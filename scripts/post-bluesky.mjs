import { AtpAgent, RichText } from "@atproto/api";
import fs from "node:fs/promises";
import path from "node:path";
import { fetchLeagueScheduleToday, fetchScheduleWindow, computeStatusForTeam, dateKeyInZone, computeWindowStartEnd } from "../src/lib/mlb.mjs";
if (process.env.CI !== "true" && process.env.GITHUB_ACTIONS !== "true") {
  await import("dotenv/config");
}

async function readTeams() {
  const teamsJsonPath = path.resolve(process.cwd(), "src/data/teams.json");
  const fileContents = await fs.readFile(teamsJsonPath, "utf8");
  return JSON.parse(fileContents);
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchLatestPost(agent, did) {
  if (!did) return null;
  try {
    const res = await agent.com.atproto.repo.listRecords({
      repo: did,
      collection: "app.bsky.feed.post",
      limit: 1,
      reverse: true,
    });
    const rec = Array.isArray(res?.records) && res.records.length > 0 ? res.records[0] : null;
    return rec || null;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.warn(`Unable to fetch latest post for ${did}: ${message}`);
    return null;
  }
}

async function main() {
  // Off-season/no-games guard: skip entirely if MLB has zero games today
  try {
    const leagueData = await fetchLeagueScheduleToday();
    const leagueDates = Array.isArray(leagueData?.dates) ? leagueData.dates : [];
    const leagueGames = leagueDates.flatMap((d) => Array.isArray(d?.games) ? d.games : []);
    if (leagueGames.length === 0) {
      console.log("No MLB games today — skipping Bluesky posts.");
      return;
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.warn(`Unable to verify league schedule; continuing: ${message}`);
  }

  const teams = await readTeams();
  let attemptedCount = 0; // teams with a configured password
  let successCount = 0;   // posts that succeeded

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
    attemptedCount += 1;
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
      const { startIso, endIso } = computeWindowStartEnd(new Date());
      const data = await fetchScheduleWindow(team.id, startIso, endIso);
      const text = computeStatusForTeam(team, data);
      const pageUrl = `https://homegame.today/${slug}`;
      const postText = text;
      const embed = {
        $type: "app.bsky.embed.external",
        external: {
          uri: pageUrl,
          title: team.name,
          description: text,
        },
      };

      // Try to attach the day's OG image as the card thumbnail
      try {
        const todayKey = dateKeyInZone(new Date(), team?.timezone);
        const ogPath = path.resolve(process.cwd(), "dist", "og", `${slug}-${todayKey}.png`);
        const bytes = await fs.readFile(ogPath);
        const upload = await agent.com.atproto.repo.uploadBlob(bytes, { encoding: "image/png" });
        const thumb = upload?.data?.blob ?? upload?.blob;
        if (thumb) {
          embed.external.thumb = thumb;
        }
      } catch (e) {
        // If thumb upload fails or file missing, proceed without a thumbnail
        const message = e instanceof Error ? e.message : String(e);
        console.warn(`OG thumb unavailable for ${team.name} (${slug}): ${message}`);
      }

      // Skip if already posted today (team local date), or if duplicate of latest
      const latest = await fetchLatestPost(agent, agent.session?.did ?? identifier);
      const teamTimeZone = team?.timezone;
      if (latest?.value?.createdAt) {
        const lastDateKey = getLocalDateKey(new Date(latest.value.createdAt), teamTimeZone);
        const nowDateKey = getLocalDateKey(new Date(), teamTimeZone);
        if (lastDateKey === nowDateKey) {
          console.log(`Already posted today for ${team.name} (${slug}) — skipping.`);
          continue;
        }
      }
      if (latest?.value?.text && latest.value.text === postText) {
        console.log(`Duplicate text for ${team.name} (${slug}) — skipping.`);
        continue;
      }

      // Build rich-text facets to hyperlink the team name (and the URL if present)
      const encoder = new TextEncoder();
      function utf8IndexFromUtf16(str, utf16Index) {
        return encoder.encode(str.slice(0, utf16Index)).length;
      }
      const facets = [];
      // Link the team name at the start of the post
      const nameUtf8Start = 0;
      const nameUtf8End = utf8IndexFromUtf16(postText, team.name.length);
      facets.push({
        index: { byteStart: nameUtf8Start, byteEnd: nameUtf8End },
        features: [
          {
            $type: "app.bsky.richtext.facet#link",
            uri: pageUrl,
          },
        ],
      });
      // Also link the raw URL line if present in the text
      const urlStart16 = postText.indexOf(pageUrl);
      if (urlStart16 >= 0) {
        const urlUtf8Start = utf8IndexFromUtf16(postText, urlStart16);
        const urlUtf8End = urlUtf8Start + encoder.encode(pageUrl).length;
        facets.push({
          index: { byteStart: urlUtf8Start, byteEnd: urlUtf8End },
          features: [
            {
              $type: "app.bsky.richtext.facet#link",
              uri: pageUrl,
            },
          ],
        });
      }

      const nowIso = new Date().toISOString();
      await agent.com.atproto.repo.createRecord({
        repo: agent.session?.did ?? identifier,
        collection: "app.bsky.feed.post",
        record: {
          $type: "app.bsky.feed.post",
          text: postText,
          embed,
          facets,
          createdAt: nowIso,
        },
      });

      console.log(`Posted for ${team.name}: ${postText}`);
      successCount += 1;
      await sleep(750);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Failed to post for ${team?.name ?? team?.id}: ${message}`);
    }
  }

  // Only fail when explicitly required. Otherwise, skip gracefully.
  const requireSuccess = process.env.REQUIRE_POST_SUCCESS === "true";
  if (attemptedCount === 0) {
    console.log("No Bluesky passwords provided; skipping Bluesky posts.");
    return;
  }
  if (successCount === 0 && requireSuccess) {
    throw new Error("Bluesky post failed for all configured teams.");
  }
}

main().catch((e) => {
  const message = e instanceof Error ? e.message : String(e);
  console.error(message);
  process.exit(1);
});