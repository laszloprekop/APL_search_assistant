"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const P = require("../parser.js");
const { CARDS, UPSELL } = require("./fixtures.js");

function parse(html) {
  const dom = new JSDOM(`<!DOCTYPE html><body><div role="list">${html}</div></body>`);
  return P.scanDocument(dom.window.document);
}

// --- per-card field extraction (data-driven over the fixtures) ----------------
for (const c of CARDS) {
  test(`parseCard: ${c.label}`, () => {
    const recs = parse(c.html);
    assert.equal(recs.length, 1, "exactly one record");
    const r = recs[0];
    for (const [key, want] of Object.entries(c.expect)) {
      assert.equal(r[key], want, `${key} (got: ${JSON.stringify(r[key])})`);
    }
  });
}

// --- document-level behavior --------------------------------------------------
test("scanDocument skips the Premium upsell (no role=listitem)", () => {
  assert.equal(parse(UPSELL).length, 0);
});

test("scanDocument parses every person card and ignores the upsell in one page", () => {
  const page = CARDS.map((c) => c.html).join("") + UPSELL;
  const recs = parse(page);
  assert.equal(recs.length, CARDS.length);
  // handles are unique -> safe to dedupe by handle downstream
  const handles = new Set(recs.map((r) => r.handle));
  assert.equal(handles.size, CARDS.length);
});

test("returns [] for an empty document", () => {
  assert.equal(parse("").length, 0);
});

// --- unit checks on the pure helpers -----------------------------------------
test("cleanProfileUrl strips query/tracking and normalizes", () => {
  assert.equal(
    P.cleanProfileUrl("https://www.linkedin.com/in/abc/?miniProfileUrn=x&foo=1"),
    "https://www.linkedin.com/in/abc/"
  );
  assert.equal(P.cleanProfileUrl("/in/relative/"), "https://www.linkedin.com/in/relative/");
});

test("parseCompany precedence: Current > headline > Past", () => {
  assert.deepEqual(
    P.parseCompany("Current: Dev at Acme AB", "Dev at Other AB"),
    { company: "Acme AB", confidence: "high" }
  );
  assert.deepEqual(
    P.parseCompany("Past: Dev at Old AB", "Dev at New AB"),
    { company: "New AB", confidence: "medium" }
  );
  assert.deepEqual(
    P.parseCompany("Summary: no employer mentioned here", ""),
    { company: "", confidence: "" }
  );
});

test("lanFromLocation maps 'X County' and known län", () => {
  assert.equal(P.lanFromLocation("Umeå, Västerbotten County, Sweden"), "Västerbotten");
  assert.equal(P.lanFromLocation("Stockholm, Sweden"), "Stockholm");
  assert.equal(P.lanFromLocation("Greater Umeå Metropolitan Area"), "");
});

// --- company About page ------------------------------------------------------
function parseCompany(html) {
  const dom = new JSDOM(`<!DOCTYPE html><body>${html}</body>`);
  return P.parseCompanyPage(dom.window.document);
}

test("unwrapRedirect extracts the real URL from a LinkedIn redirect", () => {
  assert.equal(
    P.unwrapRedirect("https://www.linkedin.com/redir/redirect?url=https%3A%2F%2Fwww.cossystems.com&urlhash=abc"),
    "https://www.cossystems.com"
  );
  assert.equal(P.unwrapRedirect("https://www.linkedin.com/company/x/"), null);
});

test("extractWebsite prefers a redirect-wrapped external link, rooted", () => {
  const html = `
    <a href="/company/cos-systems/about/">About</a>
    <a href="https://www.linkedin.com/redir/redirect?url=https%3A%2F%2Fwww.cossystems.com%2Fsweden%2F&urlhash=z">Website</a>`;
  const dom = new JSDOM(`<!DOCTYPE html><body>${html}</body>`);
  assert.equal(P.extractWebsite(dom.window.document), "https://www.cossystems.com");
});

test("extractWebsite falls back to a direct external link", () => {
  const html = `<a href="/feed/">home</a><a href="https://xlent.se/about" target="_blank">site</a>`;
  const dom = new JSDOM(`<!DOCTYPE html><body>${html}</body>`);
  assert.equal(P.extractWebsite(dom.window.document), "https://xlent.se");
});

test("parseCompanyPage pulls name, website and About <dl> fields (en + sv labels)", () => {
  const r = parseCompany(`
    <h1>COS Systems</h1>
    <a href="https://www.linkedin.com/redir/redirect?url=https%3A%2F%2Fwww.cossystems.com&urlhash=z">cossystems.com</a>
    <dl>
      <dt>Industry</dt><dd>Telecommunications</dd>
      <dt>Company size</dt><dd>11-50 employees</dd>
      <dt>Headquarters</dt><dd>Umeå, Västerbotten</dd>
    </dl>`);
  assert.equal(r.name, "COS Systems");
  assert.equal(r.website, "https://www.cossystems.com");
  assert.equal(r.industry, "Telecommunications");
  assert.equal(r.companySize, "11-50 employees");
  assert.equal(r.headquarters, "Umeå, Västerbotten");
});

