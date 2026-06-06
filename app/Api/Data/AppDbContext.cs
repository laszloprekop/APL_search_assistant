using Api.Models;
using Microsoft.EntityFrameworkCore;

namespace Api.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<Company> Companies => Set<Company>();
    public DbSet<Person> Persons => Set<Person>();
    public DbSet<ContactInfo> Contacts => Set<ContactInfo>();
    public DbSet<Setting> Settings => Set<Setting>();
    public DbSet<Template> Templates => Set<Template>();
    public DbSet<Outreach> Outreach => Set<Outreach>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        // Keys are client-generated Guids (set in the entity initializers). Tell EF so it
        // doesn't treat them as store-generated — that path miscounts affected rows on SQLite
        // and throws a spurious DbUpdateConcurrencyException when inserting child rows.
        b.Entity<Company>().Property(x => x.Id).ValueGeneratedNever();
        b.Entity<Person>().Property(x => x.Id).ValueGeneratedNever();
        b.Entity<ContactInfo>().Property(x => x.Id).ValueGeneratedNever();
        b.Entity<Template>().Property(x => x.Id).ValueGeneratedNever();
        b.Entity<Outreach>().Property(x => x.Id).ValueGeneratedNever();

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

        b.Entity<Setting>().HasKey(x => x.Key);

        b.Entity<ContactInfo>(e =>
        {
            e.Property(x => x.Value).IsRequired();
            e.Property(x => x.Type).HasConversion<string>();
            e.Property(x => x.Source).HasConversion<string>();
            e.Property(x => x.Confidence).HasConversion<string>();
            e.Property(x => x.OutreachStatus).HasConversion<string>();

            // Optional owner person. Deleting a person detaches its contacts to generic
            // (SetNull), not delete — we don't want to lose a captured email/phone.
            e.HasOne(x => x.Person)
                .WithMany(p => p.Contacts)
                .HasForeignKey(x => x.PersonId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        b.Entity<Template>(e =>
        {
            e.Property(x => x.Kind).HasConversion<string>();
            e.HasIndex(x => x.Kind).IsUnique(); // one row per kind
        });

        b.Entity<Outreach>(e =>
        {
            e.Property(x => x.Channel).HasConversion<string>();
            e.Property(x => x.Kind).HasConversion<string>();
            e.Property(x => x.Status).HasConversion<string>();
            e.HasOne(x => x.Company).WithMany().HasForeignKey(x => x.CompanyId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.Person).WithMany().HasForeignKey(x => x.PersonId).OnDelete(DeleteBehavior.SetNull);
        });
    }
}
