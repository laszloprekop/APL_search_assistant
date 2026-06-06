# PRD — APL Search Assistant

**A local-first web app to automate the grindy parts of the Lexicon APL (internship) hunt.**

Version 0.2 · Owner: László · Target: hand to Claude Code for implementation

> **v0.2 changelog (after grilling against `Material/`):** company-centric data model;
> both LinkedIn-first *and* allabolag-first discovery; three outreach channels (email/phone/
> LinkedIn); plus-alias dropped for a clean professional From; allabolag automation demoted to
> a cautious enhancement that degrades to assisted-paste; reply-tracking is manual-first;
> geography is a hard configurable filter (default Norrland); added the M0 manual fast-path,
> attachment handling, and the post-yes Lexicon checklista sub-flow.

---

## 1. Problem & context

The Lexicon LTU VT-2026 program requires students to find their own APL (workplace-based learning / internship) placement. The prescribed "LinkedIn / spontaneous-application" method is effective but extremely manual and repetitive:

1. Create a new search session aiming for ≥15 (user-specified) APL candidate hosts. Exclude already-contacted ones.
2. Find people with the right titles on LinkedIn (Boolean searches) **and/or** browse companies directly on allabolag.se.
3. Identify the company.
4. Check the company's finances on allabolag.se (prefer small, solvent, less-contested firms in the target region).
5. Find contact details (website email/phone, or call the switchboard).
6. Reach out via email, phone, or LinkedIn with a personalized spontaneous application.
7. Track who replied/declined/invited to interview/offered placement.
8. Follow up with non-responders.
9. Submit a list of ≥15 candidate hosts (with mail **and** phone) to `apl@lexicon.se`.

This app removes the repetitive overhead (organization, enrichment, drafting, tracking, follow-up scheduling) while keeping the human in control of the judgment calls and every outbound message.

## 2. Goals

- Cut the per-contact time from minutes to seconds for everything except the actual decision-making.
- Maintain a single source of truth for the "campaign": every **company**, its stage, and the full history of outreach across channels.
- Generate the required ≥15-host list (mail + phone) and email it to Lexicon after approval.
- Generate, send, and track personalized cold emails, calls, LinkedIn messages, and follow-ups — all behind approval gates.
- Build a lightweight company/person "profile" per target (including raw site/ad text) to power later interview prep.
- Be **local-first**: anyone cloning the repo runs their own instance with their own local database. No shared backend, no central store of personal data.

### 2.1 Two tracks (the app never blocks the deliverable)

This project runs on **two decoupled clocks**:

- **The assignment (M0, due now):** produce the spontansök text + the ≥15-contact list and email `apl@lexicon.se`. This is done by hand (see `Deliverable/` and §12 M0) and must **never** wait on app code.
- **The app (M1+, portfolio):** the software that automates the grind for the rest of the campaign, built in the course stack. Its milestones are sequenced so a half-built app is still useful, and so nothing about it gates the M0 deliverable.

## 3. Non-goals (v1)

- **No automated/headless LinkedIn scraping.** (See §6.1 and §11.) The human browses LinkedIn; the app assists. A helper bookmarklet/extension is optional (v1.5).
- User can also import a properly formatted CSV of prospects.
- No multi-user / hosted SaaS. Single user, single machine.
- No full CRM. Just enough pipeline tracking for this use case.
- No mobile app. Desktop browser only.
- No mass-mailing at scale — a small, deliberate, personalized campaign (tens of contacts, not thousands).

## 4. Users

A single bootcamp student running their own internship campaign locally. Technically literate (learning fullstack .NET), comfortable running a dev server and editing a `.env` file.

## 5. Guiding principles

1. **Human-in-the-loop for judgment, automation for grind.** The app never decides *who* to contact or *what* to say without review.
2. **Approval gates on every outbound action.** Sending the Lexicon list, any cold email, and any follow-up each require an explicit "Review → Approve → Send" step. Nothing sends silently.
3. **Local-first & private.** All personal data (companies, contacts, drafts, profiles, response history) lives in a local SQLite file that is `.gitignore`d. The repo ships schema + seed, never data.
4. **ToS-aware & degradeable.** No design that risks the user's own LinkedIn account. Automated lookups (allabolag, company sites) are *enhancements* that degrade gracefully to assisted-paste; the app is fully usable if no scrape ever succeeds.
5. **Professional by default.** Clean sender address, PDF CV, no spammy tracking artifacts — consistent with the deck's "Vanliga missar".
6. **Stack doubles as portfolio.** Built in the course stack so the project demonstrates the exact skills being pitched.

