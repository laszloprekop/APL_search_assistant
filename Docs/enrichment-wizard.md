# Design — Guided LinkedIn website-enrichment wizard

Status: **agreed** (grill-me session, 2026-06-06). Source of truth for the build.
Relates to PRD §6.1 (discovery) and §6.2 (enrichment). Supersedes the ad-hoc
"Capture company" panel as the primary website path.

## Problem

The captured people list has a company **name guessed from the search card**
("Current: … at X" / headline), which is unreliable (side gigs, Past roles,
"mfex" vs "MFEXbyEuroclear"). The company **website** lives nowhere upstream of
the company page. Getting it by hand is: open person → find Experience → click
company → open About → Capture → Send. Two navigations + three buttons per
company, starting from a guessed name.

## Key DOM facts (verified against `Material/Company website URL journey.md`)

1. **Search-results cards carry only `/in/…` and `/messaging/…` links.** There is
   **no `/company/` href anywhere on the results page** — so you cannot harvest
   company URLs in bulk from search.
2. **The canonical `https://www.linkedin.com/company/<ID>/` link exists only on the
   person's profile, in the Experience section** (numeric ID, e.g. `/company/69567/`).
3. **The website lives only on the company page** (`/company/<ID>/about/`), in the
   labelled `<dl>`: `<dt><h3>Website</h3></dt><dd><a href>…</a></dd>` — already
   validated by `extractWebsite()` / `websiteFromLabel()`.

Therefore the LinkedIn path is inherently **two navigations per person**
(profile → company). That is the floor; it cannot be reduced without crawling.

## Why not "stay on one page while the extension fetches everything"

Every background mechanism fails on technical **or** ToS grounds:

| Mechanism | Works? | ToS-clean? |
|---|---|---|
| `fetch()` the HTML | ❌ Experience/website are JS-rendered (Voyager); raw HTML is an empty shell | ❌ automated access |
| Hidden `<iframe>` | ❌ LinkedIn sends `X-Frame-Options: DENY` | ❌ |
| Background tabs (open→extract→close) | ✅ | ⚠️ the scraper pattern; "automated methods to access the Services" — bannable |
| Voyager API with user cookies | ✅ | ❌ flagrant violation |

Two hard constraints fall out: the data only exists after JS renders (need a
**real, visible page** with the content script in it), and any page you didn't
**visibly navigate to** is the "automated access" LinkedIn prohibits.

## Chosen mechanism — same-tab guided wizard

The **control** stays put; the **page** changes.

- Fixed-position panel (Shadow DOM, bottom-right) **re-injects at the same screen
  coordinates on every page load**, so the primary button reappears under the
  cursor each time — you click in one spot, repeatedly.
- A **progress bar** + wizard state persist in `chrome.storage.local`, surviving
  every navigation.
- **One click = one navigation of the current tab.** No auto-advance chains, no
  background/hidden fetches, human-paced, read-only extraction. Defensible as
  assisted browsing.
- Trade-off (accepted): the page visibly changes under the panel — you watch each
  profile/company load. That transparency is what keeps it on the right side of
  the line.

## Per-entry state machine

State in `chrome.storage.local`: the enrichment queue (captured rows), current
index, current stage (`profile` | `company`), a map of resolved
`companyId → { name, website }`, and per-row results.

```
start: queue = captured people; i = 0
for each person[i]:
  stage = profile
  ── user click ──► navigate current tab to /in/<handle>
       on render (wait for Experience DOM, timeout→Skip):
         { cleanName, /company/ID/ } = parseProfileExperience(doc)
         row.company = cleanName; row.companyId = ID         // replaces the guess
  ── if ID already in resolved map ──► attach person, copy website, i++  (dedupe on the fly)
  ── else: stage = company
       ── user click ──► navigate to /company/ID/about/
            on render (wait for About DOM, timeout→Skip):
              website = extractWebsite(doc)
              resolved[ID] = { cleanName, website }
       i++
end: summary "N/N · K websites found, M missing" + [Send to app]
```

Dedupe is **on the fly** (the canonical ID is only known after the profile
loads, so it can't be pre-deduped): visit each person's profile, but each unique
company's About page **only once**.

## Edge cases / blindspots (with mitigations)

1. **Top Experience ≠ the role that matched the search** → wrong company.
   *Mitigation:* panel shows the resolved company name before the company hop +
   a **Skip** button.
2. **No `/company/` link** (self-employed, freelancer, company without a LinkedIn
   page, privacy-limited / non-connection profile). *Mitigation:* Skip → stage-2
   `Find website` fallback in the app.
3. **Company About has no website field** (FXity, mfex). *Mitigation:* mark
   `website_source: none` → stage-2 fallback.
4. **JS-render timing** — must wait for the Experience/About DOM. *Mitigation:*
   MutationObserver / poll with a timeout, then offer Skip.
5. **Volume/pacing** — ~30 human-paced loads for 15 companies is fine. Keep it
   low-volume; **do not** turn it into a crawler (README must say so).

## Two-stage website retrieval

- **Stage 1 — extension wizard** (authoritative LinkedIn `Website` field).
- **Stage 2 — app `Find website`** (web search) for rows the wizard left empty:
  misses, skips, privacy-limited profiles.

## Two-key identity model

- **Company identity = canonical `/company/<ID>/`.** On import/upsert the app
  dedupes/creates companies by this URL (replacing today's name-matching) and
  attaches distinct persons. Names from search are unreliable; the ID is stable.
- **Outreach tracking = contact email**, captured later (website enrichment, §6.2)
  and used per-contact for reach-out progress/results. No emails exist at
  LinkedIn-enrichment time, so the ID is the only viable company key here.

## Send model

The wizard **enriches the in-extension list in place** and holds it. The user
presses **Send to app** once, on demand (not auto-send per company). Payload =
people rows enriched with `{ cleanCompanyName, companyId, /company/ID/, website,
website_source }`.

## Build surface

- `extension/parser.js`: add `parseProfileExperience(doc)` → first `/company/ID/`
  under the Experience `<h2>` + its name; reuse `extractWebsite`. + jsdom tests
  from the real journey-doc DOM.
- New `extension/profile.js` content script on `linkedin.com/in/*`.
- Shared **wizard coordinator** (state machine over people / profile / company
  pages) — likely `extension/wizard.js` loaded on all three matches, reading the
  same `chrome.storage` state; unify the standalone `company.js` panel so on a
  company page it reports the website into wizard state instead of its own panel.
- `manifest.json`: add the `/in/*` content script; load order parser → wizard → page script.
- App: company dedupe by `LinkedInUrl`/ID on import; keep persons distinct;
  `Find website` remains the labelled stage-2 fallback (optional "find all
  missing" bulk action).
