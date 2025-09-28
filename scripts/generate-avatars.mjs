import { promises as fs } from "fs";
import path from "path";
import { Resvg } from "@resvg/resvg-js";
import { pickPreferredThenBW } from "../src/lib/color.mjs";

const ROOT = path.resolve(process.cwd());
const TEAMS_PATH = path.join(ROOT, "src", "data", "teams.json");
const OUT_DIR = path.join(ROOT, "public", "avatar");

function escapeXml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function createAvatarSvg({ backgroundColor, textColor, size, glyph }) {
  const width = size;
  const height = size;
  const centerX = width / 2;
  const centerY = height / 2;
  const fontFamily = "system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Helvetica Neue, Arial, sans-serif";
  const fontSize = Math.round(size * 0.85);

  const safeGlyph = escapeXml(glyph);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <style>
      .glyph { fill: ${textColor}; font-family: ${fontFamily}; font-weight: 800; font-size: ${fontSize}px; }
    </style>
  </defs>
  <rect width="100%" height="100%" fill="${backgroundColor}" />
  <g text-anchor="middle">
    <text class="glyph" x="${centerX}" y="${centerY}" dominant-baseline="central" alignment-baseline="central">${safeGlyph}</text>
  </g>
</svg>`;
}

async function renderAvatarPng({ backgroundColor, textColor, size = 512, glyph = "?" }) {
  const svg = createAvatarSvg({ backgroundColor, textColor, size, glyph });
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: size },
    font: { loadSystemFonts: true },
    background: backgroundColor,
  });
  const pngData = resvg.render();
  return pngData.asPng();
}

async function main() {
  const teams = JSON.parse(await fs.readFile(TEAMS_PATH, "utf8"));
  await fs.mkdir(OUT_DIR, { recursive: true });

  for (const team of teams) {
    const slug = team?.slug;
    if (!slug) continue;
    const colors = Array.isArray(team.colors) ? team.colors : [];
    const bg = (colors[0] ?? "#000000").toString();
    const preferred = (colors[1] ?? "#ffffff").toString();
    const picked = pickPreferredThenBW({ background: bg, preferred, level: "AA", textType: "large" });
    const fg = picked.color ?? preferred;

    try {
      const png = await renderAvatarPng({ backgroundColor: bg, textColor: fg, size: 512, glyph: "?" });
      const outPath = path.join(OUT_DIR, `${slug}.png`);
      await fs.writeFile(outPath, png);
      console.log(`Avatar generated: ${outPath}`);
    } catch (err) {
      console.error(`Failed to generate avatar for ${team?.name ?? slug}:`, err);
    }
  }
}

main().catch((err) => {
  console.error("Failed to generate avatars:", err);
  process.exit(1);
});


