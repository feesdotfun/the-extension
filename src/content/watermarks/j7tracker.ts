import type { SiteWatermarkConfig } from "./index";

export const j7tracker: SiteWatermarkConfig = {
  hostname: /j7tracker\.(io|com)$/i,
  watermarks: [
    // Deploy overlay — "powered by fees.fun" under deploy button
    {
      selector: ".token-deploy-overlay",
      mode: "custom",
      html: "",
      retryMs: 500,
      maxRetries: 99999999, // never stop — modal is created/destroyed dynamically
      customApply(overlay: Element) {
        if (overlay.querySelector("[data-feesfun-powered]")) return false; // return false to keep retrying (modal gets destroyed)
        const bar = document.createElement("div");
        bar.setAttribute("data-feesfun-powered", "1");
        bar.style.cssText =
          "display:flex;align-items:center;justify-content:center;gap:6px;" +
          "font-size:11px;color:rgba(255,255,255,0.35);" +
          "letter-spacing:0.2px;";
        bar.innerHTML =
          `powered by <span style="color:#707df1;font-weight:600;">fees.fun</span>` +
          `<span style="opacity:0.3;margin:0 2px;">|</span>` +
          `saved <span data-feesfun-savings style="font-weight:600;color:#22c55e;">...</span> SOL`;
        overlay.appendChild(bar);
        // Copy current savings value from any existing element on the page
        const existing = document.querySelector("[data-feesfun-savings]");
        const savingsEl = bar.querySelector("[data-feesfun-savings]");
        if (existing && savingsEl && existing !== savingsEl && existing.textContent !== "...") {
          savingsEl.textContent = existing.textContent;
        }
        return false; // keep retrying so it re-adds when modal reopens
      },
    },
    // Header navbar badge with savings
    {
      selector: ".header .connection-info",
      mode: "custom",
      html: "",
      retryMs: 500,
      maxRetries: 60,
      customApply(connInfo: Element) {
        if (connInfo.querySelector("[data-feesfun-header]")) return true;
        const spacer = connInfo.querySelector(".left-spacer");
        if (!spacer) return false;
        const wrap = document.createElement("div");
        wrap.setAttribute("data-feesfun-header", "1");
        wrap.style.cssText =
          "display:flex;align-items:center;gap:6px;padding:4px 10px;" +
          "background:rgba(112,125,241,0.08);border:1px solid rgba(112,125,241,0.2);" +
          "border-radius:6px;font-size:12px;font-weight:500;color:#fff;" +
          "white-space:nowrap;";
        wrap.innerHTML =
          `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#707df1" stroke-width="2.5"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>` +
          `<span style="color:#707df1;font-weight:700;">fees.fun</span>` +
          `<span style="opacity:0.4;">|</span>` +
          `<span>saved <span data-feesfun-savings style="font-weight:700;color:#22c55e;">...</span> SOL</span>`;
        spacer.replaceWith(wrap);
        return true;
      },
    },
  ],
};
