import teams from "../../../data/teams.json";

export const prerender = true;

export async function getStaticPaths() {
  return (teams as Array<{ slug: string; did?: string }> )
    .filter((t) => !!t.did)
    .map((t) => ({ params: { team: t.slug }, props: { did: t.did } }));
}

export function GET({ props }: { props: { did?: string } }) {
  const did = (props?.did ?? "").trim();
  if (!did) {
    return new Response("Not found", { status: 404 });
  }
  return new Response(did + "\n", {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
}


