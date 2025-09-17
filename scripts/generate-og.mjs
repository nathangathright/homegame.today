import { promises as fs } from "fs";
import path from "path";
import { Resvg } from "@resvg/resvg-js";

const ROOT = path.resolve(process.cwd());
const TEAMS_PATH = path.join(ROOT, "src", "data", "teams.json");
const args = process.argv.slice(2);
let OUT_DIR = path.join(ROOT, "public", "og");
for (const arg of args) {
  if (arg.startsWith("--out=")) {
    const dir = arg.slice("--out=".length);
    OUT_DIR = path.isAbsolute(dir) ? dir : path.join(ROOT, dir);
  }
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
  const words = String(text).trim().split(/\s+/);
  const averageGlyphWidth = fontSize * 0.55; // heuristic average
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

  // If any single word exceeds charsPerLine drastically, hard-break it
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

function createSvg({ lines, backgroundColor, fontSize }) {
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
  const maxWidthPx = 1000; // keep good side paddings
  let fontSize = 112;
  let wrapped;
  const maxLines = 3;

  for (let i = 0; i < 8; i++) {
    wrapped = wrapTextToLines(text, fontSize, maxWidthPx, maxLines);
    if (!wrapped.overflow) break;
    fontSize = Math.max(72, fontSize - 8);
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

  const promises = teams.map(async (team) => {
    const slug = team.slug;
    const primaryColor = (team.colors?.[0] ?? "#000000").toString();
    const venue = team.venue ?? "their stadium";
    const text = `Are the ${team.name} playing at ${venue} today?`;
    const png = await renderOgPng({ text, backgroundColor: primaryColor });
    const outPath = path.join(OUT_DIR, `${slug}.png`);
    await fs.writeFile(outPath, png);
    return outPath;
  });

  // Generate homepage OG image
  const siteText = "HomeGame.today";
  const sitePng = await renderOgPng({ text: siteText, backgroundColor: "#000000" });
  const siteOut = path.join(OUT_DIR, `site.png`);
  await fs.writeFile(siteOut, sitePng);

  const outputs = await Promise.all(promises);
  console.log(`Generated ${outputs.length} team OG images and 1 site OG image in ${OUT_DIR}`);
}

main().catch((err) => {
  console.error("Failed to generate OG images:", err);
  process.exit(1);
});


