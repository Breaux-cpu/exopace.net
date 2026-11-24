const rooms = new Map();
const TTL = 15 * 60 * 1000;

function prune(now) {
  for (const [code, room] of rooms) {
    room.packets = room.packets.filter(function (row) { return now - row.at < TTL; });
    if (!room.packets.length && now - room.at > TTL) rooms.delete(code);
  }
}

export async function onRequest(context) {
  const request = context.request;
  const code = String(context.params.code || "").slice(0, 24);
  if (!/^[A-Za-z0-9_-]{4,24}$/.test(code)) return Response.json({ ok: false, error: "BAD ROOM" }, { status: 400 });
  const now = Date.now();
  prune(now);
  if (request.method === "GET") {
    const room = rooms.get(code);
    return Response.json({ ok: true, packets: room ? room.packets.map(function (row) { return row.cipher; }) : [] });
  }
  if (request.method !== "POST") return Response.json({ ok: false, error: "METHOD" }, { status: 405 });
  const body = await request.json().catch(function () { return null; });
  if (!body || !body.cipher || !body.iv || !body.salt) return Response.json({ ok: false, error: "CIPHER ONLY" }, { status: 400 });
  const room = rooms.get(code) || { at: now, packets: [] };
  room.packets.push({ at: now, cipher: { salt: String(body.salt).slice(0, 64), iv: String(body.iv).slice(0, 64), cipher: String(body.cipher).slice(0, 8000) } });
  room.packets = room.packets.slice(-40);
  rooms.set(code, room);
  return Response.json({ ok: true });
}
