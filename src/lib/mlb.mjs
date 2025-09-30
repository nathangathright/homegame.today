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
  // Use league-wide date in America/New_York to align with MLB schedule day
  const today = dateKeyInZone(new Date(), "America/New_York");

  // Regular season endpoint
  const regUrl = new URL("https://statsapi.mlb.com/api/v1/schedule");
  regUrl.searchParams.set("sportId", "1");
  regUrl.searchParams.set("startDate", today);
  regUrl.searchParams.set("endDate", today);

  // Postseason endpoint
  const psUrl = new URL("https://statsapi.mlb.com/api/v1/schedule/postseason");
  psUrl.searchParams.set("startDate", today);
  psUrl.searchParams.set("endDate", today);

  const [regRes, psRes] = await Promise.all([
    fetch(regUrl.toString(), { headers: { accept: "application/json" } }),
    fetch(psUrl.toString(), { headers: { accept: "application/json" } }),
  ]);

  // Be tolerant of errors here; this function is used as a soft guard
  let regJson = { dates: [] };
  let psJson = { dates: [] };
  try {
    if (regRes && regRes.ok) {
      regJson = await regRes.json();
    }
  } catch {
    regJson = { dates: [] };
  }
  try {
    if (psRes && psRes.ok) {
      psJson = await psRes.json();
    }
  } catch {
    psJson = { dates: [] };
  }

  // Merge dates arrays and de-dupe games by gamePk
  const regDates = Array.isArray(regJson?.dates) ? regJson.dates : [];
  const psDates = Array.isArray(psJson?.dates) ? psJson.dates : [];
  const allDates = [...regDates, ...psDates];

  const allGames = allDates.flatMap((d) => (Array.isArray(d?.games) ? d.games : []));
  const byPk = new Map();
  for (const g of allGames) {
    const pk = g?.gamePk ?? g?.gamePk === 0 ? g.gamePk : undefined;
    if (pk == null) continue;
    const existing = byPk.get(pk);
    if (!existing) {
      byPk.set(pk, g);
    } else if (!existing.gameDate && g.gameDate) {
      byPk.set(pk, g);
    }
  }

  const mergedGames = Array.from(byPk.values()).sort((a, b) => {
    const ta = a?.gameDate ? new Date(a.gameDate).getTime() : Number.POSITIVE_INFINITY;
    const tb = b?.gameDate ? new Date(b.gameDate).getTime() : Number.POSITIVE_INFINITY;
    return ta - tb;
  });

  // Re-group by date key (YYYY-MM-DD)
  const grouped = new Map();
  for (const g of mergedGames) {
    const iso = g?.gameDate ? String(g.gameDate) : "";
    const day = iso ? iso.slice(0, 10) : today;
    if (!grouped.has(day)) grouped.set(day, []);
    grouped.get(day).push(g);
  }

  return {
    totalItems: mergedGames.length,
    dates: Array.from(grouped.entries()).map(([date, games]) => ({ date, totalGames: games.length, games })),
  };
}

