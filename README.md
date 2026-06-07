# APL Search Assistant

A **local-first** web app + browser extension that automates the grindy parts of the Lexicon ×
LTU **APL (internship) search** — discovery, enrichment, personalized outreach, and the required
≥15-host contact list — while keeping a human on every send button.

> Built for the Lexicon LTU VT-2026 APL search, and as a portfolio piece in the course stack
> (ASP.NET Core + EF Core/SQLite + React + a Chrome MV3 extension).

![The company pipeline — enrichment, grouped contact points, and per-company outreach](Docs/APL_assist_app.png)

## What it does

**Company pipeline.** One table of every company with its stage
(`Identified → Enriched → Ready → Contacted → Replied → Closed`), email/phone channels,
enrichment status, and a **“≥15 ready” counter** that only counts companies with *both* a real
email and phone (the Lexicon-list bar). Filter by stage / ready-only, edit any field inline, add
companies by hand, expand a row for the full profile.

**Browser extension (Chrome MV3).** Assisted, manual, low-volume capture — no auto-crawling:

- **LinkedIn people-search capture** — browse a Boolean search yourself and append the visible
  results to a list (deduped, accumulates across pages).
- **Guided website-enrichment wizard** — one click per page walks each person’s profile →
  company About page → grabs the company website onto their row, then sends the enriched list to
  the app.
- **allabolag.se capture** — reads org.nr, switchboard phone, kommun, and revenue/financials from
  the page you opened and applies them to the right app company (pinned by the app via a link, so
  a name mismatch like *Euroclear* vs *Euroclear Sweden AB* still lands correctly).

<p>
  <img src="Docs/Browser_ext_1.png" alt="LinkedIn capture panel: the three-step flow — build the list, add website URLs, output" width="260">
  <img src="Docs/Browser_ext_2.png" alt="Captured people accumulate (deduped) across search pages" width="260">
  <img src="Docs/Browser_ext_3.png" alt="The guided website-enrichment wizard walking each profile → company About" width="260">
</p>

**Enrichment.** Cautious, polite public-website fetch (homepage + likely contact/team pages —
`/kontakt`, `/om-oss`, `/team`, `/medarbetare`, …) that extracts emails/phones and attributes
them to people by name; a **per-person search fallback** to fill an individual email gap the crawl
missed; optional **website / LinkedIn-page lookup** via a configurable search provider
(Brave / Google PSE / Serper); and MX-gated generic guesses (`info@`, `kontakt@`) that are clearly
flagged and **excluded from the ≥15 list**. Every fetch failure degrades gracefully to manual entry.

**Contacts as reach-out points.** Every email, phone, and LinkedIn profile is a *trackable*
contact point with its own status (`Not contacted → Contacted → Replied → Bounced → Closed`),
grouped under the person it belongs to or the company.

**Personalized outreach — three channels, no auto-send.** Five editable templates (cold email,
LinkedIn inMail, phone script, follow-up, Lexicon cover) with `{{merge_field}}` tokens filled from
your details + the company. Per-company drafts you act on yourself:

- **Email** → opens a prefilled compose window (`mailto:` or *Open in Gmail*).
- **LinkedIn** → copies the inMail text to send manually.
- **Phone** → shows the merge-filled call script + a `tel:` link, log the outcome.

Marking one sent/logged **advances the company stage** and is recorded in an **Outbox**.

**Lexicon ≥15-list submission.** Generates the contact list (clean CSV + a cover email from the
Lexicon template), then a guided flow — *download CSV → open the email + attach it → mark
submitted* — and snapshots exactly what was sent for your records.

## Use cases — pick your level of automation

The app and extension are deliberately **modular**: you can run it as a bare
spreadsheet-replacement and turn on the heavier, more automated parts only when you want them.
Each rung below removes a specific manual grind; you can stop at any rung.

### 1 · Effort & success tracker (zero automation)

> **The grind:** keeping a scattered spreadsheet of who you contacted, when, and whether they
> replied — and eyeballing whether you've hit the ≥15-host bar.

Use the app purely as a pipeline board. **Add companies by hand**, or **paste in a spreadsheet**
(Import / Export → copy a range from a Google Sheet and paste the tab-separated rows — a Swedish
*company discovery list* and a *per-person contact tracker* layout are recognized, with the header
row optional). Attach email/phone/LinkedIn contact points, and move each one through
`Identified → Enriched → Ready → Contacted → Replied → Closed` yourself. Every contact point
carries its own status (`Not contacted → Contacted → Replied → Bounced → Closed`), and the **“≥15
ready” counter** does the bookkeeping — it only counts companies with *both* a real email and
phone. *No crawling, no extension, no API keys.*

