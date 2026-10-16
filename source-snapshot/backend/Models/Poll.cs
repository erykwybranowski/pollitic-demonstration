namespace backend.Models
{
    public class Poll
    {
        public Guid Id { get; set; }
        public string Pollster { get; set; }
        public List<string> Media { get; set; }
        public DateTime StartDate { get; set; }
        public DateTime FinishDate { get; set; }
        public string Type { get; set; }
        public int? Sample { get; set; }
        public List<PollResult> Results { get; set; }
        public double Others { get; set; }
        public string Area { get; set; }
    }

    public class PollResult
    {
        public Guid PollId { get; set; }
        public Poll Poll { get; set; }

        public Guid PartyId { get; set; }
        public Party Party { get; set; }

        public double Value { get; set; }
    }

}