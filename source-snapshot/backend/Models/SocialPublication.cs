namespace backend.Models;

public enum SocialPublicationStatus
{
    PendingRender,
    Rendering,
    Rendered,
    Failed
}

public enum SocialPlatform
{
    Facebook,
    Instagram,
    Reddit,
    X,
    Threads,
    Bluesky,
    Telegram
}

public enum SocialPublicationTargetStatus
{
    Pending,
    Publishing,
    Published,
    Failed
}

public enum SocialPublicationAttemptStatus
{
    Started,
    Succeeded,
    Failed
}

public class SocialPublication
{
    public Guid Id { get; set; }
    public Guid PollId { get; set; }
    public string CountryCode { get; set; } = string.Empty;
    public string CountryName { get; set; } = string.Empty;
    public string CountryUrl { get; set; } = string.Empty;
    public string Caption { get; set; } = string.Empty;
    public SocialPublicationStatus Status { get; set; } = SocialPublicationStatus.PendingRender;
    public int RenderAttempts { get; set; }
    public DateTime CreatedAtUtc { get; set; }
    public DateTime? RenderedAtUtc { get; set; }
    public DateTime? NextAttemptAtUtc { get; set; }
    public string? LeaseToken { get; set; }
    public DateTime? LeaseExpiresAtUtc { get; set; }
    public string? LastError { get; set; }
}

public class SocialAsset
{
    public Guid Id { get; set; }
    public Guid PublicationId { get; set; }
    public string Format { get; set; } = string.Empty;
    public string RelativePath { get; set; } = string.Empty;
    public string Checksum { get; set; } = string.Empty;
    public int Width { get; set; }
    public int Height { get; set; }
    public long Bytes { get; set; }
    public DateTime RenderedAtUtc { get; set; }
}

public class SocialPublicationTarget
{
    public Guid Id { get; set; }
    public Guid PublicationId { get; set; }
    public SocialPlatform Platform { get; set; }
    public SocialPublicationTargetStatus Status { get; set; } = SocialPublicationTargetStatus.Pending;
    public int PublishAttempts { get; set; }
    public DateTime? NextAttemptAtUtc { get; set; }
    public string? LeaseToken { get; set; }
    public DateTime? LeaseExpiresAtUtc { get; set; }
    public string? ExternalPostId { get; set; }
    public string? ExternalPostUrl { get; set; }
    public string? LastError { get; set; }
}

public class SocialPublicationAttempt
{
    public Guid Id { get; set; }
    public Guid PublicationId { get; set; }
    public Guid? TargetId { get; set; }
    public string Operation { get; set; } = string.Empty;
    public SocialPublicationAttemptStatus Status { get; set; } = SocialPublicationAttemptStatus.Started;
    public int? HttpStatusCode { get; set; }
    public string? Error { get; set; }
    public DateTime StartedAtUtc { get; set; }
    public DateTime? FinishedAtUtc { get; set; }
}

public sealed record SocialPublicationDraft(
    SocialPublication Publication,
    IReadOnlyList<SocialPublicationTarget> Targets);
