// 문제 열람 토큰: 무작위 id + HMAC 서명. 서버 DB(opens)에 1회용으로 기록된다.
const enc = new TextEncoder();

function b64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function key(secret: string) {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}

async function sign(secret: string, data: string) {
  return b64url(await crypto.subtle.sign("HMAC", await key(secret), enc.encode(data)));
}

export async function makeToken(secret: string, puzzleId: string): Promise<string> {
  const id = b64url(crypto.getRandomValues(new Uint8Array(18)));
  return `${id}.${await sign(secret, `${id}|${puzzleId}`)}`;
}

/** 서명 검증. 토큰이 가리키는 puzzleId 는 DB 행에서 가져와 넣는다. */
export async function verifyToken(secret: string, token: string, puzzleId: string): Promise<boolean> {
  const [id, sig] = token.split(".");
  if (!id || !sig) return false;
  const expect = await sign(secret, `${id}|${puzzleId}`);
  if (expect.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= expect.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}