export async function fetchScheduleWindow(teamId, startDateIso, endDateIso) {
  // Regular season schedule
  const baseUrl = new URL("https://statsapi.mlb.com/api/v1/schedule");
  baseUrl.searchParams.set("sportId", "1");
  baseUrl.searchParams.set("teamId", String(teamId));
  if (startDateIso) baseUrl.searchParams.set("startDate", startDateIso);
  if (endDateIso) baseUrl.searchParams.set("endDate", endDateIso);

  // Postseason schedule (includes Wild Card, LDS, LCS, WS)
  const psUrl = new URL("https://statsapi.mlb.com/api/v1/schedule/postseason");
  psUrl.searchParams.set("teamId", String(teamId));
  if (startDateIso) psUrl.searchParams.set("startDate", startDateIso);
  if (endDateIso) psUrl.searchParams.set("endDate", endDateIso);

  const [regRes, psRes] = await Promise.all([
    fetch(baseUrl.toString(), { headers: { accept: "application/json" } }),
    fetch(psUrl.toString(), { headers: { accept: "application/json" } }),
  ]);

  if (!regRes.ok) {
    throw new Error(`MLB API error ${regRes.status}`);
  }

  // Postseason may 404 or be empty out of season; handle softly
  let regJson;
  let psJson;
  try {
    regJson = await regRes.json();
  } catch {
    regJson = { dates: [] };
  }
  if (psRes && psRes.ok) {
    try {
      psJson = await psRes.json();
    } catch {
      psJson = { dates: [] };
    }
  } else {
    psJson = { dates: [] };
  }

  // Merge dates arrays and de-dupe games by gamePk
  const regDates = Array.isArray(regJson?.dates) ? regJson.dates : [];
  const psDates = Array.isArray(psJson?.dates) ? psJson.dates : [];
  const allDates = [...regDates, ...psDates];

  // Flatten, merge, and rebuild minimal schedule shape compatible with consumers
  const allGames = allDates.flatMap((d) => (Array.isArray(d?.games) ? d.games : []));
  const byPk = new Map();
  for (const g of allGames) {
    const pk = g?.gamePk ?? g?.gamePk === 0 ? g.gamePk : undefined;
    if (pk == null) continue;
    // Prefer entries that have a concrete gameDate
    const existing = byPk.get(pk);
    if (!existing) {
      byPk.set(pk, g);
    } else if (!existing.gameDate && g.gameDate) {
      byPk.set(pk, g);
    }
  }

  const mergedGames = Array.from(byPk.values()).sort((a, b) => {
    const ta = a?.gameDate ? new Date(a.gameDate).getTime() : Number.POSITIVE_INFINITY;
    const tb = b?.gameDate ? new Date(b.gameDate).getTime() : Number.POSITIVE_INFINITY;
    return ta - tb;
  });

  // Re-group by date key (YYYY-MM-DD) as schedule endpoint returns
  const grouped = new Map();
  for (const g of mergedGames) {
    const iso = g?.gameDate ? String(g.gameDate) : "";
    const day = iso ? iso.slice(0, 10) : "";
    if (!grouped.has(day)) grouped.set(day, []);
    grouped.get(day).push(g);
  }

  const merged = {
    totalItems: mergedGames.length,
    dates: Array.from(grouped.entries()).map(([date, games]) => ({ date, totalGames: games.length, games })),
  };

  return merged;
}

export function deriveTeamScheduleFacts(team, apiData) {
  const dates = Array.isArray(apiData?.dates) ? apiData.dates : [];
  const games = dates.flatMap((d) => Array.isArray(d?.games) ? d.games : []);
  const teamTimeZone = team?.timezone;
  const todayKey = dateKeyInZone(new Date(), teamTimeZone);

  // Treat a game as a home game for the team if either:
  // - The MLB API home team id matches the team's id (regular case)
  // - The venue name matches the team's venue (postseason placeholders sometimes use seed ids)
  const isHomeForTeam = (g) => {
    try {
      const byId = g?.teams?.home?.team?.id === team?.id;
      const venueName = (g?.venue?.name || "").toString().trim().toLowerCase();
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
  const awayGamesToday = gamesToday.filter((g) => g?.teams?.away?.team?.id === team?.id);

  const nowTs = Date.now();
  const upcomingHomeGames = games
    .filter((g) => isHomeForTeam(g) && g?.gameDate)
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
export const getBlueskyDid = (team) => (team && typeof team.did === "string" ? team.did : undefined);
export const getBlueskyProfileUrl = (team) => {
  const did = getBlueskyDid(team);
  return did ? `https://bsky.app/profile/${did}` : "";
};
export const getBlueskyRssUrl = (team) => {
  const profile = getBlueskyProfileUrl(team);
  return profile ? `${profile}/rss` : "";
};

// Mastodon (via Bridgy Fed) helpers – only when DID exists
export const getMastodonAcct = (team) => (getBlueskyDid(team) ? `${team.slug}.homegame.today@bsky.brid.gy` : "");
export const getMastodonActorUrl = (team) => (getBlueskyDid(team) ? `https://bsky.brid.gy/ap/@${team.slug}.homegame.today` : "");

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


