import teams from "../../../data/teams.json";
import {
  dateKeyInZone,
  computeWindowStartEnd,
  fetchScheduleWindowCached,
  deriveTeamScheduleFacts,
  buildTeamPageMeta,
  getOgImagePath,
  getBlueskyProfileUrl,
  getBlueskyRssUrl,
  selectGameForTeamToday,
} from "../../../lib/schedule.mjs";
import { buildSportsEventJsonLd } from "../../../lib/seo.mjs";

export const prerender = true;

export async function getStaticPaths() {
  return teams.map((t: any) => ({ params: { slug: t.slug } }));
}

export async function GET({ params, site }: { params: { slug?: string }; site: URL | undefined }) {
  const slug = params?.slug || "";
  const team = (teams as any[]).find((t) => t.slug === slug);

  if (!team) {
    return new Response(JSON.stringify({ error: "Team not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const { startIso, endIso } = computeWindowStartEnd(new Date());
    const data = await fetchScheduleWindowCached(team, startIso, endIso);
    const facts = deriveTeamScheduleFacts(team, data);
    const meta = buildTeamPageMeta(team, data);

    const ogPath = getOgImagePath(slug, team?.timezone);
    const ogImage = site ? new URL(ogPath, site).toString() : ogPath;

    const { selectedGame, isHome } = selectGameForTeamToday(facts);
    const pageDateIso = dateKeyInZone(new Date(), team?.timezone);
    const jsonLd = buildSportsEventJsonLd({
      team,
      selectedGame,
      isHome,
      fallbackDateIso: pageDateIso,
    });

    const payload = {
      team: {
        id: team.id,
        name: team.name,
        slug: team.slug,
        colors: team.colors,
        venue: team.venue,
        timezone: team.timezone,
      },
      meta,
      ogImage,
      bluesky: {
        profile: getBlueskyProfileUrl(team),
        rss: getBlueskyRssUrl(team),
      },
      facts: {
        todayKey: facts.todayKey,
        hasHomeToday: Array.isArray(facts.homeGamesToday) && facts.homeGamesToday.length > 0,
        nextHomeGame: facts.nextHomeGame?.gameDate || null,
      },
      jsonLd,
    };

    return new Response(JSON.stringify(payload), {
      headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=300" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
