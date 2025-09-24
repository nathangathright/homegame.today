// Avoid ESM import assertion to keep ESLint happy; workers bundler will inline this
import teams from "../src/data/teams.json";

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/jrd+json; charset=utf-8" },
    ...init,
  });
}

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

function buildActorUrlsForSlug(slug) {
  const handle = `${slug}.homegame.today`;
  const actorAp = `https://bsky.brid.gy/ap/@${handle}`;
  const profileBridgy = `https://bsky.brid.gy/@${handle}`;
  const profileHtml = `https://bsky.app/profile/${handle}`;
  const acctAlias = `acct:${handle}@bsky.brid.gy`;
  return { actorAp, profileBridgy, profileHtml, acctAlias };
}

async function handleHostMeta(origin) {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<XRD xmlns="http://docs.oasis-open.org/ns/xri/xrd-1.0">` +
    `<Link rel="lrdd" type="application/xrd+xml" template="${origin}/.well-known/webfinger?resource={uri}"/>` +
    `</XRD>`;
  return new Response(xml, {
    headers: { "content-type": "application/xrd+xml; charset=utf-8" },
  });
}

function findTeamBySlug(slug) {
  try {
    return teams.find((t) => (t?.slug || "").toLowerCase() === slug);
  } catch {
    return undefined;
  }
}

async function handleWebfinger(url) {
  const resource = url.searchParams.get("resource");
  if (!resource) return badRequest("Missing resource");

  // Accept acct:slug@homegame.today
  const acctMatch = /^acct:([^@]+)@homegame\.today$/i.exec(resource);
  if (!acctMatch) return notFound("Unsupported resource");
  const slug = acctMatch[1].toLowerCase();
  const team = findTeamBySlug(slug);
  const did = team?.did;
  if (!did) return notFound("Unknown account");

  const { actorAp, profileBridgy, profileHtml, acctAlias } = buildActorUrlsForSlug(slug);
  const body = {
    subject: `acct:${slug}@homegame.today`,
    aliases: [
      actorAp,
      profileBridgy,
      profileHtml,
      acctAlias,
    ],
    links: [
      { rel: "self", type: "application/activity+json", href: actorAp },
      { rel: "http://webfinger.net/rel/profile-page", type: "text/html", href: profileBridgy },
      { rel: "http://webfinger.net/rel/profile-page", type: "text/html", href: profileHtml },
    ],
  };
  return jsonResponse(body);
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
      if (pathname === "/.well-known/host-meta") {
        const origin = `https://${hostname}`;
        return handleHostMeta(origin);
      }
      if (pathname === "/.well-known/host-meta.json") {
        const origin = `https://${hostname}`;
        return jsonResponse({
          subject: origin,
          links: [
            {
              rel: "lrdd",
              type: "application/xrd+xml",
              template: `${origin}/.well-known/webfinger?resource={uri}`,
            },
          ],
        });
      }
      if (pathname === "/.well-known/webfinger") {
        if (request.method !== "GET") return badRequest("Only GET supported");
        return handleWebfinger(url);
      }
    }

    // AT Proto handle verification on team subdomains
    if (pathname === "/.well-known/atproto-did") {
      return handleAtprotoDid(hostname);
    }

    return notFound();
  },
};