## 6. Functional requirements

### 6.1 Discovery — two co-equal paths (assisted, ToS-safe)

A **search session** groups the companies captured from one query/filter so the user can see which searches are productive. `kind` is either `linkedin_boolean` or `allabolag_filter`.

**Path A — LinkedIn-first (person → company).** Boolean query builder composing LinkedIn searches from building blocks:
- Title group: e.g. `(Utvecklingschef OR "Development Lead" OR CTO OR "Lead Developer")`
- Tech group: e.g. `AND .NET AND "C#" AND (MVC OR ASP)`
- Optional geography keyword (the hard region filter lives in Settings; see below).
- Output: a copy-ready Boolean string + a one-click "Open in LinkedIn". Store the query for reproducibility.
- Ship a preset library of Swedish title/tech groups (utvecklingschef, lead dev, CTO; .NET, C#, ASP.NET, React, SQL).

**Path B — allabolag-first (company → contact).** The deck's allabolag flow as a first-class entry point: pick bransch/underbransch (e.g. Data, IT & Telekommunikation), narrow by **län** and **size/omsättning**, prefer small/solvent/less-famous firms, then create `Company` records directly — **no LinkedIn person required**.

**Assisted capture (both paths, not scraping).** The user browses the source; to get data into the app:
- **Paste-capture box** (v1): paste a LinkedIn profile's visible text / URL, or an allabolag company's details; the app parses what it can and creates/updates a `Company` (+ optional `Person`).
- **Bookmarklet** (v1.5, optional): a "Save to APL Assistant" bookmarklet that POSTs the *currently displayed* fields from the page the user has open. User-initiated, per-page, not bulk.
- **Out of scope:** background crawlers, programmatic LinkedIn login, bulk unattended pulls.
- **Guided website-enrichment wizard** (extension): a same-tab, click-only flow that walks captured people through profile → company About to pull the authoritative LinkedIn `Website` field, deduping companies by canonical `/company/<ID>/`. One click = one navigation; no background fetch. Full spec: [`enrichment-wizard.md`](./enrichment-wizard.md).

**Geography** is a **hard, configurable filter** (`Setting: target_lan`, default **Norrland** — Norrbotten/Västerbotten), reflecting LTU + the deck's AF-housing-in-Norrland note. It drives allabolag filtering and flags out-of-region captures.

### 6.2 Company/contact enrichment ("scraping 2") — paste-first, auto as enhancement

For each captured company, enrich from **public** sources. **Assisted-paste is the guaranteed baseline and ships first;** automated fetch is layered on top and **degrades to `needs_manual_lookup` on any block/parse failure.**

- **allabolag.se lookup** by company name: org number, registered län/kommun, basic financials (revenue band, employee count, result) + switchboard phone. Used to filter (target small, financially-stable, less-contested firms). allabolag sits behind Cloudflare, which blocks *server-side* fetches — so this is done via **assisted browser-extension capture**: the app's "Open on allabolag" deep link + the extension reads the detail page *you* opened and POSTs the fields to `/companies/{id}/allabolag` (matched via a confirm dropdown). Same manual, low-volume posture as the LinkedIn capture. The captured switchboard phone counts toward the ≥15 list.
- **Company website fetch**: locate the official site, pull a public contact **email and switchboard phone** (`/kontakt`, `/contact`, `mailto:`, `tel:`). Flag confidence (found on contact page vs. guessed). **Store the raw site/ad text** (`Company.site_text_raw`) now — it's the cheap input for interview prep later (§6.8).
- If no public contact info, mark `needs_manual_lookup` with a reminder to **call the switchboard** (deck step 4B → use the phone script, §6.5).

Store everything as a structured **Company profile**: name, org no., län/kommun, size/financials, website, tech-stack guesses, raw site text, captured person(s), found email(s)/phone(s), confidence, free-text notes. A global **"enrichment on/off"** switch and a per-source toggle.

> Note: allabolag.se and company sites have their own terms and rate expectations. Keep requests low-volume, cache, identify a sane User-Agent, back off on errors.

### 6.3 Company pipeline (stage + outreach log)

The spine is the **Company**. A company can be reached on multiple channels by multiple people, so:

- Each company has **one coarse `stage`:** `Identified → Enriched → Ready → Contacted → Replied → Closed(positive|negative)`.
- Each email/call/LinkedIn message is a separate **`Outreach`** record (channel + outcome + timestamp). The company `stage` **auto-advances** from outreach events (e.g. first `sent` → `Contacted`; a logged reply → `Replied`).
- This cleanly represents states like "emailed + called, no reply yet."

UI:
- Table of all companies: company, person(s), title, stage, contact channel(s), enrichment status, last action, next action due.
- Filter/sort (stage, län, financials, has-email, has-phone, search session).
- Manual edit of any field; manual add of a company/contact without LinkedIn.
- A **"≥15" counter** that specifically counts companies with **both** a usable email **and** phone (the Lexicon-list bar).

### 6.4 Lexicon list submission

- The **list = ≥15 companies each with both mail and phone**, *independent of whether outreach has been sent* (Johan: applying is "if you have time"). 
- "Generate Lexicon list" produces a clean table (Företag, Ort, Kontaktperson, Titel, E-post, Telefon) **in the email body + an attached CSV**. (Confirm preferred format with Johan/Linnea/Claudia.)
- **Approval gate:** preview the exact email to `apl@lexicon.se` (recipient, subject, body, attachment) → Approve → send.
- Record the submission (timestamp, snapshot of exactly what was sent).

### 6.5 Personalized outreach — three channels

All three are first-class, tracked `Outreach` records:

- **Email (app drafts + sends).** Store templates with merge fields: `{{name}}`, `{{company}}`, `{{your_experience}}`, `{{your_email}}`, `{{your_phone}}`, plus the fixed Lexicon/LTU program-description block. Pre-fill `{{your_experience}}` from a CV summary stored once in Settings. Render a per-company draft; allow inline edit. **Attach** files configured in Settings (`cv_path`, optional `program_pdf_path`) — minimal: a file path, attached on send, no validation (CV-naming/PDF correctness is the user's responsibility per the deck).
- **Phone (app shows script + logs outcome).** Surface the **Telefonsamtalet** script (deck) pre-filled with company details; the user calls, then logs the outcome as an `Outreach(channel=phone)`.
- **LinkedIn message (copy + mark sent).** Render the short inMail text (deck Message 1) for the user to copy into LinkedIn, then mark `sent` manually as `Outreach(channel=linkedin)`.

**Sender identity:** send from the user's **real address — no plus-alias** (drops the spammy `+slug` look; the deck flags unprofessional addresses). Attribution is done via stored `Message-ID`/thread headers, which the user controls on both sides.

- **Approval gate** on email/follow-up sends; optional "review all, approve each" queue for one-by-one batch sending.
- **Send via the user's own Gmail SMTP** with an app password (`MailKit`). Throttle sends (min delay between messages) to stay well within normal-human limits.

### 6.6 Response tracking (manual-first)

- **Manual baseline:** two-click "mark company `Replied` + paste a snippet/date." At this volume (tens of contacts you already read in your own inbox) this is sufficient and avoids OAuth/parsing cost.
- **Stretch:** automated Gmail/IMAP inbox read (`MailKit`), matching replies to outreach via **thread/`In-Reply-To`/`Message-ID`** (not a plus-alias). Auto-update stage on match.
- Campaign dashboard: counts of sent / replied / no-reply / follow-up-due, simple response-rate %. No sentiment auto-classification in v1.

### 6.7 Follow-ups

- For companies `Contacted` with no reply past **7 days** (`Setting: followup_threshold_days`, default 7), surface them in a "Follow-up due" list.
- Generate a personalized follow-up draft from a follow-up template.
- **Approval gate:** review → Approve → send. Never auto-send.
- **Cap: exactly one** follow-up, then suggest `Close(negative — no reply)`.

### 6.8 Interview-prep helper (stretch, v1.5)

- Using the stored company profile + **`site_text_raw`** captured during enrichment, generate likely interview questions and talking points (the deck explicitly endorses LLM use, with the STAR model).
- Store prep notes against the company. (Off the critical path to the deliverable, but the input data is captured now in §6.2 so this stays cheap.)

### 6.9 Placement sub-flow (after a positive reply)

When a company reaches `Closed(positive)`, capture the real finish line (deck "När ni funnit egen APL/praktik"):
- `Placement.checklist_sent_at` — the employer's Lexicon **checklista** was sent to them.
- `Placement.lexicon_confirmed_at` — Lexicon confirmed/approved the praktik.
- Store the three coordinator emails in Settings: `johan.eriksson@`, `linnea.gaverud@`, `claudia.fjarem@lexicon.se`.

## 7. Approval-gate spec (cross-cutting)

Any action that sends data off the machine to a third party passes through a shared "Outbound Review" component:

1. Build the exact payload (recipients, subject, body, attachments).
2. Render a read-only preview.
3. Require an explicit Approve click (and for first-send-of-session, a typed confirmation).
4. Only then dispatch; log the action with a full snapshot and timestamp.
5. Provide an Outbox/Activity log of everything sent.

Applies to: Lexicon list submission, cold emails, follow-ups. (Phone/LinkedIn are user-performed and logged, not dispatched by the app.)

## 8. Recommended architecture & stack

**Primary recommendation — your course stack (so the project itself is a portfolio piece):**

- **Backend:** ASP.NET Core Web API (C#/.NET). Endpoints for sessions, companies, enrichment, drafts, sending, tracking.
- **Persistence:** Entity Framework Core with a **SQLite** provider (local file `apl.db`). Code-first migrations checked in; the `.db` file `.gitignore`d.
- **Frontend:** React (Vite). Tables, query builder, review/approve modals, dashboard.
- **Email send:** Gmail **SMTP** with an app password via `MailKit` (simplest). Clean From (no alias). Gmail API + OAuth is an optional later upgrade / portfolio flex.
- **Email read (stretch):** IMAP via `MailKit`. Match on thread/`Message-ID` headers.
- **Web enrichment:** `HttpClient` + `AngleSharp`. Polite rate-limiting, local caching, graceful degradation to paste.
- **LLM (interview prep / draft polish):** Anthropic API via HTTP; key in `.env`.
- **Config/secrets:** `appsettings.Development.json` / `.env` (both `.gitignore`d). `.env.example` checked in.

*Swappable alternative:* a single Node/TypeScript app (Next.js + Prisma + SQLite). Functionally identical; loses the "it's my course stack" benefit. Pick one and tell Claude Code.

## 9. Data model (company-centric)

```
Company        id, name, org_number, website, location_lan, location_kommun,
               revenue_band, employee_count, financial_note, tech_stack_guess,
               source {linkedin|allabolag|manual}, site_text_raw,
               enrichment_status, stage, created_at, updated_at, enriched_at
Person         id, company_id (fk), name, title, linkedin_url, notes        // 0..n
ContactInfo    id, company_id (fk), type {email|phone}, value,
               source {website|switchboard|linkedin|manual}, confidence
SearchSession  id, name, kind {linkedin_boolean|allabolag_filter},
               query_or_filter, created_at, notes
Outreach       id, company_id (fk), person_id (fk, nullable),
               channel {email|phone|linkedin}, kind {cold|followup},
               status {draft|approved|sent|logged|failed},
               subject, body, message_id, in_reply_to,
               approved_at, sent_at, outcome, snapshot_json
Reply          id, company_id (fk), outreach_id (fk, nullable),
               received_at, snippet, raw_headers, matched_by {thread|manual}
Template       id, kind {linkedin_inmail|cold_email|followup|lexicon|call_script},
               subject, body_markdown
LexiconSubmission id, created_at, company_ids_json, snapshot_json, sent_at
Placement      id, company_id (fk), checklist_sent_at, lexicon_confirmed_at, notes
InterviewPrep  id, company_id (fk), questions_md, notes_md
Setting        key, value   // target_lan(=Norrland), cv_path, program_pdf_path,
                            // followup_threshold_days(=7), send_throttle, cv_summary,
                            // name, email_base, phone, lexicon_coordinator_emails
```

Company `stage` is an enum string per §6.3; the `Placement` row layers on a positive close.

## 10. Privacy & security

- Local SQLite, `.gitignore`d; repo contains schema + `.env.example` only.
- Secrets (Gmail app password, Anthropic key) never committed.
- No third-party tracker, no pixel, **no plus-alias** in outbound mail.
- Captured names/titles/LinkedIn URLs of real people are **personal data** (GDPR): keep local, document a legitimate-interest basis for B2B outreach, provide "delete company/contact" and "wipe DB" actions.
- No analytics/telemetry phoned home.

## 11. Risks, constraints & honest caveats

- **LinkedIn ToS:** automated scraping/logins risk account restriction. v1 keeps capture human-initiated (paste / bookmarklet). Don't let scope creep turn this into a crawler.
- **allabolag.se anti-bot:** behind bot protection with its own terms; automated fetch may simply fail. Mitigated by the **degrade-to-paste contract** — the app never depends on the scrape working. Stay low-volume, cache, back off, identify yourself.
- **Email deliverability / spam:** cold-emailing from personal Gmail can trip filters or limits. Throttle hard, keep volumes small, keep content personal and plain-text-friendly. Deliberate-outreach tool, not a blaster.
- **Professional impression:** clean From, PDF CV named `Förnamn Efternamn CV`, no alias — per the deck's "Vanliga missar".
- **Brittleness of parsing:** site contact-info extraction will miss/guess — hence the `confidence` flag and `needs_manual_lookup` fallback.
- **Timeline ambiguity:** the deck dates praktikperiod A as 18 Feb–18 Mar but is itself dated 2026-06-05; confirm the actual period before treating M0 as same-day urgent.

## 12. Suggested build order (milestones)

- **M0 — Manual fast-path (today, *not* the app).** Hand-build the spontansök text + ≥15-contact list (mail+phone) and email `apl@lexicon.se`. See `Deliverable/`. Ships independent of all code.
1. **M1 — Skeleton + company-centric data layer.** ASP.NET Core API, EF Core + SQLite, migrations, React shell. Company CRUD + manual entry, person(s), contact info. Stage + "≥15 w/ mail+phone" counter.
2. **M2 — Discovery (both paths).** Boolean builder + presets + "Open in LinkedIn" + paste-capture (person→company); allabolag-filter session + company-first paste.
3. **M3 — Enrichment.** Paste baseline first; then cautious website + allabolag auto-fetch (degrade to `needs_manual_lookup`); store `site_text_raw`; confidence flags; profile view.
4. **M4 — Templates + 3-channel outreach + approval gate.** Five template kinds, per-company drafts, Outbound Review, Gmail SMTP send, clean From, attachments, throttle, phone-script + LinkedIn-copy logging, Outbox.
5. **M5 — Lexicon list submission.** Generate list (body + CSV), approval gate, send, snapshot.
6. **M6 — Reply tracking + follow-ups + placement.** Manual reply marking, dashboard, follow-up-due queue (1 @ 7d, gated), placement flags.
7. **M7 (stretch).** Auto inbox-read (thread-matched); LLM interview prep; bookmarklet capture.

## 13. Resolved decisions (was: open questions)

- **Gmail send:** SMTP + app-password first. *(Resolved.)*
- **Language:** .NET + React. *(Resolved.)*
- **Bookmarklet:** defer to v1.5; paste-capture first. *(Resolved.)*
- **Discovery:** support both LinkedIn-first and allabolag-first. *(Resolved.)*
- **Model spine:** company-centric. *(Resolved.)*
- **Sender:** clean From, thread-based attribution, no plus-alias. *(Resolved.)*
- **Reply tracking:** manual-first; auto-read is stretch. *(Resolved.)*
- **Lexicon list:** ≥15 companies with mail+phone, body + CSV. *(Resolved.)*
- **Follow-ups:** 1 follow-up at 7 days, then close. *(Resolved.)*
- **Region:** configurable, default Norrland. *(Resolved.)*

**Still to confirm with Lexicon / yourself:**
- Exact list format expected by `apl@lexicon.se` (body table vs CSV vs PDF).
- Your actual praktikperiod dates (see §11 timeline ambiguity).

---

*Built for the Lexicon LTU VT-2026 APL search. Keep it local, keep a human on every send button.*
