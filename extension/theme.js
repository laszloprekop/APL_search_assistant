// Shared visual theme for every APL extension panel (LinkedIn search, profile wizard, company,
// allabolag). Loaded right after parser.js on each matched page, so all panels read from ONE
// palette and can't drift apart. Mirrors the web app's tokens: charcoal brand #3A3A3A, gold
// accent #FED66E / #FACE4E, neutral-gray surfaces, IBM Plex Sans Condensed for text.
//
// Panels inject `globalThis.APL_THEME.base` into their shadow-root <style>, then append only
// their structure-specific rules (progress bars, result rows, …) which reference the same vars.
(function () {
  if (globalThis.APL_THEME) return;

  const vars = `
    --apl-bg:#ffffff; --apl-fg:#3a3a3a; --apl-muted:#707070; --apl-faint:#9d9d9d;
    --apl-border:#e0e0e0; --apl-surface-2:#f0f0f0; --apl-surface-3:#e7e4df;
    --apl-brand:#3a3a3a; --apl-brand-hover:#252525;
    --apl-accent:#fed66e; --apl-accent-strong:#face4e; --apl-accent-soft:#fcefc7;
    --apl-success:#16a34a; --apl-warning:#c2620a; --apl-danger:#dc2626;
    --apl-radius:14px; --apl-radius-btn:11px;
    --apl-font:"IBM Plex Sans Condensed",-apple-system,system-ui,"Segoe UI",Roboto,sans-serif;
  `;

  // Font import is scoped to the shadow root so it never touches the host page.
  const base = `
    @import url("https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Condensed:wght@400;500;600;700&display=swap");
    :host{${vars}}
    *{box-sizing:border-box;font-family:var(--apl-font);}
    .p,.panel{width:auto;background:var(--apl-bg);color:var(--apl-fg);border:1px solid var(--apl-border);
      border-radius:var(--apl-radius);box-shadow:0 10px 30px rgba(0,0,0,.18);overflow:hidden;}
    .h,.hd{display:flex;align-items:center;gap:8px;padding:10px 12px;background:var(--apl-brand);color:#fff;}
    .h b,.hd b{font-size:13px;font-weight:600;}
    .b{padding:10px 12px;}
    .min,.x{margin-left:auto;cursor:pointer;background:transparent;border:0;color:#fff;font-size:14px;padding:0 2px;width:auto;}
    button{font-size:12px;padding:7px 9px;border:1px solid var(--apl-border);border-radius:var(--apl-radius-btn);
      background:var(--apl-surface-2);color:var(--apl-fg);cursor:pointer;}
    button:hover{background:var(--apl-surface-3);}
    button[disabled]{opacity:.45;cursor:not-allowed;}
    button[disabled]:hover{background:var(--apl-surface-2);}
    button.cap,button.primary,button.send,button.enrich{background:var(--apl-accent);color:var(--apl-brand);
      border-color:var(--apl-accent-strong);font-weight:600;}
    button.cap:hover,button.primary:hover,button.send:hover,button.enrich:hover{background:var(--apl-accent-strong);}
    button.ghost{background:var(--apl-bg);}
    button.ghost:hover{background:var(--apl-surface-2);}
    .out{margin-top:8px;border-top:1px solid var(--apl-border);padding-top:6px;}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:6px;}
    .f{display:flex;gap:8px;font-size:12px;padding:3px 0;}
    .k{color:var(--apl-muted);flex:none;}
    .v{color:var(--apl-fg);word-break:break-word;} .v.miss{color:var(--apl-warning);}
    .hint,.hint2,.sub{color:var(--apl-faint);font-size:11px;line-height:1.35;}
    .note{font-size:10px;color:var(--apl-faint);margin-top:7px;line-height:1.35;}
    .status{margin-top:8px;font-size:11px;line-height:1.35;min-height:14px;color:var(--apl-muted);}
    .status[data-kind=ok]{color:var(--apl-success);}
    .status[data-kind=err]{color:var(--apl-danger);}
    .status[data-kind=warn]{color:var(--apl-warning);}
    .collapsed .b{display:none;}
  `;

  globalThis.APL_THEME = { vars, base };
})();
