// Color contrast utilities (APCA — Accessible Perceptual Contrast Algorithm)

import { calcAPCA } from "apca-w3";

function normalizeHexColor(color) {
  const str = String(color).trim();
  if (!str) return null;
  const hex = str.startsWith("#") ? str.slice(1) : str;
  if (hex.length === 3) {
    return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`.toLowerCase();
  }
  if (hex.length === 6) {
    return `#${hex}`.toLowerCase();
  }
  return null;
}

/** Returns the absolute APCA Lc value for text on a background, or null on invalid input. */
export function apcaContrast(textColor, bgColor) {
  const text = normalizeHexColor(textColor);
  const bg = normalizeHexColor(bgColor);
  if (!text || !bg) return null;
  const lc = calcAPCA(text, bg);
  return Math.abs(Number(lc));
}

/**
 * Prefer the provided preferred color; only fall back to black/white if it
 * does not meet the APCA Lc threshold.
 * @param {object} options
 * @param {string} options.background
 * @param {string} options.preferred
 * @param {number} [options.minLc] - Minimum absolute Lc (default 45 = large/bold text)
 */
export function pickPreferredThenBW({ background, preferred, minLc = 45 } = {}) {
  const preferredLc = apcaContrast(preferred, background);
  if (preferred && preferredLc != null && preferredLc >= minLc) {
    return { color: preferred, lc: preferredLc, accessible: true };
  }

  // Try black and white; choose the one with higher Lc
  const black = "#000000";
  const white = "#ffffff";
  const blackLc = apcaContrast(black, background) ?? -Infinity;
  const whiteLc = apcaContrast(white, background) ?? -Infinity;
  const choice = whiteLc >= blackLc ? white : black;
  const lc = Math.max(whiteLc, blackLc);
  return { color: choice, lc, accessible: lc >= minLc };
}
