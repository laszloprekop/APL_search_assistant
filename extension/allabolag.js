// APL Search Assistant — allabolag.se company capture (UI + send).
//
// Runs on allabolag.se. Reads a company detail page (org.nr, switchboard phone, kommun,
// revenue/result/bolagsform) via APLParser.parseAllabolag and applies it to a chosen app
// company. Cloudflare blocks server-side fetches, but reading the page the USER opened is the
// same assisted, manual posture as the LinkedIn capture — low-volume, user-initiated.

(function () {
  if (window.__aplAllabolagLoaded) return;
  window.__aplAllabolagLoaded = true;

  const P = globalThis.APLParser;
  if (!P) { console.error("[APL] parser.js failed to load (allabolag)"); return; }

  const API_BASE = "http://localhost:5099";
  let row = null;        // parsed allabolag data
  let companies = [];    // app companies for the target dropdown
  let targetId = "";     // chosen company id
  let pinnedId = null;   // app company id pinned via the #aplc=<id> link from the app

  // The app opens allabolag with #aplc=<companyId>; stash it so it survives the navigation
  // from the search page to the company detail page, and overrides fuzzy name-matching.
  const TARGET_KEY = "apl_allabolag_target";
  const TARGET_TTL = 30 * 60 * 1000; // 30 min — don't pin a stale target on a later visit
  const getTarget = () => new Promise((res) => chrome.storage.local.get(TARGET_KEY, (d) => res(d[TARGET_KEY] || null)));
  const setTarget = (t) => new Promise((res) => chrome.storage.local.set({ [TARGET_KEY]: t }, () => res()));
  const clearTarget = () => new Promise((res) => chrome.storage.local.remove(TARGET_KEY, () => res()));
  function hashTargetId() { const m = (location.hash || "").match(/aplc=([0-9a-fA-F-]{8,})/); return m ? m[1] : null; }

  const norm = (s) => (s || "").toLowerCase()
    .replace(/\(publ\)/g, "")
    .replace(/\b(aktiebolag|ab|hb|kb)\b/g, "")
    .replace(/[^a-z0-9åäö]+/g, " ").trim();

  function bestMatch(name) {
    const n = norm(name);
    let best = null, score = -1;
    for (const c of companies) {
      const cn = norm(c.name);
      let s = 0;
      if (cn && cn === n) s = 100;
      else if (n && cn && (n.startsWith(cn) || cn.startsWith(n))) s = 70;
      else if (n && cn && (n.includes(cn) || cn.includes(n))) s = 50;
      if (s > score) { score = s; best = c; }
    }
    return score >= 50 ? best : null;
  }

  async function capture() {
    row = P.parseAllabolag(document);
    if (!row || !row._isCompanyPage) { render(); status("Open a company's detail page (…/foretag/…), then Capture.", "warn"); return; }
    try {
      const res = await fetch(API_BASE + "/api/companies", { headers: { "Accept": "application/json" } });
      companies = res.ok ? await res.json() : [];
    } catch { companies = []; }
    // Pinned target (from the app's #aplc link) wins over fuzzy name-matching.
    const pinned = pinnedId ? companies.find((c) => c.id === pinnedId) : null;
    const m = pinned ? null : bestMatch(row.name);
    targetId = pinned ? pinned.id : (m ? m.id : (companies[0] ? companies[0].id : ""));
    render();
    if (!companies.length) status(`Captured ${row.name}. No app companies found — is the app running on ${API_BASE}?`, "warn");
    else if (pinned) status(`Captured ${row.name}. Linked to “${pinned.name}” (from the app).`, "ok");
    else status(`Captured ${row.name}. ${m ? "Matched “" + m.name + "”." : "No close match — pick the target."}`, m ? "ok" : "warn");
  }

  async function send(btn) {
    if (!row || !row._isCompanyPage) { status("Capture a company page first.", "warn"); return; }
    if (!targetId) { status("Pick which app company to update.", "warn"); return; }
    flash(btn, "Sending…");
    try {
      const res = await fetch(`${API_BASE}/api/companies/${targetId}/allabolag`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orgNumber: row.orgNumber, phone: row.phone, kommun: row.kommun, lan: null,
          revenueBand: row.revenueBand, employeeCount: row.employeeCount, financialNote: row.financialNote,
        }),
      });
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
      const r = await res.json();
      status(r.message || "Applied.", "ok");
      flash(btn, "Sent ✓");
      await clearTarget(); pinnedId = null; // consume the pin so a later visit isn't mis-linked
    } catch (e) {
      status(`Send failed — is the app running on ${API_BASE}? (${e})`, "err");
      flash(btn, "Failed");
    }
  }

  // ---- UI ----
  let bodyEl, statusEl, selEl;
  const esc = (s) => (s || "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  function flash(btn, msg) { const o = btn.dataset.l || btn.textContent; btn.dataset.l = o; btn.textContent = msg; setTimeout(() => (btn.textContent = btn.dataset.l), 1400); }
  function status(msg, kind) { if (statusEl) { statusEl.textContent = msg || ""; statusEl.dataset.kind = kind || ""; } }

  function field(label, value, warn) {
    return `<div class="f"><span class="k">${label}</span>`
      + (value ? `<span class="v">${esc(value)}</span>` : `<span class="v miss">${warn || "—"}</span>`) + `</div>`;
  }

  function render() {
    if (!row || !row._isCompanyPage) {
      bodyEl.innerHTML = '<div class="hint">Open a company on allabolag (…/foretag/…), then click Capture.</div>';
      return;
    }
    const opts = companies.map((c) =>
      `<option value="${c.id}"${c.id === targetId ? " selected" : ""}>${esc(c.name)}</option>`).join("");
    bodyEl.innerHTML =
      field("Företag", row.name) +
      field("Org.nr", row.orgNumber, "not found") +
      field("Telefon", row.phone, "none listed") +
      field("Kommun", row.kommun) +
      field("Omsättning", row.revenueBand) +
      field("Note", row.financialNote) +
      `<div class="sendto"><span class="k">Send to</span>
         <select id="target">${opts || '<option value="">— no app companies —</option>'}</select></div>`
      + (pinnedId && targetId === pinnedId ? `<div class="pin">↳ pinned by the app — overrides name matching</div>` : "");
    selEl = bodyEl.querySelector("#target");
    if (selEl) selEl.onchange = (e) => { targetId = e.target.value; }; // manual override still allowed
  }

  function buildPanel() {
    const host = document.createElement("div");
    host.id = "apl-allabolag-host";
    host.style.cssText = "position:fixed;z-index:2147483647;bottom:16px;right:16px;";
    const sh = host.attachShadow({ mode: "open" });
    sh.innerHTML = `
      <style>
        * { box-sizing:border-box; font-family:-apple-system,system-ui,sans-serif; }
        .p { width:320px; background:#fff; color:#1d2226; border:1px solid #d0d5dd; border-radius:10px;
          box-shadow:0 8px 28px rgba(0,0,0,.22); overflow:hidden; }
        .h { display:flex; align-items:center; gap:8px; padding:10px 12px; background:#0f766e; color:#fff; }
        .h b { font-size:13px; } .min { margin-left:auto; cursor:pointer; background:transparent; border:0; color:#fff; font-size:14px; }
        .b { padding:10px 12px; }
        .grid { display:grid; grid-template-columns:1fr 1fr; gap:6px; }
        button { font-size:12px; padding:7px 8px; border:1px solid #d0d5dd; border-radius:6px; background:#f3f6f8; cursor:pointer; }
        button:hover { background:#e9eef2; }
        button.cap { background:#0f766e; color:#fff; border-color:#0f766e; font-weight:600; }
        button.send { background:#057642; color:#fff; border-color:#057642; font-weight:600; }
        .out { margin-top:8px; border-top:1px solid #eef1f3; padding-top:6px; }
        .f { display:flex; gap:8px; font-size:12px; padding:3px 0; } .k { color:#5e6b74; width:74px; flex:none; }
        .v { color:#1d2226; word-break:break-word; } .v.miss { color:#b54708; }
        .sendto { display:flex; gap:8px; align-items:center; margin-top:6px; padding-top:6px; border-top:1px solid #eef1f3; }
        .sendto select { flex:1; font-size:12px; padding:5px; border:1px solid #d0d5dd; border-radius:6px; }
        .pin { font-size:10px; color:#0f766e; margin-top:4px; }
        .hint { font-size:12px; color:#8a939b; padding:4px 0; }
        .status { margin-top:8px; font-size:11px; min-height:14px; color:#5e6b74; line-height:1.35; }
        .status[data-kind=ok]{color:#057642;} .status[data-kind=err]{color:#b42318;} .status[data-kind=warn]{color:#b54708;}
        .note { font-size:10px; color:#9aa3ab; margin-top:7px; line-height:1.35; }
        .collapsed .b { display:none; }
      </style>
      <div class="p" id="p">
        <div class="h"><b>APL · allabolag</b><button class="min" id="min" title="Minimize">▾</button></div>
        <div class="b">
          <div class="grid">
            <button class="cap" id="cap">Capture company</button>
            <button class="send" id="send">Send to app</button>
          </div>
          <div class="out" id="body"></div>
          <div class="status" id="status"></div>
          <div class="note">Reads only the page you opened — no background fetching. Keep it low-volume.</div>
        </div>
      </div>`;
    document.documentElement.appendChild(host);
    bodyEl = sh.getElementById("body");
    statusEl = sh.getElementById("status");
    sh.getElementById("cap").onclick = () => capture();
    sh.getElementById("send").onclick = (e) => send(e.target);
    sh.getElementById("min").onclick = () => sh.getElementById("p").classList.toggle("collapsed");
    render();
  }

  window.__aplCaptureAllabolag = () => { capture(); return row; };

  (async function init() {
    // On the page the app opened, #aplc=<id> is present → stash it (survives the nav to the
    // company detail page). On any allabolag page, honour a recently-stashed pin.
    const hashId = hashTargetId();
    if (hashId) await setTarget({ id: hashId, ts: Date.now() });
    const t = await getTarget();
    if (t && t.id && Date.now() - (t.ts || 0) < TARGET_TTL) pinnedId = t.id;
    buildPanel();
  })();
})();
