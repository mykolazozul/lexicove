// Web Push with nothing but WebCrypto: payload encryption (RFC 8291, aes128gcm) and the VAPID
// signature (RFC 8292). Runs in Deno on the server and in Node for the tests.

const encoder = new TextEncoder()

/** Bytes backed by a plain ArrayBuffer, which is what WebCrypto accepts. */
export type Bytes = Uint8Array<ArrayBuffer>

export function toBase64Url(bytes: Bytes): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function fromBase64Url(text: string): Bytes {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4))
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

function concat(...parts: Bytes[]): Bytes {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

async function hkdf(salt: Bytes, ikm: Bytes, info: Bytes, length: number): Promise<Bytes> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8))
}

/** A P-256 private key as JWK, from the raw scalar and the uncompressed public point. */
function privateJwk(d: Bytes, publicRaw: Bytes): JsonWebKey {
  return {
    kty: 'EC',
    crv: 'P-256',
    d: toBase64Url(d),
    x: toBase64Url(publicRaw.slice(1, 33)),
    y: toBase64Url(publicRaw.slice(33, 65)),
  }
}

export type TestKeys = { salt: Bytes; serverPrivate: Bytes; serverPublic: Bytes }

/**
 * Encrypts a payload for one subscription. `keys` pins the salt and the server's one-time key
 * pair, which only the tests do; real messages get fresh random ones.
 */
export async function encrypt(payload: Bytes, p256dh: string, authSecret: string, keys?: TestKeys): Promise<Bytes> {
  const clientPublic = fromBase64Url(p256dh)
  const auth = fromBase64Url(authSecret)
  const salt = keys?.salt ?? crypto.getRandomValues(new Uint8Array(16))

  let serverPrivateKey: CryptoKey
  let serverPublic: Bytes
  if (keys) {
    serverPrivateKey = await crypto.subtle.importKey(
      'jwk',
      privateJwk(keys.serverPrivate, keys.serverPublic),
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      ['deriveBits'],
    )
    serverPublic = keys.serverPublic
  } else {
    const pair = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair
    serverPrivateKey = pair.privateKey
    serverPublic = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))
  }

  const clientKey = await crypto.subtle.importKey('raw', clientPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: clientKey }, serverPrivateKey, 256))

  const keyInfo = concat(encoder.encode('WebPush: info\0'), clientPublic, serverPublic)
  const ikm = await hkdf(auth, shared, keyInfo, 32)
  const cek = await hkdf(salt, ikm, encoder.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, ikm, encoder.encode('Content-Encoding: nonce\0'), 12)

  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  // One record: the payload, then the 0x02 delimiter that marks the last record.
  const record = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, concat(payload, new Uint8Array([2]))))

  const header = new Uint8Array(21)
  header.set(salt, 0)
  new DataView(header.buffer).setUint32(16, 4096)
  header[20] = serverPublic.length
  return concat(header, serverPublic, record)
}

export type Vapid = { publicKey: string; privateJwk: JsonWebKey; subject: string }

export async function createVapidKeys(): Promise<{ publicKey: string; privateJwk: JsonWebKey }> {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair
  return {
    publicKey: toBase64Url(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))),
    privateJwk: await crypto.subtle.exportKey('jwk', pair.privateKey),
  }
}

/** The Authorization header value for one push service (the audience is its origin). */
export async function vapidAuthorization(endpoint: string, vapid: Vapid, now = Date.now()): Promise<string> {
  const header = toBase64Url(encoder.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const claims = toBase64Url(
    encoder.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: vapid.subject })),
  )
  const key = await crypto.subtle.importKey('jwk', vapid.privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  const signature = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, encoder.encode(`${header}.${claims}`)))
  return `vapid t=${header}.${claims}.${toBase64Url(signature)}, k=${vapid.publicKey}`
}

export type Subscription = { endpoint: string; p256dh: string; auth: string }

/** Sends one notification. Resolves to the push service's status code. */
export async function sendPush(subscription: Subscription, message: unknown, vapid: Vapid, ttlSeconds = 4 * 3600): Promise<number> {
  const body = await encrypt(encoder.encode(JSON.stringify(message)), subscription.p256dh, subscription.auth)
  const response = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidAuthorization(subscription.endpoint, vapid),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(ttlSeconds),
      Urgency: 'normal',
    },
    body,
  })
  await response.body?.cancel()
  return response.status
}
