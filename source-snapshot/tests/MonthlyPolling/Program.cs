// Read-only application tests: all fixtures exist exclusively in an in-memory database.
// Run from the repository root: dotnet run --project tests/MonthlyPolling
using backend.Controllers;
using backend.Data;
using backend.Models;
using Microsoft.EntityFrameworkCore;

var options = new DbContextOptionsBuilder<AppDbContext>()
    .UseInMemoryDatabase(Guid.NewGuid().ToString(), db => db.EnableNullChecks(false))
    .Options;
await using var context = new AppDbContext(options);
var party = new Party { Id = Guid.NewGuid(), CountryCode = "pl" };
var otherParty = new Party { Id = Guid.NewGuid(), CountryCode = "pl" };
context.Parties.AddRange(party, otherParty);
void AddPoll(string name, int month, double value, string area = "X", double? second = null)
{
    var poll = new Poll {
        Id = Guid.NewGuid(), Pollster = name, Area = area,
        StartDate = new DateTime(2026, month, 1), FinishDate = new DateTime(2026, month, 15),
        Media = [], Results = []
    };
    poll.Results.Add(new PollResult { Poll = poll, Party = party, PartyId = party.Id, Value = value });
    if (second.HasValue)
        poll.Results.Add(new PollResult { Poll = poll, Party = otherParty, PartyId = otherParty.Id, Value = second.Value });
    context.Polls.Add(poll);
}
AddPoll("Alpha", 6, 10);
AddPoll(" ALPHA ", 6, 20);
AddPoll("Beta", 6, 60, second: 12);
AddPoll("Alpha", 5, 20);
AddPoll("Beta", 5, 40);
AddPoll("Gamma", 6, 99, "Y");
await context.SaveChangesAsync();
var controller = new PublicController(context);

async Task<MonthlyTrendResponseDTO> Trend(bool equal, string? pollsters = null) =>
    (await controller.GetMonthlyTrendByCountry("pl", "2026-05", "2026-06", "X", pollsters, equal)).Value
    ?? throw new Exception("Expected a successful response.");
void Check(bool success, string name)
{
    if (!success) throw new Exception($"FAIL: {name}");
    Console.WriteLine($"PASS: {name}");
}
double Value(MonthlyTrendResponseDTO result, string month, Guid id) =>
    result.Points.Single(p => p.Month == month).Results.Single(r => r.PartyId == id).Average;

var plain = await Trend(false);
var equal = await Trend(true);
Check(Value(plain, "2026-06", party.Id) == 30, "default mode weights each poll equally");
Check(Value(equal, "2026-06", party.Id) == 37.5, "equal mode groups normalized pollster names");
Check(Value(equal, "2026-05", party.Id) == 30, "months are averaged independently");
Check(Value(equal, "2026-06", otherParty.Id) == 12, "missing party results are not invented as zero");
Check(equal.Points.Single(p => p.Month == "2026-06").PollCount == 3, "area filter excludes other regions");
var raw = equal.Points.Single(p => p.Month == "2026-06").Results.Single(r => r.PartyId == party.Id);
Check(raw.ValueCount == 3 && raw.ValueSum == 90, "raw result count and sum retain their meanings");
Check(Value(await Trend(true, "Beta"), "2026-06", party.Id) == 60, "pollster filter precedes equal weighting");
Check(Value(await Trend(false, "Beta"), "2026-06", party.Id) == 60, "pollster filter precedes poll weighting");
Check(Value(await Trend(true, "Alpha"), "2026-06", party.Id) == 15, "filter handles pollster whitespace and case");
Check((await Trend(true, "")).Points.Count == 0, "deselecting all pollsters produces no trend points");

// Unequal numbers of polls per alias must not create an average of alias means.
AddPoll("United Surveys", 6, 10, "Z");
AddPoll(" united surveys ", 6, 20, "Z");
AddPoll("United Surveys", 6, 30, "Z");
AddPoll("IBRiS", 6, 70, "Z");
AddPoll("Other", 6, 80, "Z");
await context.SaveChangesAsync();
async Task<MonthlyTrendResponseDTO> GroupedTrend(bool equal, string? filter = null) =>
    (await controller.GetMonthlyTrendByCountry("pl", "2026-06", "2026-06", "Z", filter, equal)).Value!;
var grouped = await GroupedTrend(true);
Check(Value(grouped, "2026-06", party.Id) == 56.3, "aliases share one combined mean before equal weighting");
Check(Value(await GroupedTrend(false), "2026-06", party.Id) == 42, "alias grouping does not change equal-poll weighting");
Check(grouped.Pollsters.Single(p => p.Name == "United Surveys / IBRiS").Count == 4,
    "pollster counts and labels are merged");
Check(grouped.PollsterGroups.Single().Aliases.SequenceEqual(new[] { "United Surveys", "IBRiS" }),
    "API exposes the shared mapping to the frontend");
foreach (var filter in new[] { "United Surveys / IBRiS", "United Surveys", "  ibris  " })
    Check(Value(await GroupedTrend(true, filter), "2026-06", party.Id) == 32.5,
        $"filter '{filter}' includes both aliases");
var individualPolls = (await controller.GetMonthlyPollsByCountry("pl", "2026-06", "Z", "United Surveys / IBRiS")).Value!.ToList();
Check(individualPolls.Count == 4 && individualPolls.Any(p => p.Pollster == "United Surveys") &&
    individualPolls.Any(p => p.Pollster == "IBRiS"), "individual polls keep their original names");
Check((await GroupedTrend(true, "Other")).Pollsters.All(p => p.Name == "Other"),
    "excluding the group excludes all its aliases");
Check((await GroupedTrend(true, "")).PollsterGroups.Count == 1,
    "group metadata is available even with no pollsters selected");

Console.WriteLine("All monthly polling tests passed. No external database or publisher was used.");
