export async function onRequest() {
  return Response.json(
    { region: "World", ships: [] },
    {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "public, max-age=60",
        "access-control-allow-origin": "*",
      },
    },
  );
}
