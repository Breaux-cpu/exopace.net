export async function onRequest(context) {
  const z = Number(context.params.z);
  const x = Number(context.params.x);
  const y = Number(context.params.y);
  const limit = 2 ** z;
  if (!Number.isInteger(z) || !Number.isInteger(x) || !Number.isInteger(y) || z < 0 || z > 15 || x < 0 || y < 0 || x >= limit || y >= limit) {
    return new Response("bad tile", { status: 400 });
  }
  const upstream = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/" + z + "/" + x + "/" + y + ".png";
  const res = await fetch(upstream, { headers: { "user-agent": "exopace.net" } });
  if (!res.ok) return new Response("no tile", { status: 404 });
  return new Response(res.body, {
    headers: {
      "content-type": "image/png",
      "cache-control": "public, max-age=86400",
    },
  });
}
