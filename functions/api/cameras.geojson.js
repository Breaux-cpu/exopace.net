export async function onRequest() {
  return Response.json(
    { type: "FeatureCollection", features: [] },
    {
      headers: {
        "content-type": "application/geo+json; charset=utf-8",
        "cache-control": "public, max-age=300",
        "access-control-allow-origin": "*",
      },
    },
  );
}
