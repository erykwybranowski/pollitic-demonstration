using backend.Models;
using MySqlConnector;

namespace backend.Services;

public sealed class SocialPublisherRepository
{
    private readonly string _connectionString;

    public SocialPublisherRepository()
    {
        _connectionString = Environment.GetEnvironmentVariable("DefaultConnection") ?? string.Empty;
    }

    public async Task<SocialPublishLease?> ClaimNextAsync(IReadOnlyCollection<SocialPlatform> platforms, CancellationToken cancellationToken)
    {
        EnsureConfigured();
        var configuredPlatforms = platforms.Distinct().ToArray();
        if (configuredPlatforms.Length == 0)
        {
            return null;
        }

        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync(cancellationToken);
        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);
        var now = DateTime.UtcNow;
        var platformParameterNames = configuredPlatforms.Select((_, index) => $"@platform{index}").ToArray();

        await using var select = new MySqlCommand($@"
            SELECT target.Id, target.PublicationId, publication.PollId, target.Platform,
                   publication.Caption, asset.RelativePath, target.PublishAttempts, asset.Width, asset.Height
            FROM SocialPublicationTargets AS target
            INNER JOIN SocialPublications AS publication ON publication.Id = target.PublicationId
            INNER JOIN SocialAssets AS asset ON asset.PublicationId = publication.Id
            WHERE publication.Status = @rendered
              AND target.Platform IN ({string.Join(", ", platformParameterNames)})
              AND (
                (target.Status = @pending AND (target.NextAttemptAtUtc IS NULL OR target.NextAttemptAtUtc <= @now))
                OR (target.Status = @publishing AND target.LeaseExpiresAtUtc IS NOT NULL AND target.LeaseExpiresAtUtc <= @now)
              )
            ORDER BY publication.CreatedAtUtc, target.Platform
            LIMIT 1
            FOR UPDATE SKIP LOCKED;", connection, transaction);
        select.Parameters.AddWithValue("@rendered", (int)SocialPublicationStatus.Rendered);
        select.Parameters.AddWithValue("@pending", (int)SocialPublicationTargetStatus.Pending);
        select.Parameters.AddWithValue("@publishing", (int)SocialPublicationTargetStatus.Publishing);
        select.Parameters.AddWithValue("@now", now);
        for (var index = 0; index < configuredPlatforms.Length; index += 1)
        {
            select.Parameters.AddWithValue(platformParameterNames[index], (int)configuredPlatforms[index]);
        }

        await using var reader = await select.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            await reader.DisposeAsync();
            await transaction.CommitAsync(cancellationToken);
            return null;
        }

        var targetId = reader.GetGuid(0);
        var publicationId = reader.GetGuid(1);
        var pollId = reader.GetGuid(2);
        var platform = (SocialPlatform)reader.GetInt32(3);
        var caption = reader.GetString(4);
        var relativePath = reader.GetString(5);
        var publishAttempt = reader.GetInt32(6) + 1;
        var assetWidth = reader.GetInt32(7);
        var assetHeight = reader.GetInt32(8);
        await reader.DisposeAsync();

