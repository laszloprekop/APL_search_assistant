# Design — Direct-profile capture (single user/company package)

Status: **agreed** (grill-me session, 2026-06-08). Source of truth for the build.
Relates to PRD §6.1 (discovery). Complements `enrichment-wizard.md`: same
website-walk engine, new entry point.

## Problem

Today the extension only captures people you reach **from a people-search results
list** (`content.js` on `/search/results/people/*`). But you often land on a single
LinkedIn profile directly — a referral, a Google hit, a "people you may know". There
is **no way to capture that one person + walk their company website + push it to the
app** without first manufacturing a search that contains them.

`wizard.js` already runs on `/in/*` and `/company/*`, but it stays invisible unless
`apl_wizard.active` is set — which only the search panel sets. A direct visit gets no
UI at all.

## Goal

On a directly-visited `/in/*` profile, capture the person's details, walk the existing
one-click website-retrieval steps, and push that **single user/company package** to the
app.

## What already works (no change needed)

- **Backend.** `POST /api/companies/import` takes a `List<CaptureRow>` and handles a
  **single-element array** perfectly (`ApiEndpoints.cs:179`): it matches/creates the
  company by canonical `/company/<ID>/` or name, adds the person, attaches the LinkedIn
  contact, and **dedupes by handle** — so re-capturing the same profile is safe.
  **Zero backend changes.**
