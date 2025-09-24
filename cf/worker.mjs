// Avoid ESM import assertion to keep ESLint happy; workers bundler will inline this
import teams from "../src/data/teams.json";

function textResponse(body, init = {}) {
  return new Response(body, {
    headers: { "content-type": "text/plain; charset=utf-8" },
    ...init,
  });
}

function notFound(message = "Not found") {
  return textResponse(message, { status: 404 });
}

function badRequest(message = "Bad request") {
  return textResponse(message, { status: 400 });
}

function getSlugFromHost(hostname) {
  const suffix = ".homegame.today";
  if (!hostname.endsWith(suffix)) return null;
  const sub = hostname.slice(0, -suffix.length);
  if (!sub) return null;
  return sub.toLowerCase();
}

function getSlugFromResource(resource) {
  if (!resource) return null;
  const m = /^acct:([^@]+)@homegame\.today$/i.exec(resource);
  return m ? m[1].toLowerCase() : null;
}

function buildBridgyResource(slug) {
  return `acct:${slug}.homegame.today@bsky.brid.gy`;
}

function redirectToBridgy(kind, slug) {
  const bridgyUrl = new URL(`https://bsky.brid.gy/.well-known/${kind}`);
  bridgyUrl.searchParams.set("resource", buildBridgyResource(slug));
  return Response.redirect(bridgyUrl.toString(), 302);
}

function findTeamBySlug(slug) {
  try {
    return teams.find((t) => (t?.slug || "").toLowerCase() === slug);
  } catch {
    return undefined;
  }
}

async function handleAtprotoDid(hostname) {
  const slug = getSlugFromHost(hostname);
  if (!slug) return notFound("Subdomain required");
  const team = findTeamBySlug(slug);
  const did = team?.did;
  if (!did) return notFound("Unknown handle");
  return textResponse(`did=${did}`);
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const { hostname, pathname } = url;

    // AT Proto handle verification on team subdomains
    if (pathname === "/.well-known/atproto-did") {
      return handleAtprotoDid(hostname);
    }

    // Redirect team subdomain root to canonical apex path, preserve query
    // e.g., https://cubs.homegame.today/ -> https://homegame.today/cubs
    if (hostname.endsWith(".homegame.today") && hostname !== "homegame.today") {
      const isWellKnown = pathname.startsWith("/.well-known/");
      if (!isWellKnown && (pathname === "/" || pathname === "")) {
        const slug = getSlugFromHost(hostname);
        if (slug) {
          const redirectTo = new URL(`https://homegame.today/${slug}${url.search}`);
          return Response.redirect(redirectTo.toString(), 301);
        }
      }
    }

    // Host-meta and WebFinger only on apex
    if (hostname === "homegame.today") {
      if (pathname === "/.well-known/host-meta" || pathname === "/.well-known/host-meta.json") {
        const slug = getSlugFromResource(url.searchParams.get("resource"));
        if (!slug) return badRequest("Missing resource");
        const team = findTeamBySlug(slug);
        const did = team?.did;
        if (did) return redirectToBridgy("host-meta", slug);
        return notFound("Unknown account");
      }
      if (pathname === "/.well-known/webfinger") {
        const slug = getSlugFromResource(url.searchParams.get("resource"));
        if (!slug) return badRequest("Missing resource");
        const team = findTeamBySlug(slug);
        const did = team?.did;
        if (did) return redirectToBridgy("webfinger", slug);
        return notFound("Unknown account");
      }
    }

    return notFound();
  },
};
