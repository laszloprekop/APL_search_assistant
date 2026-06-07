// APL Search Assistant — LinkedIn COMPANY PAGE capture (UI + send).
//
// Runs on linkedin.com/company/*. Reads the company's About data (website + industry/size/HQ)
// via APLParser.parseCompanyPage and upserts it into the local app, matched by company name.
// Authoritative website source — complements the web-search "Find website".
//
// Assisted/manual: you're already viewing the page; you click Capture. No crawling.

(function () {
  if (window.__aplCompanyLoaded) return;
  window.__aplCompanyLoaded = true;

  const P = globalThis.APLParser;
  if (!P) { console.error("[APL] parser.js failed to load"); return; }

  const API_BASE = "http://localhost:5099";
  let row = null;

  function capture() {
    row = P.parseCompanyPage(document);
    render();
  }

  async function send(btn) {
    if (!row || !row.name) { status("Nothing captured — click Capture first.", "warn"); return; }
    flash(btn, "Sending…");
    try {
      const res = await fetch(API_BASE + "/api/companies/upsert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([row]),
      });
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
      const r = await res.json();
      status(`Sent → ${r.created} created, ${r.updated} updated.`, "ok");
      flash(btn, "Sent ✓");
    } catch (e) {
      status(`Send failed — is the app running on ${API_BASE}? (${e})`, "err");
      flash(btn, "Failed");
    }
  }

  // ---- UI ----
  let bodyEl, statusEl;
  const esc = (s) => (s || "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  function flash(btn, msg) { const o = btn.dataset.l || btn.textContent; btn.dataset.l = o; btn.textContent = msg; setTimeout(() => (btn.textContent = btn.dataset.l), 1400); }
  function status(msg, kind) { if (statusEl) { statusEl.textContent = msg; statusEl.dataset.kind = kind || ""; } }

  function field(label, value, warn) {
    return `<div class="f"><span class="k">${label}</span>`
      + (value ? `<span class="v">${esc(value)}</span>` : `<span class="v miss">${warn || "—"}</span>`) + `</div>`;
  }

  function render() {
    if (!row) { bodyEl.innerHTML = '<div class="hint">Open a company’s page, then click Capture.</div>'; return; }
    bodyEl.innerHTML =
      field("Company", row.name, "not found — are you on a company page?") +
      field("Website", row.website, "no website on page") +
      field("Industry", row.industry) +
      field("Size", row.companySize) +
      field("HQ", row.headquarters);
  }

  function buildPanel() {
    const host = document.createElement("div");
    host.id = "apl-company-host";
    host.style.cssText = "position:fixed;z-index:2147483647;bottom:16px;right:16px;";
    const sh = host.attachShadow({ mode: "open" });
    sh.innerHTML = `
      <style>
        ${globalThis.APL_THEME.base}
        .p { width:300px; }
        .k { width:64px; }
        .hint { padding:4px 0; }
      </style>
      <div class="p" id="p">
        <div class="h"><b>APL · Company</b><button class="min" id="min" title="Minimize">▾</button></div>
        <div class="b">
          <div class="grid">
            <button class="cap" id="cap">Capture company</button>
            <button id="send">Send to app</button>
          </div>
          <div class="out" id="body"></div>
          <div class="status" id="status"></div>
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

  window.__aplCaptureCompany = () => { capture(); return row; };

  // Stand down while the enrichment wizard is running — it owns the UI on company pages
  // (Docs/enrichment-wizard.md). Otherwise show the standalone company-capture panel.
  try {
    chrome.storage.local.get("apl_wizard", (d) => {
      if (d && d.apl_wizard && d.apl_wizard.active) return; // wizard drives this page
      buildPanel();
    });
  } catch {
    buildPanel();
  }
})();
