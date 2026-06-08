# How We Built This — An LLM Collaboration Log

*A reconstruction of how the APL Search Assistant came to exist, end to end: it began as a
conversation in **Claude.ai** that decoded the assignment and produced the PRD, then continued in
**Claude Code** as the build (4 sessions, 116 human turns, 5–8 June 2026). This log records the
origin chat, the initial framing, the prompts that turned the project at key moments, the
corrections that mattered, the skills used, what made the prompting effective — and the risks and
blind spots visible in the record.*

> **A note on names and marks.** This document is written for readers curious about how the operator drives Claude Code, so the operator is referred to in the third person, for the one at the keyboard. And every verbatim human-entered prompt is marked with a leading **`❯`** — short ones inline, longer or multi-request ones in a fenced block — so you can always tell a real prompt from narration. Quotes are verbatim, typos and all.

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
   (`(Utvecklingschef OR Development Lead) AND .NET AND C# AND (MVC OR ASP)` — the real example
   that later seeded the extension).
2. Get the company name from the hiring manager's profile.
3. Look the company up on **allabolag.se** and check its finances — deliberately targeting
   *smaller, less-contested* firms with sound numbers.
4. Find contact details on the company site, or call the switchboard for them.
5. Reach out with a personalized spontaneous application.

Only after the assignment was understood did the carbon-unit propose the product, in a single
message that is essentially the PRD in embryo:

```
❯ I am thinking of building a web app to automatize most of the grindy parts.

* There shall be a UI for to initiate search session for the companies-leaders as described
  (scraping 1) - potentially collaborate with the user collecting details from LinkedIn,
* look up contact details (scraping 2), kind of build a profile of the company/person to help
  later with interview preparation
* generate a list and after approval send it to Lexicon apl@lexicon.se
* Send personalized emails using the template after approval
* Track email responses (for example using customized reply email address, like
  laszlo.prekop+companyname@gmail.com) to see the success of the "campaign"
* send personalized follow-up email later after approval if there was no response
* data persistance in a local database so every user cloning the repo will have their own local
  content, preventing privacy issues.
Create a kind of PRD I can take to Claude Code and take implementation from there.
```

Three of the project's load-bearing decisions were made right there in the chat, *before the PRD
was even written*, and they held for the entire build:

- **Assisted capture, not headless scraping.** Claude pushed back: automated LinkedIn scraping
  violates their User Agreement and risks getting the human's *own* account banned mid-search — so
  the carbon-unit stays in the loop on LinkedIn by design, while the defensible enrichment
  (websites, allabolag) gets automated. This is the exact posture later flagged as risk #1 in §7.
- **Every outbound action behind explicit approval** — the list, each email, each follow-up. This
  is the seed of the no-auto-send line that became project memory.
- **The stack was chosen to double as portfolio work**: ASP.NET Core + EF Core + SQLite + React,
  deliberately matching the human's bootcamp course stack so the tool itself demonstrates the
  skills being pitched to hosts.

The chat closed by producing *"a full PRD you can drop straight into Claude Code"* and flagging
two human-judgment calls it couldn't settle: SMTP-vs-OAuth for sending (recommend SMTP first), and
**confirming with Lexicon what format the 15-host list should take** before building the export.
The handoff from "thinking partner" to "implementation agent" happened at exactly that PRD.
Everything in the sections below is what happened *after* that file landed in Claude Code.

---

## 1. The shape of the collaboration

- **Span:** 5 June → 8 June 2026, four working sessions, ~116 of the human's turns plus several
  `/compact` context rollovers.
