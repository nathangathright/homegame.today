// Public API for schedule data — sport-agnostic
//
// All consumers (pages, scripts, API endpoints) should import from this module
// instead of importing adapters directly. Sport-specific logic is delegated to
// adapters via getAdapter(team.sport).

import { getAdapter } from "./adapters/index.mjs";
import {
  dateKeyInZone,
  computeWindowStartEnd,
  HORIZON_MONTHS,
  isStartTimeTbd,
  getLocalDateAndOptionalTime,
  getCachedSchedule,
  setCachedSchedule,
} from "./adapters/shared.mjs";
import { buildSportsEventJsonLd } from "./seo.mjs";

// Re-export shared utilities
export {
  dateKeyInZone,
  computeWindowStartEnd,
  HORIZON_MONTHS,
  isStartTimeTbd,
  getLocalDateAndOptionalTime,
};

// Re-export adapter dispatcher
export { getAdapter };

const SPORT_DISPLAY_NAMES = {
  mlb: "Baseball",
  nhl: "Hockey",
  nba: "Basketball",
  nfl: "Football",
};

function sportDisplayName(sport) {
  return SPORT_DISPLAY_NAMES[sport || "mlb"] || "Baseball";
}

// Per-run cached fetch — delegates to the correct adapter based on team.sport
export async function fetchScheduleWindowCached(team, startIso, endIso) {
  const sport = team.sport || "mlb";
  const apiId = team.apiId ?? team.id;
  const key = `${sport}:${apiId}:${startIso}:${endIso}`;
  const cached = getCachedSchedule(key);
  if (cached !== undefined) return cached;
  const adapter = getAdapter(sport);
  const data = await adapter.fetchScheduleWindow(team, startIso, endIso);
  setCachedSchedule(key, data);
  return data;
}

// Fetch league-wide schedule for today (used for off-season guards)
export async function fetchLeagueScheduleToday(sport = "mlb") {
  const adapter = getAdapter(sport);
  return adapter.fetchLeagueScheduleToday();
}

// Derive schedule facts for a team from normalized game data
export function deriveTeamScheduleFacts(team, apiData) {
  const dates = Array.isArray(apiData?.dates) ? apiData.dates : [];
  const games = dates.flatMap((d) => (Array.isArray(d?.games) ? d.games : []));
  const teamTimeZone = team?.timezone;
  const todayKey = dateKeyInZone(new Date(), teamTimeZone);
  const teamApiId = team?.apiId ?? team?.id;

  // Treat a game as a home game for the team if either:
  // - The normalized homeTeam id matches the team's API id
  // - The venue name matches the team's venue (postseason placeholders sometimes use seed ids)
  const isHomeForTeam = (g) => {
    try {
      const byId = g?.homeTeam?.id === teamApiId;
      const venueName = (g?.venue || "").toString().trim().toLowerCase();
      const teamVenue = (team?.venue || "").toString().trim().toLowerCase();
      const byVenue = !!venueName && !!teamVenue && venueName === teamVenue;
      return byId || byVenue;
    } catch {
      return false;
    }
  };

  const gamesToday = games.filter((g) => {
    const iso = g?.gameDate ? dateKeyInZone(new Date(g.gameDate), teamTimeZone) : undefined;
    return iso === todayKey;
  });
  const homeGamesToday = gamesToday.filter((g) => isHomeForTeam(g));
  const awayGamesToday = gamesToday.filter((g) => g?.awayTeam?.id === teamApiId);

  const nowTs = Date.now();
  const upcomingHomeGames = games
    .filter((g) => isHomeForTeam(g) && g?.gameDate)
    .sort((a, b) => new Date(a.gameDate).getTime() - new Date(b.gameDate).getTime());
  const nextHomeGame = upcomingHomeGames.find((g) => new Date(g.gameDate).getTime() >= nowTs);

  return {
    games,
    teamTimeZone,
    todayKey,
    gamesToday,
    homeGamesToday,
    awayGamesToday,
    nextHomeGame,
  };
}

