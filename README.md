# APL Search Assistant

A **local-first** web app to automate the grindy parts of the Lexicon LTU APL (internship)
search — discovery, enrichment, personalized outreach, tracking, and follow-ups — while
keeping a human on every send button.

> Built for the Lexicon LTU VT-2026 APL search, and as a portfolio piece in the course stack
> (ASP.NET Core + EF Core/SQLite + React).

## What it does

- **Discovery** — LinkedIn Boolean query builder *and* allabolag-first company browsing.
- **Enrichment** — company financials + public contact details, paste-first with cautious
  automated fetch that degrades gracefully.
- **Outreach** — personalized email (sent via your own Gmail), phone-call scripts, and
  LinkedIn messages, all behind approval gates.
- **Tracking** — a company pipeline, reply marking, and 7-day follow-ups.
- **Lexicon list** — generates and submits the required ≥15-host contact list.

## Principles

Human-in-the-loop for judgment, automation for grind · approval gates on every outbound
action · local-first & private (your data never leaves your machine) · ToS-aware ·
professional by default.

## Docs

- **[Product Requirements (PRD)](Docs/APL_Search_Assistant_PRD.md)** — full spec, data model,
  and build milestones.
- **`Deliverable/`** — the manual fast-path templates (spontansök email, LinkedIn inMail,
  phone script, Lexicon list).

## Status

Early — PRD finalized (v0.2); implementation milestones M1+ pending. Personal data and the
local database are git-ignored by design; the repo ships schema and templates, never data.
