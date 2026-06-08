# How We Built This — An LLM Collaboration Log

*A reconstruction of how the APL Search Assistant came to exist, end to end: it began as a
conversation in **Claude.ai** that decoded the assignment and produced the PRD, then continued in
**Claude Code** as the build (4 sessions, 116 user turns, 5–8 June 2026). This log records the
origin chat, the initial framing, the prompts that turned the project at key moments, the
corrections that mattered, the skills used, what made the prompting effective — and the risks and
blind spots visible in the record.*

---

## 0. Where it actually began — a Claude.ai chat

The project did not start in an editor. It started as a problem dropped into a Claude.ai
conversation: the **Lexicon APL-day assignment** — an email from Johan Eriksson plus a Swedish
slide deck ("Att söka praktik och jobb") — that had to be understood before anything could be
built. Claude (with Google Drive access) read both and translated the deliverable into plain
terms:

> Today's concrete output is **(1) a spontaneous-application email** and **(2) a list of ≥15 APL
> hosts with name / email / phone**, emailed to `apl@lexicon.se`.

Crucially, the same chat surfaced the **exact method** the later app would automate — straight
from the deck's "LinkedIn strategy":

1. Find people with the right titles on LinkedIn via Boolean search
   (*"`(Utvecklingschef OR Development Lead) AND .NET AND C# AND (MVC OR ASP)`"* — the real
   example that later seeded the extension).
2. Get the company name from the hiring manager's profile.
3. Look the company up on **allabolag.se** and check its finances — deliberately targeting
   *smaller, less-contested* firms with sound numbers.
4. Find contact details on the company site, or call the switchboard for them.
5. Reach out with a personalized spontaneous application.

Only after the assignment was understood did **you** propose the product, in a single message
that is essentially the PRD in embryo:

> *"I am thinking of building a web app to automatize most of the grindy parts."* — with seven
> bullets that already named: assisted LinkedIn capture, contact-detail lookup + a company/person
> *profile* for interview prep, an approval-gated list to `apl@lexicon.se`, templated emails
> behind approval, **reply-tracking via a `+companyname` alias address**, follow-ups, and
> **local-only persistence so every cloner keeps their own data — "preventing privacy issues."**

Three of the project's load-bearing decisions were made right there in the chat, *before the
PRD was even written*, and they held for the entire build:

- **Assisted capture, not headless scraping.** Claude pushed back: automated LinkedIn scraping
  violates their User Agreement and risks getting *your own* account banned mid-search — so the
  human stays in the loop on LinkedIn by design, while the defensible enrichment (websites,
  allabolag) gets automated. This is the exact posture later flagged as risk #1 in §7.
- **Every outbound action behind explicit approval** — the list, each email, each follow-up.
  This is the seed of the no-auto-send line that became project memory.
- **The stack was chosen to double as portfolio work**: ASP.NET Core + EF Core + SQLite + React,
  deliberately matching your bootcamp course stack so the tool itself demonstrates the skills
  you're pitching to hosts.

The chat closed by producing *"a full PRD you can drop straight into Claude Code"* and flagging
two human-judgment calls it couldn't settle: SMTP-vs-OAuth for sending (recommend SMTP first),
and **confirming with Lexicon what format the 15-host list should take** before building the
export. The handoff from "thinking partner" to "implementation agent" happened at exactly that
PRD. Everything in the sections below is what happened *after* that file landed in Claude Code.

---

## 1. The shape of the collaboration

- **Span:** 5 June → 8 June 2026, four working sessions, ~116 of your turns plus several
  `/compact` context rollovers.