// Unified status formatter used by OG and Bluesky
export function formatTeamStatus(team, apiData, opts = {}) {
  const { includeTeamName = false, nbsp = false, dateStyle = "medium" } = opts;
  const venue = team?.venue ?? "their stadium";
  const teamApiId = team?.apiId ?? team?.id;
  const { games, teamTimeZone, todayKey } = deriveTeamScheduleFacts(team, apiData);
  const isToday = (g) =>
    g?.gameDate ? dateKeyInZone(new Date(g.gameDate), teamTimeZone) === todayKey : false;
  const homeToday = games.filter(isToday).filter((g) => g?.homeTeam?.id === teamApiId);

  const prefix = includeTeamName ? `${team.name} — ` : "";
  const space = nbsp ? "\u00A0" : " ";
  const nb = (s) => (nbsp ? String(s).replace(/ /g, "\u00A0") : String(s));

  if (homeToday.length > 0) {
    const { timePart, timeCertain } = getLocalDateAndOptionalTime(homeToday[0], teamTimeZone, {
      timeStyle: "short",
    });
    return (
      prefix +
      (timeCertain && timePart
        ? `Yes, today's game at ${venue} is scheduled for ${nb(timePart)}.`
        : `Yes, today's game at ${venue} is scheduled.`)
    );
  }

  const nowTs = Date.now();
  const upcomingHome = games
    .filter((g) => g?.homeTeam?.id === teamApiId && g?.gameDate)
    .sort((a, b) => new Date(a.gameDate).getTime() - new Date(b.gameDate).getTime())
    .find((g) => new Date(g.gameDate).getTime() >= nowTs);

  if (upcomingHome?.gameDate) {
    const { datePart, timePart, timeCertain } = getLocalDateAndOptionalTime(
      upcomingHome,
      teamTimeZone,
      { dateStyle, timeStyle: "short" }
    );
    const safeDate = nb(datePart);
    if (timeCertain && timePart) {
      const safeTime = nb(timePart);
      return (
        prefix + `No, the next game at ${venue} is scheduled for ${safeDate} at${space}${safeTime}.`
      );
    }
    return prefix + `No, the next game at ${venue} is scheduled for ${safeDate}.`;
  }

  return prefix + `No, the next game at ${venue} is not yet scheduled.`;
}

// Backwards-compatible wrappers
export function computeOgText(team, apiData) {
  return formatTeamStatus(team, apiData, {
    includeTeamName: false,
    nbsp: true,
    dateStyle: "medium",
  });
}

export function computeStatusForTeam(team, apiData) {
  return formatTeamStatus(team, apiData, {
    includeTeamName: true,
    nbsp: false,
    dateStyle: "medium",
  });
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
  const message = formatTeamStatus(team, apiData, {
    includeTeamName: false,
    nbsp: false,
    dateStyle: "medium",
  });
  const hasHome = /^(Yes)/.test(message);
  const answer = hasHome ? "Yes" : "No";
  const title = `${teamName} — ${answer} | ${siteName}`;
  const description = message;
  return { title, description };
}

// Bluesky helpers
export const getBlueskyHandle = (team) => `${team.slug}.homegame.today`;
export const getBlueskyDid = (team) =>
  team && typeof team.did === "string" ? team.did : undefined;
export const getBlueskyProfileUrl = (team) => {
  const did = getBlueskyDid(team);
  return did ? `https://bsky.app/profile/${did}` : "";
};
export const getBlueskyRssUrl = (team) => {
  const profile = getBlueskyProfileUrl(team);
  return profile ? `${profile}/rss` : "";
};

// Mastodon (via Bridgy Fed) helpers — only when DID exists
export const getMastodonAcct = (team) =>
  getBlueskyDid(team) ? `${team.slug}.homegame.today@bsky.brid.gy` : "";
export const getMastodonActorUrl = (team) =>
  getBlueskyDid(team) ? `https://bsky.brid.gy/ap/@${team.slug}.homegame.today` : "";

// Build full team page data (SSG-friendly)
export async function buildTeamPageData(team, options = {}) {
  const { siteBase } = options;
  const { startIso, endIso } = computeWindowStartEnd(new Date());
  const data = await fetchScheduleWindowCached(team, startIso, endIso);
  const facts = deriveTeamScheduleFacts(team, data);
  const meta = buildTeamPageMeta(team, data);

  const ogPath = getOgImagePath(team.slug, team?.timezone);
  const ogImage = siteBase ? new URL(ogPath, siteBase).toString() : ogPath;

  const { selectedGame, isHome } = selectGameForTeamToday(facts);
  const pageDateIso = dateKeyInZone(new Date(), team?.timezone);
  const jsonLd = buildSportsEventJsonLd({
    team,
    selectedGame,
    isHome,
    fallbackDateIso: pageDateIso,
    sportName: sportDisplayName(team.sport),
  });

  const bluesky = {
    profile: getBlueskyProfileUrl(team),
    rss: getBlueskyRssUrl(team),
  };

  const mastodon = {
    acct: getMastodonAcct(team),
    actor: getMastodonActorUrl(team),
  };

  return { meta, ogImage, bluesky, mastodon, facts, jsonLd };
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
    return { pre: `Today's game at ${venue} is scheduled for `, iso: dt.toISOString(), label };
  }

  // Next upcoming home game
  const nextHome = facts?.nextHomeGame;
  if (nextHome?.gameDate) {
    const { datePart, timePart, timeCertain } = getLocalDateAndOptionalTime(nextHome, tz, {
      dateStyle: "medium",
      timeStyle: "short",
    });
    const dt = new Date(nextHome.gameDate);
    const label = timeCertain && timePart ? `${datePart} at ${timePart}` : `${datePart}`;
    return { pre: `The next game at ${venue} is scheduled for `, iso: dt.toISOString(), label };
  }

  return { fallback: `The next game at ${venue} is not yet scheduled.` };
}
