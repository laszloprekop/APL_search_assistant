# APL Search Assistant — LinkedIn Capture (browser extension)

A small Manifest V3 extension that captures the LinkedIn **people-search results you are
currently viewing** into a CSV/JSON, to seed your APL contact list. Implements the
"assisted capture" path of the PRD (§6.1).

## ⚠️ Scope & ToS boundary — read this
- **You drive; it reads only what you open.** On people-search and company pages you click
  **Capture**; on a profile you open directly it **auto-reads that one rendered page**. Either
  way it **never** auto-scrolls, auto-paginates, opens tabs, logs in, or fetches in the
  background — and every page navigation and every send stays behind a click. It is not a crawler.
- **Personal use.** This is for your own internship hunt. Don't bulk-collect or redistribute
  other people's data. LinkedIn's User Agreement discourages automated collection — keep
  usage low-volume and human-paced, exactly as the Lexicon deck instructs you to do by hand.
- Captured data stays local (clipboard / a downloaded CSV). Nothing is sent anywhere.

## Install (load unpacked)
1. Chrome/Edge → `chrome://extensions` (or `edge://extensions`).
2. Toggle **Developer mode** (top-right).
3. **Load unpacked** → select this `extension/` folder.
4. Open a LinkedIn people search, e.g.
   `https://www.linkedin.com/search/results/people/?keywords=...`
   A small **APL Capture** panel appears bottom-right.

## Use
1. Run your Boolean search on LinkedIn; let the results render.
2. Click **Capture visible** — it grabs the cards on screen, **deduped by profile handle**.
3. **Accumulate across pages.** Scroll for more, or click LinkedIn's **Next** and capture again.
   Captures are persisted to `chrome.storage.local`, so they survive the page reload and the
   lists **append** (the same person is never stored twice).
4. **Send to APL Assistant** — POSTs everything to the local app (`/api/companies/import`,
   port 5099). Requires the API running; the server also dedupes by handle, so re-sending is
   safe. You'll see `N companies, M persons (K dupes skipped)`.
5. Or export to `Deliverable.local/lexicon_list.csv`:
   - **Copy CSV** / **Download CSV** — includes the header row (use for a fresh file).
   - **Copy rows** — header-less, for appending to a CSV that already has a header.
   - **Copy JSON** — the richer record (incl. `company_confidence`, `raw_current`).
6. **Clear all** wipes the accumulated set (and storage) when you start a new campaign.

## Enrich websites — the guided wizard (click-only)
After capturing your people list, click **Enrich websites →**. The extension walks each
captured person through **their profile → their company's About page**, reading the
authoritative LinkedIn **Website** field and the canonical `/company/<ID>/` URL, then holds
the enriched list until you **Send**.

- **One click = one page.** A small **APL · Enrich** panel (with a progress bar) appears at a
  fixed spot; click its button to open the next page, it reads what rendered, and the next
  button reappears under your cursor. No background fetching, no auto-advance, no new tabs —
  it only reads the page *you* opened. Keep it low-volume (this is the ToS line; see below).
- **Dedupe on the fly.** Several people at one company → each profile is visited (that's where
  the company link lives), but each company's About page is read only **once**.
- **Skip** anything that won't resolve (private profile, freelancer, company with no LinkedIn
  page). Those, plus companies whose About page lists no site, fall to the app's **Find
  website** (web search) as stage 2.
- **Send enriched list to app** → `POST /api/companies/import`. The app dedupes companies by
  the canonical `/company/<ID>/` (unifying name variants like `mfex` / `MFEXbyEuroclear`) and
  fills each company's website.

Full design + rationale (incl. why background fetching is off the table): `Docs/enrichment-wizard.md`.

## Capture a profile you visit directly
Land on a `linkedin.com/in/<person>` page you reached **outside** a search list (a referral,
a Google hit) and an **APL · Capture profile** panel appears (bottom-right). It **auto-reads**
that rendered profile — name, headline, location, and the canonical company link from the
Experience section — and shows the captured package.

