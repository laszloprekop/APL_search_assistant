using Api.Models;
using Microsoft.EntityFrameworkCore;

namespace Api.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<Company> Companies => Set<Company>();
    public DbSet<Person> Persons => Set<Person>();
    public DbSet<ContactInfo> Contacts => Set<ContactInfo>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<Company>(e =>
        {
            e.Property(x => x.Name).IsRequired();
            // PRD §9: statuses persisted as enum strings, not ints.
            e.Property(x => x.Stage).HasConversion<string>();
            e.Property(x => x.Source).HasConversion<string>();
            e.Property(x => x.EnrichmentStatus).HasConversion<string>();

            e.HasMany(x => x.Persons)
                .WithOne(p => p.Company!)
                .HasForeignKey(p => p.CompanyId)
                .OnDelete(DeleteBehavior.Cascade);

            e.HasMany(x => x.Contacts)
                .WithOne(c => c.Company!)
                .HasForeignKey(c => c.CompanyId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        b.Entity<Person>(e =>
        {
            e.Property(x => x.Name).IsRequired();
            e.HasIndex(x => x.LinkedInHandle);
        });

        b.Entity<ContactInfo>(e =>
        {
            e.Property(x => x.Value).IsRequired();
            e.Property(x => x.Type).HasConversion<string>();
            e.Property(x => x.Source).HasConversion<string>();
            e.Property(x => x.Confidence).HasConversion<string>();
        });
    }
}