- **Method:** PRD-first. We never started coding cold — we started by *grilling the PRD*.
- **Cadence:** the project moved in milestones (M1 → M4, from the PRD's build order), then
  shifted into a long quality/UX-refinement phase, then a theming overhaul, then two late
  features (import/export, saved Boolean searches).
- **Output:** ~20 tagged releases (v0.5 → v0.22), a web app (ASP.NET Core + EF/SQLite + React)
  and a browser extension, plus README, in-app user guide, and use-case docs.

The defining trait of the record: **you led with intent and corrected with specifics.** Almost
every turn either set a direction ("let's improve quality before M4") or made a precise,
checkable correction ("use #739A26 as success green"). Very little was vague.

---

## 2. The initial prompt — and why it set the tone

PRD in hand, the *Claude Code* phase still didn't begin with "build me an app." It began
(5 June, 12:08) with a **skill invocation** wrapping a deliberately critical instruction:

> `/grill-me` …
> *"examine `Docs/APL_Search_Assistant_PRD.md` and let's fine-tune this PRD. Look for risks and
> blindspots. The source materials are in `Material/`."*

This is the single most consequential choice in the whole history. Instead of asking for code,
you asked to be **interviewed against your own plan**, with the source material on the table.
The PRD's own v0.2 changelog records what fell out of that session:

> *"company-centric data model; both LinkedIn-first and allabolag-first discovery; three
> outreach channels; plus-alias dropped for a clean professional From; allabolag automation
> demoted to a cautious enhancement that degrades to assisted-paste; reply-tracking is
> manual-first; geography is a hard configurable filter (default Norrland)…"*

Every one of those is a *de-risking* decision made **before** a line of code existed. The
"company-centric data model" in particular saved a later rewrite — and we'll see below that even
so, the data model still had to be reshaped once mid-flight.

---

## 3. Memorable prompts, in order

### Phase 0 — PRD & setup (5 June)
- `/grill-me` on the PRD (above).
- *"agree"* → *"Push this project to github as public."*
- *"Make a gitignored copy of the Deliverable with my personal details pre-filled… keep the
  anonymized/generalized templates in the Deliverable."* — **a privacy instinct that recurs all
  the way through.** You consistently separated *your* data from the *shareable template*.
- *"please scrub"* — terse, but it triggered removal of personal data from a committed file.

### Phase 1 — Extension + M1/M2 (5 June)
- *"Can we start creating a browser extension to extract contact/company details from a LinkedIn
  dom like: [search URL]…"* — the extension was **your** idea, seeded with a real Boolean-search
  URL as the spec.
- *"is this generating the row shape of `Deliverable/lexicon_list.csv`?"* — you keep tying the
  build back to the **real deliverable format**. This is a recurring quality lever: you check
  output against the actual artifact the work has to produce.
- *"jsdom test suite"* — two words, but it requested test coverage for the DOM-scraping logic.
- *"wire the Send to APL Assistant button, and add another function to append another list
  extracted from one page with the list on the next."* — the *append-across-pages* capture
  pattern came from you noticing a real workflow need.

### Phase 2 — Enrichment / search (5–6 June)
- *"can we use google or any other public search to find the company website/contact details?"*
- *"How to securely store the Brave key?"* — **you raised the secret-handling question
  yourself**, unprompted. Good instinct.
- *"Wouldn't it be better to search on allabolaget.se?"* — redirecting enrichment toward the
  Swedish company registry, which is far higher-signal than open web search.
- *"it's tedious to get from the person to the company about page…"* (with a concrete example,
  twoday → `/company/twoday/about/`) — naming the *exact* friction is what made the
  company-page-resolution feature buildable.
- You pasted **raw browser-console experiments** (the `querySelectorAll('script[ld+json]')`
  snippets) to debug DOM extraction together. This is a notable pattern: you didn't just report
  "it doesn't work," you brought reproductions.

### Phase 3 — The quality-before-features turn (6 June)
This is the second pivotal prompt:

> *"Before we jump on M4 let's improve the quality of the currently implemented features. Some
> issues I see: …"* — followed by an **eight-item bulleted defect list** (company-name garbage
> like `CompanyALTEN1,446,778 followers`; unclear extension labels; steps that should be gated
> on prior steps; missing visual feedback / x-of-max counters; the Euroclear vs *Euroclear
> Sweden AB* name-mismatch breaking enrichment; branch-URL redirects; weak contact scans;
> Save-button enable/disable logic).

Choosing to *stop and harden before advancing a milestone* is a senior move. The bullet form,
each with a symptom and often a hypothesis, is exactly the shape that turns into commits.

### Phase 3b — The data-model reshape (6 June)
> *"a person is a LinkedIn contact, with the same tracking statuses. Therefore I recommend
> merging the two lists into one grouped as Persons and Company contact points…"*

You re-derived the domain model from first principles mid-project and proposed the merge
yourself. This is the kind of insight the PRD-grilling *aims* for but didn't fully catch — the
person/contact duplication only became obvious once the UI existed.

### Phase 4 — M4 outreach, with a hard line (6 June)
> *"…even if we can trigger a new mail with the email address, subject and body pre-filled,
> that's enough… So don't build auto-mail sending just yet."*

