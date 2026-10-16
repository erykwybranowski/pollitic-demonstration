using backend.Data;

namespace backend.Services;

// Monthly statistics only. Never rewrite the pollster stored on a poll.
public static class MonthlyPollsterGroups
{
    public static IReadOnlyList<MonthlyPollsterGroupDTO> Groups { get; } =
        Array.AsReadOnly(new[] {
            new MonthlyPollsterGroupDTO("United Surveys / IBRiS", ["United Surveys", "IBRiS"])
        });

    public static string GetName(string? name)
    {
        var trimmed = name?.Trim() ?? string.Empty;
        return Groups.FirstOrDefault(group =>
            group.Name.Equals(trimmed, StringComparison.OrdinalIgnoreCase) ||
            group.Aliases.Contains(trimmed, StringComparer.OrdinalIgnoreCase))?.Name ?? trimmed;
    }

    public static IEnumerable<string> Expand(IEnumerable<string> names) => names
        .SelectMany(name => Groups.FirstOrDefault(group =>
            group.Name.Equals(GetName(name), StringComparison.OrdinalIgnoreCase)) is { } group
                ? group.Aliases.Append(group.Name) : new[] { name });

    public static List<MonthlyPollsterUsageDTO> MergeUsage(IEnumerable<MonthlyPollsterUsageDTO> usage) => usage
        .GroupBy(item => GetName(item.Name), StringComparer.OrdinalIgnoreCase)
        .Select(group => new MonthlyPollsterUsageDTO { Name = group.Key, Count = group.Sum(item => item.Count) })
        .OrderByDescending(item => item.Count).ThenBy(item => item.Name).ToList();
}