### 2 · + Templated outreach

> **The grind:** rewriting the same cold email / inMail / phone script for every company and
> hand-substituting names, dates, and your own details each time.

Turn on the **five editable templates** (cold email, LinkedIn inMail, phone script, follow-up,
Lexicon cover). `{{merge_field}}` tokens are filled from **Your details** + the company, so each
draft comes out personalized. Nothing is auto-sent: **Email** opens a prefilled compose window
(`mailto:` / *Open in Gmail*), **LinkedIn** copies the inMail to paste, **Phone** shows the
merge-filled script + a `tel:` link. Marking one sent **advances the stage** and logs it to the
**Outbox**.

### 3 · + Enrich manual contacts from allabolag.se

> **The grind:** opening each company on allabolag and copying org.nr, switchboard phone, kommun,
> and revenue across by hand — and matching *Euroclear* to *Euroclear Sweden AB*.

With the **extension** on an `allabolag.se` page, one click reads org.nr, switchboard phone,
kommun, and financials and applies them to the **right** app company — pinned by a link from the
app, so name mismatches still land correctly. Read-only, one click = one page.

### 4 · + Enrich a company from its own website

> **The grind:** clicking through `/kontakt`, `/om-oss`, `/team` pages hunting for real
> addresses and phone numbers and figuring out *whose* they are.

The app does a **cautious, polite public-website fetch** (homepage + likely contact/team pages),
extracts emails/phones, and **attributes them to people by name**. A **per-person search
fallback** fills an individual gap the crawl missed; MX-gated generic guesses (`info@`,
`kontakt@`) are clearly flagged and **excluded from the ≥15 list**. Every failure degrades
gracefully to manual entry.

### 5 · + Source contacts from LinkedIn (two steps)

> **The grind:** scrolling Boolean people-searches, copying names off the page, then chasing
> down each person's employer website one profile at a time.

Two separate, user-initiated extension steps:

1. **Capture people** — browse a Boolean people-search yourself and append the visible results to
   a list. It **dedupes** and **accumulates across pages**.
2. **Grab company websites** — the **guided wizard** walks each captured person's profile →
   company About page → lifts the company website URL onto their row, then sends the enriched list
   to the app.

Kept as two steps on purpose: capture is fast and broad; the website pass is the slow part, so you
run it only on the people you keep. Manual trigger only — no auto-pagination, no background fetch.

### 6 · Export / share the ready list

> **The grind:** assembling the required ≥15-host contact list into something clean enough to
> hand in or share with a coach.

When ≥15 companies are **Ready**, the **Lexicon list generator** produces a **clean CSV**
(`lexicon_list.csv`) plus a cover email from the Lexicon template, then a guided *download CSV →
open the email + attach → mark submitted* flow that **snapshots exactly what was sent**. The same
CSV is a tidy, shareable export of your ready-to-reach-out companies and people.

For ad-hoc sharing, **Import / Export → Export** copies the **current table view** (respecting your
stage / ready-only filter) as tab-separated rows in either sheet layout — paste it straight back
into a Google Sheet to hand off or collaborate.

## How it flows — inputs to outputs

```mermaid
flowchart LR
  subgraph IN["Inputs"]
    LI["LinkedIn<br/>people search"]
    AB["allabolag.se<br/>page"]
    WEB["Company<br/>website"]
    MAN["Manual add"]
    SS["Spreadsheet<br/>paste (TSV)"]
  end

  subgraph EXT["Browser extension"]
    CAP["Capture people<br/>(dedupe + accumulate)"]
    WIZ["Website wizard<br/>profile → About → URL"]
    ABC["allabolag capture<br/>org.nr · phone · financials"]
  end

  subgraph APP["Web app"]
    PIPE["Company pipeline<br/>+ contact points<br/>+ ≥15 counter"]
    ENR["Enrichment<br/>website crawl + search"]
    TPL["Templates<br/>{{merge fields}}"]
    OUT["3-channel outreach<br/>+ stage tracking"]
  end

  subgraph OUTP["Outputs"]
    DRAFT["Email / LinkedIn / phone<br/>drafts (you send)"]
    OBX["Outbox log"]
    LEX["Lexicon ≥15<br/>CSV + cover"]
    XPT["Spreadsheet<br/>export (TSV)"]
  end

  LI --> CAP --> PIPE
  LI --> WIZ --> PIPE
  AB --> ABC --> PIPE
  MAN --> PIPE
  SS --> PIPE
  WEB --> ENR
  PIPE --> ENR --> PIPE
  PIPE --> TPL --> OUT
  OUT --> DRAFT
  OUT --> OBX
  PIPE -- "when ≥15 ready" --> LEX
  PIPE --> XPT
```

