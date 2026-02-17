// Shared ESPN API fetcher for NBA and NFL adapters
import { FETCH_TIMEOUT_MS } from "./shared.mjs";

/**
 * Fetch a single day's scoreboard from ESPN.
 * @param {string} sport - ESPN sport path segment (e.g. "basketball", "football")
 * @param {string} league - ESPN league path segment (e.g. "nba", "nfl")
 * @param {string} dateKey - Date in YYYYMMDD format
 * @returns {Promise<object[]>} Array of normalized game objects
 */
export async function fetchEspnScoreboard(sport, league, dateKey) {
  const url = `https://site.api.espn.com/apis/site/v2/sports/${sport}/${league}/scoreboard?dates=${dateKey}`;

  let res;
  try {
    res = await fetch(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch {
    return [];
  }

  if (!res.ok) return [];

  let json;
  try {
    json = await res.json();
  } catch {
    return [];
  }

  const events = Array.isArray(json?.events) ? json.events : [];
  return events.map((event) => normalizeEspnEvent(event)).filter(Boolean);
}

function normalizeEspnEvent(event) {
  if (!event) return null;
  const comp = event.competitions?.[0];
  if (!comp) return null;

  const competitors = Array.isArray(comp.competitors) ? comp.competitors : [];
  const homeComp = competitors.find((c) => c.homeAway === "home");
  const awayComp = competitors.find((c) => c.homeAway === "away");

  const statusType = comp.status?.type?.name || event.status?.type?.name || "";
  const isTbd = statusType === "STATUS_TBD" || !event.date;

  return {
    gameId: event.id,
    gameDate: event.date || undefined,
    homeTeam: {
      name: homeComp?.team?.displayName || homeComp?.team?.name || "Home Team",
      id: homeComp?.team?.abbreviation || homeComp?.team?.id,
    },
    awayTeam: {
      name: awayComp?.team?.displayName || awayComp?.team?.name || "Away Team",
      id: awayComp?.team?.abbreviation || awayComp?.team?.id,
    },
    venue: comp.venue?.fullName || undefined,
    startTimeTbd: isTbd,
    status: statusType || undefined,
  };
}
