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
