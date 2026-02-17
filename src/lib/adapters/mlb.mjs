// MLB adapter — fetches from MLB Stats API and normalizes to shared game shape
import { FETCH_TIMEOUT_MS, dateKeyInZone } from "./shared.mjs";

// MLB uses a placeholder time of 03:33 UTC for TBD games
function isMlbTimeTbd(g) {
  if (g?.status?.startTimeTBD === true) return true;
  const iso = g?.gameDate;
  if (!iso) return true;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return true;
  const utcHours = d.getUTCHours();
  const utcMinutes = d.getUTCMinutes();
  if (utcHours === 3 && utcMinutes === 33) return true;
  return false;
}

function normalizeGame(g) {
  if (!g) return null;
  return {
    gameId: g.gamePk,
    gameDate: g.gameDate || undefined,
    homeTeam: {
      name: g.teams?.home?.team?.name || "Home Team",
      id: g.teams?.home?.team?.id,
    },
    awayTeam: {
      name: g.teams?.away?.team?.name || "Away Team",
      id: g.teams?.away?.team?.id,
    },
    venue: g.venue?.name || undefined,
    startTimeTbd: isMlbTimeTbd(g),
    status: g.status?.detailedState || g.status?.abstractGameState || undefined,
  };
}

// Merge regular-season and postseason game arrays, de-dupe by gamePk (preferring
// entries with a concrete gameDate), sort chronologically, normalize, and re-group by date key.
function mergeAndGroupGames(regDates, psDates, fallbackDateKey = "") {
  const allDates = [...regDates, ...psDates];
  const allGames = allDates.flatMap((d) => (Array.isArray(d?.games) ? d.games : []));

  const byPk = new Map();
  for (const g of allGames) {
    const pk = (g?.gamePk ?? g?.gamePk === 0) ? g.gamePk : undefined;
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

  const normalizedGames = mergedGames.map(normalizeGame).filter(Boolean);

  const grouped = new Map();
  for (const g of normalizedGames) {
    const iso = g?.gameDate ? String(g.gameDate) : "";
    const day = iso ? iso.slice(0, 10) : fallbackDateKey;
    if (!grouped.has(day)) grouped.set(day, []);
    grouped.get(day).push(g);
  }

  return {
    totalItems: normalizedGames.length,
    dates: Array.from(grouped.entries()).map(([date, games]) => ({
      date,
      totalGames: games.length,
      games,
    })),
  };
}

export async function fetchScheduleWindow(team, startDateIso, endDateIso) {
  const teamId = team.apiId ?? team.id;

  const baseUrl = new URL("https://statsapi.mlb.com/api/v1/schedule");
  baseUrl.searchParams.set("sportId", "1");
  baseUrl.searchParams.set("teamId", String(teamId));
  if (startDateIso) baseUrl.searchParams.set("startDate", startDateIso);
  if (endDateIso) baseUrl.searchParams.set("endDate", endDateIso);

  const psUrl = new URL("https://statsapi.mlb.com/api/v1/schedule/postseason");
  psUrl.searchParams.set("teamId", String(teamId));
  if (startDateIso) psUrl.searchParams.set("startDate", startDateIso);
  if (endDateIso) psUrl.searchParams.set("endDate", endDateIso);

  const [regRes, psRes] = await Promise.all([
    fetch(baseUrl.toString(), {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    }),
    fetch(psUrl.toString(), {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    }),
  ]);

  if (!regRes.ok) {
    throw new Error(`MLB API error ${regRes.status}`);
  }

  let regJson, psJson;
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

  const regDates = Array.isArray(regJson?.dates) ? regJson.dates : [];
  const psDates = Array.isArray(psJson?.dates) ? psJson.dates : [];
  return mergeAndGroupGames(regDates, psDates);
}

export async function fetchLeagueScheduleToday() {
  const today = dateKeyInZone(new Date(), "America/New_York");

  const regUrl = new URL("https://statsapi.mlb.com/api/v1/schedule");
  regUrl.searchParams.set("sportId", "1");
  regUrl.searchParams.set("startDate", today);
  regUrl.searchParams.set("endDate", today);

  const psUrl = new URL("https://statsapi.mlb.com/api/v1/schedule/postseason");
  psUrl.searchParams.set("startDate", today);
  psUrl.searchParams.set("endDate", today);

  const [regRes, psRes] = await Promise.all([
    fetch(regUrl.toString(), {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    }),
    fetch(psUrl.toString(), {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    }),
  ]);

  let regJson = { dates: [] };
  let psJson = { dates: [] };
  try {
    if (regRes && regRes.ok) regJson = await regRes.json();
  } catch {
    regJson = { dates: [] };
  }
  try {
    if (psRes && psRes.ok) psJson = await psRes.json();
  } catch {
    psJson = { dates: [] };
  }

  const regDates = Array.isArray(regJson?.dates) ? regJson.dates : [];
  const psDates = Array.isArray(psJson?.dates) ? psJson.dates : [];
  return mergeAndGroupGames(regDates, psDates, today);
}
