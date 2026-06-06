using System.Text.RegularExpressions;
using Api.Data;
using Api.Models;
using Microsoft.EntityFrameworkCore;

namespace Api.Services;

/// <summary>
/// M4 outreach helpers (no auto-send): seed the five templates, resolve {{merge_field}} tokens
/// per company/person, and pick the recipient per channel. Templates are seeded from
/// Deliverable/01–04 with [...] placeholders turned into {{merge_field}} tokens; all stay
/// editable in-app afterwards.
/// </summary>
public static class OutreachService
{
    public record Seed(TemplateKind Kind, string? Subject, string Body);

    // Settings keys (local DB) → merge-field name. The user's own details, not secrets.
    public static readonly (string Key, string Field)[] ConstantKeys =
    {
        ("outreach.yourName", "your_name"),
        ("outreach.cvSummary", "your_experience"),
        ("outreach.email", "your_email"),
        ("outreach.phone", "your_phone"),
        ("outreach.linkedin", "your_linkedin"),
        ("outreach.period", "period"),
        ("outreach.area", "your_area"),
    };

    private static readonly Regex Token = new(@"\{\{\s*(\w+)\s*\}\}", RegexOptions.Compiled);

    /// <summary>Replace {{field}} with its value; an unset/blank field becomes a visible
    /// [field?] marker so the user fixes it before sending — never silently blank.</summary>
    public static string Render(string? text, IReadOnlyDictionary<string, string?> fields)
    {
        if (string.IsNullOrEmpty(text)) return text ?? "";
        return Token.Replace(text, m =>
        {
            var key = m.Groups[1].Value;
            return fields.TryGetValue(key, out var v) && !string.IsNullOrWhiteSpace(v) ? v! : $"[{key}?]";
        });
    }

    /// <summary>Full merge-field map: per company/person fields + the Settings constants.</summary>
    public static Dictionary<string, string?> Fields(Company c, Person? p, IReadOnlyDictionary<string, string> constants)
    {
        var f = new Dictionary<string, string?>(StringComparer.OrdinalIgnoreCase)
        {
            ["name"] = p?.Name,
            ["company"] = c.Name,
            ["stack"] = c.TechStackGuess,
            ["ort"] = c.LocationKommun,
        };
        foreach (var kv in constants) f[kv.Key] = kv.Value;
        return f;
    }

