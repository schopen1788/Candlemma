// Only the Pages Functions boundary uses this. Direct Pages requests continue to
// use Cloudflare's original CF-Connecting-IP. A cross-zone proxy must authenticate
// its client IP, method, path and browser-origin headers before replacing it.
export async function proxyRequest(request: Request, secret?: string, now = Date.now()): Promise<Request | Response> {
  const names = ["x-trevu-client-ip", "x-trevu-proxy-time", "x-trevu-proxy-signature"];
  if (!names.some(name => request.headers.has(name))) return request;
  const reject = () => new Response('{"error":"Invalid proxy context"}', {
    status: 403, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
  const [ip, time, signature] = names.map(name => request.headers.get(name) || "");
  if (!secret || !/^[0-9a-fA-F:.]{2,64}$/.test(ip) || !/^\d{13}$/.test(time)
    || Math.abs(now - Number(time)) > 60_000 || !/^[0-9a-f]{64}$/.test(signature)) return reject();
  const url = new URL(request.url);
  const payload = [time, request.method, url.pathname + url.search, request.headers.get("origin") || "",
    request.headers.get("sec-fetch-site") || "", ip].join("\n");
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const bytes = Uint8Array.from(signature.match(/../g)!, hex => parseInt(hex, 16));
  if (!await crypto.subtle.verify("HMAC", key, bytes, encoder.encode(payload))) return reject();
  const headers = new Headers(request.headers);
  headers.set("cf-connecting-ip", ip);
  names.forEach(name => headers.delete(name));
  return new Request(request, { headers });
}
