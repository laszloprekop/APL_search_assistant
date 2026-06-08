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

  // Defensive cleanup for company names lifted from a LinkedIn page header, which can bleed
  // into junk like "ALTEN, CompanyALTEN1,446,778 followers" when JSON-LD is unavailable.
  function sanitizeName(s) {
    let t = clean(s);
    if (!t) return t;
    // Cut a trailing follower count and everything after it (en + sv).
    t = t.replace(/\d[\d., \s]*\s*(followers|följare)\b.*$/i, "");
    // Strip a "Company"/"Företag" label glued before the name ("CompanyALTEN" -> "ALTEN").
    t = t.replace(/\b(?:Company|Företag)(?=[A-ZÅÄÖ])/g, "");
    // Drop a leftover standalone "Company"/"Företag" token.
    t = t.replace(/(^|[\s,])(?:Company|Företag)(?=[\s,]|$)/gi, "$1");
    t = clean(t).replace(/^[\s,·|-]+|[\s,·|-]+$/g, "");
    // Collapse an immediately repeated name token ("ALTEN, ALTEN" -> "ALTEN").
    const toks = t.split(/\s*,\s*|\s+/).filter(Boolean);
    const uniq = [];
    for (const w of toks) if (!uniq.length || uniq[uniq.length - 1].toLowerCase() !== w.toLowerCase()) uniq.push(w);
    return clean(uniq.join(" "));
  }

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

  // ---- PERSON PROFILE PAGE (Experience) parsing -----------------------------
  // The canonical company link `/company/<ID>/` lives ONLY on the profile, under the
  // Experience section. We take the FIRST such link below the "Experience" heading —
  // that's the current/primary role — plus its company name. Numeric ID → the About
  // page is `/company/<ID>/about/`.
  function companyUrlFromHref(href) {
    if (!href) return null;
    try {
      const u = new URL(href, "https://www.linkedin.com");
      const m = u.pathname.match(/\/company\/([^/?#]+)/);
      return m ? { id: m[1], url: "https://www.linkedin.com/company/" + m[1] + "/" } : null;
    } catch { return null; }
  }

  function parseProfileExperience(doc) {
    const d = doc || (typeof document !== "undefined" ? document : null);
    if (!d) return null;

    // Anchor on the "Experience" heading (h2/h3, en + sv), then scan only what follows it.
    let heading = null;
    for (const h of d.querySelectorAll("h2, h3")) {
      if (/^(experience|erfarenhet)$/i.test(clean(h.textContent))) { heading = h; break; }
    }
    // Collect /company/ anchors that appear after the heading in document order.
    const anchors = [...d.querySelectorAll('a[href*="/company/"]')];
    const ordered = heading
      ? anchors.filter((a) => heading.compareDocumentPosition(a) & 4 /* FOLLOWING */)
      : anchors;

    for (const a of ordered) {
      const co = companyUrlFromHref(a.getAttribute("href"));
      if (!co) continue;
      // Name: the logo link carries an aria-label "… logo" / alt; otherwise the text link
      // next to it. Prefer a non-empty, reasonable company string.
      let name = "";
      const labelled = a.querySelector('[aria-label$="logo"], img[alt$="logo"], [aria-label]');
      if (labelled) {
        const al = labelled.getAttribute("aria-label") || labelled.getAttribute("alt") || "";
        name = clean(al.replace(/\s+logo$/i, ""));
      }
      if (!name) name = clean(a.textContent);
      name = sanitizeName(name);
      // Skip the bare logo anchor if its sibling text anchor gives a better name later;
      // but a usable id is enough to proceed.
      return { name: name || null, companyId: co.id, linkedinUrl: co.url };
    }
    return null;
  }

  // ---- PERSON PROFILE PAGE (top-card header) parsing ------------------------
  // Reads the directly-visited /in/ profile's header: name + headline (title) + location.
  // The company link still comes from parseProfileExperience; this adds the person fields
  // that, on a search capture, came from the result card (parseCard) instead.
  //
  // DOM facts (verified against a real logged-in profile, June 2026): classes are fully
  // hashed and there is NO <h1> — the name is the single <h2> that matches the page <title>.
  // Top-card order is: name <h2> · pronouns <p> · "· 1st/2nd" degree <p> · headline <p> ·
  // current-company row <p> · location <p> · "Contact info". So anchor on the name heading
  // and classify the <p> lines that follow it, bounded by the next section heading.

  // The profile URL: the running tab (browser) → a <link rel=canonical> → the jsdom window.
  function pageUrl(d) {
    if (typeof location !== "undefined" && location.href) return location.href;
    const c = d.querySelector('link[rel="canonical"]');
    if (c && c.getAttribute("href")) return c.getAttribute("href");
    try { if (d.defaultView && d.defaultView.location) return d.defaultView.location.href; } catch { /* ignore */ }
    return "";
  }

  // "Magnus Ferm | LinkedIn" / "(3) Magnus Ferm | LinkedIn" -> "Magnus Ferm".
  function nameFromTitle(d) {
    const raw = clean(d.title || "");
    if (!raw) return "";
    return clean(raw.replace(/^\(\d+\+?\)\s*/, "").split("|")[0]);
  }

  function parseProfile(doc) {
    const d = doc || (typeof document !== "undefined" ? document : null);
    if (!d) return null;

    const linkedin_url = cleanProfileUrl(pageUrl(d));
    const handle = linkedin_url ? handleFromUrl(linkedin_url) : "";

    // Name: trust the <title>, then anchor on the heading carrying it (so we don't grab a
    // section heading like "About"/"Experience"). Fall back to the first heading's text.
    const headings = [...d.querySelectorAll("h1, h2, h3")];
    const wantName = nameFromTitle(d);
    let nameHeading = wantName ? headings.find((h) => clean(h.textContent) === wantName) || null : null;
    const name = wantName || (nameHeading ? clean(nameHeading.textContent) : (headings[0] ? clean(headings[0].textContent) : ""));
    if (!name) return null;
    if (!nameHeading) nameHeading = headings.find((h) => clean(h.textContent) === name) || null;

    // Walk the <p> lines after the name heading, stopping at the next heading (top-card
    // boundary). Skip pronouns ("He/Him") and connection degree ("· 1st"); the first line
    // left is the headline (title); the line matching locRe is the location.
    let title = "", location = "";
    if (nameHeading) {
      const after = headings.filter((h) => nameHeading.compareDocumentPosition(h) & 4 /* FOLLOWING */);
      const nextHeading = after[0] || null;
      const inCard = (p) =>
        (nameHeading.compareDocumentPosition(p) & 4) &&
        (!nextHeading || (p.compareDocumentPosition(nextHeading) & 4));
      const locRe = /(Sweden|Sverige|County|Region|Metropolitan|Area|län|kommun)/i;
      const isPronoun = (s) => /^(he|she|they|hen|ze)\s*\/\s*(him|her|them|hen|zir)$/i.test(s);
      const isDegree = (s) => /^[·•\s]*(1st|2nd|3rd)$/i.test(s);
      for (const p of d.querySelectorAll("p")) {
        if (!inCard(p)) continue;
        const s = clean(p.textContent);
        if (!s || s === "·" || isPronoun(s) || isDegree(s)) continue;
        if (!location && locRe.test(s) && s.length < 70) { location = s; if (title) break; continue; }
        if (!title) { title = s; if (location) break; continue; }
      }
    }

    return { name, title, location, lan: lanFromLocation(location), linkedin_url, handle };
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
      name: sanitizeName(ld.name || (h1 ? h1.textContent : "")),
      website: ld.website || extractWebsite(d),
      industry: about.industry || null, // industry isn't in LinkedIn's JSON-LD
      companySize: ld.companySize || about.companySize || null,
      headquarters: ld.headquarters || about.headquarters || null,
      linkedinUrl: companyLinkedInUrl(d),
      _source: ld.website ? "json-ld" : "dom", // for debugging which path produced the website
    };
  }

  // ---- allabolag.se COMPANY DETAIL page (/foretag/.../<ID>) -----------------
  // Cloudflare blocks server-side fetches, but a content script reading the page the USER
  // opened is fine. Anchors are allabolag's semantic classes (companyId-label/-address,
  // StatsWidget-*), not MUI's hashed `mui-*` classes. Values are in 1000s SEK ("Belopp i 1000").
  function parseAllabolag(doc) {
    const d = doc || (typeof document !== "undefined" ? document : null);
    if (!d) return null;

    const h1 = d.querySelector("h1");
    const name = h1 ? clean(h1.textContent) : "";

    // org.nr (NNNNNN-NNNN) + street address both ride on .companyId-address — tell them apart.
    let orgNumber = null, address = null;
    for (const el of d.querySelectorAll(".companyId-address")) {
      const t = clean(el.textContent);
      if (!orgNumber && /^\d{6}-\d{4}$/.test(t)) { orgNumber = t; continue; }
      if (!address && /\d{3}\s?\d{2}\s+\S/.test(t)) address = t;
    }
    if (!orgNumber) {
      const m = (d.body && d.body.textContent || "").match(/\b\d{6}-\d{4}\b/);
      if (m) orgNumber = m[0];
    }

    const tel = d.querySelector('a[href^="tel:"]');
    const phone = tel ? clean(tel.textContent) : null;

    let kommun = null; // "..., 903 21 Umeå" -> "Umeå"
    if (address) { const m = address.match(/\d{3}\s?\d{2}\s+(.+)$/); if (m) kommun = clean(m[1]); }

    // financial stat cells: header -> value (header often carries a trailing year)
    const stats = {};
    for (const cell of d.querySelectorAll(".StatsWidget-cell")) {
      const h = clean((cell.querySelector(".StatsWidget-header") || {}).textContent || "");
      const v = clean((cell.querySelector(".StatsWidget-value") || {}).textContent || "").replace(/ /g, " ");
      if (h) stats[h] = v;
    }
    const findStat = (re) => { for (const k of Object.keys(stats)) if (re.test(k)) return { label: k, value: stats[k] }; return null; };
    const yearOf = (label) => (label.match(/\d{4}/) || [""])[0];

    const oms = findStat(/^Omsättning/i);
    const res = findStat(/^Resultat efter finansnetto/i);
    const ans = findStat(/^Anställda/i);
    const bolagsform = stats["Bolagsform"] || null;
    const reg = stats["Registreringsår"] || null;

    const revenueBand = oms ? `${oms.value} tkr${yearOf(oms.label) ? ` (${yearOf(oms.label)})` : ""}` : null;
    const note = [];
    if (res) note.push(`Resultat e. finansnetto${yearOf(res.label) ? ` ${yearOf(res.label)}` : ""}: ${res.value} tkr`);
    if (bolagsform) note.push(bolagsform);
    if (reg) note.push(`reg ${reg}`);

    return {
      name, orgNumber, phone, address, kommun,
      revenueBand, employeeCount: ans ? ans.value : null,
      financialNote: note.join(" · ") || null,
      _isCompanyPage: !!(name && orgNumber),
    };
  }

  const API = {
    clean, sanitizeName, cleanProfileUrl, handleFromUrl, lanFromLocation, parseAllabolag,
    parseCompany, parseCard, scanDocument,
    unwrapRedirect, extractWebsite, parseCompanyPage, organizationFromJsonLd,
    parseProfileExperience, parseProfile,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.APLParser = API;
})(typeof globalThis !== "undefined" ? globalThis : this);
