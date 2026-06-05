# M0 — Manual fast-path (today's deliverable)

This folder is the **assignment**, not the app. It exists so you can ship what Johan
asked for *today* without waiting on any code (PRD principle: the app never blocks the
deliverable).

## What Johan asked for (Material/Assignment.txt)
1. A good **Spontansök** inMail/email text.
2. A **contact list** with **mail _and_ phone** to ≥ **15** potential praktikmottagare,
   per the LinkedIn-strategin.
3. Email it to **apl@lexicon.se**.
4. (If time) start spontaneously applying to people on the list.

## Files
| File | Use |
|------|-----|
| `01_spontansok_email.md` | The cold-email text (deck "Spontanansökningsmailet"). Fill the `[...]` placeholders. |
| `02_linkedin_inmail.md`  | The short first-contact LinkedIn message (deck Message 1). |
| `03_telefonsamtal_script.md` | Phone script for the switchboard / contact (deck "Telefonsamtalet", strategy step 4B). |
| `04_lexicon_submission_email.md` | The cover email to `apl@lexicon.se` with the list. |
| `lexicon_list.csv` | The ≥15-contact list. Replace the SAMPLE rows; keep the header. |

## The research loop (deck "Spontansök-strategi"), done by hand for M0
For each target, until you have ≥15 rows with **both** email and phone:
1. LinkedIn Boolean search for the right title + stack — e.g.
   `(Utvecklingschef OR "Development Lead" OR CTO OR "Lead Developer") AND .NET AND "C#" AND (MVC OR ASP)`
2. Open the person → note their **company**.
3. allabolag.se → org.nr, ort, size, economy. Prefer **small, solvent, less-famous**
   firms in your target län (default: Norrland / Norrbotten / Västerbotten).
4. Company website `/kontakt` → grab **email + phone**.
   4B. No contact info? Call the **switchboard** (use `03_telefonsamtal_script.md`) and ask.
5. Add a row to `lexicon_list.csv`.

> ⚠️ Confirm before sending: (a) your actual **praktikperiod dates** — the deck says
> 18 Feb–18 Mar but is dated June; (b) whether `apl@lexicon.se` wants the list **in the
> email body, as CSV, or PDF** (one line to Johan/Linnea/Claudia settles it).