        var leaseToken = Guid.NewGuid().ToString();
        await using var update = new MySqlCommand(@"
            UPDATE SocialPublicationTargets
            SET Status = @status,
                PublishAttempts = PublishAttempts + 1,
                LeaseToken = @leaseToken,
                LeaseExpiresAtUtc = @leaseExpiresAtUtc,
                NextAttemptAtUtc = NULL,
                LastError = NULL
            WHERE Id = @targetId
              AND (
                (Status = @pending AND (NextAttemptAtUtc IS NULL OR NextAttemptAtUtc <= @now))
                OR (Status = @publishing AND LeaseExpiresAtUtc IS NOT NULL AND LeaseExpiresAtUtc <= @now)
              );", connection, transaction);
        update.Parameters.AddWithValue("@status", (int)SocialPublicationTargetStatus.Publishing);
        update.Parameters.AddWithValue("@leaseToken", leaseToken);
        update.Parameters.AddWithValue("@leaseExpiresAtUtc", now.AddMinutes(5));
        update.Parameters.AddWithValue("@targetId", targetId.ToString());
        update.Parameters.AddWithValue("@pending", (int)SocialPublicationTargetStatus.Pending);
        update.Parameters.AddWithValue("@publishing", (int)SocialPublicationTargetStatus.Publishing);
        update.Parameters.AddWithValue("@now", now);
        if (await update.ExecuteNonQueryAsync(cancellationToken) == 0)
        {
            await transaction.CommitAsync(cancellationToken);
            return null;
        }

        await using var attempt = new MySqlCommand(@"
            INSERT INTO SocialPublicationAttempts (Id, PublicationId, TargetId, Operation, Status, StartedAtUtc)
            VALUES (@id, @publicationId, @targetId, 'publish', @status, @startedAtUtc);", connection, transaction);
        attempt.Parameters.AddWithValue("@id", Guid.NewGuid().ToString());
        attempt.Parameters.AddWithValue("@publicationId", publicationId.ToString());
        attempt.Parameters.AddWithValue("@targetId", targetId.ToString());
        attempt.Parameters.AddWithValue("@status", (int)SocialPublicationAttemptStatus.Started);
        attempt.Parameters.AddWithValue("@startedAtUtc", now);
        await attempt.ExecuteNonQueryAsync(cancellationToken);

        await transaction.CommitAsync(cancellationToken);
        return new SocialPublishLease(targetId, publicationId, pollId, platform, caption, relativePath, assetWidth, assetHeight, publishAttempt, leaseToken);
    }

    public async Task MarkPublishedAsync(SocialPublishLease lease, SocialPublishResult result, CancellationToken cancellationToken)
    {
        EnsureConfigured();
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync(cancellationToken);
        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);

        await using var update = new MySqlCommand(@"
            UPDATE SocialPublicationTargets
            SET Status = @status,
                LeaseToken = NULL,
                LeaseExpiresAtUtc = NULL,
                NextAttemptAtUtc = NULL,
                ExternalPostId = @externalPostId,
                ExternalPostUrl = @externalPostUrl,
                LastError = NULL
            WHERE Id = @targetId AND LeaseToken = @leaseToken;", connection, transaction);
        update.Parameters.AddWithValue("@status", (int)SocialPublicationTargetStatus.Published);
        update.Parameters.AddWithValue("@externalPostId", result.ExternalPostId);
        update.Parameters.AddWithValue("@externalPostUrl", (object?)result.ExternalPostUrl ?? DBNull.Value);
        update.Parameters.AddWithValue("@targetId", lease.TargetId.ToString());
        update.Parameters.AddWithValue("@leaseToken", lease.LeaseToken);
        if (await update.ExecuteNonQueryAsync(cancellationToken) > 0)
        {
            await FinishAttemptAsync(connection, transaction, lease.TargetId, SocialPublicationAttemptStatus.Succeeded, null, null, cancellationToken);
        }

        await transaction.CommitAsync(cancellationToken);
    }

    public async Task MarkPublishFailureAsync(SocialPublishLease lease, Exception exception, CancellationToken cancellationToken)
    {
        EnsureConfigured();
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync(cancellationToken);
        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);
        var now = DateTime.UtcNow;
        var error = Truncate(exception.Message, 4_000);
        var publishException = exception as SocialPublishHttpException;
        var isPermanent = exception is SocialPublishValidationException || publishException?.IsPermanent == true;
        var retryMinutes = Math.Min(Math.Pow(2, Math.Min(lease.PublishAttempt, 6)), 60);

        await using var update = new MySqlCommand(@"
            UPDATE SocialPublicationTargets
            SET Status = @status,
                LeaseToken = NULL,
                LeaseExpiresAtUtc = NULL,
                NextAttemptAtUtc = @nextAttemptAtUtc,
                LastError = @lastError
            WHERE Id = @targetId AND LeaseToken = @leaseToken;", connection, transaction);
        update.Parameters.AddWithValue("@status", (int)(isPermanent ? SocialPublicationTargetStatus.Failed : SocialPublicationTargetStatus.Pending));
        update.Parameters.AddWithValue("@nextAttemptAtUtc", isPermanent ? DBNull.Value : now.AddMinutes(retryMinutes));
        update.Parameters.AddWithValue("@lastError", error);
        update.Parameters.AddWithValue("@targetId", lease.TargetId.ToString());
        update.Parameters.AddWithValue("@leaseToken", lease.LeaseToken);
        if (await update.ExecuteNonQueryAsync(cancellationToken) > 0)
        {
            await FinishAttemptAsync(connection, transaction, lease.TargetId, SocialPublicationAttemptStatus.Failed, error,
                publishException is null ? null : (int)publishException.StatusCode, cancellationToken);
        }

        await transaction.CommitAsync(cancellationToken);
    }

    public async Task MarkAssetMissingAsync(SocialPublishLease lease, string error, CancellationToken cancellationToken)
    {
        EnsureConfigured();
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync(cancellationToken);
        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);
        var now = DateTime.UtcNow;

        await using var updateTarget = new MySqlCommand(@"
            UPDATE SocialPublicationTargets
            SET Status = @pending,
                LeaseToken = NULL,
                LeaseExpiresAtUtc = NULL,
                NextAttemptAtUtc = @now,
                LastError = @lastError
            WHERE Id = @targetId AND LeaseToken = @leaseToken;", connection, transaction);
        updateTarget.Parameters.AddWithValue("@pending", (int)SocialPublicationTargetStatus.Pending);
        updateTarget.Parameters.AddWithValue("@now", now);
        updateTarget.Parameters.AddWithValue("@lastError", Truncate(error, 4_000));
        updateTarget.Parameters.AddWithValue("@targetId", lease.TargetId.ToString());
        updateTarget.Parameters.AddWithValue("@leaseToken", lease.LeaseToken);
        if (await updateTarget.ExecuteNonQueryAsync(cancellationToken) > 0)
        {
            await using var updatePublication = new MySqlCommand(@"
                UPDATE SocialPublications
                SET Status = @pendingRender,
                    LeaseToken = NULL,
                    LeaseExpiresAtUtc = NULL,
                    NextAttemptAtUtc = @now,
                    LastError = @lastError
                WHERE Id = @publicationId AND Status = @rendered;", connection, transaction);
            updatePublication.Parameters.AddWithValue("@pendingRender", (int)SocialPublicationStatus.PendingRender);
            updatePublication.Parameters.AddWithValue("@rendered", (int)SocialPublicationStatus.Rendered);
            updatePublication.Parameters.AddWithValue("@now", now);
            updatePublication.Parameters.AddWithValue("@lastError", Truncate(error, 4_000));
            updatePublication.Parameters.AddWithValue("@publicationId", lease.PublicationId.ToString());
            await updatePublication.ExecuteNonQueryAsync(cancellationToken);

            await FinishAttemptAsync(connection, transaction, lease.TargetId, SocialPublicationAttemptStatus.Failed, Truncate(error, 4_000), null, cancellationToken);
        }

        await transaction.CommitAsync(cancellationToken);
    }

    private static async Task FinishAttemptAsync(MySqlConnection connection, MySqlTransaction transaction, Guid targetId,
        SocialPublicationAttemptStatus status, string? error, int? httpStatusCode, CancellationToken cancellationToken)
    {
        await using var command = new MySqlCommand(@"
            UPDATE SocialPublicationAttempts
            SET Status = @status, Error = @error, HttpStatusCode = @httpStatusCode, FinishedAtUtc = @finishedAtUtc
            WHERE TargetId = @targetId AND Operation = 'publish' AND Status = @started
            ORDER BY StartedAtUtc DESC
            LIMIT 1;", connection, transaction);
        command.Parameters.AddWithValue("@status", (int)status);
        command.Parameters.AddWithValue("@error", (object?)error ?? DBNull.Value);
        command.Parameters.AddWithValue("@httpStatusCode", (object?)httpStatusCode ?? DBNull.Value);
        command.Parameters.AddWithValue("@finishedAtUtc", DateTime.UtcNow);
        command.Parameters.AddWithValue("@targetId", targetId.ToString());
        command.Parameters.AddWithValue("@started", (int)SocialPublicationAttemptStatus.Started);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    private static string Truncate(string value, int maximumLength) => value.Length <= maximumLength ? value : value[..maximumLength];

    private void EnsureConfigured()
    {
        if (string.IsNullOrWhiteSpace(_connectionString))
        {
            throw new InvalidOperationException("DefaultConnection is required for the social publisher.");
        }
    }
}

public sealed record SocialPublishLease(
    Guid TargetId,
    Guid PublicationId,
    Guid PollId,
    SocialPlatform Platform,
    string Caption,
    string RelativePath,
    int AssetWidth,
    int AssetHeight,
    int PublishAttempt,
    string LeaseToken);

public sealed record SocialPublishResult(string ExternalPostId, string? ExternalPostUrl);

public sealed class SocialPublishHttpException(System.Net.HttpStatusCode statusCode, string responseBody)
    : Exception($"Social platform returned HTTP {(int)statusCode}: {responseBody[..Math.Min(responseBody.Length, 1000)]}")
{
    public System.Net.HttpStatusCode StatusCode { get; } = statusCode;
    public bool IsPermanent =>
        !IsMediaNotReady &&
        (int)StatusCode is >= 400 and < 500 &&
        StatusCode is not System.Net.HttpStatusCode.RequestTimeout and not (System.Net.HttpStatusCode)429;

    private bool IsMediaNotReady =>
        ResponseBody.Contains("\"code\":9007", StringComparison.Ordinal) ||
        ResponseBody.Contains("\"error_subcode\":2207027", StringComparison.Ordinal);

    private string ResponseBody { get; } = responseBody;
}

public sealed class SocialPublishValidationException(string message) : Exception(message);