- **Open *Company* ↗** walks the single website step (profile → that company's About → website),
  the same one-click, reads-only-what-you-open mechanism as the bulk wizard. **Send without
  website** skips it.
- No company on the profile (freelancer / no LinkedIn company page)? It still captures the
  person; **Send to app** files them (the app's **Find website** can fill the company later).
- **Send to app** → `POST /api/companies/import` with that single row. The app dedupes by
  profile handle, so re-capturing the same person is safe.

Reuses the enrichment wizard's engine; full design in `Docs/profile-capture.md`.

## Output (CSV schema)
Columns match `Deliverable/lexicon_list.csv` so captures append straight into your ≥15 list.
LinkedIn fills these:

| Column | From LinkedIn |
|--------|---------------|
| `foretag` | employer (parsed from "Current: … at X") |
| `ort` | location line |
| `lan` | guessed from "… County" / known län |
| `kontaktperson` | person name |
| `titel` | headline |
| `linkedin_url` | profile URL |
| `kontaktkalla` | `linkedin` |
| `status` | `not_contacted` |

`org_nr`, `antal_anstallda`, `ekonomi_note`, `epost`, `telefon` stay **blank** — those come
later from allabolag + company-website enrichment (PRD §6.2). The JSON export also includes
`company_confidence` and the raw "Current:" line.

## Verifying the parse (against the sample you provided)
On that Västerbotten `.NET` search, you should get rows like:

| Name | Company | Title | Conf |
|------|---------|-------|------|
| Andreas Larsson | Confirma Artvise AB | Team Lead / Software Developer | high |
| Stefan Eriksson | Sportswik AB | Technical Lead & Co Founder at Sportswik AB | high |
| Daniel Nilsson | Amnel AB | Senior Software Engineer | high |
| Johan Frank | Acino AB | Senior systemutvecklare | low* |
| Maximilian P. | Telia | Freelance Software Engineer | high |
| Daniel Hellström | twoday Sweden | CTO/Utvecklingschef - twoday INSIKT | high |
| Morgan Johansson | FXity | Senior Cloud Architect at Fxity | high |
| anders printz | mfex | Developer at mfex | medium |
| Don Janssen | Euroclear | Tech Lead at Euroclear | medium |

\* Johan Frank's only "at X" line is a *Past* role → low confidence. Company parsing is
best-effort; **review and edit** — LinkedIn's "Current" sometimes points at a side gig
(e.g. Clive L. → "IKSU" from a training-instructor role, not his .NET work).

## Layout
- `parser.js` — pure parsing logic (no DOM mutation, no UI). Shared by the content script
  and the tests. **This is the only file to touch when LinkedIn changes its DOM.**
- `content.js` — the on-page panel, capture store, and CSV/JSON export.
- `manifest.json` — loads `parser.js` then `content.js`.
- `test/` — jsdom test suite.

## Tests
The parser is covered by a Node + jsdom suite that targets the **semantic contract** (not the
hashed classes), including the tricky cases: verified vs. non-verified name sources, the
company-precedence rule (Current → headline → Past), trailing-description trimming,
mutual-connection links not hijacking the primary URL, percent-encoded handles, and skipping
the Premium upsell card.

```
cd extension
npm install      # installs jsdom (dev only)
npm test         # node --test test/  -> 15 passing
```

## Maintenance (when LinkedIn changes the DOM)
Class names are hashed and rotate, so the parser keys off **semantic anchors only**
(`[role="listitem"]`, `aria-label`, `a[href*="/in/"]`, the "Current:" text). If results stop
parsing, fix `parser.js` and update `test/fixtures.js`. Use `window.__aplScan()` /
`window.__aplStore` in DevTools to debug live.

## Roadmap
- **Done:** clipboard + CSV export; cross-page accumulation (persisted, deduped);
  **Send to APL Assistant** → `POST http://localhost:5099/api/companies/import`.
- Optional: a company-first capture mode for allabolag result pages.

## Company-page capture (authoritative website)
Besides people-search, the extension also runs on **`linkedin.com/company/*`**. Open a
company's LinkedIn page and an **APL · Company** panel appears (bottom-right):

1. Click **Capture company** — reads the **About** data: website (unwrapping LinkedIn's
   `…/redir/redirect?url=` tracker), industry, company size, HQ.
2. **Send to app** → `POST /api/companies/upsert`, matched to the existing company **by name**
   (updates it; creates it if new). The website is LinkedIn's own field, so it's authoritative —
   more reliable than the web-search "Find website" guess, and it fills the few that search misses.

> Parser sourcing: schema.org JSON-LD first when present (logged-out pages), else the rendered
> DOM. Logged in, LinkedIn emits **no** JSON-LD, so the DOM path is used — validated against the
> real About `<dl>` markup (`<dt><h3>Website</h3></dt><dd><a href>…</a></dd>`), reading the
> labelled "Website"/"Webbplats" value plus Industry / Company size / Headquarters. Be on the
> **About tab** so those fields are present.

## allabolag capture (org.nr, financials, switchboard phone)
The extension also runs on **`allabolag.se`**. From the app, click **Open on allabolag** on a
company → open its detail page (`…/foretag/…`) → an **APL · allabolag** panel appears:

1. **Capture company** — reads org.nr, the **switchboard phone**, kommun, and the
   Omsättning/Resultat/Bolagsform figures (semantic `companyId-*` / `StatsWidget-*` anchors,
   not MUI's hashed classes).
2. It loads your app companies and **pre-selects the best name match** ("COS Systems AB" ↔
   "COS Systems"); confirm or change the **Send to** target.
3. **Send to app** → `POST /api/companies/{id}/allabolag` fills org.nr / kommun / revenue /
   financial note and adds the phone as a **Switchboard** contact (high-confidence — it counts
   toward the ≥15 list).

> Why an extension and not a server fetch: allabolag is behind Cloudflare, which blocks
> automated server requests — but **not** your real browser. Reading the page *you* opened is
> the same manual, low-volume, assisted posture as the LinkedIn capture.

## Permissions
- `storage` — to persist captures across result-page navigations.
- `host_permissions: http://localhost:5099/*` — to send to the local app.
The only network call is to `localhost`; nothing leaves your machine otherwise.
