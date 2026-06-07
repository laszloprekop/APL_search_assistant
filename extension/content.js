// APL Search Assistant — LinkedIn people-search capture (UI + exporters + send).
//
// Parsing logic lives in parser.js (loaded first via the manifest) and is exposed as the
// global APLParser. This file handles the on-page panel, the capture store, persistence,
// CSV/JSON export, and sending to the local app.
//
// Philosophy: assisted, user-initiated capture (PRD §6.1). You browse LinkedIn yourself and
// click "Capture" to grab the results CURRENTLY rendered. No auto-scroll, no auto-pagination,
// no background fetching. Manual trigger only.
//
// Cross-page accumulation: LinkedIn paginates by navigating (the content script reloads), so
// the store is persisted to chrome.storage.local and re-hydrated on load. That lets you
// capture page 1, click Next, capture page 2, and have the lists APPEND (deduped by handle).

(function () {
  if (window.__aplCaptureLoaded) return;
  window.__aplCaptureLoaded = true;

  const P = globalThis.APLParser;
  if (!P) { console.error("[APL] parser.js failed to load"); return; }

  const API_BASE = "http://localhost:5099"; // the ASP.NET Core dev server
  const STORAGE_KEY = "apl_captures";

  // Output schema = Deliverable/lexicon_list.csv columns, so captures append into your ≥15 list.
  const LEX_COLS = [
    "foretag", "org_nr", "ort", "lan", "antal_anstallda", "ekonomi_note",
    "kontaktperson", "titel", "linkedin_url", "epost", "telefon",
    "kontaktkalla", "status",
  ];

  const store = new Map(); // handle -> record (deduped, persisted across pages)

  // -------------------------------------------------------------- persistence -
  function persist() {
    try { chrome.storage?.local?.set({ [STORAGE_KEY]: [...store.values()] }); } catch { /* ignore */ }
  }
  async function hydrate() {
    try {
      const data = await chrome.storage?.local?.get(STORAGE_KEY);
      const arr = data?.[STORAGE_KEY];
      if (Array.isArray(arr)) for (const r of arr) if (r?.handle) store.set(r.handle, r);
    } catch { /* ignore */ }
  }

  function scan() {
    const recs = P.scanDocument(document);
    let added = 0;
    for (const rec of recs) {
      if (rec && rec.handle && !store.has(rec.handle)) { store.set(rec.handle, rec); added++; }
    }
    if (added) persist();
    return { added, parsed: recs.length };
  }

  // ------------------------------------------------------------- exporters ----
  const csvCell = (v) => {
    const s = (v == null ? "" : String(v));
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };

  function lexRows() {
    return [...store.values()].map((r) => ({
      foretag: r.company, org_nr: "", ort: r.location, lan: r.lan,
      antal_anstallda: "", ekonomi_note: "", kontaktperson: r.name,
      titel: r.title, linkedin_url: r.linkedin_url, epost: "", telefon: "",
      kontaktkalla: "linkedin", status: "not_contacted",
    }));
  }

  function toLexCsv(withHeader = true) {
    const body = lexRows().map((r) => LEX_COLS.map((c) => csvCell(r[c])).join(","));
    return (withHeader ? [LEX_COLS.join(","), ...body] : body).join("\n");
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

  // -------------------------------------- start the website-enrichment wizard -
  // Hands the captured rows to wizard.js (Docs/enrichment-wizard.md) and navigates to the
  // first person's profile. From there the wizard drives profile → company About, one click
  // per page, enriching each row with the authoritative LinkedIn website + canonical company URL.
  async function startWizard(btn) {
    if (store.size === 0) { status("Capture some people first.", "warn"); return; }
    // Only rows with a profile URL are walkable; queue[0] must be the first navigation target.
    const queue = [...store.values()].filter((r) => r.linkedin_url);
    if (queue.length === 0) { status("No profile URLs to walk — recapture the list.", "warn"); return; }
    if (!confirm(`Walk ${queue.length} captured ${queue.length === 1 ? "person" : "people"} to fetch company websites from LinkedIn?\n\nYou'll click once per page; the extension only reads the page you open.`)) return;
    const wstate = { active: true, queue, i: 0, stage: "profile", resolved: {}, done: false };
    try {
      await chrome.storage.local.set({ apl_wizard: wstate });
      flash(btn, "Starting…");
      location.href = queue[0].linkedin_url;
    } catch (e) {
      status(`Couldn't start the wizard (${e}).`, "err");
    }
  }

  // -------------------------------------------------- send to the local app ---
  async function sendToApp(btn) {
    const rows = [...store.values()];
    if (rows.length === 0) { status("Nothing captured yet.", "warn"); return; }
    flash(btn, "Sending…");
    try {
      const res = await fetch(API_BASE + "/api/companies/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rows),
      });
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
      const r = await res.json();
      status(`Sent → ${r.companiesCreated} companies, ${r.personsAdded} persons (${r.duplicatesSkipped} dupes skipped).`, "ok");
      flash(btn, "Sent ✓");
    } catch (e) {
      status(`Send failed — is the app running on ${API_BASE}? (${e})`, "err");
      flash(btn, "Failed");
    }
  }

  // -------------------------------------------------------------------- UI ----
  let countEl, previewEl, statusEl;
  let gated = []; // buttons that require at least one capture (steps 2 & 3)

  function flash(btn, msg) {
    const old = btn.dataset.label || btn.textContent;
    btn.dataset.label = old;
    btn.textContent = msg;
    setTimeout(() => { btn.textContent = btn.dataset.label; }, 1400);
  }

  function status(msg, kind) {
    if (!statusEl) return;
    statusEl.textContent = msg;
    statusEl.dataset.kind = kind || "";
  }

  const esc = (s) => (s || "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

  function refresh() {
    countEl.textContent = store.size;
    // Gate steps 2 (enrich) & 3 (output): nothing to enrich/send until the list has rows.
    const hasRows = store.size > 0;
    for (const b of gated) if (b) b.disabled = !hasRows;
    const rows = [...store.values()].slice(-8).reverse();
    previewEl.innerHTML = rows.map((r) =>
      `<div class="row"><b>${esc(r.name) || "—"}</b> · ${esc(r.company) || "<i>?company</i>"}`
      + `<div class="sub">${esc(r.title) || ""}${r.location ? " · " + esc(r.location) : ""}</div></div>`
    ).join("") || '<div class="row sub">No captures yet — click “Capture people on this page”.</div>';
  }

  function buildPanel() {
    const host = document.createElement("div");
    host.id = "apl-capture-host";
    host.style.cssText = "position:fixed;z-index:2147483647;bottom:16px;right:16px;";
    const sh = host.attachShadow({ mode: "open" });
    sh.innerHTML = `
      <style>
        ${globalThis.APL_THEME.base}
        .panel { width:320px; }
        .body { padding:10px 12px; }
        .collapsed .body { display:none; }
        .hd .c { margin-left:auto; font-size:12px; opacity:.9; }
        .min:hover { background:transparent; }
        .step { padding:8px 0; border-top:1px solid var(--apl-border); }
        .step:first-child { border-top:0; padding-top:2px; }
        .lbl { display:flex; align-items:center; gap:7px; font-size:12px; font-weight:700; color:var(--apl-fg); margin-bottom:6px; }
        .lbl .n { display:inline-grid; place-items:center; width:17px; height:17px; border-radius:50%;
          background:var(--apl-brand); color:#fff; font-size:10px; font-weight:700; flex:none; }
        button { width:100%; }
        .send { margin-bottom:6px; }
        .hint2 { margin-top:5px; }
        .preview { margin-top:6px; max-height:140px; overflow:auto; border-top:1px solid var(--apl-border); padding-top:6px; }
        .row { font-size:12px; padding:4px 0; border-bottom:1px solid var(--apl-border); }
        i { color:var(--apl-warning); }
      </style>
      <div class="panel" id="panel">
        <div class="hd">
          <b>APL Capture</b><span class="c"><span id="count">0</span> saved</span>
          <button class="min" id="min" title="Minimize">▾</button>
        </div>
        <div class="body">
          <div class="step">
            <div class="lbl"><span class="n">1</span> Build the list</div>
            <button class="primary" id="cap">Capture people on this page</button>
            <div class="hint2">Browse a people-search; each capture appends the visible results
              (deduped). Page through LinkedIn and capture each page.</div>
          </div>
          <div class="step">
            <div class="lbl"><span class="n">2</span> Add company website URLs</div>
            <button class="enrich" id="enrich">Walk the list → fetch websites</button>
            <div class="hint2">Guided, one click per page: each person’s profile → company
              About → grabs the website onto their row.</div>
          </div>
          <div class="step">
            <div class="lbl"><span class="n">3</span> Output</div>
            <button class="send" id="send">Send to APL Assistant</button>
            <div class="grid">
              <button id="csv">Copy CSV</button>
              <button id="rows">Copy rows</button>
              <button id="json" class="ghost">Copy JSON</button>
              <button id="dl" class="ghost">Download CSV</button>
            </div>
          </div>
          <div class="status" id="status"></div>
          <div class="preview" id="preview"></div>
          <button id="clr" class="ghost" style="margin-top:6px;">Clear all</button>
        </div>
      </div>`;
    document.documentElement.appendChild(host);

    countEl = sh.getElementById("count");
    previewEl = sh.getElementById("preview");
    statusEl = sh.getElementById("status");
    const $ = (id) => sh.getElementById(id);

    $("cap").onclick = (e) => { const r = scan(); refresh(); flash(e.target, `+${r.added} (${r.parsed} parsed)`); };
    $("enrich").onclick = (e) => startWizard(e.target);
    $("send").onclick = (e) => sendToApp(e.target);
    $("csv").onclick = (e) => copy(toLexCsv(true), e.target);
    $("rows").onclick = (e) => copy(toLexCsv(false), e.target);
    $("json").onclick = (e) => copy(toJson(), e.target);
    $("dl").onclick = () => download(`apl_linkedin_${Date.now()}.csv`, toLexCsv(true), "text/csv");
    $("clr").onclick = (e) => { store.clear(); persist(); refresh(); status(""); flash(e.target, "Cleared"); };
    $("min").onclick = () => $("panel").classList.toggle("collapsed");

    // Steps 2 & 3 stay disabled until step 1 has produced rows (no enrich/send before capture).
    gated = ["enrich", "send", "csv", "rows", "json", "dl", "clr"].map($);

    refresh();
  }

  window.__aplScan = scan;
  window.__aplStore = store;

  buildPanel();
  // Re-hydrate persisted captures from previous pages, then reflect the running total.
  hydrate().then(refresh);
})();