- **Website-walk engine.** `wizard.js`'s per-item flow — `profile → /company/<ID>/ →
  /about/ → extractWebsite` — is exactly what a single capture needs. We reuse it as a
  **1-item, one-shot** run.
- **Company-hop + website parsers.** `parseProfileExperience()` (company link from the
  Experience section) and `parseCompanyPage()` / `extractWebsite()` are unchanged. Verified
  against the real fixture: the Experience heading is present and the top company id
  resolves (e.g. `thetribetech` → `/company/thetribetech/about/`).
- **Coexistence.** `company.js` already stands down when `apl_wizard.active`. The 1-item
  flow sets `apl_wizard.active` only at walk-start, so the company panel yields correctly.

## The one genuine gap — `parseProfile()`

Nothing reads the **profile header** (name / title / location). `parseCard()` reads
*search* cards; `parseProfileExperience()` reads only the company link. We add a pure
`parseProfile(doc)` to `parser.js` (the single place DOM logic lives), returning
`{ name, title, location, lan, linkedin_url, handle }`.

### DOM facts (verified against `extension/test/profile-sample.html`, the new LinkedIn DOM)

The redesigned profile DOM has **fully hashed classes** and **no `<h1>`**. Top-card order:

```
<h2>Magnus Ferm</h2>                              ← name (the ONLY h2 matching the title)
<svg aria-label="View … verifications">           ← verified badge
<p>He/Him</p>                                      ← pronouns
<p>· 1st</p> / <p>· 2nd</p>                         ← connection degree
<p>Lead Consultant & Manager at The Tribe</p>     ← HEADLINE (title)
<p>The Tribe · Lernia AB</p>                       ← current-company row (ignored)
<p>Kalmar County, Sweden</p>                       ← LOCATION
<p>·</p> <a>Contact info</a>
```

### Anchoring strategy (semantic only — classes rotate)

- **Name:** `document.title` → text before `|` ("Magnus Ferm | LinkedIn" → "Magnus Ferm").
  Cross-check / fall back to the single heading whose trimmed text equals it.
- **Headline (title):** the first `<p>` *following the name heading* in document order
  that is **not** pronouns (`/^\s*\S+\/\S+\s*$/`-style, e.g. `He/Him`), **not** degree
  (`/^[·•\s]*(1st|2nd|3rd)$/i`), and **not** the location.
- **Location:** the first following `<p>` matching the existing `locRe`
  (`County|Sweden|Region|…`). Feeds `lanFromLocation` → `lan` ("Kalmar County" → "Kalmar").
- **Bounding:** only scan `<p>`s after the name heading, stop at the next heading
  (section boundary) or after ~12 elements, so we never drift into "People you may know".
- **handle / linkedin_url:** `cleanProfileUrl(location.href)` + `handleFromUrl` (existing).

### Test fixture (privacy)

`extension/test/profile-sample.html` is the **real saved profile DOM — gitignored**
(personal data; see `.gitignore`). The committed jsdom test therefore runs against an
**anonymized synthetic fixture** added to `test/fixtures.js`, faithfully mirroring the
structure above (hashed-class `<h2>` name, pronoun/degree/headline/company/location `<p>`s,
plus an Experience heading + a `/company/<id>/` link). The real file stays local for
spot-validation via `window.__apl*`.

## Interaction (agreed)

On `/in/*` with **no active `apl_wizard`**:

1. **Auto-read on arrival.** Passively parse the rendered profile — `parseProfile` (name /
   title / location) + `parseProfileExperience` (company link). No click to read.
   *(This is a deliberate departure from "click Capture"; see ToS note below.)*
2. **Read-only preview.** Panel shows the captured package: `name · title · location →
   resolved company`. Not editable — corrections happen in the app (matches `content.js` /
   `company.js`).
3. **One-click walk**, gated by a `confirm()`: "Open *Company* ↗" → `/company/<ID>/about/`
   → `extractWebsite`. Reads only the page you opened. A **Skip** sends the person without
   a website. (Reuses the wizard's existing per-page render/Skip.)
4. **Send** → `/api/companies/import` with the 1-row package. On success: **"Sent ✓",
   `apl_wizard` cleared**; navigating to the next profile auto-reads fresh (clean one-shot
   loop — the "one package" model).

### State / coexistence

The single flow persists `apl_wizard` **only at walk-start**, tagged `mode:"single"`,
`queue:[item]`, `stage:"company"` (we already read Experience on the profile, so we hop
straight to the company). `wizard.js` `init()` branches:

- `apl_wizard.active && mode!=="single"` → existing multi-person enrich walk (unchanged).
- `apl_wizard.active && mode==="single"` → single walk: company hop → website → done →
  Send; `mode:"single"` drives single-profile copy and the post-send "clear" behavior.
- not active && on `/in/*` → auto-read + single-capture entry panel.

The entry panel is stateless until the walk begins, so the multi-person walk visiting a
profile (which has `active` set) never triggers the single entry.

### Edge cases (all: capture the person anyway)

- **No Experience company link (freelancer):** skip the walk, go straight to send-ready;
  backend files them under `(okänt företag)`.
- **Company resolves but About has no website:** `website_source:"none"`; person + company
  sent without a site (the app's "Find website" picks it up later).

## ToS note (must update docs)

The manifest description and README currently promise *"Manual trigger only. You click
Capture; the extension reads what's already rendered."* **Auto-read on arrival contradicts
that wording.** It is defensible — you deliberately navigated to the profile; parsing the
already-rendered DOM involves no scroll, pagination, background fetch, or new tab, and all
**navigation and send stay click-gated** (incl. the `confirm()`). But to keep code and
stated posture honest, the manifest description + README boundary are reworded to:
*"auto-reads the rendered profile you navigate to; all navigation and send stay
click-gated."*

## File-by-file changes

| File | Change |
|---|---|
| `extension/parser.js` | **New** `parseProfile(doc)` → `{name,title,location,lan,linkedin_url,handle}`; export in `API`. |
| `extension/wizard.js` | `init()` branch for `/in/*` with no active wizard → auto-read, build entry panel; `mode:"single"` handling in start/renderDone/post-send (clear + revert). Single-profile copy/labels. |
| `extension/test/fixtures.js` | **New** anonymized profile fixture (synthetic, faithful to the real DOM). |
| `extension/test/parser.test.js` | **New** cases: name via title + heading fallback, headline picked over pronoun/degree/company rows, location→lan, freelancer (no company link). |
| `extension/manifest.json` | Reword description (ToS); version bump. No new `content_scripts` (already on `/in/*`). |
| `extension/README.md` | Reword ToS boundary; document the direct-profile entry point. |
| `.gitignore` | `extension/test/profile-sample.html` + `*-sample.html` (done). |

## Out of scope

- No backend change. No accumulate-then-batch (one-shot per profile). No inline editing.
- Company-page (`/company/*`) capture stays with `company.js`; this entry is profile-first.
```

## Build order

1. `parseProfile()` + synthetic fixture + tests (red→green) — the only risky piece.
2. `wizard.js` `init()` auto-read branch + entry panel (preview).
3. `mode:"single"` walk-start + reuse company-hop/website/done; Send.
4. Post-send clear + edge cases (freelancer, no-website).
5. Manifest/README ToS reword + version bump.
