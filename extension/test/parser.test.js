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
