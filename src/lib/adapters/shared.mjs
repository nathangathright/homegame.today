// Shared utilities for schedule adapters

export const FETCH_TIMEOUT_MS = 10_000;
export const HORIZON_MONTHS = 9;

export function dateKeyInZone(d, timeZone) {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  } catch {
    return new Date(d).toISOString().slice(0, 10);
  }
}

export function computeWindowStartEnd(fromDate = new Date(), months = HORIZON_MONTHS) {
  const start = new Date(fromDate);
  const end = new Date(fromDate);
  end.setMonth(end.getMonth() + months);
  const startIso = start.toISOString().slice(0, 10);
  const endIso = end.toISOString().slice(0, 10);
  return { startIso, endIso };
}

// Checks whether a normalized game has a TBD start time.
// Sport-specific TBD heuristics (like MLB's 03:33 UTC placeholder) should be
// resolved by the adapter and stored in game.startTimeTbd.
export function isStartTimeTbd(game) {
  try {
    if (!game) return true;
    if (game?.startTimeTbd === true) return true;
    const iso = game?.gameDate;
    if (!iso) return true;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return true;
    return false;
  } catch {
    return true;
  }
}

export function getLocalDateAndOptionalTime(game, timeZone, options = {}) {
  const { dateStyle = "medium", timeStyle = "short" } = options;
  const iso = game?.gameDate;
  const d = iso ? new Date(iso) : null;
  const datePart = d ? d.toLocaleDateString(undefined, { dateStyle, timeZone }) : "";
  const timeCertain = !isStartTimeTbd(game);
  const timePart =
    timeCertain && d ? d.toLocaleTimeString(undefined, { timeStyle, timeZone }) : undefined;
  return { datePart, timePart, timeCertain };
}

// Per-run schedule window cache to avoid duplicate HTTP fetches
const _scheduleWindowCache = new Map();

export function getCachedSchedule(key) {
  return _scheduleWindowCache.has(key) ? _scheduleWindowCache.get(key) : undefined;
}

export function setCachedSchedule(key, data) {
  _scheduleWindowCache.set(key, data);
}
