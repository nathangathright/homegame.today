import { AtpAgent } from "@atproto/api";
import fs from "node:fs/promises";
import path from "node:path";

async function readTeams() {
  const teamsJsonPath = path.resolve(process.cwd(), "src/data/teams.json");
  const fileContents = await fs.readFile(teamsJsonPath, "utf8");
  return JSON.parse(fileContents);
}

async function fetchTodaySchedule(teamId) {
  const apiUrl = new URL("https://statsapi.mlb.com/api/v1/schedule");
  apiUrl.searchParams.set("sportId", "1");
  apiUrl.searchParams.set("teamId", String(teamId));
  const res = await fetch(apiUrl.toString(), { headers: { accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`MLB API error ${res.status}`);
  }
  return res.json();
}

function computeStatusForTeam(team, apiData) {
  const dates = Array.isArray(apiData?.dates) ? apiData.dates : [];
  const games = dates.flatMap((d) => Array.isArray(d?.games) ? d.games : []);
  const homeGames = games.filter((g) => g?.teams?.home?.team?.id === team?.id);
  const awayGames = games.filter((g) => g?.teams?.away?.team?.id === team?.id);
  const hasHomeGame = homeGames.length > 0;
  const hasAwayGame = awayGames.length > 0;
  const venueName = team?.venue || undefined;

  let text;
  if (hasHomeGame) {
    text = `${team.name} — Home game today${venueName ? ` at ${venueName}` : ""}.`;
  } else if (hasAwayGame) {
    text = `${team.name} — No home game today.`;
  } else {
    text = `${team.name} — No game today.`;
  }
  return text;
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const teams = await readTeams();

  for (const team of teams) {
    const slug = String(team?.slug || "");
    if (!slug) {
      continue;
    }
    const envKey = `BLUESKY_PASSWORD_${slug.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;
    const password = process.env[envKey];
    if (!password) {
      console.warn(`Skipping ${team.name} (${slug}) — missing env ${envKey}.`);
      continue;
    }
    const identifier = `${slug}.homegame.today`;

    const agent = new AtpAgent({ service: "https://bsky.social" });
    try {
      await agent.login({ identifier, password });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error(`Login failed for ${identifier}: ${message}`);
      continue;
    }

    try {
      const data = await fetchTodaySchedule(team.id);
      const text = computeStatusForTeam(team, data);

      const nowIso = new Date().toISOString();
      await agent.com.atproto.repo.createRecord({
        repo: agent.session?.did ?? identifier,
        collection: "app.bsky.feed.post",
        record: {
          $type: "app.bsky.feed.post",
          text,
          createdAt: nowIso,
        },
      });

      console.log(`Posted for ${team.name}: ${text}`);
      await sleep(750);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Failed to post for ${team?.name ?? team?.id}: ${message}`);
    }
  }
}

main().catch((e) => {
  const message = e instanceof Error ? e.message : String(e);
  console.error(message);
  process.exit(1);
});