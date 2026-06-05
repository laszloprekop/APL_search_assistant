// APL Search Assistant — LinkedIn people-search capture (UI + exporters).
//
// Parsing logic lives in parser.js (loaded first via the manifest) and is exposed as the
// global APLParser. This file only handles the on-page panel, the capture store, and export.
//
// Philosophy: assisted, user-initiated capture (PRD §6.1). You browse LinkedIn yourself and
// click "Capture" to grab the results CURRENTLY rendered. No auto-scroll, no auto-pagination,
// no background fetching. Manual trigger only.

(function () {
  if (window.__aplCaptureLoaded) return;
  window.__aplCaptureLoaded = true;

  const P = globalThis.APLParser;
  if (!P) { console.error("[APL] parser.js failed to load"); return; }

  // Output schema = Deliverable/lexicon_list.csv columns, so captures append into your ≥15 list.
  const LEX_COLS = [
    "foretag", "org_nr", "ort", "lan", "antal_anstallda", "ekonomi_note",
    "kontaktperson", "titel", "linkedin_url", "epost", "telefon",
    "kontaktkalla", "status",
  ];

  const store = new Map(); // handle -> record (dedupe across scrolls/pages)

  function scan() {
    const recs = P.scanDocument(document);
    let added = 0;
    for (const rec of recs) {
      if (rec && rec.handle && !store.has(rec.handle)) { store.set(rec.handle, rec); added++; }
    }
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

  // -------------------------------------------------------------------- UI ----
  let countEl, previewEl;

  function flash(btn, msg) {
    const old = btn.textContent; btn.textContent = msg;
    setTimeout(() => (btn.textContent = old), 1300);
  }

  const esc = (s) => (s || "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

  function refresh() {
    countEl.textContent = store.size;
    const rows = [...store.values()].slice(-8).reverse();
    previewEl.innerHTML = rows.map((r) =>
      `<div class="row"><b>${esc(r.name) || "—"}</b> · ${esc(r.company) || "<i>?company</i>"}`
      + `<div class="sub">${esc(r.title) || ""}${r.location ? " · " + esc(r.location) : ""}</div></div>`
    ).join("") || '<div class="row sub">No captures yet. Click “Capture visible”.</div>';
  }

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
            <button id="rows">Copy rows</button>
            <button id="json" class="ghost">Copy JSON</button>
            <button id="dl" class="ghost">Download CSV</button>
            <button id="clr" class="ghost">Clear</button>
          </div>
          <div class="preview" id="preview"></div>
          <div class="note">Manual capture of the results on screen. Scroll to load more,
            click Capture again to add. “Copy rows” omits the header for appending.</div>
        </div>
      </div>`;
    document.documentElement.appendChild(host);

    countEl = sh.getElementById("count");
    previewEl = sh.getElementById("preview");
    const $ = (id) => sh.getElementById(id);

    $("cap").onclick = (e) => { const r = scan(); refresh(); flash(e.target, `+${r.added} (${r.parsed} parsed)`); };
    $("csv").onclick = (e) => copy(toLexCsv(true), e.target);
    $("rows").onclick = (e) => copy(toLexCsv(false), e.target);
    $("json").onclick = (e) => copy(toJson(), e.target);
    $("dl").onclick = () => download(`apl_linkedin_${Date.now()}.csv`, toLexCsv(true), "text/csv");
    $("clr").onclick = (e) => { store.clear(); refresh(); flash(e.target, "Cleared"); };
    $("min").onclick = () => $("panel").classList.toggle("collapsed");

    refresh();
  }

  window.__aplScan = scan;
  window.__aplStore = store;

  buildPanel();
})();
