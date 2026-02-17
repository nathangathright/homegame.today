// Color contrast utilities (WCAG 2.1)

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

function hexToRgb(color) {
  const normalized = normalizeHexColor(color);
  if (!normalized) return null;
  const r = parseInt(normalized.slice(1, 3), 16);
  const g = parseInt(normalized.slice(3, 5), 16);
  const b = parseInt(normalized.slice(5, 7), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
  return { r, g, b };
}

function srgbChannelToLinear(channelByte) {
  const s = channelByte / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(color) {
  const rgb = typeof color === "string" ? hexToRgb(color) : color;
  if (!rgb) return null;
  const r = srgbChannelToLinear(rgb.r);
  const g = srgbChannelToLinear(rgb.g);
  const b = srgbChannelToLinear(rgb.b);
  // Rec. 709 coefficients per WCAG
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(colorA, colorB) {
  const L1 = relativeLuminance(colorA);
  const L2 = relativeLuminance(colorB);
  if (L1 == null || L2 == null) return null;
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}

export function isContrastAccessible({
  colorA,
  colorB,
  level = "AA", // "AA" | "AAA"
  textType = "normal", // "normal" | "large"
} = {}) {
  const ratio = contrastRatio(colorA, colorB);
  if (ratio == null) return { ok: false, ratio: null, min: null };

  const isLarge = textType === "large";
  let min;
  if (level === "AAA") {
    min = isLarge ? 4.5 : 7.0;
  } else {
    min = isLarge ? 3.0 : 4.5;
  }

  return { ok: ratio >= min, ratio, min };
}

export function pickReadableTextColor({
  background,
  preferred,
  fallbacks = ["#000000", "#ffffff"],
  level = "AA",
  textType = "normal",
} = {}) {
  const candidates = [preferred, ...fallbacks].filter(Boolean);
  let best = null;
  let bestRatio = -Infinity;
  for (const candidate of candidates) {
    const ratio = contrastRatio(background, candidate);
    if (ratio != null && ratio > bestRatio) {
      best = candidate;
      bestRatio = ratio;
    }
  }
  const { ok, min } = isContrastAccessible({ colorA: background, colorB: best, level, textType });
  return { color: best, ratio: bestRatio, accessible: ok, min };
}

// Prefer the provided preferred color; only fall back to black/white if it
// does not meet the contrast threshold for the given level/textType.
export function pickPreferredThenBW({
  background,
  preferred,
  level = "AA",
  textType = "normal",
} = {}) {
  const preferredRatio = contrastRatio(background, preferred);
  const preferredCheck = isContrastAccessible({
    colorA: background,
    colorB: preferred,
    level,
    textType,
  });
  if (preferred && preferredRatio != null && preferredCheck.ok) {
    return { color: preferred, ratio: preferredRatio, accessible: true, min: preferredCheck.min };
  }

  // Try black and white; choose the one with higher ratio
  const black = "#000000";
  const white = "#ffffff";
  const blackRatio = contrastRatio(background, black) ?? -Infinity;
  const whiteRatio = contrastRatio(background, white) ?? -Infinity;
  const choice = whiteRatio >= blackRatio ? white : black;
  const ratio = Math.max(whiteRatio, blackRatio);
  const check = isContrastAccessible({ colorA: background, colorB: choice, level, textType });
  return { color: choice, ratio, accessible: check.ok, min: check.min };
}

export default {
  relativeLuminance,
  contrastRatio,
  isContrastAccessible,
  pickReadableTextColor,
  pickPreferredThenBW,
};
