// NBA adapter — thin wrapper around ESPN shared fetcher
import { fetchEspnScoreboard } from "./espn.mjs";
import { dateKeyInZone } from "./shared.mjs";

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

export async function fetchScheduleWindow(team, startDateIso, endDateIso) {
  // ESPN doesn't have a season-long schedule endpoint like MLB/NHL.
  // Fetch day-by-day for a reasonable window around today.
  const start = startDateIso ? new Date(startDateIso) : new Date();
  const end = endDateIso ? new Date(endDateIso) : new Date();

  // Limit to ~14 days to avoid excessive API calls
  const maxDays = 14;
  const diffDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  const days = Math.min(diffDays, maxDays);

  const teamApiId = team.apiId;
  const allGames = [];

  for (let i = 0; i <= days; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const dateKey = d.toISOString().slice(0, 10).replace(/-/g, "");
    const dayGames = await fetchEspnScoreboard("basketball", "nba", dateKey);
    // Filter to games involving this team
    const teamGames = dayGames.filter(
      (g) => g.homeTeam?.id === teamApiId || g.awayTeam?.id === teamApiId
    );
    allGames.push(...teamGames);
  }

  return groupGamesByDate(allGames);
}

export async function fetchLeagueScheduleToday() {
  const today = dateKeyInZone(new Date(), "America/New_York");
  const dateKey = today.replace(/-/g, "");
  const games = await fetchEspnScoreboard("basketball", "nba", dateKey);
  return groupGamesByDate(games, today);
}