- **Method:** PRD-first. Coding never started cold — it started by *grilling the PRD*.
- **Cadence:** the project moved in milestones (M1 → M4, from the PRD's build order), then shifted
  into a long quality/UX-refinement phase, then a theming overhaul, then two late features
  (import/export, saved Boolean searches).
- **Output:** ~20 tagged releases (v0.5 → v0.22), a web app (ASP.NET Core + EF/SQLite + React) and
  a browser extension, plus README, in-app user guide, and use-case docs.

The defining trait of the record: **the carbon-unit led with intent and corrected with
specifics.** Almost every turn either set a direction (*"let's improve quality before M4"*) or
made a precise, checkable correction (*"use #739A26 as success green"*). Very little was vague.

---

## 2. The initial prompt — and why it set the tone

PRD in hand, the *Claude Code* phase still didn't begin with "build me an app." It began
(5 June, 12:08) with a **skill invocation** wrapping a deliberately critical instruction:

```
❯ /grill-me
ARGUMENTS: examine ~/dev/APL_search_assistant/Docs/APL_Search_Assistant_PRD.md
and let's fine-tune the this PRD. Look for risks and blindspots.
The source materials are in this folder: '~/dev/APL_search_assistant/Material/'
```

This is the single most consequential choice in the whole history. Instead of asking for code, the
carbon-unit asked to be **interviewed against the plan**, with the source material on the table.
The PRD's own v0.2 changelog records what fell out of that session:

> *"company-centric data model; both LinkedIn-first and allabolag-first discovery; three outreach
> channels; plus-alias dropped for a clean professional From; allabolag automation demoted to a
> cautious enhancement that degrades to assisted-paste; reply-tracking is manual-first; geography
> is a hard configurable filter (default Norrland)…"*

Every one of those is a *de-risking* decision made **before** a line of code existed. The
"company-centric data model" in particular saved a later rewrite — and even so, the data model
still had to be reshaped once mid-flight (§3b).

---

## 3. Memorable prompts, in order

### Phase 0 — PRD & setup (5 June)
- `❯ agree` → `❯ Push this project to github as public`
- A privacy instinct that recurs all the way through — separating *personal* data from the
  *shareable template*:

  ```
  ❯ Make a gitignored copy of the Deliverable with my personal details pre-filled, as complete as
    possible and keep the anonymized/generalized templeates in the Deliverable
  ```
- `❯ please scrub` — terse, but it triggered removal of personal data from a committed file.

### Phase 1 — Extension + M1/M2 (5 June)
- The extension was the carbon-unit's idea, seeded with a real Boolean-search URL and a pasted
  LinkedIn DOM fragment as the spec:

  ```
  ❯ Can we start creating a browser extension to extract contact/company details from a Linkedind
    dom like: https://www.linkedin.com/search/results/people/?keywords=(Utvecklingschef OR
    Development Lead) AND .NET AND C# AND (Core OR ASP)&origin=FACETED_SEARCH&geoUrn=["105077040"]
    [followed by a pasted block of the search-result list DOM]
  ```
- `❯ is this generating the row shape of @../Deliverable/lexicon_list.csv ?` — tying the build back
  to the **real deliverable format**. A recurring quality lever: check output against the actual
  artifact the work has to produce.
- `❯ jsdom test suite` — two words, but it requested test coverage for the DOM-scraping logic.
- The *append-across-pages* capture pattern, from noticing a real workflow need:

  ```
  ❯ yes, wire the Send to APL Assistant button, and add another function to append another list
    extracted from one page with the list on the next
  ```

### Phase 2 — Enrichment / search (5–6 June)
- `❯ can we use google or any other public search to find the company website/contact details/staff contact details?`
- `❯ How to securely store the Brave key?` — the carbon-unit raised the secret-handling question,
  unprompted. Good instinct.
- `❯ Wouldn't it be etter to search on allbolaget.se?` — redirecting enrichment toward the Swedish
  company registry, far higher-signal than open web search.
- *"it's tedious to get from the person to the company about page… twoday Sweden / Daniel Hellström
  / CTO/Utvecklingschef → `https://www.linkedin.com/company/twoday/about/` where their webpage URL
  lives…"* — naming the *exact* friction is what made the company-page-resolution feature
  buildable.
- The carbon-unit pasted **raw browser-console experiments** (the
  `querySelectorAll('script[type="application/ld+json"]')` snippets) to debug DOM extraction
  together — not "it doesn't work," but reproductions.

### Phase 3 — The quality-before-features turn (6 June)
The second pivotal prompt: choosing to *stop and harden before advancing a milestone*. Quoted in
full because the bullet shape — each item a symptom, often with a hypothesis — is exactly what
turns into commits:

```
❯ Before we jump on M4 let's improve the quality of the currently implemented features. Some
  issues I see:
- Sometimes company names like this get into the app: ALTEN, CompanyALTEN1,446,778 followers.
  Would it make sense to allow editing the company name?
- The extension lablels in the extension are not clear enough, we need to emphasise the steps:
  1. we build a list by appending the people in the current search result page, 2. we clickt
  through the list to get to the company about page and add the conpany website URL to the people
  entries, 3. We do an output: send to the app running locally, copy/export to json csv etc.
- Only those buttons shall be active in the extension which have their previous steps already
  performed (no enrich before added)
- When in the website URL retvieaval flow, the actualy extracted data shall be presented as
  visual feedback. Also a x/max counter would be nice.
- when doing the Allabolag scan, if the company name differs from the one coming via LinkedIn,
  the enrichment fails: Euroclear vs Euroclear Sweden AB. Is it possible to pass a company ID to
  the extension which keeps the scan result linked to the app entry?
- similarly, when a linkedIn company URL redirects to another branch url, the website retrieval
  fails
- the 'Scan company contacts' rarely return useful results. Would it make sense to do a more
  sophisticated search, for example company name + Person name?
- Save fields button int the Enrichment card shall be active if the form is not submitted and
  there is somthing to update - up until then keep it inactive
```

### Phase 3b — The data-model reshape (6 June)
The carbon-unit re-derived the domain model from first principles mid-project and proposed the
merge — an insight the PRD-grilling *aims* for but didn't fully catch, because the person/contact
duplication only became obvious once the UI existed:

```
❯ Person/contact clarification: I was thinking about this and realized, that a person is a
  LinkedIn contact, with the same tracking statuses. Therefore I recommend merging the two lists
  into one, grouped as Persons and Company contact points. Persons can have linkedin profile URL
  (already captured and stored), email and phone (these two optional). Company contacts can be
  multiple emails and phone numbers. All contact points (linkedin url, email, phone) shall have
  the statuses, default: Not contacted and all contact points can be deleted.

  Move the Enrichment card above the contacts.
  Move the Add form to the left column (where the Persons were before) and label all fields for
  clarity. Stack the fields vertically.
  Add the merged, grouped list of contacts to the right. Rename 'guessed guessed · verify' tag to
  'guessed'.
```

### Phase 4 — M4 outreach, with a hard line (6 June)
Preserved in project memory (`m4-outreach-no-autosend.md`) precisely because it runs *against* the
PRD, which had envisioned send-and-track. A values decision, not a technical one — keep a human at
the outbound gate:

```
❯ Check ~/dev/APL_search_assistant/Deliverable and even if we can trigger a new
  mail with the email address, subject and body pre-filled, that's enough. Paste-able for LinkedIn
  In mails, and a popup with the preview of the Phone script the user can follow while in call. So
  don't build auto-mail sending just yet.
```

### Phase 5 — The theming overhaul (7 June)
A long, exacting design conversation. A **reference-driven** brief opened it:

`❯ The resulting colors look pale, see www.snopes.com for how color roles are used to provide a clean, contrasty, colorful highlighted visual rythm`

Then design *principles*, not pixel orders, so they generalize across the whole UI:

```
❯ here are my thoughts: [Image #2]
- Use font weight difference instead of font color.
- use extra colors sparingly, button bg-s shall be either white (not urgent), primary (if that
  button doesn't repeat), secondary gold if the button is important and repeats frequently.)
- Minimalize border use, use background colors instead.
- the look and feel of the extension is much closer to what we are aiming for. [Image #3]
```

```
❯ No green buttons and progress bar, use the gold color with contrasting text instead. Keep the
  page background white.
  Darken faint text color, to improve contrast, no borders on light gray backgrounds.
  Use #fffae9 for input tag backgrounds, and no gray borders. For icons, don use gray color, use
  opacity instead (light gray is hard to read on color background. Don't use gray separators
  between table rows.
  Collapsed and expanded state element ("header", "body") shall be grouped, not in multiple rows
  so changing background color on hover will effect the whole header and the whole body
```

And a cascade of **exact tokens** when the human knew the precise value —
`❯ Use #ffedaf for backgound (.bg-page)`, `❯ Use this color as success green #739A26`,
`❯ Use the mdi-briefcase-search icon for favicon`. Principles where the carbon-unit had them, exact
values where they were known: that mix is what made the theming converge instead of oscillating.

### Phase 6 — Docs & late features (7 June)
A *narrative structure* specified for the docs, not just "write docs":

```
❯ create a user guide walkthrough of every step to explain how this app works in detail, add it to
  the UI to show as a side/slide in. Use What -> how (+why, if necessary) narrative. Use the same
  icons for the features the app uses.
  Add a FAQ to explain the most unintuitive functions, mention hovering elements for desctiptions.
```

Round-trip backup and spreadsheet import, the carbon-unit's idea:

```
❯ Add an importer/exporter for some spreadsheets. Replace the Import capture menu with a list of
  options, one is the LinkedIn json.
  Another is this spreadsheet: [Google Sheets link]
  And one another spreadsheet: [Google Sheets link]
  both Import and export could be copy-paste of clipboard
```

The saved-Boolean-search feature (v0.21), closing the loop back to where the project started:

`❯ As another grind minimalization: would it be possible to manage/maintain a list of binary searches and by clicking it, open the search page with the query in linkedIn?`

…with the follow-up to **store filter options** too
(`❯ Would it be possible to store and pass filter options too, for example: …&geoUrn=["105077040"]`).
And the human wrote the product's tagline: `❯ "One place for the whole APL search grind"`.

---

## 4. Skills & commands used

| Skill / command | Times | Role in the project |
|---|---|---|
| `/grill-me` | **3** | The backbone. Used to pressure-test the PRD (5 Jun) and again before major phases (6 & 7 Jun). Every grilling preceded a direction change. |
| `/compact` | 5 | Context rollovers across the four long sessions — the project outlived several context windows. |
| `/clear`, `/resume`, `/model`, `/login`, `/rate-limit-options` | 1 each | Session management; `/rate-limit-options` shows usage limits were hit during the heavy build days. |

The most important meta-finding: **`/grill-me` was used as a gate, not a gimmick.** Three times the
carbon-unit stopped to be interviewed before committing to a direction, and all three produced
recorded decisions (PRD v0.2 changelog, the quality-first pivot, the design-system rules).

> **Where the skills come from.** `/grill-me` (and the other `[Matt P]` skills available in this
> environment) are from Matt Pocock's open skill collection —
> <https://github.com/mattpocock/skills>. They're reusable Claude Code skills you drop into
> `~/.claude/skills/`; `/grill-me` is the one that earned its keep here.

---

## 5. What made the prompting effective

Patterns visible across all 116 turns:

1. **Plan-before-code, via grilling.** The human spent the first session attacking their own PRD
   for *"risks and blindspots."* Nearly every expensive mistake a project like this can make
   (wrong data model, auto-sending email, scattered personal data) was either avoided up front or
   caught early *because* the habit of stopping to think was established turn one.

2. **Symptom + example + hypothesis.** The best bug reports weren't "it's broken." They were
   *"Euroclear vs Euroclear Sweden AB — is it possible to pass a company ID to the extension?"* —
   symptom, concrete instance, and a proposed mechanism. That compresses the debugging loop.

3. **Principles where the carbon-unit had them, exact values where known.** *"Use font weight
   instead of color"* (a rule that generalizes) sat next to `#739A26` (a value that needs no
   interpretation). Mixing the two kept the long theming pass from thrashing.

