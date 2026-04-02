import type { SiteWatermarkConfig } from "./index";

export const uxento: SiteWatermarkConfig = {
  hostname: /(app\.)?uxento\.io$/i,
  watermarks: [
    {
      selector: 'img[alt="uxento logo"]',
      mode: "custom",
      html: "",
      retryMs: 500,
      maxRetries: 60,
      customApply(logoImg: Element) {
        // img → a → div.relative → div.relative.shrink-0 → div.flex.items-center.gap-3
        const flexRow = logoImg.parentElement?.parentElement?.parentElement?.parentElement;
        if (!flexRow || flexRow.querySelector("[data-feesfun-badge]")) return true;
        const nav = flexRow.querySelector("nav");
        if (!nav) return false;
        const badge = document.createElement("a");
        badge.setAttribute("data-feesfun-badge", "1");
        badge.href = "https://www.fees.fun";
        badge.target = "_blank";
        badge.rel = "noopener";
        badge.style.cssText =
          "display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:600;" +
          "color:#707df1;background:rgba(112,125,241,0.08);border:1px solid rgba(112,125,241,0.15);" +
          "border-radius:6px;padding:3px 8px;text-decoration:none;" +
          "letter-spacing:0.2px;line-height:1;white-space:nowrap;transition:background 0.15s;" +
          "flex-shrink:0;height:26px;";
        badge.innerHTML =
          `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>` +
          `<span>fees.fun</span>` +
          `<span style="opacity:0.3;margin:0 1px;">|</span>` +
          `<span style="color:#22c55e;font-weight:700;" data-feesfun-savings>...</span>` +
          `<span style="opacity:0.5;">SOL saved</span>`;
        badge.onmouseenter = () => { badge.style.background = "rgba(112,125,241,0.15)"; };
        badge.onmouseleave = () => { badge.style.background = "rgba(112,125,241,0.08)"; };
        flexRow.insertBefore(badge, nav);
        return true;
      },
    },
  ],
};
