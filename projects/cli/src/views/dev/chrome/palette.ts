/**
 * Single source of truth for the TUI's purple gradient. Tailwind violet
 * stops, picked so the OUTPUT logo reads top-bright to bottom-dark and
 * the chrome rules sit somewhere in the middle.
 */
export const PURPLE_50 = '#c4b5fd';
export const PURPLE_100 = '#a78bfa';
export const PURPLE_200 = '#8b5cf6';
export const PURPLE_300 = '#7c3aed';
export const PURPLE_400 = '#6d28d9';

export const RULE_PURPLE = PURPLE_100;

/**
 * 3-stop gradient applied across the OUTPUT logo's three rows after
 * 2x2 quadrant compression.
 */
export const LOGO_GRADIENT = [ PURPLE_50, PURPLE_200, PURPLE_400 ] as const;