This is preserved in project memory (`m4-outreach-no-autosend.md`) precisely because it runs
*against* the PRD, which had envisioned send-and-track. You deliberately kept a human at the
outbound gate. **Memorable because it's a values decision, not a technical one.**

### Phase 5 — The theming overhaul (7 June)
A long, exacting design conversation. The standout prompts:
- *"The resulting colors look pale, see www.snopes.com for how color roles are used to provide a
  clean, contrasty, colorful highlighted visual rhythm."* — a **reference-driven** design brief.
- *"Use font weight difference instead of font color. Use extra colors sparingly… Minimalize
  border use, use background colors instead."* — design *principles*, not pixel orders, so they
  generalize across the whole UI.
- A cascade of **exact tokens**: `#ffedaf` page bg, `#fffae9` input bg, `#739A26` success green,
  `mdi-briefcase-search` favicon. When you knew the precise value, you gave it; when you didn't,
  you gave the rule. That mix is what made the theming converge instead of oscillating.

### Phase 6 — Docs & late features (7 June)
- *"create a user guide walkthrough… Use What → how (+why, if necessary) narrative. Use the same
  icons for the features."* — you specified a *narrative structure* for docs, not just "write
  docs."
- *"Add an importer/exporter for some spreadsheets…"* and *"export the app's own data format…
  in lossless JSON, Excel, TSV, CSV."* — round-trip backup, your idea.
- *"would it be possible to manage/maintain a list of binary searches and by clicking it, open
  the search page with the query in LinkedIn?"* and the follow-up to **store filter options**
  (geoUrn etc.) — the saved-Boolean-search feature (v0.21) closing the loop back to where the
  project started.
- *"One place for the whole APL search grind"* — you wrote the product's tagline yourself.

### Phase 7 — Operational awareness (7 June)
- *"what is using so much CPU that the fans are spinning constantly?"* → *"is it our
  extension?"* — you watch the *running* system, not just the code.

---

## 4. Skills & commands used

| Skill / command | Times | Role in the project |
|---|---|---|
| `/grill-me` | **3** | The backbone. Used to pressure-test the PRD (5 Jun) and again before major phases (6 & 7 Jun). Every grilling preceded a direction change. |
| `/compact` | 5 | Context rollovers across the four long sessions — the project outlived several context windows. |
| `/clear`, `/resume`, `/model`, `/login`, `/rate-limit-options` | 1 each | Session management; `/rate-limit-options` shows we hit usage limits during the heavy build days. |

The most important meta-finding: **`/grill-me` was used as a gate, not a gimmick.** Three times
you stopped to be interviewed before committing to a direction, and all three produced recorded
decisions (PRD v0.2 changelog, the quality-first pivot, the design-system rules).

---

## 5. What made your prompting effective

Patterns visible across all 116 turns:

1. **Plan-before-code, via grilling.** You spent the first session attacking your own PRD for
   "risks and blindspots." Nearly every expensive mistake a project like this can make
   (wrong data model, auto-sending email, scattered personal data) was either avoided up front
   or caught early *because* the habit of stopping to think was established turn one.

2. **Symptom + example + hypothesis.** Your best bug reports weren't "it's broken." They were
   *"Euroclear vs Euroclear Sweden AB — is it possible to pass a company ID to the extension?"*
   — symptom, concrete instance, and a proposed mechanism. That compresses the debugging loop.

3. **Principles where you had them, exact values where you knew them.** *"Use font weight instead
   of color"* (a rule that generalizes) sat next to *"`#739A26`"* (a value that doesn't need
   interpretation). Mixing the two is what kept the long theming pass from thrashing.

4. **Tie work to the real artifact.** Repeatedly checking output against
   `Deliverable/lexicon_list.csv` and the actual Lexicon submission format kept the build
   honest about what it ultimately had to produce.

5. **Bring reproductions.** Pasting live console snippets and error stacks (the workbox
   `Failed to fetch`, the `address already in use` on :5099, the `/api/export 404`) turned
   "fix it" into "fix *this*."

6. **Sequence the work deliberately.** *"Before we jump on M4 let's improve quality"* and
   *"don't build auto-mail sending just yet"* show you controlling *order* and *scope*, not just
   features. That's where a lot of the project's coherence comes from.

7. **Privacy as a standing constraint.** From *"gitignored copy with my details… keep the
   anonymized templates"* to *"please scrub"* to the no-auto-send gate, you treated personal
   data and outbound actions as things to contain by default.