4. **Tie work to the real artifact.** Repeatedly checking output against
   `Deliverable/lexicon_list.csv` and the actual Lexicon submission format kept the build honest
   about what it ultimately had to produce.

5. **Bring reproductions.** Pasting live console snippets and error stacks (the workbox
   `Failed to fetch`, the `address already in use` on :5099, the `/api/export 404`) turned "fix
   it" into "fix *this*."

6. **Sequence the work deliberately.** *"Before we jump on M4 let's improve quality"* and *"don't
   build auto-mail sending just yet"* show the human controlling *order* and *scope*, not just
   features — a lot of the project's coherence comes from there.

7. **Privacy as a standing constraint.** From *"gitignored copy with my details… keep the
   anonymized templates"* to *"please scrub"* to the no-auto-send gate, personal data and outbound
   actions were treated as things to contain by default.

The phrases that did the most work were the *framing* ones — **"look for risks and blindspots,"**
**"let's improve quality before we jump on M4,"** **"a person is a LinkedIn contact… I recommend
merging,"** and **"don't build auto-mail sending just yet."** None of them are about code. They're
about *what to do and in what order*, which is exactly the leverage a human has over a coding
agent.

---

## 6. How the prompts improved the code (concretely)

- **The PRD grilling** reshaped the data model to company-centric and demoted allabolag automation
  to a degrade-to-paste enhancement — before implementation, so it cost nothing.
