export interface WatermarkConfig {
  /** CSS selector to find the element to modify */
  selector: string;
  /** How to apply the watermark */
  mode: "append" | "replace-inner" | "custom";
  /** HTML to inject (not used in custom mode) */
  html: string;
  /** Retry until found (SPA pages load elements dynamically) */
  retryMs?: number;
  /** Max retries before giving up */
  maxRetries?: number;
  /** Custom apply function — return true if successful, false to retry */
  customApply?: (el: Element) => boolean;
}

export interface SiteWatermarkConfig {
  hostname: RegExp;
  watermarks: WatermarkConfig[];
}

import { rapidlaunch } from "./rapidlaunch";
import { uxento } from "./uxento";
import { j7tracker } from "./j7tracker";

export const SITE_WATERMARKS: SiteWatermarkConfig[] = [
  rapidlaunch,
  uxento,
  j7tracker,
];

export function getWatermarksForSite(): WatermarkConfig[] {
  const hostname = location.hostname;
  for (const site of SITE_WATERMARKS) {
    if (site.hostname.test(hostname)) {
      return site.watermarks;
    }
  }
  return [];
}
