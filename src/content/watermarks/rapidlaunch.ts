import type { SiteWatermarkConfig } from "./index";

export const rapidlaunch: SiteWatermarkConfig = {
  hostname: /rapidlaunch\.io$/i,
  watermarks: [
    {
      selector: 'img[alt="Rapid Launch Logo"]',
      mode: "custom",
      html: "",
      retryMs: 500,
      maxRetries: 30,
      customApply(img: Element) {
        let container = img.parentElement;
        for (let i = 0; i < 3 && container; i++) {
          const versionSpan = container.querySelector("span.text-xs");
          if (versionSpan && versionSpan.textContent?.includes("Version")) {
            versionSpan.innerHTML = `
              <span>saved <span data-feesfun-savings style="font-weight:600;color:#22c55e;transition:color 0.3s">...</span> SOL with</span>
              <span style="color:#4a5df7;font-weight:600">fees.fun</span>
            `;
            return true;
          }
          container = container.parentElement;
        }
        return false;
      },
    },
  ],
};
