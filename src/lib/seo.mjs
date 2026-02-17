// SEO helpers (JSON-LD builders)

/**
 * Build SportsEvent JSON-LD for a team's selected game.
 * @param {object} params
 * @param {object} params.team - Team object from teams.json
 * @param {object|undefined} params.selectedGame - MLB API game object
 * @param {boolean} params.isHome - Whether team is the home team for selectedGame
 * @param {string|undefined} params.fallbackDateIso - ISO date (YYYY-MM-DD) if no gameDate exists
 * @returns {object|null}
 */
export function buildSportsEventJsonLd({ team, selectedGame, isHome, fallbackDateIso }) {
  if (!team || !selectedGame) return null;
  const teamName = team?.name || "Team";
  const opponentName = isHome
    ? selectedGame?.teams?.away?.team?.name
    : selectedGame?.teams?.home?.team?.name;

  const gameStartIso =
    selectedGame?.gameDate || (fallbackDateIso ? `${fallbackDateIso}T00:00:00Z` : undefined);
  if (!gameStartIso) return null;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    name: isHome
      ? `${teamName} vs ${opponentName ?? "Opponent"}`
      : `${opponentName ?? "Opponent"} vs ${teamName}`,
    sport: "Baseball",
    startDate: gameStartIso,
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    homeTeam: {
      "@type": "SportsTeam",
      name: isHome ? teamName : (selectedGame?.teams?.home?.team?.name ?? "Home Team"),
    },
    awayTeam: {
      "@type": "SportsTeam",
      name: isHome ? (selectedGame?.teams?.away?.team?.name ?? "Away Team") : teamName,
    },
  };
  if (isHome && team?.venue) {
    jsonLd.location = { "@type": "Place", name: team.venue };
  }
  return jsonLd;
}