    public static async Task<Dictionary<string, string>> LoadConstantsAsync(AppDbContext db)
    {
        var map = await db.Settings.AsNoTracking()
            .Where(s => s.Key.StartsWith("outreach."))
            .ToDictionaryAsync(s => s.Key, s => s.Value);
        var consts = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var (key, field) in ConstantKeys)
            consts[field] = map.TryGetValue(key, out var v) ? v : "";
        return consts;
    }

    /// <summary>Recipient for a channel: the chosen person's real email, else a generic company
    /// email (Email); the profile URL (LinkedIn); the switchboard/any phone (Phone).</summary>
    public static string? RecipientFor(OutreachChannel channel, Company c, Person? p)
    {
        switch (channel)
        {
            case OutreachChannel.Email:
                static string? PickEmail(IEnumerable<ContactInfo> xs) =>
                    xs.FirstOrDefault(x => x.Type == ContactType.Email && x.Source != ContactSource.Guessed)?.Value
                    ?? xs.FirstOrDefault(x => x.Type == ContactType.Email)?.Value;
                if (p is not null)
                {
                    var personEmail = PickEmail(c.Contacts.Where(x => x.PersonId == p.Id));
                    if (personEmail is not null) return personEmail;
                }
                return PickEmail(c.Contacts.Where(x => x.PersonId == null)) ?? PickEmail(c.Contacts);
            case OutreachChannel.Linkedin:
                return p?.LinkedInUrl ?? c.LinkedInUrl;
            case OutreachChannel.Phone:
                return c.Contacts.FirstOrDefault(x => x.Type == ContactType.Phone && x.Source == ContactSource.Switchboard)?.Value
                    ?? c.Contacts.FirstOrDefault(x => x.Type == ContactType.Phone)?.Value;
            default:
                return null;
        }
    }

    // Which template a channel+kind uses.
    public static TemplateKind TemplateFor(OutreachChannel channel, OutreachKind kind) => channel switch
    {
        OutreachChannel.Linkedin => TemplateKind.LinkedinInmail,
        OutreachChannel.Phone => TemplateKind.CallScript,
        _ => kind == OutreachKind.Followup ? TemplateKind.Followup : TemplateKind.ColdEmail,
    };

    // Email/LinkedIn are user-sent → Sent; Phone is logged after the call → Logged.
    public static OutreachLogStatus DefaultStatus(OutreachChannel channel) =>
        channel == OutreachChannel.Phone ? OutreachLogStatus.Logged : OutreachLogStatus.Sent;

    // Which contact-point type a channel touches (to bump its reach-out status on log).
    public static ContactType ContactTypeFor(OutreachChannel channel) => channel switch
    {
        OutreachChannel.Email => ContactType.Email,
        OutreachChannel.Phone => ContactType.Phone,
        _ => ContactType.LinkedIn,
    };

    // ---- seed templates (from Deliverable/01–04; followup is a short starter) ----
    public static readonly Seed[] Seeds =
    {
        new(TemplateKind.ColdEmail, "Praktikplats inom .NET/systemutveckling – {{your_name}}",
            """
            Hej {{name}},

            Jag genomför just nu en 1-årig heltids-intensivutbildning med inriktning mot systemutveckling. I {{period}} kommer jag att söka praktik (APL) inom detta område. Praktiken är kostnadsfri för er och alla försäkringar är täckta.

            Mina tidigare IT-erfarenheter består av {{your_experience}}.

            Utbildningen genomförs av Lexicon i samarbete med Luleå Tekniska Universitet och ger under ett år djupgående kunskaper i C#/.NET, frontendutveckling (HTML, CSS, JavaScript, React), databashantering (SQL Server, Entity Framework), API-utveckling i ASP.NET Core, testning och molntjänster. Kurserna från LTU omfattar även programvaruteknik, systemanalys, UML, agil utveckling, datakommunikation och dator-/webbsäkerhet. Innehållet kan appliceras även inom Javautveckling.

            Se gärna den bifogade PDF:en för en mer detaljerad beskrivning av utbildningen, samt mitt CV.

            Jag tar gärna ett möte eller ett samtal med dig!

            Vänliga hälsningar,
            {{your_name}}
            {{your_email}} · {{your_phone}} · {{your_linkedin}}
            """),

        new(TemplateKind.LinkedinInmail, null,
            """
            Hej {{name}}, jag genomför just nu en 1-årig intensivutbildning med inriktning .NET systemutveckling och kommer i {{period}} att söka praktik (APL) inom området. Tar gärna en dialog med dig!

            Mvh {{your_name}}
            """),

        new(TemplateKind.CallScript, null,
            """
            ÖPPNING
            Hej {{name}}, {{your_name}} heter jag. Jag kontaktar dig som en potentiell praktikgivare. Jag går just nu en Fullstack .NET-utbildning och ska under {{period}} genomföra praktik.

            LÄGLIGT?
            Ringer jag lägligt nu?
            – (Inte?) → Ok, när passar det bättre att jag återkommer?
            – (Fel person?) → Vore toppen om jag kunde få kontaktuppgifter (mail + telefon) till rätt person.

            PITCH
            Toppen. Jag genomför alltså en påbyggnadsutbildning inriktning .NET Fullstack och har sedan tidigare erfarenhet inom {{your_area}}. Praktiken är helt kostnadsfri och alla försäkringar är täckta.

            BEHOVSFRÅGOR
            - Hur ser läget ut hos er? Har ni tidigare tagit in systemutvecklar-praktikanter, eller finns planer på det framåt?
            - Vilken teknikstack arbetar ni inom? Vilka kompetenser är viktigast för er?

            AVSLUT
            Får jag gärna skicka över en kort spontansök med mitt CV på mail? Vilken adress passar bäst?
            """),

        new(TemplateKind.Followup, "Uppföljning – praktikplats inom .NET ({{your_name}})",
            """
            Hej {{name}},

            Jag hörde av mig för en tid sedan angående en praktikplats (APL) inom systemutveckling under {{period}}. Jag ville bara följa upp och höra om det kan vara intressant för er.

            Praktiken är kostnadsfri och alla försäkringar är täckta. Hör gärna av dig om du har några frågor!

            Vänliga hälsningar,
            {{your_name}}
            {{your_email}} · {{your_phone}}
            """),

        new(TemplateKind.Lexicon, "Kontaktlista – potentiella praktikmottagare ({{your_name}}, VT-2026)",
            """
            Hej Johan,

            Här kommer min lista med potentiella praktikmottagare enligt LinkedIn-strategin, med kontaktuppgifter (mail och telefon).

            Bifogar listan som CSV. Säg gärna till om ni hellre vill ha den i ett annat format.

            Med vänliga hälsningar,
            {{your_name}}
            {{your_email}} · {{your_phone}}
            """),
    };
}
