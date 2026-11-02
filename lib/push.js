// lib/push.js
// Web Push without dependencies (same spirit as the hand-verified Svix
// webhook): VAPID auth (RFC 8292) + aes128gcm payload encryption (RFC 8291)
// with Node's crypto.
//
// Zero config: the VAPID key pair is derived from TRACKING_SECRET, so no new
// environment variables are needed. Set VAPID_PRIVATE_KEY (base64url, 32
// bytes) to use an explicit key instead. Changing either one invalidates
// existing subscriptions; devices just need to tap "Enable alerts" again.
//
// Subscriptions live in the "Push Subscriptions" table.

import crypto from 'crypto';
import { fetchAll, base } from './airtable';

const TABLE = 'Push Subscriptions';
const SUBJECT = 'mailto:diego@diez.gallery';

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const fromB64u = (s) => Buffer.from(String(s), 'base64url');

// ── VAPID keys ──────────────────────────────────────────────────────────────
let _keys = null;
export function vapidKeys() {
  if (_keys) return _keys;
  let d = process.env.VAPID_PRIVATE_KEY ? fromB64u(process.env.VAPID_PRIVATE_KEY) : null;
  if (!d || d.length !== 32) {
    const secret = process.env.TRACKING_SECRET || 'default-secret';
    d = crypto.createHmac('sha256', secret).update('diez-mail/vapid/v1').digest();
  }
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.setPrivateKey(d);
  const pub = ecdh.getPublicKey(); // 65 bytes, uncompressed
  const jwk = {
    kty: 'EC', crv: 'P-256',
    d: b64u(d), x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)),
  };
  _keys = {
    publicKey: b64u(pub),
    privateKey: crypto.createPrivateKey({ key: jwk, format: 'jwk' }),
    publicKeyObject: crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y }, format: 'jwk' }),
  };
  return _keys;
}

export function vapidAuthHeader(endpoint) {
  const { publicKey, privateKey } = vapidKeys();
  const aud = new URL(endpoint).origin;
  const header = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const payload = b64u(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: SUBJECT }));
  const unsigned = `${header}.${payload}`;
  const sig = crypto.sign('sha256', Buffer.from(unsigned), { key: privateKey, dsaEncoding: 'ieee-p1363' });
  return `vapid t=${unsigned}.${b64u(sig)}, k=${publicKey}`;
}

// ── aes128gcm encryption ────────────────────────────────────────────────────
function hmac(key, data) {
  return crypto.createHmac('sha256', key).update(data).digest();
}

export function encryptPayload(subscription, payload, { salt = crypto.randomBytes(16), ephemeral } = {}) {
  const uaPublic = fromB64u(subscription.keys.p256dh);
  const authSecret = fromB64u(subscription.keys.auth);

  const as = ephemeral || crypto.createECDH('prime256v1');
  if (!ephemeral) as.generateKeys();
  const asPublic = as.getPublicKey();
  const ecdhSecret = as.computeSecret(uaPublic);

  // IKM = HKDF(auth_secret, ecdh_secret, "WebPush: info" || 0 || ua_public || as_public, 32)
  const prkKey = hmac(authSecret, ecdhSecret);
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic, Buffer.from([1])]);
  const ikm = hmac(prkKey, keyInfo);

  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.concat([Buffer.from('Content-Encoding: aes128gcm\0'), Buffer.from([1])])).subarray(0, 16);
  const nonce = hmac(prk, Buffer.concat([Buffer.from('Content-Encoding: nonce\0'), Buffer.from([1])])).subarray(0, 12);

  const plaintext = Buffer.concat([Buffer.from(payload), Buffer.from([2])]); // 0x02 = last record
  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const body = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);

  const rs = Buffer.alloc(4);
  rs.writeUInt32BE(4096);
  const header = Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic]);
  return Buffer.concat([header, body]);
}

// Send one notification. Returns the HTTP status (201 = delivered to the
// push service; 404/410 = subscription is gone).
export async function sendPush(subscription, message) {
  const body = encryptPayload(subscription, JSON.stringify(message));
  const res = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      Authorization: vapidAuthHeader(subscription.endpoint),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '86400',
      Urgency: 'high',
    },
    body,
  });
  return res.status;
}

// ── Subscriptions ───────────────────────────────────────────────────────────
let subsCache = { ts: 0, list: null };

export async function listSubscriptions() {
  if (subsCache.list && Date.now() - subsCache.ts < 5 * 60 * 1000) return subsCache.list;
  const rows = await fetchAll(TABLE, { maxRecords: 100 });
  const list = rows
    .map((r) => {
      try {
        return { recordId: r.id, endpoint: (r.Endpoint || '').trim(), keys: JSON.parse(r.Keys || '{}'), device: r.Device || '' };
      } catch {
        return null;
      }
    })
    .filter((s) => s && s.endpoint && s.keys?.p256dh && s.keys?.auth);
  subsCache = { ts: Date.now(), list };
  return list;
}

export async function saveSubscription(sub, device = '') {
  const existing = await listSubscriptions();
  const found = existing.find((s) => s.endpoint === sub.endpoint);
  const fields = { Endpoint: sub.endpoint, Keys: JSON.stringify(sub.keys), Device: String(device).slice(0, 200) };
  if (found) await base(TABLE).update(found.recordId, fields);
  else await base(TABLE).create(fields);
  subsCache = { ts: 0, list: null };
}

export async function removeSubscription(endpoint) {
  const existing = await listSubscriptions();
  const found = existing.find((s) => s.endpoint === endpoint);
  if (found) await base(TABLE).destroy(found.recordId);
  subsCache = { ts: 0, list: null };
}

// Fan out to every device. Never throws: a failed push must never break the
// tracking request that triggered it. Bounded to ~4s overall.
export async function notifyAll(message) {
  try {
    const subs = await listSubscriptions();
    if (subs.length === 0) return 0;
    const results = await Promise.race([
      Promise.allSettled(subs.map((s) => sendPush(s, message).then((status) => ({ s, status })))),
      new Promise((resolve) => setTimeout(() => resolve([]), 4000)),
    ]);
    let delivered = 0;
    for (const r of results) {
      if (r.status !== 'fulfilled') continue;
      const { s, status } = r.value;
      if (status >= 200 && status < 300) delivered++;
      if (status === 404 || status === 410) removeSubscription(s.endpoint).catch(() => {});
    }
    return delivered;
  } catch (err) {
    console.error('[push] notifyAll failed:', err.message);
    return 0;
  }
}
