export async function pull(url, putQueue) {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      if (putQueue) await putQueue({ id: url, url, at: new Date().toISOString() });
      return { error: "FEED UNREACHABLE", status: res.status };
    }
    return { data: await res.json() };
  } catch (err) {
    if (putQueue) await putQueue({ id: url, url, at: new Date().toISOString() });
    return { error: "FEED UNREACHABLE" };
  }
}
