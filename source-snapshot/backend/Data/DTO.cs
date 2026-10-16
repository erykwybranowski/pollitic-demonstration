using System.Collections.Generic;

namespace backend.Data
{
    public class PartyDTO
    {
        public Guid Id { get; set; }
        public string StringId { get; set; }
        public string Acronym { get; set; }
        public string EnglishName { get; set; }
        public string CountryCode { get; set; }
        public List<string> LocalName { get; set; }
        public List<double>? CHES_EU { get; set; }
        public List<double>? CHES_Economy { get; set; }
        public List<double>? CHES_Progress { get; set; }
        public List<double>? CHES_Liberal { get; set; }
        public List<PartyDTO> SubParties  { get; set; }
        public List<GroupDTO> Groups { get; set; }
        public int? Mp { get; set; }
        public ICollection<string> Role { get; set; }
    }

    public class GroupDTO
    {
        public int Id { get; set; }
        public string Acronym { get; set; }
        public string Name { get; set; } = string.Empty;
        public int R { get; set; }
        public int G { get; set; }
        public int B { get; set; }
    }

    public class PollDTO
    {
        public Guid Id { get; set; }
        public string Pollster { get; set; }
        public List<string> Media { get; set; }
        public DateTime StartDate { get; set; }
        public DateTime FinishDate { get; set; }
        public string Type { get; set; }
        public int? Sample { get; set; }
        public List<PollResultDTO> Results { get; set; }
        public double Others { get; set; }
        public string Area { get; set; } = string.Empty;
    }
    
    public class NewestPollsDTO
    {
        public Guid Id { get; set; }
        public string Pollster { get; set; }
        public List<string> Media { get; set; }
        public DateTime StartDate { get; set; }
        public DateTime FinishDate { get; set; }
        public string Type { get; set; }
        public int? Sample { get; set; }
        public List<PollResultDTO> Results { get; set; }
        public double Others { get; set; }
        public string Area { get; set; } = string.Empty;
        public string CountryCode { get; set; }
    }

    public class PollResultDTO
    {
        public Guid PartyId { get; set; }
        public double Value { get; set; }
    }
    public class PollOptionDTO
    {
        public Guid Id { get; set; }
        public string Pollster { get; set; } = string.Empty;
        public DateTime FinishDate { get; set; }
        public string Area { get; set; } = string.Empty;
    }

    public class PagedLatestPollsDTO
    {
        public int TotalCount { get; set; }
        public int PageIndex { get; set; }
        public int PageSize { get; set; }
        public List<LatestPollItemDTO> Items { get; set; } = new();
    }

    public class LatestPollItemDTO
    {
        public PollDTO Poll { get; set; } = new();
        public PollDTO? PreviousPoll { get; set; }
    }

    public class MonthlyTrendResponseDTO
    {
        public IReadOnlyList<MonthlyPollsterGroupDTO> PollsterGroups { get; set; } = Array.Empty<MonthlyPollsterGroupDTO>();
        public List<string> AvailableMonths { get; set; } = new();
        public List<MonthlyPollsterUsageDTO> AvailablePollsters { get; set; } = new();
        public List<MonthlyPollsterUsageDTO> Pollsters { get; set; } = new();
        public List<MonthlyTrendPointDTO> Points { get; set; } = new();
    }

    public class MonthlySupportResponseDTO
    {
        public string Month { get; set; } = string.Empty;
        public string Area { get; set; } = string.Empty;
        public int PollCount { get; set; }
        public List<MonthlyPollAggregateResultDTO> Results { get; set; } = new();
        public List<MonthlyPollsterUsageDTO> Pollsters { get; set; } = new();
    }

    public class MonthlyTrendPointDTO
    {
        public string Month { get; set; } = string.Empty;
        public string Area { get; set; } = string.Empty;
        public int PollCount { get; set; }
        public List<MonthlyPollAggregateResultDTO> Results { get; set; } = new();
    }

    public class MonthlyPollsterUsageDTO
    {
        public string Name { get; set; } = string.Empty;
        public int Count { get; set; }
    }

    public record MonthlyPollsterGroupDTO(string Name, string[] Aliases);

    public class MonthlyPollAggregateResultDTO
    {
        public Guid PartyId { get; set; }
        public double ValueSum { get; set; }
        public int ValueCount { get; set; }
        public double Average { get; set; }
    }

    public class CountryDTO
    {
        public string CountryCode { get; set; }
        public string Name { get; set; } = string.Empty;
    }
    
    public class SimilarPartyDTO
    {
        public PartyDTO Party { get; set; }
        public double Difference { get; set; }
    }

    public class PagedSimilarPartiesDTO
    {
        public int TotalCount { get; set; }
        public int PageIndex { get; set; }
        public int PageSize { get; set; }
        public List<SimilarPartyDTO> Items { get; set; }
    }
}