## Tech stack

- **Backend:** ASP.NET Core Minimal APIs (.NET 10), EF Core + **SQLite** (`apl.db`), code-first
  migrations applied on startup.
- **Frontend:** React 18 + Vite + TypeScript + Tailwind CSS v4 — a token-based theme
  (charcoal/gold palette), IBM Plex Sans Condensed type, and Material Design Icons.
- **Extension:** Chrome Manifest V3 content scripts (LinkedIn + allabolag), semantic-anchor DOM
  parsing, shared pure-JS parser with a Node test suite.

## Setup

**Prerequisites:** [.NET 10 SDK](https://dotnet.microsoft.com/download), Node.js 20+, and a
Chromium-based browser for the extension.

**1 · API** (creates + migrates `apl.db`, seeds the templates on first run):

```bash
cd app/Api
dotnet run          # → http://localhost:5099
```

**2 · Web app** (Vite dev server, proxies `/api` → :5099):

```bash
cd app/web
npm install
npm run dev         # → http://localhost:5180
```

**3 · Extension** — open `chrome://extensions`, enable **Developer mode**, click **Load
unpacked**, and select the `extension/` folder. It activates on LinkedIn search/profile/company
pages and on `allabolag.se`, and talks to the API on `localhost:5099`.

**4 · Settings (optional, in-app):** open **Settings** in the web app to
- pick a **search provider + API key** (Brave / Google PSE / Serper) for *Find website* and the
  per-person contact-gap search, and
- fill **Your details** (name, period, email, phone, LinkedIn, area, CV summary) — these feed the
  `{{your_*}}` / `{{period}}` outreach merge fields.

**Tests** (extension parser):

```bash
cd extension && npm install && npm test
```

## Project layout

```
app/Api/         ASP.NET Core API — entities, EF migrations, endpoints, services
app/web/         React + Vite frontend
extension/       Chrome MV3 extension (parser.js is shared + unit-tested)
Deliverable/     Manual fast-path templates (the M0 deliverable, with placeholders)
Docs/            PRD, enrichment-wizard spec, screenshots
```

## Privacy, security & ToS

- **Local-first:** all data lives in `apl.db` on your machine. The DB, `Deliverable.local/`,
  `Material/`, and `.env*` are git-ignored — the repo ships **schema + templates, never data**.
- **Secrets** (search API keys) and your outreach details are stored only in the local DB and are
  never returned to the browser in full or committed. No telemetry, no third-party trackers, no
  plus-alias in outbound mail.
- **Email is never auto-sent** — every message is reviewed and sent by you (mailto/Gmail compose).
- **Extension posture:** manual, user-initiated, read-only, one click = one navigation; it only
  reads the page you opened (no background fetching or auto-pagination), to stay within site terms.

## Status

Implemented through **M5**:

| | Milestone | State |
|---|---|---|
| M0 | Manual fast-path templates (`Deliverable/`) | ✅ |
| M1 | Company-centric data layer + pipeline | ✅ |
| M2 | Discovery (LinkedIn + allabolag capture) | ✅ |
| M3 | Enrichment (website crawl + search + allabolag) | ✅ |
| M4 | Templates + 3-channel outreach + Outbox | ✅ |
| M5 | Lexicon ≥15-list submission | ✅ |
| M6 | Reply tracking + follow-up-due queue + placement | ⬜ |
| M7 | Stretch — LLM interview prep, auto inbox-read, bookmarklet | ⬜ |

## Docs

- **[Product Requirements (PRD)](Docs/APL_Search_Assistant_PRD.md)** — full spec, data model,
  build milestones.
- **[Enrichment wizard spec](Docs/enrichment-wizard.md)** — the guided LinkedIn → website flow.
- **`Deliverable/`** — the manual fast-path templates (spontansök email, LinkedIn inMail, phone
  script, Lexicon cover + list).
