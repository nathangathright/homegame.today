// NHL adapter — fetches from NHL API (api-web.nhle.com) and normalizes to shared game shape
import { FETCH_TIMEOUT_MS, dateKeyInZone } from "./shared.mjs";

function normalizeGame(g) {
  if (!g) return null;
  return {
    gameId: g.id,
    gameDate: g.startTimeUTC || undefined,
    homeTeam: {
      name: g.homeTeam?.commonName?.default || "Home Team",
      id: g.homeTeam?.abbrev || g.homeTeam?.id,
    },
    awayTeam: {
      name: g.awayTeam?.commonName?.default || "Away Team",
      id: g.awayTeam?.abbrev || g.awayTeam?.id,
    },
    venue: g.venue?.default || undefined,
    startTimeTbd: g.gameScheduleState === "TBD" || !g.startTimeUTC,
    status: g.gameState || undefined,
  };
}

// Group normalized games by date key
function groupGamesByDate(games, fallbackDateKey = "") {
  const grouped = new Map();
  for (const g of games) {
    const iso = g?.gameDate ? String(g.gameDate) : "";
    const day = iso ? iso.slice(0, 10) : fallbackDateKey;
    if (!grouped.has(day)) grouped.set(day, []);
    grouped.get(day).push(g);
  }
  return {
    totalItems: games.length,
    dates: Array.from(grouped.entries()).map(([date, dateGames]) => ({
      date,
      totalGames: dateGames.length,
      games: dateGames,
    })),
  };
}

// NHL season spans two calendar years (e.g., "20242025")
function currentNhlSeason() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed
  // NHL season starts in October. Before October, we're in the prev-year/current-year season.
  if (month < 9) {
    return `${year - 1}${year}`;
  }
  return `${year}${year + 1}`;
}

export async function fetchScheduleWindow(team) {
  const teamCode = team.apiId;
  if (!teamCode) throw new Error(`NHL team missing apiId (3-letter code): ${team.name}`);

  const season = currentNhlSeason();
  const url = `https://api-web.nhle.com/v1/club-schedule-season/${teamCode}/${season}`;

  let res;
  try {
    res = await fetch(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch {
    return groupGamesByDate([]);
  }

  if (!res.ok) {
    // Off-season or unknown team: return empty
    if (res.status === 404) return groupGamesByDate([]);
    throw new Error(`NHL API error ${res.status}`);
  }

  let json;
  try {
    json = await res.json();
  } catch {
    return groupGamesByDate([]);
  }

  const rawGames = Array.isArray(json?.games) ? json.games : [];
  const normalized = rawGames
    .map(normalizeGame)
    .filter(Boolean)
    .sort((a, b) => {
      const ta = a.gameDate ? new Date(a.gameDate).getTime() : Number.POSITIVE_INFINITY;
      const tb = b.gameDate ? new Date(b.gameDate).getTime() : Number.POSITIVE_INFINITY;
      return ta - tb;
    });

  return groupGamesByDate(normalized);
}

export async function fetchLeagueScheduleToday() {
  const today = dateKeyInZone(new Date(), "America/New_York");
  const url = `https://api-web.nhle.com/v1/schedule/${today}`;

  let res;
  try {
    res = await fetch(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch {
    return groupGamesByDate([], today);
  }

  if (!res.ok) return groupGamesByDate([], today);

  let json;
  try {
    json = await res.json();
  } catch {
    return groupGamesByDate([], today);
  }

  const gameWeek = Array.isArray(json?.gameWeek) ? json.gameWeek : [];
  const allGames = gameWeek.flatMap((w) => (Array.isArray(w?.games) ? w.games : []));
  const normalized = allGames.map(normalizeGame).filter(Boolean);

  return groupGamesByDate(normalized, today);
}
