import { describe, expect, it } from 'vitest';
import { proxyRequest } from './proxy';

const secret = 'isolated-proxy-test-secret';
const now = 1792746000000;
async function signed(overrides: { secret?: string; time?: number; ip?: string; path?: string } = {}) {
  const time = String(overrides.time ?? now);
  const ip = overrides.ip ?? '192.0.2.5';
  const path = overrides.path ?? '/api/game/answer?x=1';
  const origin = 'https://candlemma.pages.dev';
  const payload = [time, 'POST', path, origin, 'same-origin', ip].join('\n');
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(overrides.secret ?? secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(payload))), b => b.toString(16).padStart(2, '0')).join('');
  return new Request('https://candlemma.pages.dev' + path, { method: 'POST', body: '{"pick":"up"}', headers: {
    origin, 'sec-fetch-site': 'same-origin', 'cf-connecting-ip': '2a06:98c0:3600::103',
    'x-trevu-client-ip': ip, 'x-trevu-proxy-time': time, 'x-trevu-proxy-signature': signature,
  } });
}
describe('authenticated cross-zone proxy IP', () => {
  it('leaves direct requests unchanged', async () => {
    const request = new Request('https://candlemma.pages.dev/api/meta');
    expect(await proxyRequest(request)).toBe(request);
  });
  it('restores a signed client IP and preserves the POST body and CSRF headers', async () => {
    const result = await proxyRequest(await signed(), secret, now);
    expect(result).toBeInstanceOf(Request);
    const request = result as Request;
    expect(request.headers.get('cf-connecting-ip')).toBe('192.0.2.5');
    expect(request.headers.get('origin')).toBe('https://candlemma.pages.dev');
    expect(request.headers.get('x-trevu-proxy-signature')).toBeNull();
    expect(await request.text()).toBe('{"pick":"up"}');
  });
  it.each([{}, { secret: 'wrong-key' }, { time: now - 60_001 }, { time: now + 60_001 }, { ip: 'untrusted' }])('rejects absent configuration or invalid signatures: %j', async overrides => {
    const result = await proxyRequest(await signed(overrides), Object.keys(overrides).length ? secret : undefined, now);
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(403);
  });
  it.each(['origin', 'sec-fetch-site', 'x-trevu-client-ip', 'x-trevu-proxy-time'])('rejects tampered %s', async name => {
    const request = await signed();
    request.headers.set(name, 'tampered');
    expect((await proxyRequest(request, secret, now) as Response).status).toBe(403);
  });
  it('binds the signature to method and path', async () => {
    const original = await signed();
    const request = new Request('https://candlemma.pages.dev/api/ranking/submit', { method: 'POST', headers: original.headers });
    expect((await proxyRequest(request, secret, now) as Response).status).toBe(403);
  });
});
