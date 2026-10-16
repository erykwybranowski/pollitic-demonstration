namespace backend.Services;

public sealed class SocialPublisherWorker : BackgroundService
{
    private static readonly TimeSpan IdleDelay = TimeSpan.FromSeconds(10);
    private readonly ILogger<SocialPublisherWorker> _logger;
    private readonly SocialPublisherRepository _repository;
    private readonly IReadOnlyDictionary<backend.Models.SocialPlatform, ISocialPlatformPublisher> _publishers;

    public SocialPublisherWorker(
        ILogger<SocialPublisherWorker> logger,
        SocialPublisherRepository repository,
        IEnumerable<ISocialPlatformPublisher> publishers)
    {
        _logger = logger;
        _repository = repository;
        _publishers = publishers.ToDictionary(publisher => publisher.Platform);
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var configuredPlatforms = _publishers.Values
            .Where(publisher => publisher.IsConfigured)
            .Select(publisher => publisher.Platform)
            .ToArray();

        if (configuredPlatforms.Length == 0)
        {
            _logger.LogWarning("Social publisher worker started without configured platform credentials.");
        }
        else
        {
            _logger.LogInformation("Social publisher worker started for: {Platforms}.", string.Join(", ", configuredPlatforms));
        }

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var processed = await ProcessNextTargetAsync(configuredPlatforms, stoppingToken);
                if (!processed)
                {
                    await Task.Delay(IdleDelay, stoppingToken);
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception exception)
            {
                _logger.LogError(exception, "Unexpected error in social publisher worker.");
                await Task.Delay(IdleDelay, stoppingToken);
            }
        }
    }

    private async Task<bool> ProcessNextTargetAsync(
        IReadOnlyCollection<backend.Models.SocialPlatform> configuredPlatforms,
        CancellationToken cancellationToken)
    {
        var lease = await _repository.ClaimNextAsync(configuredPlatforms, cancellationToken);
        if (lease is null)
        {
            return false;
        }

        var publisher = _publishers[lease.Platform];
        try
        {
            var result = await publisher.PublishAsync(lease, cancellationToken);
            await _repository.MarkPublishedAsync(lease, result, cancellationToken);
            _logger.LogInformation(
                "Published social asset. PublicationId={PublicationId}; PollId={PollId}; Platform={Platform}; ExternalPostId={ExternalPostId}",
                lease.PublicationId, lease.PollId, lease.Platform, result.ExternalPostId);
        }
        catch (SocialAssetMissingException exception)
        {
            await _repository.MarkAssetMissingAsync(lease, exception.Message, cancellationToken);
            _logger.LogWarning(exception,
                "Social asset was missing. PublicationId={PublicationId}; PollId={PollId}; Platform={Platform}. Render was re-queued.",
                lease.PublicationId, lease.PollId, lease.Platform);
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            await _repository.MarkPublishFailureAsync(lease, exception, cancellationToken);
            _logger.LogError(exception,
                "Social publication failed. PublicationId={PublicationId}; PollId={PollId}; Platform={Platform}",
                lease.PublicationId, lease.PollId, lease.Platform);
        }

        return true;
    }
}
