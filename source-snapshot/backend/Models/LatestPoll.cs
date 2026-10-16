namespace backend.Models
{
    public class LatestPoll
    {
        public Guid PollId { get; set; }
        public Poll Poll { get; set; }
        public string CountryCode { get; set; }
        public Country Country { get; set; }
    }

}