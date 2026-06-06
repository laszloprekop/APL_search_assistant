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

  // ---- LinkedIn COMPANY PAGE (About) parsing --------------------------------

  // LinkedIn wraps external links: https://www.linkedin.com/redir/redirect?url=<ENC>&urlhash=..
  function unwrapRedirect(href) {
    if (!href) return null;
    try {
      const u = new URL(href, "https://www.linkedin.com");
      if (u.pathname.includes("/redir/redirect")) {
        const target = u.searchParams.get("url");
        if (target) return decodeURIComponent(target);
      }
    } catch { /* ignore */ }
    return null;
  }

  function isExternal(href) {
    try {
      const h = new URL(href, "https://www.linkedin.com").host.toLowerCase();
      return !h.includes("linkedin.com") && !h.includes("licdn.com");
    } catch { return false; }
  }

  // The "Website"/"Webbplats" labelled value in the About <dl> — authoritative on a real
  // LinkedIn company page: <dt><h3>Website</h3></dt><dd><a href="http://site">…</a></dd>.
  function websiteFromLabel(doc) {
    for (const dt of doc.querySelectorAll("dt")) {
      if (!/^(website|webbplats)$/i.test(clean(dt.textContent))) continue;
      const dd = dt.nextElementSibling;
      const a = dd && dd.querySelector("a[href]");
      if (a) {
        const href = a.getAttribute("href") || "";
        return unwrapRedirect(href) || href;
      }
    }
    return null;
  }

  // Best-effort website from a company About page: the labelled "Website" value first, then a
  // redirect-wrapped link, then the first external (non-LinkedIn) http link. Clean root URL.
  function extractWebsite(doc) {
    const labelled = websiteFromLabel(doc);
    if (labelled && isExternal(labelled)) return rootUrl(labelled);

    const anchors = [...doc.querySelectorAll("a[href]")];
    for (const a of anchors) {
      const t = unwrapRedirect(a.getAttribute("href"));
      if (t && isExternal(t)) return rootUrl(t);
    }
    for (const a of anchors) {
      const href = a.getAttribute("href") || "";
      if (/^https?:\/\//i.test(href) && isExternal(href)) return rootUrl(href);
    }
    return null;
  }

  function rootUrl(u) {
    try { return new URL(u).origin; } catch { return u; }
  }

  // Map a company-page <dl> (or labelled rows) into { industry, companySize, headquarters }.
  function extractAboutFields(doc) {
    const out = {};
    const want = {
      "industry": "industry", "bransch": "industry",
      "company size": "companySize", "antal anställda": "companySize", "företagsstorlek": "companySize",
      "headquarters": "headquarters", "huvudkontor": "headquarters",
    };
    // <dt>label</dt><dd>value</dd>
    for (const dt of doc.querySelectorAll("dt")) {
      const label = clean(dt.textContent).toLowerCase().replace(/:$/, "");
      const key = want[label];
      if (!key || out[key]) continue;
      const dd = dt.nextElementSibling;
      if (dd && dd.tagName === "DD") out[key] = clean(dd.textContent);
    }
    return out;
  }

  // ---- JSON-LD (schema.org) — robust to LinkedIn's CSS-class churn -----------
  function jsonLdNodes(doc) {
    const out = [];
    for (const s of doc.querySelectorAll('script[type="application/ld+json"]')) {
      let data;
      try { data = JSON.parse(s.textContent || ""); } catch { continue; }
      const items = Array.isArray(data) ? data : (data["@graph"] ? data["@graph"] : [data]);
      for (const it of items) if (it && typeof it === "object") out.push(it);
    }
    return out;
  }

  function typeIs(node, t) {
    const ty = node && node["@type"];
    return Array.isArray(ty) ? ty.includes(t) : ty === t;
  }

  // Pull a company Organization out of JSON-LD (direct, or via a Person's worksFor).
  function organizationFromJsonLd(doc) {
    const nodes = jsonLdNodes(doc);
    let org = nodes.find((n) => typeIs(n, "Organization"));
    if (!org) {
      const person = nodes.find((n) => typeIs(n, "Person"));
      const w = person && (Array.isArray(person.worksFor) ? person.worksFor[0] : person.worksFor);
      if (w && typeof w === "object") org = w;
    }
    if (!org) return null;

    // org.url is normally the external website; skip it if it's a LinkedIn URL.
    let website = typeof org.url === "string" ? org.url : null;
    if (website && /linkedin\.com/i.test(website)) website = null;
    if (!website && Array.isArray(org.sameAs)) website = org.sameAs.find((u) => isExternal(u)) || null;

    const num = org.numberOfEmployees;
    const employees = num && typeof num === "object" ? (num.value || num.minValue || null) : (num || null);
    const addr = org.address;
    const hq = addr && typeof addr === "object"
      ? [addr.addressLocality, addr.addressRegion].filter(Boolean).join(", ") || null
      : null;

    return {
      name: typeof org.name === "string" ? clean(org.name) : null,
      website: website ? rootUrl(website) : null,
      companySize: employees ? String(employees) : null,
      headquarters: hq,
    };
  }

  function companyLinkedInUrl(doc) {
    const href = (typeof location !== "undefined" && location.href) ||
      doc.querySelector('link[rel="canonical"]')?.getAttribute("href") || "";
    const m = href.match(/\/company\/[^/?#]+/);
    return m ? "https://www.linkedin.com" + m[0] + "/" : null;
  }

  // Parse the currently-open LinkedIn company page into a CompanyImportRow shape.
  // JSON-LD (schema.org Organization) is the primary source — stable across LinkedIn's CSS
  // churn — with the DOM heuristic as a per-field fallback.
  function parseCompanyPage(doc) {
    const d = doc || (typeof document !== "undefined" ? document : null);
    if (!d) return null;
    const ld = organizationFromJsonLd(d) || {};
    const about = extractAboutFields(d);
    const h1 = d.querySelector("h1");

    return {
      name: ld.name || (h1 ? clean(h1.textContent) : ""),
      website: ld.website || extractWebsite(d),
      industry: about.industry || null, // industry isn't in LinkedIn's JSON-LD
      companySize: ld.companySize || about.companySize || null,
      headquarters: ld.headquarters || about.headquarters || null,
      linkedinUrl: companyLinkedInUrl(d),
      _source: ld.website ? "json-ld" : "dom", // for debugging which path produced the website
    };
  }

  const API = {
    clean, cleanProfileUrl, handleFromUrl, lanFromLocation,
    parseCompany, parseCard, scanDocument,
    unwrapRedirect, extractWebsite, parseCompanyPage, organizationFromJsonLd,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.APLParser = API;
})(typeof globalThis !== "undefined" ? globalThis : this);
