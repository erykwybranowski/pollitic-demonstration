using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Linq.Expressions;
using System.Threading.Tasks;
using backend.Data;
using backend.Models;
using backend.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace backend.Controllers
{
    [Route("api/public")]
    [ApiController]
    public class PublicController : ControllerBase
    {
        private readonly AppDbContext _context;

        public PublicController(AppDbContext context)
        {
            _context = context;
        }

        // GET: api/public/countries
        [HttpGet("countries")]
        public async Task<ActionResult<IEnumerable<CountryDTO>>> GetAllCountries()
        {
            return await _context.Countries
                .Select(c => new CountryDTO
                {
                    CountryCode = c.CountryCode,
                    Name = c.Name
                })
                .ToListAsync();
        }

        // GET: api/public/parties
        [HttpGet("parties")]
        public async Task<ActionResult<IEnumerable<PartyDTO>>> GetAllParties()
        {
            return await _context.Parties
                .Include(p => p.Groups)
                .Include(p => p.SubParties)
                .Select(p => new PartyDTO
                {
                    Id = p.Id,
                    StringId = p.StringId,
                    Acronym = p.Acronym,
                    EnglishName = p.EnglishName,
                    CountryCode = p.CountryCode,
                    LocalName = p.LocalName,
                    CHES_EU = p.CHES_EU,
                    CHES_Economy = p.CHES_Economy,
                    CHES_Progress = p.CHES_Progress,
                    CHES_Liberal = p.CHES_Liberal,
                    Mp = p.Mp,
                    Role = p.Role,
                    Groups = p.Groups.Select(g => new GroupDTO
                    {
                        Id = g.Id,
                        Acronym = g.Acronym,
                        Name = g.Name,
                        R = g.R,
                        G = g.G,
                        B = g.B
                    }).ToList(),
                    SubParties = p.SubParties.Select(sp => new PartyDTO
                    {
                        Id = sp.Id,
                        StringId = sp.StringId,
                        Acronym = sp.Acronym,
                        EnglishName = sp.EnglishName,
                        CountryCode = sp.CountryCode
                    }).ToList()
                })
                .ToListAsync();
        }
        
        // GET: api/public/parties/{countryCode}
        [HttpGet("parties/{countryCode}")]
        public async Task<ActionResult<IEnumerable<PartyDTO>>> GetPartiesByCountry(string countryCode)
        {
            return await _context.Parties
                .Where(p => p.CountryCode == countryCode)
                .Include(p => p.Groups)
                .Include(p => p.SubParties)
                .Select(p => new PartyDTO
                {
                    Id = p.Id,
                    StringId = p.StringId,
                    Acronym = p.Acronym,
                    EnglishName = p.EnglishName,
                    CountryCode = p.CountryCode,
                    LocalName = p.LocalName,
                    CHES_EU = p.CHES_EU,
                    CHES_Economy = p.CHES_Economy,
                    CHES_Progress = p.CHES_Progress,
                    CHES_Liberal = p.CHES_Liberal,
                    Mp = p.Mp,
                    Role = p.Role,
                    Groups = p.Groups.Select(g => new GroupDTO
                    {
                        Id = g.Id,
                        Acronym = g.Acronym,
                        Name = g.Name,
                        R = g.R,
                        G = g.G,
                        B = g.B
                    }).ToList(),
                    SubParties = p.SubParties.Select(sp => new PartyDTO
                    {
                        Id = sp.Id,
                        StringId = sp.StringId,
                        Acronym = sp.Acronym,
                        EnglishName = sp.EnglishName,
                        CountryCode = sp.CountryCode
                    }).ToList()
                })
                .ToListAsync();
        }

        // GET: api/public/polls
        [HttpGet("polls")]
        public async Task<ActionResult<IEnumerable<PollDTO>>> GetAllPolls()
        {
            return await _context.Polls
                .Include(p => p.Results)
                .OrderByDescending(p => p.FinishDate)
                .Select(p => new PollDTO
                {
                    Id = p.Id,
                    Pollster = p.Pollster,
                    Media = p.Media,
                    StartDate = p.StartDate,
                    FinishDate = p.FinishDate,
                    Type = p.Type,
                    Sample = p.Sample,
                    Others = p.Others,
                    Area = p.Area,
                    Results = p.Results.Select(r => new PollResultDTO
                    {
                        PartyId = r.PartyId,
                        Value = r.Value
                    }).ToList()
                })
                .ToListAsync();
        }

        // GET: api/public/polls/count
        [HttpGet("polls/count")]
        public async Task<ActionResult<int>> GetPollsCount()
        {
            return await _context.Polls.CountAsync();
        }

        // GET: api/public/polls/{countryCode}
        [HttpGet("polls/{countryCode}")]
        public async Task<ActionResult<IEnumerable<PollDTO>>> GetPollsByCountry(string countryCode)
        {
            return await _context.Polls
                .Where(p => p.Results.Any(r => r.Party.CountryCode == countryCode))
                .Include(p => p.Results)
                .OrderByDescending(p => p.FinishDate)
                .Select(p => new PollDTO
                {
                    Id = p.Id,
                    Pollster = p.Pollster,
                    Media = p.Media,
                    StartDate = p.StartDate,
                    FinishDate = p.FinishDate,
                    Type = p.Type,
                    Sample = p.Sample,
                    Others = p.Others,
                    Area = p.Area,
                    Results = p.Results.Select(r => new PollResultDTO
                    {
                        PartyId = r.PartyId,
                        Value = r.Value
                    }).ToList()
                })
                .ToListAsync();
        }


        // GET: api/public/polls/{countryCode}/count
        [HttpGet("polls/{countryCode}/count")]
        public async Task<ActionResult<int>> GetPollsCountByCountry(string countryCode)
        {
            return await _context.Polls
                .AsNoTracking()
                .CountAsync(p => p.Results.Any(r => r.Party.CountryCode == countryCode));
        }

        // GET: api/public/polls/{countryCode}/monthly-trend?fromMonth=2021-01&toMonth=2026-07&area=BRU&pollsters=A,B
        [HttpGet("polls/{countryCode}/monthly-trend")]
        public async Task<ActionResult<MonthlyTrendResponseDTO>> GetMonthlyTrendByCountry(
            string countryCode,
            [FromQuery] string? fromMonth,
            [FromQuery] string? toMonth,
            [FromQuery] string? area,
            [FromQuery] string? pollsters,
            [FromQuery] bool equalPollsterWeight = false)
        {
            var baseQuery = BuildCountryPollQuery(countryCode, area);

            var availableMonthParts = await baseQuery
                .GroupBy(p => new { p.FinishDate.Year, p.FinishDate.Month })
                .Select(group => new { group.Key.Year, group.Key.Month })
                .OrderBy(month => month.Year)
                .ThenBy(month => month.Month)
                .ToListAsync();

            var availableMonths = availableMonthParts
                .Select(month => ToMonthKey(month.Year, month.Month))
                .ToList();

            var query = baseQuery;
            if (!ApplyMonthRange(ref query, fromMonth, toMonth, out var monthRangeError))
            {
                return BadRequest(monthRangeError);
            }

            // Lista dostępnych sondażowni dotyczy wybranego zakresu czasu,
            // przed zastosowaniem opcjonalnego filtra sondażowni.
            var availablePollsterUsage = await query
                .Where(p => p.Pollster != null && p.Pollster != string.Empty)
                .GroupBy(p => p.Pollster)
                .Select(group => new MonthlyPollsterUsageDTO
                {
                    Name = group.Key,
                    Count = group.Count()
                })
                .OrderByDescending(p => p.Count)
                .ThenBy(p => p.Name)
                .ToListAsync();

            var pollsterFilter = ParseCsvSet(pollsters);
            if (pollsterFilter != null)
            {
                if (pollsterFilter.Count == 0)
                {
                    return new MonthlyTrendResponseDTO
                    {
                        PollsterGroups = MonthlyPollsterGroups.Groups,
                        AvailableMonths = availableMonths,
                        AvailablePollsters = MonthlyPollsterGroups.MergeUsage(availablePollsterUsage),
                        Pollsters = new List<MonthlyPollsterUsageDTO>(),
                        Points = new List<MonthlyTrendPointDTO>()
                    };
                }

                query = ApplyPollsterFilter(query, pollsterFilter);
            }

            var pollsterUsage = await query
                .Where(p => p.Pollster != null && p.Pollster != string.Empty)
                .GroupBy(p => p.Pollster)
                .Select(group => new MonthlyPollsterUsageDTO
                {
                    Name = group.Key,
                    Count = group.Count()
                })
                .OrderByDescending(p => p.Count)
                .ThenBy(p => p.Name)
                .ToListAsync();

            var resultQuery = query
                .SelectMany(p => p.Results)
                .Where(r => r.Party.CountryCode == countryCode);

            var pollCountRows = await query
                .GroupBy(p => new { p.FinishDate.Year, p.FinishDate.Month })
                .Select(group => new
                {
                    group.Key.Year,
                    group.Key.Month,
                    PollCount = group.Count()
                })
                .ToListAsync();

            var aggregateRows = await resultQuery
                .Where(r => r.Value > 0)
                .GroupBy(r => new { r.Poll.FinishDate.Year, r.Poll.FinishDate.Month, r.PartyId,
                    Pollster = (r.Poll.Pollster ?? "").Trim().ToLower() })
                .Select(group => new
                {
                    group.Key.Year,
                    group.Key.Month,
                    group.Key.PartyId,
                    group.Key.Pollster,
                    ValueSum = group.Sum(r => r.Value),
                    ValueCount = group.Count()
                })
                .ToListAsync();

            // Merge aliases by sums/counts BEFORE computing means, not by
            // averaging alias means (which would give each alias its own weight).
            var groupedRows = aggregateRows
                .GroupBy(row => new { row.Year, row.Month, row.PartyId,
                    Pollster = MonthlyPollsterGroups.GetName(row.Pollster).ToLowerInvariant() })
                .Select(group => new {
                    group.Key.Year, group.Key.Month, group.Key.PartyId,
                    ValueSum = group.Sum(row => row.ValueSum),
                    ValueCount = group.Sum(row => row.ValueCount)
                });
            var resultsByMonth = groupedRows
                .GroupBy(row => ToMonthKey(row.Year, row.Month))
                .ToDictionary(
                    group => group.Key,
                    group => group
                        .GroupBy(row => row.PartyId)
                        .Select(party => new MonthlyPollAggregateResultDTO
                        {
                            PartyId = party.Key,
                            ValueSum = Math.Round(party.Sum(row => row.ValueSum), 4),
                            ValueCount = party.Sum(row => row.ValueCount),
                            // Do not round pollster means before calculating the final mean.
                            Average = Math.Round(equalPollsterWeight
                                ? party.Average(row => row.ValueSum / row.ValueCount)
                                : party.Sum(row => row.ValueSum) / party.Sum(row => row.ValueCount), 1,
                                MidpointRounding.AwayFromZero)
                        })
                        .OrderBy(result => result.PartyId)
                        .ToList());

            var points = pollCountRows
                .Select(row =>
                {
                    var month = ToMonthKey(row.Year, row.Month);
                    return new MonthlyTrendPointDTO
                    {
                        Month = month,
                        Area = area ?? string.Empty,
                        PollCount = row.PollCount,
                        Results = resultsByMonth.GetValueOrDefault(month) ?? new List<MonthlyPollAggregateResultDTO>()
                    };
                })
                .OrderBy(point => point.Month)
                .ToList();

            return new MonthlyTrendResponseDTO
            {
                PollsterGroups = MonthlyPollsterGroups.Groups,
                AvailableMonths = availableMonths,
                AvailablePollsters = MonthlyPollsterGroups.MergeUsage(availablePollsterUsage),
                Pollsters = MonthlyPollsterGroups.MergeUsage(pollsterUsage),
                Points = points
            };
        }

        // GET: api/public/polls/{countryCode}/monthly-polls?month=2026-07&area=BRU&pollsters=A,B
        [HttpGet("polls/{countryCode}/monthly-polls")]
        public async Task<ActionResult<IEnumerable<PollDTO>>> GetMonthlyPollsByCountry(
            string countryCode,
            [FromQuery] string month,
            [FromQuery] string? area,
            [FromQuery] string? pollsters)
        {
            if (string.IsNullOrWhiteSpace(month) || !TryParseMonth(month, out var monthStart))
            {
                return BadRequest("Query parameter 'month' must use YYYY-MM format.");
            }

            var monthEndExclusive = monthStart.AddMonths(1);
            var pollsterFilter = ParseCsvSet(pollsters);
            if (pollsterFilter != null && pollsterFilter.Count == 0)
            {
                return new List<PollDTO>();
            }

            var query = BuildCountryPollQuery(countryCode, area)
                .Where(p => p.FinishDate >= monthStart && p.FinishDate < monthEndExclusive);

            if (pollsterFilter != null)
            {
                query = ApplyPollsterFilter(query, pollsterFilter);
            }

            var polls = await query
                .Include(p => p.Results)
                .OrderByDescending(p => p.FinishDate)
                .ThenByDescending(p => p.StartDate)
                .ToListAsync();

            return polls.Select(ToPollDTO).ToList();
        }
        // GET: api/public/polls/{countryCode}/monthly-support?month=2026-07&area=BRU&pollsters=A,B
        [HttpGet("polls/{countryCode}/monthly-support")]
        public async Task<ActionResult<MonthlySupportResponseDTO>> GetMonthlySupportByCountry(
            string countryCode,
            [FromQuery] string month,
            [FromQuery] string? area,
            [FromQuery] string? pollsters)
        {
            if (string.IsNullOrWhiteSpace(month) || !TryParseMonth(month, out var monthStart))
            {
                return BadRequest("Query parameter 'month' must use YYYY-MM format.");
            }

            var monthEndExclusive = monthStart.AddMonths(1);
            var pollsterFilter = ParseCsvSet(pollsters);

            var query = BuildCountryPollQuery(countryCode, area)
                .Where(p => p.FinishDate >= monthStart && p.FinishDate < monthEndExclusive);

            var pollsterUsage = await query
                .Where(p => p.Pollster != null && p.Pollster != string.Empty)
                .GroupBy(p => p.Pollster)
                .Select(group => new MonthlyPollsterUsageDTO
                {
                    Name = group.Key,
                    Count = group.Count()
                })
                .OrderByDescending(p => p.Count)
                .ThenBy(p => p.Name)
                .ToListAsync();

            if (pollsterFilter != null)
            {
                if (pollsterFilter.Count == 0)
                {
                    return new MonthlySupportResponseDTO
                    {
                        Month = month,
                        Area = area ?? string.Empty,
                        PollCount = 0,
                        Results = new List<MonthlyPollAggregateResultDTO>(),
                        Pollsters = pollsterUsage
                    };
                }

                query = ApplyPollsterFilter(query, pollsterFilter);
            }

            var resultQuery = query
                .SelectMany(p => p.Results)
                .Where(r => r.Party.CountryCode == countryCode);

            var pollCount = await query.CountAsync();
            var aggregateRows = await resultQuery
                .Where(r => r.Value > 0)
                .GroupBy(r => r.PartyId)
                .Select(group => new
                {
                    PartyId = group.Key,
                    ValueSum = group.Sum(r => r.Value),
                    ValueCount = group.Count()
                })
                .ToListAsync();

            var results = aggregateRows
                .Select(row => new MonthlyPollAggregateResultDTO
                {
                    PartyId = row.PartyId,
                    ValueSum = Math.Round(row.ValueSum, 4),
                    ValueCount = row.ValueCount,
                    Average = row.ValueCount == 0 ? 0 : Math.Round(row.ValueSum / row.ValueCount, 1)
                })
                .OrderBy(result => result.PartyId)
                .ToList();

            return new MonthlySupportResponseDTO
            {
                Month = month,
                Area = area ?? string.Empty,
                PollCount = pollCount,
                Results = results,
                Pollsters = pollsterUsage
            };
        }

        // GET: api/public/polls/{countryCode}/latest?pageIndex=0&pageSize=10
        [HttpGet("polls/{countryCode}/latest")]
        public async Task<ActionResult<PagedLatestPollsDTO>> GetLatestPollsByCountry(
            string countryCode,
            [FromQuery] int pageIndex = 0,
            [FromQuery] int pageSize = 10)
        {
            if (pageIndex < 0) pageIndex = 0;
            if (pageSize <= 0) pageSize = 10;
            if (pageSize > 50) pageSize = 50;

            var baseQuery = _context.Polls
                .AsNoTracking()
                .Where(p => p.Results.Any(r => r.Party.CountryCode == countryCode));

            var totalCount = await baseQuery.CountAsync();

            var polls = await baseQuery
                .Include(p => p.Results)
                .OrderByDescending(p => p.FinishDate)
                .ThenByDescending(p => p.StartDate)
                .Skip(pageIndex * pageSize)
                .Take(pageSize)
                .ToListAsync();

            var items = new List<LatestPollItemDTO>();
            foreach (var poll in polls)
            {
                var area = poll.Area ?? string.Empty;
                var previousPoll = await baseQuery
                    .Include(p => p.Results)
                    .Where(p =>
                        p.Pollster == poll.Pollster &&
                        (p.Area ?? string.Empty) == area &&
                        (p.FinishDate < poll.FinishDate ||
                         (p.FinishDate == poll.FinishDate && p.StartDate < poll.StartDate)))
                    .OrderByDescending(p => p.FinishDate)
                    .ThenByDescending(p => p.StartDate)
                    .FirstOrDefaultAsync();

                items.Add(new LatestPollItemDTO
                {
                    Poll = ToPollDTO(poll),
                    PreviousPoll = previousPoll == null ? null : ToPollDTO(previousPoll)
                });
            }

            return new PagedLatestPollsDTO
            {
                TotalCount = totalCount,
                PageIndex = pageIndex,
                PageSize = pageSize,
                Items = items
            };
        }

        // GET: api/public/polls/{countryCode}/options?area=BRU
        [HttpGet("polls/{countryCode}/options")]
        public async Task<ActionResult<IEnumerable<PollOptionDTO>>> GetPollOptionsByCountry(
            string countryCode,
            [FromQuery] string? area)
        {
            var query = _context.Polls
                .AsNoTracking()
                .Where(p => p.Results.Any(r => r.Party.CountryCode == countryCode));

            if (!string.IsNullOrWhiteSpace(area))
            {
                var normalizedArea = area.Trim().ToUpperInvariant();
                query = query.Where(p => (p.Area ?? string.Empty).ToUpper() == normalizedArea);
            }

            return await query
                .OrderByDescending(p => p.FinishDate)
                .ThenByDescending(p => p.StartDate)
                .Select(p => new PollOptionDTO
                {
                    Id = p.Id,
                    Pollster = p.Pollster,
                    FinishDate = p.FinishDate,
                    Area = p.Area
                })
                .ToListAsync();
        }

        // GET: api/public/polls/by-id/{pollId}
        [HttpGet("polls/by-id/{pollId:guid}")]
        public async Task<ActionResult<PollDTO>> GetPollById(Guid pollId)
        {
            var poll = await _context.Polls
                .AsNoTracking()
                .Include(p => p.Results)
                .FirstOrDefaultAsync(p => p.Id == pollId);

            if (poll == null)
            {
                return NotFound();
            }

            return ToPollDTO(poll);
        }
        // GET: api/public/groups
        [HttpGet("groups")]
        public async Task<ActionResult<IEnumerable<GroupDTO>>> GetAllGroups()
        {
            return await _context.Groups
                .Select(g => new GroupDTO
                {
                    Id = g.Id,
                    Acronym = g.Acronym,
                    Name = g.Name,
                    R = g.R,
                    G = g.G,
                    B = g.B
                })
                .ToListAsync();
        }
        
        // GET: api/public/newest-polls-per-country
        [HttpGet("newest-polls-per-country")]
        public async Task<ActionResult<IEnumerable<NewestPollsDTO>>> GetNewestPollPerCountry()
        {
            var latestPolls = await _context.LatestPolls
                .Include(lp => lp.Poll)
                .ThenInclude(p => p.Results)
                .ToListAsync();

            var result = latestPolls.Select(lp => new NewestPollsDTO
                {
                    Id = lp.Poll.Id,
                    Pollster = lp.Poll.Pollster,
                    Media = lp.Poll.Media,
                    StartDate = lp.Poll.StartDate,
                    FinishDate = lp.Poll.FinishDate,
                    Type = lp.Poll.Type,
                    Sample = lp.Poll.Sample,
                    Others = lp.Poll.Others,
                    Area = lp.Poll.Area,
                    CountryCode = lp.CountryCode,
                    Results = lp.Poll.Results.Select(r => new PollResultDTO
                    {
                        PartyId = r.PartyId,
                        Value = r.Value
                    }).ToList()
                })
                .OrderByDescending(dto => dto.FinishDate)
                .ToList();

            return result;
        }
        
        // GET: api/public/parties/{countryCode}/{stringId}/similar
        [HttpGet("parties/{countryCode}/{stringId}/similar")]
        public async Task<ActionResult<PagedSimilarPartiesDTO>> GetSimilarParties(
            string countryCode,
            string stringId,
            [FromQuery] string? filterCountries,
            [FromQuery] string? filterGroups,
            [FromQuery] bool includeNonParliament = true,
            [FromQuery] int pageIndex = 0,
            [FromQuery] int pageSize = 1)
        {
            if (pageIndex < 0) pageIndex = 0;
            if (pageSize <= 0) pageSize = 1;

            countryCode = countryCode.ToUpperInvariant();

            // Partia bazowa – ściągamy partie z kraju do pamięci
            // i dopiero tam porównujemy StringId „bit po bicie”.
            var partiesInCountry = await _context.Parties
                .Include(p => p.Groups)
                .Where(p => p.CountryCode.ToUpper() == countryCode)
                .AsNoTracking()
                .ToListAsync();

            var baseParty = partiesInCountry
                .FirstOrDefault(p => string.Equals(p.StringId, stringId, StringComparison.Ordinal));
            
            if (baseParty == null)
            {
                return NotFound($"Party with StringId '{stringId}' in country '{countryCode}' not found.");
            }

            if (!HasValidChes(baseParty))
            {
                return BadRequest("Base party does not have single-value CHES scores (all four dimensions must be single numbers).");
            }

            // Filtry krajów
            HashSet<string>? countryFilter = null;
            if (!string.IsNullOrWhiteSpace(filterCountries))
            {
                countryFilter = filterCountries
                    .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                    .Select(c => c.ToUpperInvariant())
                    .ToHashSet();
            }

            // Filtry grup
            HashSet<int>? groupFilter = null;
            var includeNoGroup = false;

            if (!string.IsNullOrWhiteSpace(filterGroups))
            {
                var ids = filterGroups
                    .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

                var set = new HashSet<int>();
                foreach (var s in ids)
                {
                    if (int.TryParse(s, out var id))
                    {
                        set.Add(id);
                    }
                }

                if (set.Count > 0)
                {
                    groupFilter = set;
                    includeNoGroup = set.Contains(0); // 0 = „Bez grupy”
                }
            }

            // 1. Pobieramy z bazy tylko „inne partie” + Groups + SubParties
            var allOtherParties = await _context.Parties
                .Include(p => p.Groups)
                .Include(p => p.SubParties)
                .Where(p => p.Id != baseParty.Id)
                .AsNoTracking()
                .ToListAsync();

            // 2. Filtry robimy już w pamięci (EF już tu nie uczestniczy)

            IEnumerable<Party> candidates = allOtherParties;

            // a) tylko partie z poprawnymi CHES (pojedyncze liczby)
            candidates = candidates.Where(HasValidChes);

            // b) filtr krajów
            if (countryFilter != null && countryFilter.Count > 0)
            {
                candidates = candidates.Where(p =>
                    !string.IsNullOrEmpty(p.CountryCode) &&
                    countryFilter.Contains(p.CountryCode.ToUpperInvariant()));
            }

            // c) filtr grup (z obsługą „Bez grupy” = id 0)
            if (groupFilter != null && groupFilter.Count > 0)
            {
                var realGroupIds = new HashSet<int>(groupFilter.Where(id => id != 0));
                var filterByRealGroups = realGroupIds.Count > 0;

                candidates = candidates.Where(p =>
                    // partie bez grupy
                    (includeNoGroup && (p.Groups == null || !p.Groups.Any())) ||

                    // partie z jedną z wybranych grup
                    (filterByRealGroups &&
                     p.Groups != null &&
                     p.Groups.Any(g => realGroupIds.Contains(g.Id))));
            }

            // d) opcjonalnie ukrywamy partie spoza parlamentu/archiwalne
            if (!includeNonParliament)
            {
                candidates = candidates.Where(p => p.Mp.HasValue && p.Mp.Value > 0);
            }

            // 2.5. Wykluczamy „Composite-party” + parentów mających w SubParties (rekurencyjnie)
            // partie ze zbioru kandydatów – zostawiamy tylko „najgłębsze” partie
            var candidateList = candidates
                .Where(p => !string.Equals(p.EnglishName, "Composite-party", StringComparison.OrdinalIgnoreCase))
                .ToList();

            // Przekazujemy też Id partii bazowej, żeby usunąć jej koalicje
            candidateList = FilterOnlyDeepestParties(candidateList, baseParty.Id);

            // 3. Liczenie różnic CHES
            var baseScores = ExtractChesScores(baseParty);

            var similarityList = candidateList
                .Select(p =>
                {
                    var scores = ExtractChesScores(p);
                    double diff =
                        Math.Abs(scores.Economy - baseScores.Economy) +
                        Math.Abs(scores.Progress - baseScores.Progress) +
                        Math.Abs(scores.Liberal - baseScores.Liberal) +
                        Math.Abs(scores.Eu - baseScores.Eu);

                    return new { Party = p, Difference = diff };
                })
                .OrderBy(x => x.Difference)
                .ThenByDescending(x => x.Party.Mp ?? 0)
                .ToList();

            int totalCount = similarityList.Count;

            // 4. Paginacja
            var pageItems = similarityList
                .Skip(pageIndex * pageSize)
                .Take(pageSize)
                .ToList();

            // 5. Projekcja do DTO
            var dtoItems = pageItems.Select(x => new SimilarPartyDTO
            {
                Difference = Math.Round(x.Difference, 2),
                Party = new PartyDTO
                {
                    Id = x.Party.Id,
                    StringId = x.Party.StringId,
                    Acronym = x.Party.Acronym,
                    EnglishName = x.Party.EnglishName,
                    CountryCode = x.Party.CountryCode,
                    LocalName = x.Party.LocalName,
                    CHES_EU = x.Party.CHES_EU,
                    CHES_Economy = x.Party.CHES_Economy,
                    CHES_Progress = x.Party.CHES_Progress,
                    CHES_Liberal = x.Party.CHES_Liberal,
                    Mp = x.Party.Mp,
                    Role = x.Party.Role,
                    Groups = x.Party.Groups.Select(g => new GroupDTO
                    {
                        Id = g.Id,
                        Acronym = g.Acronym,
                        Name = g.Name,
                        R = g.R,
                        G = g.G,
                        B = g.B
                    }).ToList(),
                    SubParties = x.Party.SubParties.Select(sp => new PartyDTO
                    {
                        Id = sp.Id,
                        StringId = sp.StringId,
                        Acronym = sp.Acronym,
                        EnglishName = sp.EnglishName,
                        CountryCode = sp.CountryCode
                    }).ToList()
                }
            }).ToList();

            var result = new PagedSimilarPartiesDTO
            {
                TotalCount = totalCount,
                PageIndex = pageIndex,
                PageSize = pageSize,
                Items = dtoItems
            };

            return Ok(result);
        }

        

        private static PollDTO ToPollDTO(Poll poll)
        {
            return new PollDTO
            {
                Id = poll.Id,
                Pollster = poll.Pollster,
                Media = poll.Media,
                StartDate = poll.StartDate,
                FinishDate = poll.FinishDate,
                Type = poll.Type,
                Sample = poll.Sample,
                Others = poll.Others,
                Area = poll.Area,
                Results = poll.Results.Select(r => new PollResultDTO
                {
                    PartyId = r.PartyId,
                    Value = r.Value
                }).ToList()
            };
        }

        private IQueryable<Poll> BuildCountryPollQuery(string countryCode, string? area)
        {
            var query = _context.Polls
                .AsNoTracking()
                .Where(p => p.Results.Any(r => r.Party.CountryCode == countryCode));

            if (!string.IsNullOrWhiteSpace(area))
            {
                var normalizedArea = area.Trim().ToUpperInvariant();
                query = query.Where(p => (p.Area ?? string.Empty).ToUpper() == normalizedArea);
            }

            return query;
        }

        private static IQueryable<Poll> ApplyPollsterFilter(
            IQueryable<Poll> query,
            IEnumerable<string> pollsters)
        {
            var pollsterNames = MonthlyPollsterGroups.Expand(pollsters)
                .Where(name => !string.IsNullOrWhiteSpace(name))
                .Select(name => name.Trim().ToUpperInvariant())
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();

            if (pollsterNames.Count == 0)
            {
                return query.Where(_ => false);
            }

            // Pomelo fails to translate a collection parameter through PollResult.Poll on the aggregate query.
            // Normalize both sides so case variants match regardless of the database collation.
            var poll = Expression.Parameter(typeof(Poll), "poll");
            var pollsterProperty = Expression.Property(poll, nameof(Poll.Pollster));
            var trimmedPollster = Expression.Call(
                Expression.Coalesce(pollsterProperty, Expression.Constant(string.Empty)),
                nameof(string.Trim), Type.EmptyTypes);
            var upperPollster = Expression.Call(trimmedPollster, nameof(string.ToUpper), Type.EmptyTypes);
            Expression? predicate = null;

            foreach (var pollsterName in pollsterNames)
            {
                var equals = Expression.Equal(upperPollster, Expression.Constant(pollsterName));
                predicate = predicate == null ? equals : Expression.OrElse(predicate, equals);
            }

            var lambda = Expression.Lambda<Func<Poll, bool>>(predicate!, poll);
            return query.Where(lambda);
        }

        private static bool ApplyMonthRange(
            ref IQueryable<Poll> query,
            string? fromMonth,
            string? toMonth,
            out string? error)
        {
            error = null;

            if (!string.IsNullOrWhiteSpace(fromMonth))
            {
                if (!TryParseMonth(fromMonth, out var fromDate))
                {
                    error = "Query parameter 'fromMonth' must use YYYY-MM format.";
                    return false;
                }
                query = query.Where(p => p.FinishDate >= fromDate);
            }

            if (!string.IsNullOrWhiteSpace(toMonth))
            {
                if (!TryParseMonth(toMonth, out var toDate))
                {
                    error = "Query parameter 'toMonth' must use YYYY-MM format.";
                    return false;
                }
                var toExclusive = toDate.AddMonths(1);
                query = query.Where(p => p.FinishDate < toExclusive);
            }

            return true;
        }

        private static bool TryParseMonth(string month, out DateTime monthStart)
        {
            return DateTime.TryParseExact(
                month,
                "yyyy-MM",
                CultureInfo.InvariantCulture,
                DateTimeStyles.None,
                out monthStart);
        }

        private static string ToMonthKey(DateTime date)
        {
            return date.ToString("yyyy-MM", CultureInfo.InvariantCulture);
        }

        private static string ToMonthKey(int year, int month)
        {
            return $"{year:D4}-{month:D2}";
        }

        private static HashSet<string>? ParseCsvSet(string? csv)
        {
            if (csv == null)
            {
                return null;
            }

            return csv
                .Split(',', StringSplitOptions.TrimEntries)
                .Where(value => !string.IsNullOrWhiteSpace(value))
                .ToHashSet(StringComparer.OrdinalIgnoreCase);
        }

        private static List<MonthlyPollAggregateResultDTO> BuildMonthlyAggregateResults(
            IEnumerable<Poll> polls,
            string countryCode)
        {
            return polls
                .SelectMany(p => p.Results.Where(r => r.Party.CountryCode == countryCode && r.Value > 0))
                .GroupBy(r => r.PartyId)
                .Select(resultGroup =>
                {
                    var valueSum = resultGroup.Sum(r => r.Value);
                    var valueCount = resultGroup.Count();
                    return new MonthlyPollAggregateResultDTO
                    {
                        PartyId = resultGroup.Key,
                        ValueSum = Math.Round(valueSum, 4),
                        ValueCount = valueCount,
                        Average = valueCount == 0 ? 0 : Math.Round(valueSum / valueCount, 1)
                    };
                })
                .OrderBy(r => r.PartyId)
                .ToList();
        }

        #region Helpers – CHES similarity

        private static bool HasValidChes(Party party)
        {
            return IsSingleValue(party.CHES_Economy)
                   && IsSingleValue(party.CHES_Progress)
                   && IsSingleValue(party.CHES_Liberal)
                   && IsSingleValue(party.CHES_EU);
        }

        private static bool IsSingleValue(List<double>? values)
        {
            return values != null && values.Count == 1;
        }

        private static (double Economy, double Progress, double Liberal, double Eu) ExtractChesScores(Party party)
        {
            // Wywoływane tylko po HasValidChes, więc listy są != null i mają dokładnie 1 element
            return (
                party.CHES_Economy![0],
                party.CHES_Progress![0],
                party.CHES_Liberal![0],
                party.CHES_EU![0]
            );
        }

        #endregion
        
        // --- Filtrowanie „koalicji” – zostawiamy tylko najgłębsze partie ---
        // basePartyId – Id partii, z którą porównujemy (żeby wyrzucić jej koalicje)
        private static List<Party> FilterOnlyDeepestParties(
            List<Party> parties,
            Guid? basePartyId = null)
        {
            if (parties.Count == 0)
                return parties;

            // używamy Id (PK) jako identyfikatora w zbiorze
            var eligibleIds = parties
                .Where(p => p != null)
                .Select(p => p.Id)
                .ToHashSet();

            // Dodajemy też Id partii bazowej – jeśli któryś kandydat ma ją w SubParties,
            // zostanie potraktowany jako koalicja i odfiltrowany.
            if (basePartyId.HasValue)
            {
                eligibleIds.Add(basePartyId.Value);
            }

            var result = new List<Party>(parties.Count);

            foreach (var party in parties)
            {
                if (party == null)
                    continue;

                var visited = new HashSet<Guid> { party.Id };

                // jeśli w drzewie SubParties znajdziemy jakąkolwiek partię,
                // która też jest w „eligibleIds”, to ten parent jest koalicją
                if (!HasDescendantInSet(party, eligibleIds, visited))
                {
                    result.Add(party);
                }
            }

            return result;
        }

        private static bool HasDescendantInSet(
            Party party,
            HashSet<Guid> eligibleIds,
            HashSet<Guid> visited)
        {
            if (party.SubParties == null || party.SubParties.Count == 0)
                return false;

            foreach (var child in party.SubParties)
            {
                if (child == null)
                    continue;

                if (visited.Contains(child.Id))
                    continue;

                visited.Add(child.Id);

                // jeśli pod-partia jest w zbiorze kandydatów -> parent jest koalicją
                if (eligibleIds.Contains(child.Id))
                    return true;

                // rekurencja: pod-partia może mieć własne SubParties itd.
                if (HasDescendantInSet(child, eligibleIds, visited))
                    return true;
            }

            return false;
        }
    }
}
