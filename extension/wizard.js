// APL Search Assistant — guided website-enrichment wizard (coordinator).
//
// Spec: Docs/enrichment-wizard.md. Loaded on linkedin.com/in/* and /company/* (after
// parser.js). content.js starts it from the search panel by writing the wizard state and
// navigating to the first profile.
//
// Mechanism (ToS-clean): ONE click = ONE navigation of the current tab. No background
// fetch, no auto-advance chains, no new tabs. The panel re-injects at fixed coordinates on
// every page load, so the primary button reappears under the cursor; on arrival the content
// script waits for the JS to render, reads the page, and shows the next single action.
//
// Per-person flow:  /in/<handle>  →  parseProfileExperience → /company/<ID>/  →
//                   /company/<ID>/about/ → extractWebsite.  Companies dedupe by ID on the fly.

(function () {
  if (window.__aplWizardLoaded) return;
  window.__aplWizardLoaded = true;

  const P = globalThis.APLParser;
  if (!P) { console.error("[APL] parser.js failed to load (wizard)"); return; }

  const KEY = "apl_wizard";
  const getState = () => new Promise((res) => chrome.storage.local.get(KEY, (d) => res(d[KEY] || null)));
  const setState = (s) => new Promise((res) => chrome.storage.local.set({ [KEY]: s }, () => res()));
  const clearState = () => new Promise((res) => chrome.storage.local.remove(KEY, () => res()));

  const API_BASE = "http://localhost:5099";
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const onProfile = () => /\/in\//.test(location.pathname);
  const onCompany = () => /\/company\//.test(location.pathname);
  const aboutUrl = (id) => `https://www.linkedin.com/company/${id}/about/`;

  function expHeading() {
    for (const h of document.querySelectorAll("h2, h3"))
      if (/^(experience|erfarenhet)$/i.test((h.textContent || "").trim())) return h;
    return null;
  }

  // Poll until `pred()` is truthy or we time out. LinkedIn renders content via JS after load.
  async function waitFor(pred, timeoutMs = 9000, every = 350) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) { try { if (pred()) return true; } catch { /* keep polling */ } await sleep(every); }
    return false;
  }

  // -------------------------------------------------------------- state moves -
  function advance(s) { s.i += 1; s.stage = "profile"; if (s.i >= s.queue.length) s.done = true; }

  async function processProfile(s, item) {
    busy("Reading profile…");
    await waitFor(() => P.parseProfileExperience(document) !== null || expHeading() !== null);
    const r = P.parseProfileExperience(document);
    if (r && r.companyId) {
      item.company = r.name || item.company;
      item.company_id = r.companyId;
      item.company_linkedin_url = r.linkedinUrl;
      const seen = s.resolved[r.companyId];
      if (seen) { // company already resolved this session — skip the company hop
        item.website = seen.website;
        item.website_source = seen.website_source;
        advance(s);
      } else {
        s.stage = "company";
      }
      await setState(s); renderNext(s); return;
    }
    if (expHeading()) { // page loaded, but no company in Experience (freelancer / no LI page)
      item.website_source = "none"; item.skipped = "no_company";
      advance(s); await setState(s); renderNext(s); return;
    }
    renderError(s, "Couldn't read this profile (it may be private or slow).");
  }

  async function processCompany(s, item) {
    busy("Reading company…");
    await waitFor(() => P.extractWebsite(document) || document.querySelector("h1, dl"));
    const page = P.parseCompanyPage(document) || {};
    const website = page.website || null;
    item.website = website;
    item.website_source = website ? "linkedin" : "none";
    if (!item.company || item.company === "(okänt företag)") item.company = page.name || item.company;
    s.resolved[item.company_id] = { name: item.company, website, website_source: item.website_source };
    advance(s);
    await setState(s); renderNext(s);
  }

  async function processPage(s) {
    const item = s.queue[s.i];
    if (s.done || !item) { renderNext(s); return; }
    if (s.stage === "profile") {
      if (!onProfile()) { renderResume(s, "profile", item.linkedin_url, `${item.name}'s profile`); return; }
      await processProfile(s, item);
    } else {
      if (!onCompany()) { renderResume(s, "company", aboutUrl(item.company_id), `${item.company} page`); return; }
      await processCompany(s, item);
    }
  }

  // ------------------------------------------------------------ user actions -
  async function skipCurrent() {
    const s = await getState(); if (!s?.active) return;
    const item = s.queue[s.i];
    if (item) { item.website_source = item.website_source || "none"; item.skipped = item.skipped || "manual"; }
    advance(s); await setState(s); renderNext(s);
  }

  async function cancel() {
    await clearState();
    if (host) host.remove();
  }

  function go(url) { location.href = url; } // one click = one navigation

  async function send(btn) {
    const s = await getState(); if (!s) return;
    flash(btn, "Sending…");
    try {
      const res = await fetch(API_BASE + "/api/companies/import", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(s.queue),
      });
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
      const r = await res.json();
      status(`Sent → ${r.companiesCreated} companies, ${r.personsAdded} persons (${r.duplicatesSkipped} dupes).`, "ok");
      flash(btn, "Sent ✓");
      await clearState();
    } catch (e) {
      status(`Send failed — is the app running on ${API_BASE}? (${e})`, "err");
      flash(btn, "Failed");
    }
  }

  // -------------------------------------------------------------------- UI ---
  let host, sh, barEl, stepEl, actEl, statusEl;
  const esc = (s) => (s || "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  function flash(btn, msg) { const o = btn.dataset.l || btn.textContent; btn.dataset.l = o; btn.textContent = msg; setTimeout(() => (btn.textContent = btn.dataset.l), 1400); }
  function status(msg, kind) { if (statusEl) { statusEl.textContent = msg || ""; statusEl.dataset.kind = kind || ""; } }

  function setBar(done, total) {
    const pct = total ? Math.round((done / total) * 100) : 0;
    barEl.querySelector(".fill").style.width = pct + "%";
    barEl.querySelector(".lbl").textContent = `${done}/${total}`;
  }

  function busy(msg) {
    if (!actEl) return;
    stepEl.textContent = msg;
    actEl.innerHTML = `<button class="primary" disabled>…</button>`;
  }

  function renderError(s, msg) {
    stepEl.textContent = msg;
    actEl.innerHTML = `<button class="primary" id="retry">Retry</button><button class="ghost" id="skip">Skip</button>`;
    sh.getElementById("retry").onclick = () => processPage(s);
    sh.getElementById("skip").onclick = () => skipCurrent();
  }

  function renderResume(s, stage, url, label) {
    stepEl.textContent = `You navigated away. Resume to continue.`;
    actEl.innerHTML = `<button class="primary" id="resume">Resume → open ${esc(label)}</button><button class="ghost" id="skip">Skip</button>`;
    sh.getElementById("resume").onclick = () => go(url);
    sh.getElementById("skip").onclick = () => skipCurrent();
  }

  function renderDone(s) {
    const found = s.queue.filter((q) => q.website).length;
    const missing = s.queue.length - found;
    setBar(s.queue.length, s.queue.length);
    stepEl.textContent = `Done — ${found} website${found === 1 ? "" : "s"} found, ${missing} for the app’s Find website.`;
    actEl.innerHTML = `<button class="send" id="send">Send enriched list to app</button><button class="ghost" id="discard">Discard</button>`;
    sh.getElementById("send").onclick = (e) => send(e.target);
    sh.getElementById("discard").onclick = () => cancel();
  }

  function renderNext(s) {
    setBar(s.i, s.queue.length);
    if (s.done) { renderDone(s); return; }
    const item = s.queue[s.i];
    if (s.stage === "company") {
      stepEl.textContent = `${item.name} → ${item.company || "company"}`;
      actEl.innerHTML = `<button class="primary" id="go">Open ${esc(item.company || "company")} ↗</button><button class="ghost" id="skip">Skip</button>`;
      sh.getElementById("go").onclick = () => go(aboutUrl(item.company_id));
    } else {
      stepEl.textContent = `Next: ${item.name || "person"} (${s.i + 1}/${s.queue.length})`;
      actEl.innerHTML = `<button class="primary" id="go">Open ${esc(item.name || "profile")} → profile</button><button class="ghost" id="skip">Skip</button>`;
      sh.getElementById("go").onclick = () => go(item.linkedin_url);
    }
    sh.getElementById("skip").onclick = () => skipCurrent();
  }

  function buildPanel() {
    host = document.createElement("div");
    host.id = "apl-wizard-host";
    host.style.cssText = "position:fixed;z-index:2147483647;bottom:16px;right:16px;";
    sh = host.attachShadow({ mode: "open" });
    sh.innerHTML = `
      <style>
        * { box-sizing:border-box; font-family:-apple-system,system-ui,sans-serif; }
        .p { width:300px; background:#fff; color:#1d2226; border:1px solid #d0d5dd; border-radius:10px;
          box-shadow:0 8px 28px rgba(0,0,0,.22); overflow:hidden; }
        .h { display:flex; align-items:center; gap:8px; padding:9px 12px; background:#4f46e5; color:#fff; }
        .h b { font-size:13px; } .h .x { margin-left:auto; cursor:pointer; background:transparent; border:0; color:#fff; font-size:14px; }
        .b { padding:10px 12px; }
        .bar { position:relative; height:8px; border-radius:5px; background:#eef0f4; overflow:hidden; margin-bottom:8px; }
        .bar .fill { position:absolute; inset:0 auto 0 0; width:0; background:#4f46e5; transition:width .25s; }
        .bar .lbl { position:absolute; right:6px; top:-1px; font-size:9px; color:#5e6b74; }
        .step { font-size:12px; color:#1d2226; min-height:16px; margin-bottom:8px; }
        .act { display:flex; gap:6px; }
        button { font-size:12px; padding:8px 9px; border:1px solid #d0d5dd; border-radius:6px; background:#f3f6f8; cursor:pointer; }
        button:hover { background:#e9eef2; } button[disabled] { opacity:.6; cursor:default; }
        button.primary { flex:1; background:#4f46e5; color:#fff; border-color:#4f46e5; font-weight:600; }
        button.send { flex:1; background:#057642; color:#fff; border-color:#057642; font-weight:600; }
        button.ghost { background:#fff; }
        .status { margin-top:8px; font-size:11px; line-height:1.35; min-height:14px; color:#5e6b74; }
        .status[data-kind=ok]{color:#057642;} .status[data-kind=err]{color:#b42318;} .status[data-kind=warn]{color:#b54708;}
        .note { font-size:10px; color:#9aa3ab; margin-top:7px; line-height:1.35; }
      </style>
      <div class="p">
        <div class="h"><b>APL · Enrich websites</b><button class="x" id="x" title="Cancel">✕</button></div>
        <div class="b">
          <div class="bar"><div class="fill"></div><div class="lbl">0/0</div></div>
          <div class="step" id="step">Loading…</div>
          <div class="act" id="act"></div>
          <div class="status" id="status"></div>
          <div class="note">One click = one page. Reads only the page you opened — no background fetching. Keep it low-volume.</div>
        </div>
      </div>`;
    document.documentElement.appendChild(host);
    barEl = sh.querySelector(".bar");
    stepEl = sh.getElementById("step");
    actEl = sh.getElementById("act");
    statusEl = sh.getElementById("status");
    sh.getElementById("x").onclick = () => cancel();
  }

  // --------------------------------------------------------------- bootstrap -
  (async function init() {
    const s = await getState();
    if (!s || !s.active) return; // wizard not running -> stay invisible
    buildPanel();
    await processPage(s);
  })();
})();
