// Pure LinkedIn people-search parsing logic — NO DOM mutation, NO UI side effects.
// Shared by content.js (browser content-script world) and the jsdom test suite (Node).
//
// Robustness: LinkedIn's class names are hashed and rotate (e.g. `_5734e67c`), so this
// parser keys ONLY off stable semantic anchors:
//   [role="listitem"]            -> one per result card (the Premium upsell has no role)
//   aria-label / img[alt]        -> person name
//   a[href*="/in/"]              -> profile URL (first match = card wrapper)
//   "Current: ... at {Company}"  -> employer
// If LinkedIn restructures, this file is the single place to fix.

(function (root) {
  "use strict";

  const clean = (s) => (s || "").replace(/\s+/g, " ").trim();

  function cleanProfileUrl(href) {
    if (!href) return "";
    const abs = href.startsWith("http") ? href : "https://www.linkedin.com" + href;
    try {
      const u = new URL(abs);
      const m = u.pathname.match(/\/in\/[^/]+/);
      return m ? "https://www.linkedin.com" + m[0] + "/" : abs.split("?")[0];
    } catch {
      return abs.split("?")[0];
    }
  }

  function handleFromUrl(url) {
    const m = url.match(/\/in\/([^/]+)/);
    try { return m ? decodeURIComponent(m[1]) : url; } catch { return m ? m[1] : url; }
  }

  function lanFromLocation(loc) {
    const m = loc.match(/([A-Za-zÅÄÖåäö]+)\s+County/);
    if (m) return m[1];
    const known = ["Norrbotten", "Västerbotten", "Stockholm", "Skåne", "Uppsala",
      "Östergötland", "Jämtland", "Västernorrland", "Gävleborg", "Dalarna"];
    return known.find((k) => loc.includes(k)) || "";
  }

  // Employer, best-effort. Precedence: "Current: … at X" > headline "… at X" > "Past:/Summary: … at X".
  function parseCompany(summary, title) {
    const pick = (line) => {
      if (!line) return "";
      const body = line.replace(/^(Current|Past|Summary)\s*:\s*/i, "");
      const parts = body.split(/\s+at\s+/i);
      if (parts.length < 2) return "";
      let co = parts[parts.length - 1];
      co = co.split(/\s[-–·|]\s|\.{3}|…/)[0]; // cut trailing role/description
      return clean(co);
    };
    if (/^Current\s*:/i.test(summary)) {
      const co = pick(summary);
      if (co) return { company: co, confidence: "high" };
    }
    const fromTitle = pick(title);
    if (fromTitle) return { company: fromTitle, confidence: "medium" };
    const fromSummary = pick(summary);
    if (fromSummary) return { company: fromSummary, confidence: "low" };
    return { company: "", confidence: "" };
  }

  function parseCard(li) {
    const primary = li.querySelector('a[href*="/in/"]');
    if (!primary) return null; // not a person card (e.g. upsell) -> skip
    const linkedin_url = cleanProfileUrl(primary.getAttribute("href"));
    const handle = handleFromUrl(linkedin_url);
    if (!handle) return null;

    // name: action-button aria-label -> img alt -> shortest /in/ link text
    let name = "";
    const action = li.querySelector(
      'a[aria-label^="Invite "], a[aria-label^="Send a message to "]'
    );
    if (action) {
      const al = action.getAttribute("aria-label") || "";
      const m = al.match(/^Invite (.+?) to connect$/) || al.match(/^Send a message to (.+)$/);
      if (m) name = clean(m[1]);
    }
    if (!name) {
      const img = li.querySelector("img[alt]");
      if (img && clean(img.getAttribute("alt"))) name = clean(img.getAttribute("alt"));
    }
    if (!name) {
      const cand = [...li.querySelectorAll('a[href*="/in/"]')]
        .map((a) => clean(a.textContent))
        .filter((t) => t && t.length <= 60 && !/•/.test(t));
      if (cand.length) name = cand.sort((a, b) => a.length - b.length)[0];
    }

    // text lines -> classify into title / location / summary
    const lines = [...li.querySelectorAll("p")].map((p) => clean(p.textContent)).filter(Boolean);
    const isSummary = (s) => /^(Current|Past|Summary)\s*:/i.test(s);
    const isMutual = (s) => /mutual connection/i.test(s);
    const isDegree = (s) => /•\s*(1st|2nd|3rd)/i.test(s);
    const isPromo = (s) => /actively hiring|Retry Premium|advanced search/i.test(s);
    const locRe = /(Sweden|Sverige|County|Region|Metropolitan|Area|län|kommun)/i;

    let title = "", location = "", summary = "";
    for (const line of lines) {
      if (!summary && isSummary(line)) { summary = line; continue; }
      if (isMutual(line) || isDegree(line) || isPromo(line)) continue;
      if (line === name) continue;
      if (!location && locRe.test(line) && line.length < 70) { location = line; continue; }
      if (!title && !isSummary(line)) { title = line; continue; }
    }

    const { company, confidence } = parseCompany(summary, title);

    return {
      name, title, company, company_confidence: confidence,
      location, lan: lanFromLocation(location),
      linkedin_url, handle, raw_current: summary,
      captured_at: new Date().toISOString(),
    };
  }

  function scanDocument(doc) {
    const d = doc || (typeof document !== "undefined" ? document : null);
    if (!d) return [];
    return [...d.querySelectorAll('[role="listitem"]')].map(parseCard).filter(Boolean);
  }

  const API = {
    clean, cleanProfileUrl, handleFromUrl, lanFromLocation,
    parseCompany, parseCard, scanDocument,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.APLParser = API;
})(typeof globalThis !== "undefined" ? globalThis : this);