The phrases that did the most work were the *framing* ones — **"look for risks and blindspots,"**
**"let's improve quality before we jump on M4,"** **"a person is a LinkedIn contact… I recommend
merging,"** and **"don't build auto-mail sending just yet."** None of them are about code. They're
about *what to do and in what order*, which is exactly the leverage a human has over a coding
agent.

---

## 6. How your prompts improved the code (concretely)

- **The PRD grilling** reshaped the data model to company-centric and demoted allabolag
  automation to a degrade-to-paste enhancement — before implementation, so it cost nothing.
- **The person/contact merge** collapsed two parallel lists into one model, removing duplicated
  status-tracking logic.
- **The "quality before M4" list** directly produced: editable company names, step-gated
  extension buttons, x-of-max progress feedback, company-ID linkage to survive name mismatches,
  branch-URL handling, and smarter contact search.
- **The design-principle prompts** converted an ad-hoc palette into a coherent token system
  (page/input/success/accent roles, weight-over-color, opacity-over-gray).
- **The round-trip import/export** request added lossless backup the PRD never specified.
- **The saved-Boolean-search** feature closed the workflow loop from search → capture → enrich →
  outreach → track, which became the product's "one place for the whole grind" thesis.

---

## 7. Risks & blind spots visible in the record

These are observations from the history, offered candidly — several are inherent to the project,
not failures.

1. **LinkedIn scraping is fragile and against-ToS-adjacent.** The whole capture path depends on
   LinkedIn's DOM (your `script[ld+json]` and `a[href]` experiments show how much). It *will*
   break on their markup changes, and automated extraction sits in a grey zone with their terms.
   The mitigation already in place — human-in-the-loop, manual paste fallbacks — is the right
   posture; keep it. Treat the extension as assistive, never headless/bulk.

2. **The CPU/fans question never got a recorded resolution.** Sessions 7 Jun ended on *"is it our
   extension?"* without a confirmed answer in the prompt log. A content script that observes the
   LinkedIn DOM can easily spin on mutation observers or polling. **Worth verifying the extension
   isn't running hot in the background.**

3. **Personal data lives in more than one place.** You were disciplined (gitignored personal
   copy, "please scrub"), but the pattern of pre-filling real details (phone `+46…`, CV path,
   email) into working files means a scrubbing miss is a real risk. A pre-commit secret/PII check
   would make the discipline automatic rather than manual.

4. **Brave Search / API key handling was raised but worth re-auditing.** You asked the right
   question ("How to securely store the Brave key?"). Confirm the key isn't in any committed
   file, build artifact, or the extension bundle, and that the public GitHub repo never received
   it in history (it's a *public* repo — `git log -p` for the key string is cheap insurance).

5. **Heuristic enrichment can produce wrong contacts.** "Guessed" emails (`info@`, `kontakt@`)
   and name-based contact scans are inherently noisy — the early *"are these emails doubled?"*
   turn shows it surfacing. The "guessed · verify" tag is the right guardrail; just make sure
   nothing guessed can flow into an outbound draft without an explicit verify step. (Your
   no-auto-send decision already backstops this — keep them coupled.)

6. **Email/company matching by name is brittle by design.** The Euroclear case is the canonical
   example; the company-ID linkage helps, but any name-keyed join (LinkedIn name vs allabolag
   legal name vs website) will mismatch. This is structural, not a bug — worth a periodic manual
   reconciliation rather than trusting the join blindly.

7. **Test coverage is uneven.** You explicitly asked for a `jsdom` suite for extraction, which is
   the highest-risk surface — good. But the long UI/theming and the API export paths (which threw
   a live 404) grew largely by manual verification. The export 404 reaching you is a sign the
   server endpoints could use a thin integration test so regressions surface before you do.

8. **Knowledge lives in the chat, not the repo.** Much of the *why* (the no-auto-send rationale,
   the data-model reshape reasoning) exists only in these transcripts and one memory file. This
   very document is a partial mitigation — consider folding the key decisions into the PRD or an
   ADR log so a future contributor (or a fresh Claude session) doesn't have to re-derive them.

---

*Generated from session transcripts in
`~/.claude/projects/-Users-laszloprekop-dev-APL-search-assistant/`. Prompt quotes are verbatim
from the user turns; light trimming marked with ellipses.*