test("parseCompanyPage tolerates a missing website / About section", () => {
  const r = parseCompany(`<h1>Some AB</h1>`);
  assert.equal(r.name, "Some AB");
  assert.equal(r.website, null);
  assert.equal(r.industry, null);
});

// --- allabolag.se company detail page ---------------------------------------
// Built from Material/allabolag-company-path.md (COS Systems AB, captured June 2026).
function parseAlla(html) {
  const dom = new JSDOM(`<!DOCTYPE html><body>${html}</body>`);
  return P.parseAllabolag(dom.window.document);
}

const ALLA_COS = `
  <h1 class="MuiTypography-h1">COS Systems AB</h1>
  <div class="companyId-overview">
    <span class="companyId-label">Org.nr</span><span class="companyId-address">556830-8703</span>
  </div>
  <div class="companyId-overview">
    <span class="companyId-label">Telefon</span><span><a href="tel:0706565119">070-656 51 19</a></span>
    <span class="MuiBox-root"><span class="companyId-label">Adress</span></span>
    <span class="companyId-address">Storgatan 28 e, 903 21 Umeå</span>
  </div>
  <div class="MuiStack-root">
    <div class="StatsWidget-cell"><span class="StatsWidget-header">Omsättning 2024</span><span class="StatsWidget-value">5&nbsp;406</span></div>
    <div class="StatsWidget-cell"><span class="StatsWidget-header">Resultat efter finansnetto 2024</span><span class="StatsWidget-value">−18&nbsp;508</span></div>
    <div class="StatsWidget-cell"><span class="StatsWidget-header">EBITDA 2024</span><span class="StatsWidget-value">−18&nbsp;859</span></div>
    <div class="StatsWidget-cell"><span class="StatsWidget-header">Bolagsform</span><span class="StatsWidget-value">Aktiebolag</span></div>
    <div class="StatsWidget-cell"><span class="StatsWidget-header">Registreringsår</span><span class="StatsWidget-value">2010</span></div>
  </div>`;

test("parseAllabolag reads name, org.nr, phone, kommun and financials", () => {
  const r = parseAlla(ALLA_COS);
  assert.equal(r.name, "COS Systems AB");
  assert.equal(r.orgNumber, "556830-8703");
  assert.equal(r.phone, "070-656 51 19");
  assert.equal(r.kommun, "Umeå");
  assert.equal(r.revenueBand, "5 406 tkr (2024)"); // &nbsp; folded to a normal space
  assert.equal(r.financialNote, "Resultat e. finansnetto 2024: −18 508 tkr · Aktiebolag · reg 2010");
  assert.equal(r._isCompanyPage, true);
});

test("parseAllabolag tells the org.nr .companyId-address from the address one", () => {
  const r = parseAlla(ALLA_COS);
  assert.equal(r.address, "Storgatan 28 e, 903 21 Umeå");
  assert.notEqual(r.orgNumber, r.address);
});

test("parseAllabolag returns _isCompanyPage=false off a company page (e.g. search list)", () => {
  const r = parseAlla(`<h1>Företagssökning</h1><div>no org number here</div>`);
  assert.equal(r._isCompanyPage, false);
  assert.equal(r.orgNumber, null);
});

// --- JSON-LD (schema.org) — the robust primary path --------------------------
function ld(json, extra = "") {
  return `<script type="application/ld+json">${JSON.stringify(json)}</script>${extra}`;
}

test("organizationFromJsonLd reads website (url) + size + HQ, skipping a LinkedIn url", () => {
  const dom = new JSDOM(`<!DOCTYPE html><body>${ld({
    "@type": "Organization", name: "twoday Sweden", url: "https://www.twoday.se",
    numberOfEmployees: { "@type": "QuantitativeValue", value: 1200 },
    address: { "@type": "PostalAddress", addressLocality: "Umeå", addressRegion: "Västerbotten" },
  })}</body>`);
  const o = P.organizationFromJsonLd(dom.window.document);
  assert.equal(o.website, "https://www.twoday.se");
  assert.equal(o.companySize, "1200");
  assert.equal(o.headquarters, "Umeå, Västerbotten");
});

test("parseCompanyPage prefers JSON-LD over the DOM and marks the source", () => {
  // DOM has a decoy external link; JSON-LD has the real website → JSON-LD wins.
  const r = parseCompany(ld(
    { "@graph": [{ "@type": "Organization", name: "COS Systems", url: "https://www.cossystems.com" }] },
    `<h1>cos systems (dom)</h1><a href="https://decoy-aggregator.se">x</a>`
  ));
  assert.equal(r.name, "COS Systems");
  assert.equal(r.website, "https://www.cossystems.com");
  assert.equal(r._source, "json-ld");
});

test("organizationFromJsonLd falls back to a Person's worksFor company", () => {
  const dom = new JSDOM(`<!DOCTYPE html><body>${ld({
    "@type": "Person", name: "Daniel H.",
    worksFor: [{ "@type": "Organization", name: "twoday", url: "https://twoday.se" }],
  })}</body>`);
  const o = P.organizationFromJsonLd(dom.window.document);
  assert.equal(o.name, "twoday");
  assert.equal(o.website, "https://twoday.se");
});

