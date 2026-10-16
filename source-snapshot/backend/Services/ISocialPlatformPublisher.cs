using backend.Models;

namespace backend.Services;

public interface ISocialPlatformPublisher
{
    SocialPlatform Platform { get; }
    bool IsConfigured { get; }
    Task<SocialPublishResult> PublishAsync(SocialPublishLease lease, CancellationToken cancellationToken);
}

public sealed class SocialAssetMissingException(string message) : Exception(message);
