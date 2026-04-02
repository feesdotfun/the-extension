/**
 * Uxento.io - Site-specific background module
 *
 * WS interception is fully self-contained in the MAIN world script
 * (uxento.ts) — no bridge or background handler needed.
 * Empty stubs exported so the SITES array loop in background.ts can
 * call setup/applyRules/removeRules uniformly without null checks.
 */

export function setup() {}
export function applyRules() {}
export function removeRules() {}
