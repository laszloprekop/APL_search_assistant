# APL Search Assistant — LinkedIn Capture (browser extension)

A small Manifest V3 extension that captures the LinkedIn **people-search results you are
currently viewing** into a CSV/JSON, to seed your APL contact list. Implements the
"assisted capture" path of the PRD (§6.1).

## ⚠️ Scope & ToS boundary — read this
- **Manual trigger only.** You click **Capture**; the extension reads what's already
  rendered on your screen. It does **not** auto-scroll, auto-paginate, log in, or fetch in
  the background. It is not a crawler.
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

## Permissions
- `storage` — to persist captures across result-page navigations.
- `host_permissions: http://localhost:5099/*` — to send to the local app.
The only network call is to `localhost`; nothing leaves your machine otherwise.
