namespace backend.Models
{
    public class Group
    {
        public int Id { get; set; }
        public string Acronym { get; set; }
        public string Name { get; set; }
        public int R { get; set; }
        public int G { get; set; }
        public int B { get; set; }
        public ICollection<Party> Parties { get; set; } // Many-to-Many with Party
    }
}