- **The person/contact merge** collapsed two parallel lists into one model, removing duplicated
  status-tracking logic.
- **The "quality before M4" list** directly produced: editable company names, step-gated extension
  buttons, x-of-max progress feedback, company-ID linkage to survive name mismatches, branch-URL
  handling, and smarter contact search.
- **The design-principle prompts** converted an ad-hoc palette into a coherent token system
  (page/input/success/accent roles, weight-over-color, opacity-over-gray).
- **The round-trip import/export** request added lossless backup the PRD never specified.
- **The saved-Boolean-search** feature closed the workflow loop from search → capture → enrich →
  outreach → track, which became the product's "one place for the whole grind" thesis.

---

## 7. Risks & blind spots visible in the record

Observations from the history, offered candidly — several are inherent to the project, not
failures.

1. **LinkedIn scraping is fragile and against-ToS-adjacent.** The whole capture path depends on
   LinkedIn's DOM (the `script[ld+json]` and `a[href]` experiments show how much). It *will* break
   on their markup changes, and automated extraction sits in a grey zone with their terms. The
   mitigation already in place — human-in-the-loop, manual paste fallbacks — is the right posture;
   keep it. Treat the extension as assistive, never headless/bulk.
3. **Personal data lives in more than one place.** The carbon-unit was disciplined (gitignored
   personal copy, *"please scrub"*), but the pattern of pre-filling real details (phone `+46…`, CV
   path, email) into working files means a scrubbing miss is a real risk. A pre-commit secret/PII
   check would make the discipline automatic rather than manual.
