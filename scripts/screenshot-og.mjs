import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs/promises";
import fssync from "node:fs";
import path from "node:path";

const ROOT = path.resolve(process.cwd());
const DIST_DIR = path.join(ROOT, "dist");
const TEAMS_PATH = path.join(ROOT, "src", "data", "teams.json");

const args = process.argv.slice(2);
const argMap = new Map(
  args
    .filter((a) => a.includes("="))
    .map((a) => {
      const [k, ...rest] = a.split("=");
      return [k.replace(/^--/, ""), rest.join("=")];
    })
);

const BASE = argMap.get("base") || ""; // e.g. http://localhost:4321
let OUT_DIR = argMap.get("out") || path.join(ROOT, "dist", "og");
const ONLY_SLUG = argMap.get("slug") || "";
const VIEWPORT_W = Number(argMap.get("width") || 1200);
const VIEWPORT_H = Number(argMap.get("height") || 630);
const DELAY_MS = Number(argMap.get("delay") || 250);

const MIME = new Map(
  Object.entries({
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".txt": "text/plain; charset=utf-8",
  })
);

function guessMime(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME.get(ext) || "application/octet-stream";
}

function createStaticServer(rootDir) {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", "http://localhost");
      let filePath = path.join(rootDir, decodeURIComponent(url.pathname));
      if (filePath.endsWith("/")) filePath = path.join(filePath, "index.html");

      let stat = null;
      try {
        stat = await fs.stat(filePath);
      } catch {}

      if (!stat || stat.isDirectory()) {
        res.statusCode = 404;
        res.end("Not Found");
        return;
      }

      res.setHeader("Content-Type", guessMime(filePath));
      fssync.createReadStream(filePath).pipe(res);
    } catch (e) {
      res.statusCode = 500;
      res.end("Internal Server Error");
    }
  });
  return server;
}

function dateKeyInZone(d, timeZone) {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  } catch {
    return new Date(d).toISOString().slice(0, 10);
  }
}

async function main() {
  const teams = JSON.parse(await fs.readFile(TEAMS_PATH, "utf8"));
  OUT_DIR = path.isAbsolute(OUT_DIR) ? OUT_DIR : path.join(ROOT, OUT_DIR);
  await fs.mkdir(OUT_DIR, { recursive: true });

  let baseUrl = BASE;
  let server = null;
  if (!baseUrl) {
    // Serve built site from dist if no base provided
    server = createStaticServer(DIST_DIR);
    await new Promise((resolve) => server.listen(4173, resolve));
    baseUrl = "http://127.0.0.1:4173";
  }

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: VIEWPORT_W, height: VIEWPORT_H }, deviceScaleFactor: 1 });

  try {
    for (const team of teams) {
      const slug = team?.slug;
      if (!slug) continue;
      if (ONLY_SLUG && slug !== ONLY_SLUG) continue;
      const tz = team?.timezone;
      const todayKey = dateKeyInZone(new Date(), tz);
      const url = `${baseUrl}/${slug}`;
      const page = await context.newPage();
      await page.goto(url, { waitUntil: "networkidle" });
      await page.waitForTimeout(DELAY_MS);
      const outPath = path.join(OUT_DIR, `${slug}-${todayKey}.png`);
      await page.screenshot({ path: outPath });
      await page.close();
      console.log(`OG screenshot: ${outPath}`);
    }
  } finally {
    await browser.close();
    if (server) await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((err) => {
  console.error("screenshot-og failed:", err);
  process.exit(1);
});
