// APL Search Assistant — LinkedIn people-search capture (content script)
//
// Philosophy: assisted, user-initiated capture (PRD §6.1). You browse LinkedIn
// yourself and click "Capture" to grab the results CURRENTLY rendered on screen.
// No auto-scroll, no auto-pagination, no background fetching. Manual trigger only.
//
// Robustness note: LinkedIn's class names are hashed and rotate (e.g. `_5734e67c`),
// so this parser deliberately avoids them. It keys off stable semantic anchors:
//   - [role="listitem"]            -> one per result card (skips the Premium upsell)
//   - aria-label / img[alt]        -> person name
//   - a[href*="/in/"]              -> profile URL (first = card wrapper)
//   - "Current: ... at {Company}"  -> employer
// If LinkedIn changes structure, the SELECTORS section below is the only thing to fix.

(function () {
  if (window.__aplCaptureLoaded) return;
  window.__aplCaptureLoaded = true;

  // Output schema = the Deliverable/lexicon_list.csv columns, so captures append
  // straight into your ≥15 list. LinkedIn only fills some columns; the rest
  // (org_nr, epost, telefon, financials) come later from allabolag/website enrichment.
  const LEX_COLS = [
    "foretag", "org_nr", "ort", "lan", "antal_anstallda", "ekonomi_note",
    "kontaktperson", "titel", "linkedin_url", "epost", "telefon",
    "kontaktkalla", "status",
  ];

  const store = new Map(); // handle -> record (dedupe across scrolls/pages)

  // ---------------------------------------------------------------- helpers ---
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
  // e.g. "Current: Senior Cloud Architect at FXity - Architecture and..." -> FXity (high)
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
    const fromTitle = pick(title); // current headline "Role at Company"
    if (fromTitle) return { company: fromTitle, confidence: "medium" };
    const fromSummary = pick(summary); // Past:/Summary: fallback
    if (fromSummary) return { company: fromSummary, confidence: "low" };
    return { company: "", confidence: "" };
  }

  // ----------------------------------------------------------- SELECTORS ------
  function parseCard(li) {
    const primary = li.querySelector('a[href*="/in/"]');
    if (!primary) return null; // not a person card (e.g. upsell) -> skip
    const linkedin_url = cleanProfileUrl(primary.getAttribute("href"));
    const handle = handleFromUrl(linkedin_url);
    if (!handle) return null;

    // --- name: action-button aria-label -> img alt -> shortest /in/ link text
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

    // --- gather text lines, classify into title / location / summary
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

  function scan() {
    const cards = [...document.querySelectorAll('[role="listitem"]')];
    let added = 0;
    for (const li of cards) {
      const rec = parseCard(li);
      if (rec && rec.handle && !store.has(rec.handle)) {
        store.set(rec.handle, rec);
        added++;
      }
    }
    return { added, total: store.size, onPage: cards.length };
  }

  // ------------------------------------------------------------- exporters ----
  const csvCell = (v) => {
    const s = (v == null ? "" : String(v));
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };

  function toLexCsv() {
    const rows = [...store.values()].map((r) => ({
      foretag: r.company, org_nr: "", ort: r.location, lan: r.lan,
      antal_anstallda: "", ekonomi_note: "", kontaktperson: r.name,
      titel: r.title, linkedin_url: r.linkedin_url, epost: "", telefon: "",
      kontaktkalla: "linkedin", status: "not_contacted",
    }));
    return [LEX_COLS.join(","), ...rows.map((r) => LEX_COLS.map((c) => csvCell(r[c])).join(","))].join("\n");
  }

  const toJson = () => JSON.stringify([...store.values()], null, 2);

  function download(filename, text, mime) {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.documentElement.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function copy(text, btn) {
    try { await navigator.clipboard.writeText(text); flash(btn, "Copied ✓"); }
    catch {
      const ta = document.createElement("textarea");
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); flash(btn, "Copied ✓"); }
      catch { flash(btn, "Copy failed"); }
      ta.remove();
    }
  }

  // -------------------------------------------------------------------- UI ----
  let countEl, previewEl;

  function flash(btn, msg) {
    const old = btn.textContent; btn.textContent = msg;
    setTimeout(() => (btn.textContent = old), 1200);
  }

  function refresh() {
    countEl.textContent = store.size;
    const rows = [...store.values()].slice(-8).reverse();
    previewEl.innerHTML = rows.map((r) =>
      `<div class="row"><b>${esc(r.name) || "—"}</b> · ${esc(r.company) || "<i>?company</i>"}`
      + `<div class="sub">${esc(r.title) || ""}${r.location ? " · " + esc(r.location) : ""}</div></div>`
    ).join("") || '<div class="row sub">No captures yet. Click “Capture visible”.</div>';
  }
  const esc = (s) => (s || "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

  function buildPanel() {
    const host = document.createElement("div");
    host.id = "apl-capture-host";
    host.style.cssText = "position:fixed;z-index:2147483647;bottom:16px;right:16px;";
    const sh = host.attachShadow({ mode: "open" });
    sh.innerHTML = `
      <style>
        * { box-sizing: border-box; font-family: -apple-system, system-ui, sans-serif; }
        .panel { width: 300px; background:#fff; color:#1d2226; border:1px solid #d0d5dd;
          border-radius:10px; box-shadow:0 8px 28px rgba(0,0,0,.22); overflow:hidden; }
        .hd { display:flex; align-items:center; gap:8px; padding:10px 12px; background:#0a66c2; color:#fff; }
        .hd b { font-size:13px; } .hd .c { margin-left:auto; font-size:12px; opacity:.9; }
        .body { padding:10px 12px; }
        .grid { display:grid; grid-template-columns:1fr 1fr; gap:6px; }
        button { font-size:12px; padding:7px 8px; border:1px solid #d0d5dd; border-radius:6px;
          background:#f3f6f8; cursor:pointer; } button:hover { background:#e9eef2; }
        button.primary { grid-column:1/3; background:#0a66c2; color:#fff; border-color:#0a66c2; font-weight:600; }
        button.ghost { background:#fff; }
        .preview { margin-top:8px; max-height:168px; overflow:auto; border-top:1px solid #eef1f3; padding-top:6px; }
        .row { font-size:12px; padding:4px 0; border-bottom:1px solid #f3f4f6; }
        .sub { color:#5e6b74; font-size:11px; } i { color:#b54708; }
        .note { font-size:10px; color:#8a939b; margin-top:8px; line-height:1.35; }
        .min { cursor:pointer; background:transparent; border:0; color:#fff; font-size:14px; padding:0 2px; }
        .collapsed .body { display:none; }
      </style>
      <div class="panel" id="panel">
        <div class="hd">
          <b>APL Capture</b><span class="c"><span id="count">0</span> saved</span>
          <button class="min" id="min" title="Minimize">▾</button>
        </div>
        <div class="body">
          <div class="grid">
            <button class="primary" id="cap">Capture visible</button>
            <button id="csv">Copy CSV</button>
            <button id="json">Copy JSON</button>
            <button id="dl" class="ghost">Download CSV</button>
            <button id="clr" class="ghost">Clear</button>
          </div>
          <div class="preview" id="preview"></div>
          <div class="note">Manual capture of the results on screen. Scroll to load more,
            click Capture again to add. Personal use — not a crawler.</div>
        </div>
      </div>`;
    document.documentElement.appendChild(host);

    countEl = sh.getElementById("count");
    previewEl = sh.getElementById("preview");
    const $ = (id) => sh.getElementById(id);

    $("cap").onclick = (e) => { const r = scan(); refresh(); flash(e.target, `+${r.added} (${r.onPage} on page)`); };
    $("csv").onclick = (e) => copy(toLexCsv(), e.target);
    $("json").onclick = (e) => copy(toJson(), e.target);
    $("dl").onclick = () => download(`apl_linkedin_${Date.now()}.csv`, toLexCsv(), "text/csv");
    $("clr").onclick = (e) => { store.clear(); refresh(); flash(e.target, "Cleared"); };
    $("min").onclick = () => $("panel").classList.toggle("collapsed");

    refresh();
  }

  // expose for debugging in console
  window.__aplScan = scan;
  window.__aplStore = store;

  buildPanel();
})();