4. **Brave Search / API key handling was raised but worth re-auditing.** The human asked the right
   question (*"How to securely store the Brave key?"*). Confirm the key isn't in any committed
   file, build artifact, or the extension bundle, and that the public GitHub repo never received it
   in history (it's a *public* repo — `git log -p` for the key string is cheap insurance).
5. **Heuristic enrichment can produce wrong contacts.** "Guessed" emails (`info@`, `kontakt@`) and
   name-based contact scans are inherently noisy — the early *"are these emails doubled?"* turn
   shows it surfacing. The "guessed · verify" tag is the right guardrail; just make sure nothing
   guessed can flow into an outbound draft without an explicit verify step. (The no-auto-send
   decision already backstops this — keep them coupled.)
6. **Email/company matching by name is brittle by design.** The Euroclear case is the canonical
   example; the company-ID linkage helps, but any name-keyed join (LinkedIn name vs allabolag legal
   name vs website) will mismatch. This is structural, not a bug — worth a periodic manual
   reconciliation rather than trusting the join blindly.
7. **Test coverage is uneven.** The human explicitly asked for a `jsdom` suite for extraction, the
   highest-risk surface — good. But the long UI/theming and the API export paths (which threw a
   live 404) grew largely by manual verification. The export 404 reaching the human is a sign the
   server endpoints could use a thin integration test so regressions surface earlier.
8. **Knowledge lives in the chat, not the repo.** Much of the *why* (the no-auto-send rationale,
   the data-model reshape reasoning) exists only in these transcripts and one memory file. This
   very document is a partial mitigation — consider folding the key decisions into the PRD or an
   ADR log so a future contributor (or a fresh Claude session) doesn't have to re-derive them.

---

*Generated from session transcripts in
`~/.claude/projects/-Users-laszloprekop-dev-APL-search-assistant/`. Prompt quotes are verbatim from
the human's turns (typos preserved); light trimming marked with ellipses, and pasted DOM/links
abbreviated in brackets.*
