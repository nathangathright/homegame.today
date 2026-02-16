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
  async fetch(request, env) {
    const url = new URL(request.url);
    const fwdHost = request.headers.get("x-forwarded-host");
    const hostHeader = request.headers.get("host");
    const hostValue = fwdHost && fwdHost.length > 0 ? fwdHost : hostHeader;
    const hostname = (hostValue ? hostValue.split(":")[0] : url.hostname) || url.hostname;
    const { pathname } = url;

    // AT Proto handle verification on team subdomains
    if (pathname === "/.well-known/atproto-did") {
      return handleAtprotoDid(hostname);
    }

    const isSubdomain = hostname.endsWith(".homegame.today") && hostname !== "homegame.today";

    // --- Subdomain requests (e.g. cubs.homegame.today) ---
    if (isSubdomain) {
      const slug = getSlugFromHost(hostname);

      // Root → rewrite to /slug/ and serve from static assets
      if (pathname === "/" || pathname === "") {
        if (slug) {
          const rewritten = new URL(`/${slug}/`, url.origin);
          return env.ASSETS.fetch(new Request(rewritten, request));
        }
      }

      // Everything else on subdomains (CSS, JS, images, og, api) → pass through to assets
      return env.ASSETS.fetch(request);
    }

    // --- Apex requests (homegame.today) ---

    // Host-meta and WebFinger on apex
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

    // Redirect /team-slug paths to subdomains
    const pathSlug = pathname.replace(/^\/|\/$/g, "");
    if (pathSlug && findTeamBySlug(pathSlug)) {
      const redirectTo = `https://${pathSlug}.homegame.today/${url.search}`;
      return Response.redirect(redirectTo, 301);
    }

    // Everything else on apex (homepage, static files, API) → pass through to assets
    return env.ASSETS.fetch(request);
  },
};
