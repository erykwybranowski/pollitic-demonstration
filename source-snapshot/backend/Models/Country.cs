namespace backend.Models
{
    public class Country
    {
        public string CountryCode { get; set; }
        public string Name { get; set; }
        public ICollection<Party> Parties { get; set; } // One-to-Many with Party
    }
}