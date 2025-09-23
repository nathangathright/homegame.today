// Shared MLB helpers for schedule fetching and formatting
import { buildSportsEventJsonLd } from "./seo.mjs";

export function dateKeyInZone(d, timeZone) {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  } catch {
    return new Date(d).toISOString().slice(0, 10);
  }
}

export async function fetchLeagueScheduleToday() {
  const apiUrl = new URL("https://statsapi.mlb.com/api/v1/schedule");
  apiUrl.searchParams.set("sportId", "1");
  const res = await fetch(apiUrl.toString(), { headers: { accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`MLB API error ${res.status}`);
  }
  return res.json();
}

export async function fetchScheduleWindow(teamId, startDateIso, endDateIso) {
  const apiUrl = new URL("https://statsapi.mlb.com/api/v1/schedule");
  apiUrl.searchParams.set("sportId", "1");
  apiUrl.searchParams.set("teamId", String(teamId));
  if (startDateIso) apiUrl.searchParams.set("startDate", startDateIso);
  if (endDateIso) apiUrl.searchParams.set("endDate", endDateIso);
  const res = await fetch(apiUrl.toString(), { headers: { accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`MLB API error ${res.status}`);
  }
  return res.json();
}

export function deriveTeamScheduleFacts(team, apiData) {
  const dates = Array.isArray(apiData?.dates) ? apiData.dates : [];
  const games = dates.flatMap((d) => Array.isArray(d?.games) ? d.games : []);
  const teamTimeZone = team?.timezone;
  const todayKey = dateKeyInZone(new Date(), teamTimeZone);

  const gamesToday = games.filter((g) => {
    const iso = g?.gameDate ? dateKeyInZone(new Date(g.gameDate), teamTimeZone) : undefined;
    return iso === todayKey;
  });
  const homeGamesToday = gamesToday.filter((g) => g?.teams?.home?.team?.id === team?.id);
  const awayGamesToday = gamesToday.filter((g) => g?.teams?.away?.team?.id === team?.id);

  const nowTs = Date.now();
  const upcomingHomeGames = games
    .filter((g) => g?.teams?.home?.team?.id === team?.id && g?.gameDate)
    .sort((a, b) => new Date(a.gameDate).getTime() - new Date(b.gameDate).getTime());
  const nextHomeGame = upcomingHomeGames.find((g) => new Date(g.gameDate).getTime() >= nowTs);

  return { games, teamTimeZone, todayKey, gamesToday, homeGamesToday, awayGamesToday, nextHomeGame };
}

// Window horizon configuration
export const HORIZON_MONTHS = 9; // fetch schedule up to 9 months ahead
export function computeWindowStartEnd(fromDate = new Date(), months = HORIZON_MONTHS) {
  const start = new Date(fromDate);
  const end = new Date(fromDate);
  end.setMonth(end.getMonth() + months);
  const startIso = start.toISOString().slice(0, 10);
  const endIso = end.toISOString().slice(0, 10);
  return { startIso, endIso };
}

// Heuristics for TBD/placeholder times in MLB API schedules
export function isStartTimeTbd(game) {
  try {
    if (!game) return true;
    if (game?.status?.startTimeTBD === true) return true;
    const iso = game?.gameDate;
    if (!iso) return true;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return true;
    // Many future games use a placeholder like 03:33Z; treat that as TBD
    const utcHours = d.getUTCHours();
    const utcMinutes = d.getUTCMinutes();
    if (utcHours === 3 && utcMinutes === 33) return true;
    return false;
  } catch {
    return true;
  }
}

export function getLocalDateAndOptionalTime(game, timeZone, options = {}) {
  const { dateStyle = "medium", timeStyle = "short" } = options;
  const iso = game?.gameDate;
  const d = iso ? new Date(iso) : null;
  const datePart = d
    ? d.toLocaleDateString(undefined, { dateStyle, timeZone })
    : "";
  const timeCertain = !isStartTimeTbd(game);
  const timePart = timeCertain && d
    ? d.toLocaleTimeString(undefined, { timeStyle, timeZone })
    : undefined;
  return { datePart, timePart, timeCertain };
}

// Bluesky helpers
export const getBlueskyHandle = (team) => `${team.slug}.homegame.today`;
export const getBlueskyProfileUrl = (team) => `https://bsky.app/profile/${getBlueskyHandle(team)}`;
export const getBlueskyRssUrl = (team) => `${getBlueskyProfileUrl(team)}/rss`;

// Per-run schedule window cache to avoid duplicate HTTP fetches
const _scheduleWindowCache = new Map();
export async function fetchScheduleWindowCached(teamId, startIso, endIso) {
  const key = `${teamId}:${startIso}:${endIso}`;
  if (_scheduleWindowCache.has(key)) return _scheduleWindowCache.get(key);
  const data = await fetchScheduleWindow(teamId, startIso, endIso);
  _scheduleWindowCache.set(key, data);
  return data;
}

// Unified status formatter used by OG and Bluesky
export function formatTeamStatus(team, apiData, opts = {}) {
  const { includeTeamName = false, nbsp = false, dateStyle = "medium" } = opts;
  const venue = team?.venue ?? "their stadium";
  const { games, teamTimeZone, todayKey } = deriveTeamScheduleFacts(team, apiData);
  const isToday = (g) => (g?.gameDate ? dateKeyInZone(new Date(g.gameDate), teamTimeZone) === todayKey : false);
  const homeToday = games.filter(isToday).filter((g) => g?.teams?.home?.team?.id === team?.id);

  const prefix = includeTeamName ? `${team.name} — ` : "";
  const space = nbsp ? "\u00A0" : " ";
  const nb = (s) => (nbsp ? String(s).replace(/ /g, "\u00A0") : String(s));

  if (homeToday.length > 0) {
    const { timePart, timeCertain } = getLocalDateAndOptionalTime(homeToday[0], teamTimeZone, { timeStyle: "short" });
    return prefix + (timeCertain && timePart
      ? `Yes, today’s game at ${venue} is scheduled for ${nb(timePart)}.`
      : `Yes, today’s game at ${venue} is scheduled.`);
  }

  const nowTs = Date.now();
  const upcomingHome = games
    .filter((g) => g?.teams?.home?.team?.id === team?.id && g?.gameDate)
    .sort((a, b) => new Date(a.gameDate).getTime() - new Date(b.gameDate).getTime())
    .find((g) => new Date(g.gameDate).getTime() >= nowTs);

  if (upcomingHome?.gameDate) {
    const { datePart, timePart, timeCertain } = getLocalDateAndOptionalTime(upcomingHome, teamTimeZone, { dateStyle, timeStyle: "short" });
    const safeDate = nb(datePart);
    if (timeCertain && timePart) {
      const safeTime = nb(timePart);
      return prefix + `No, the next game at ${venue} is scheduled for ${safeDate} at${space}${safeTime}.`;
    }
    return prefix + `No, the next game at ${venue} is scheduled for ${safeDate}.`;
  }

  return prefix + `No, the next game at ${venue} is not yet scheduled.`;
}

// Backwards-compatible wrappers
export function computeOgText(team, apiData) {
  return formatTeamStatus(team, apiData, { includeTeamName: false, nbsp: true, dateStyle: "medium" });
}

export function computeStatusForTeam(team, apiData) {
  return formatTeamStatus(team, apiData, { includeTeamName: true, nbsp: false, dateStyle: "medium" });
}

// Selects the primary game to feature for JSON-LD (home preferred, else away)
export function selectGameForTeamToday(facts) {
  const selected = (facts?.homeGamesToday?.[0] ?? facts?.awayGamesToday?.[0]) || undefined;
  const isHome = !!facts?.homeGamesToday?.[0];
  return { selectedGame: selected, isHome };
}

// OG image path for today using team-local date key
export function getOgImagePath(slug, timeZone) {
  const dateKey = dateKeyInZone(new Date(), timeZone);
  return `/og/${slug}-${dateKey}.png`;
}

// Build page title and description for a team page
export function buildTeamPageMeta(team, apiData) {
  const siteName = "homegame.today";
  const teamName = team?.name ?? "Team";
  const message = formatTeamStatus(team, apiData, { includeTeamName: false, nbsp: false, dateStyle: "medium" });
  // Title format: "<Team> — Yes|No | homegame.today"
  const hasHome = /^(Yes)/.test(message);
  const answer = hasHome ? "Yes" : "No";
  const title = `${teamName} — ${answer} | ${siteName}`;
  const description = message;
  return { title, description };
}

// Build full team page data (SSG-friendly; no network outside provided helpers)
export async function buildTeamPageData(team, options = {}) {
  const { siteBase } = options;
  const { startIso, endIso } = computeWindowStartEnd(new Date());
  const data = await fetchScheduleWindowCached(team.id, startIso, endIso);
  const facts = deriveTeamScheduleFacts(team, data);
  const meta = buildTeamPageMeta(team, data);

  const ogPath = getOgImagePath(team.slug, team?.timezone);
  const ogImage = siteBase ? new URL(ogPath, siteBase).toString() : ogPath;

  const { selectedGame, isHome } = selectGameForTeamToday(facts);
  const pageDateIso = new Date().toISOString().slice(0, 10);
  const jsonLd = buildSportsEventJsonLd({ team, selectedGame, isHome, fallbackDateIso: pageDateIso });

  const bluesky = {
    profile: getBlueskyProfileUrl(team),
    rss: getBlueskyRssUrl(team),
  };

  return { meta, ogImage, bluesky, facts, jsonLd };
}

// Build detail content fragments for the team page under the Yes/No
export function buildDetailContent(team, facts) {
  const venue = team?.venue ?? "their stadium";
  const tz = team?.timezone;

  // Home game today
  const homeToday = Array.isArray(facts?.homeGamesToday) ? facts.homeGamesToday : [];
  if (homeToday.length > 0) {
    const g = homeToday[0];
    const dtIso = g?.gameDate;
    if (!dtIso) {
      return { fallback: `Yes, game at ${venue} today.` };
    }
    const dt = new Date(dtIso);
    const label = dt.toLocaleTimeString(undefined, { timeStyle: "short", timeZone: tz });
    return { pre: `Today’s game at ${venue} is scheduled for `, iso: dt.toISOString(), label };
  }

  // Next upcoming home game
  const nextHome = facts?.nextHomeGame;
  if (nextHome?.gameDate) {
    const { datePart, timePart, timeCertain } = getLocalDateAndOptionalTime(nextHome, tz, { dateStyle: "medium", timeStyle: "short" });
    const dt = new Date(nextHome.gameDate);
    const label = timeCertain && timePart ? `${datePart} at ${timePart}` : `${datePart}`;
    return { pre: `The next game at ${venue} is scheduled for `, iso: dt.toISOString(), label };
  }

  return { fallback: `The next game at ${venue} is not yet scheduled.` };
}


