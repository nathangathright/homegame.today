import { promises as fs } from "fs";
import path from "path";
import { Resvg } from "@resvg/resvg-js";

const ROOT = path.resolve(process.cwd());
const TEAMS_PATH = path.join(ROOT, "src", "data", "teams.json");
const args = process.argv.slice(2);
let OUT_DIR = path.join(ROOT, "dist", "og");
for (const arg of args) {
  if (arg.startsWith("--out=")) {
    const dir = arg.slice("--out=".length);
    OUT_DIR = path.isAbsolute(dir) ? dir : path.join(ROOT, dir);
  }
}

function dateKeyInZone(d, timeZone) {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  } catch {
    return new Date(d).toISOString().slice(0, 10);
  }
}

async function fetchScheduleWindow(teamId, startDateIso, endDateIso) {
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

function computeOgText(team, apiData) {
  const dates = Array.isArray(apiData?.dates) ? apiData.dates : [];
  const games = dates.flatMap((d) => Array.isArray(d?.games) ? d.games : []);
  const teamTimeZone = team?.timezone;
  const todayKey = dateKeyInZone(new Date(), teamTimeZone);

  const gamesToday = games.filter((g) => {
    const iso = g?.gameDate ? dateKeyInZone(new Date(g.gameDate), teamTimeZone) : undefined;
    return iso === todayKey;
  });

  const homeGamesToday = gamesToday.filter((g) => g?.teams?.home?.team?.id === team?.id);
  const venueName = team?.venue || "their stadium";

  if (homeGamesToday.length > 0) {
    const dtIso = homeGamesToday[0]?.gameDate;
    if (dtIso) {
      const dt = new Date(dtIso);
      const timePart = dt.toLocaleTimeString(undefined, { timeStyle: "short", timeZone: teamTimeZone });
      return `Yes, today’s game at ${venueName} is scheduled for ${timePart}.`;
    }
    return `Yes, today’s game at ${venueName} is scheduled.`;
  }

  // Find next upcoming home game (including later today)
  const nowTs = Date.now();
  const upcomingHomeGames = games
    .filter((g) => g?.teams?.home?.team?.id === team?.id && g?.gameDate)
    .sort((a, b) => new Date(a.gameDate).getTime() - new Date(b.gameDate).getTime());
  const nextHome = upcomingHomeGames.find((g) => new Date(g.gameDate).getTime() >= nowTs);
  if (nextHome?.gameDate) {
    const dt = new Date(nextHome.gameDate);
    const datePart = dt.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: teamTimeZone }).replace(/ /g, "\u00A0");
    const timePart = dt.toLocaleTimeString(undefined, { timeStyle: "short", timeZone: teamTimeZone }).replace(/ /g, "\u00A0");
    return `No, the next game at ${venueName} is scheduled for ${datePart} at\u00A0${timePart}.`;
  }
  return `No, next game at ${venueName} is not yet scheduled.`;
}

function escapeXml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function wrapTextToLines(text, fontSize, maxWidthPx, maxLines) {
  // Split on regular ASCII whitespace only to preserve non-breaking spaces (\u00A0)
  const words = String(text).trim().split(/[ \t\r\n\f\v]+/);
  const averageGlyphWidth = fontSize * 0.55;
  const charsPerLine = Math.max(8, Math.floor(maxWidthPx / averageGlyphWidth));

  const lines = [];
  let current = "";
  for (const word of words) {
    if (!current) {
      current = word;
      continue;
    }
    const tentative = current + " " + word;
    if (tentative.length <= charsPerLine) {
      current = tentative;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].length > charsPerLine * 1.5) {
      const str = lines[i];
      const chunks = [];
      for (let p = 0; p < str.length; p += charsPerLine) {
        chunks.push(str.slice(p, p + charsPerLine));
      }
      lines.splice(i, 1, ...chunks);
      i += chunks.length - 1;
    }
  }

  if (lines.length > maxLines) {
    return { lines, overflow: true };
  }
  return { lines, overflow: false };
}

function createSvg({ lines, backgroundColor, fontSize, teamName }) {
  const width = 1200;
  const height = 630;
  const centerX = width / 2;
  const centerY = height / 2;
  const fontFamily = "Inter, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Helvetica Neue, Arial, sans-serif";
  const lineHeight = Math.round(fontSize * 1.2);
  const safeLines = lines.map(escapeXml);

  const texts = safeLines
    .map((line, idx) => {
      const offset = (idx - (safeLines.length - 1) / 2) * lineHeight;
      const y = centerY + offset;
      return `<text class="title" x="${centerX}" y="${y}" dominant-baseline="middle">${line}</text>`;
    })
    .join("\n    ");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <style>
      .title { fill: #ffffff; font-family: ${fontFamily}; font-weight: 800; font-size: ${fontSize}px; }
    </style>
  </defs>
  <rect width="100%" height="100%" fill="${backgroundColor}" />
  <g text-anchor="middle">
    ${texts}
  </g>
</svg>`;
}

async function renderOgPng({ text, backgroundColor }) {
  const maxWidthPx = 1000;
  let fontSize = 96;
  let wrapped;
  const maxLines = 3;

  for (let i = 0; i < 8; i++) {
    wrapped = wrapTextToLines(text, fontSize, maxWidthPx, maxLines);
    if (!wrapped.overflow) break;
    fontSize = Math.max(64, fontSize - 6);
  }

  const svg = createSvg({ lines: wrapped.lines, backgroundColor, fontSize });
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: 1200 },
    font: { loadSystemFonts: true },
    background: backgroundColor,
  });
  const pngData = resvg.render();
  return pngData.asPng();
}

async function main() {
  const teams = JSON.parse(await fs.readFile(TEAMS_PATH, "utf8"));
  await fs.mkdir(OUT_DIR, { recursive: true });

  const startIso = new Date().toISOString().slice(0, 10);
  const end = new Date();
  end.setDate(end.getDate() + 90);
  const endIso = end.toISOString().slice(0, 10);

  for (const team of teams) {
    const slug = team?.slug;
    if (!slug) continue;
    const primaryColor = (team.colors?.[0] ?? "#000000").toString();

    try {
      const apiData = await fetchScheduleWindow(team.id, startIso, endIso);
      const text = computeOgText(team, apiData);
      const todayKey = dateKeyInZone(new Date(), team?.timezone);
      const outPath = path.join(OUT_DIR, `${slug}-${todayKey}.png`);
      const png = await renderOgPng({ text, backgroundColor: primaryColor });
      await fs.writeFile(outPath, png);
      console.log(`Daily OG generated: ${outPath}`);
    } catch (err) {
      console.error(`Failed to generate daily OG for ${team?.name ?? slug}:`, err);
    }
  }
}

main().catch((err) => {
  console.error("Failed to generate daily OG images:", err);
  process.exit(1);
});