test("parseCompanyPage falls back to DOM when there's no JSON-LD", () => {
  const r = parseCompany(`<h1>XLENT</h1><a href="https://www.xlent.se/about" target="_blank">site</a>`);
  assert.equal(r.website, "https://www.xlent.se");
  assert.equal(r._source, "dom");
});

// --- PERSON PROFILE Experience -> canonical company link --------------------
function parseProfile(html) {
  const dom = new JSDOM(`<!DOCTYPE html><body>${html}</body>`);
  return P.parseProfileExperience(dom.window.document);
}

// Real logged-in profile Experience markup (from Material/Company website URL journey.md):
// the company link is /company/<numeric-id>/ and the name rides on the logo's aria-label.
test("parseProfileExperience reads the first /company/ID/ under the Experience heading", () => {
  const r = parseProfile(`
    <section aria-label="Primary content">
      <a href="https://www.linkedin.com/company/999/">current-company pill in the TOP CARD (must be ignored)</a>
      <h2 componentkey="ProfileNullStateCardAnchor_Experience">Experience</h2>
      <div componentkey="entity-collection-item-19a98a">
        <a href="https://www.linkedin.com/company/69567/">
          <figure><svg role="img" aria-label="Euroclear FundsPlace logo"></svg>
            <img alt="Euroclear FundsPlace logo"></figure></a>
        <a href="https://www.linkedin.com/company/69567/">
          <div><p>Engineering Manager</p><p>Euroclear FundsPlace · Full-time</p></div></a>
      </div>
    </section>`);
  assert.equal(r.companyId, "69567");
  assert.equal(r.linkedinUrl, "https://www.linkedin.com/company/69567/");
  assert.equal(r.name, "Euroclear FundsPlace");
});

test("parseProfileExperience ignores a /company/ link that precedes the Experience heading", () => {
  // No heading-following company link -> nothing from Experience.
  const r = parseProfile(`
    <a href="https://www.linkedin.com/company/123/">Top card current company</a>
    <h2>Experience</h2>`);
  assert.equal(r, null);
});

test("parseProfileExperience falls back to a slug company id and link text for the name", () => {
  const r = parseProfile(`
    <h3>Experience</h3>
    <a href="/company/cos-systems/"><span>COS Systems</span></a>`);
  assert.equal(r.companyId, "cos-systems");
  assert.equal(r.linkedinUrl, "https://www.linkedin.com/company/cos-systems/");
  assert.equal(r.name, "COS Systems");
});

test("parseProfileExperience returns null when there is no company in Experience", () => {
  assert.equal(parseProfile(`<h2>Experience</h2><p>Self-employed</p>`), null);
});

// Real logged-in LinkedIn company About markup (captured from the live page, June 2026):
// no JSON-LD; website lives in a <dl> as <dt><h3>Website</h3></dt><dd><a href>…</a></dd>.
test("parseCompanyPage reads the real LinkedIn About <dl> (label <h3> inside <dt>)", () => {
  const r = parseCompany(`
    <h1>COS Systems</h1>
    <dl class="overflow-hidden">
      <dt class="mb1"><h3 class="text-heading-medium">Website</h3></dt>
      <dd class="mb4"><a target="_blank" rel="noopener noreferrer" href="http://www.cossystems.com" class="link-without-visited-state ember-view"><span dir="ltr">http://www.cossystems.com</span></a></dd>
      <dt class="mb1"><h3>Industry</h3></dt>
      <dd>Telecommunications</dd>
      <dt class="mb1"><h3>Company size</h3></dt>
      <dd>11-50 employees</dd>
      <dt class="mb1"><h3>Headquarters</h3></dt>
      <dd>Umeå, Västerbotten</dd>
    </dl>`);
  assert.equal(r.name, "COS Systems");
  assert.equal(r.website, "http://www.cossystems.com");
  assert.equal(r.industry, "Telecommunications");
  assert.equal(r.companySize, "11-50 employees");
  assert.equal(r.headquarters, "Umeå, Västerbotten");
});

// --- sanitizeName: defend against LinkedIn company-header bleed ----------------
test("sanitizeName strips a glued 'Company' label + follower count", () => {
  assert.equal(P.sanitizeName("ALTEN, CompanyALTEN1,446,778 followers"), "ALTEN");
});

test("sanitizeName drops a trailing Swedish follower count", () => {
  assert.equal(P.sanitizeName("Volvo Group 1 234 567 följare"), "Volvo Group");
});

test("sanitizeName collapses an immediately repeated name token", () => {
  assert.equal(P.sanitizeName("Knightec, Knightec"), "Knightec");
});

test("sanitizeName leaves a clean multi-word name untouched", () => {
  assert.equal(P.sanitizeName("COS Systems AB"), "COS Systems AB");
});

test("parseCompanyPage sanitizes a junk h1 when JSON-LD is absent", () => {
  const dom = new JSDOM(`<!DOCTYPE html><body>
    <h1>ALTEN, CompanyALTEN1,446,778 followers</h1></body>`);
  const r = P.parseCompanyPage(dom.window.document);
  assert.equal(r.name, "ALTEN");
});
