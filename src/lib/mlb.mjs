// Shared MLB helpers for schedule fetching and formatting

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

export function computeOgText(team, apiData) {
  const { games, teamTimeZone, todayKey } = deriveTeamScheduleFacts(team, apiData);
  const gamesToday = games.filter((g) => {
    const iso = g?.gameDate ? dateKeyInZone(new Date(g.gameDate), teamTimeZone) : undefined;
    return iso === todayKey;
  });
  const homeGamesToday = gamesToday.filter((g) => g?.teams?.home?.team?.id === team?.id);
  const venueName = team?.venue || "their stadium";

  if (homeGamesToday.length > 0) {
    const { timePart, timeCertain } = getLocalDateAndOptionalTime(homeGamesToday[0], teamTimeZone, { timeStyle: "short" });
    return timeCertain && timePart
      ? `Yes, today’s game at ${venueName} is scheduled for ${String(timePart).replace(/ /g, "\u00A0")}.`
      : `Yes, today’s game at ${venueName} is scheduled.`;
  }

  const nowTs = Date.now();
  const upcomingHomeGames = games
    .filter((g) => g?.teams?.home?.team?.id === team?.id && g?.gameDate)
    .sort((a, b) => new Date(a.gameDate).getTime() - new Date(b.gameDate).getTime());
  const nextHome = upcomingHomeGames.find((g) => new Date(g.gameDate).getTime() >= nowTs);
  if (nextHome?.gameDate) {
    const { datePart, timePart, timeCertain } = getLocalDateAndOptionalTime(nextHome, teamTimeZone, { dateStyle: "medium", timeStyle: "short" });
    const safeDate = String(datePart).replace(/ /g, "\u00A0");
    if (timeCertain && timePart) {
      const safeTime = String(timePart).replace(/ /g, "\u00A0");
      return `No, the next game at ${venueName} is scheduled for ${safeDate} at\u00A0${safeTime}.`;
    }
    return `No, the next game at ${venueName} is scheduled for ${safeDate}.`;
  }
  return `No, the next game at ${venueName} is not yet scheduled.`;
}

export function computeStatusForTeam(team, apiData) {
  const dates = Array.isArray(apiData?.dates) ? apiData.dates : [];
  const games = dates.flatMap((d) => Array.isArray(d?.games) ? d.games : []);
  const todayIso = new Date().toISOString().slice(0, 10);
  const gamesToday = games.filter((g) => {
    const iso = g?.gameDate ? new Date(g.gameDate).toISOString().slice(0, 10) : undefined;
    return iso === todayIso;
  });
  const homeGamesToday = gamesToday.filter((g) => g?.teams?.home?.team?.id === team?.id);

  const venueName = team?.venue || undefined;
  const teamTimeZone = team?.timezone;

  let text;
  if (homeGamesToday.length > 0) {
    const { timePart, timeCertain } = getLocalDateAndOptionalTime(homeGamesToday[0], teamTimeZone, { timeStyle: "short" });
    text = timeCertain && timePart
      ? `${team.name} — Yes, today’s game at ${venueName ?? "their stadium"} is scheduled for ${timePart}.`
      : `${team.name} — Yes, there’s a game at ${venueName ?? "their stadium"} scheduled for today.`;
  } else {
    const nowTs = Date.now();
    const upcomingHomeGames = games
      .filter((g) => g?.teams?.home?.team?.id === team?.id && g?.gameDate)
      .sort((a, b) => new Date(a.gameDate).getTime() - new Date(b.gameDate).getTime());
    const nextHome = upcomingHomeGames.find((g) => new Date(g.gameDate).getTime() >= nowTs);
    if (nextHome?.gameDate) {
      const { datePart, timePart, timeCertain } = getLocalDateAndOptionalTime(nextHome, teamTimeZone, { dateStyle: "medium", timeStyle: "short" });
      text = timeCertain && timePart
        ? `${team.name} — No, the next game at ${venueName ?? "their stadium"} is scheduled for ${datePart} at ${timePart}.`
        : `${team.name} — No, the next game at ${venueName ?? "their stadium"} is scheduled for ${datePart}.`;
    } else {
      text = `${team.name} — No, the next game at ${venueName ?? "their stadium"} is not yet scheduled.`;
    }
  }
  return text;
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


