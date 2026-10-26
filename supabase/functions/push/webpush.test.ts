import { describe, expect, it } from 'vitest'
import { createVapidKeys, encrypt, fromBase64Url, toBase64Url, vapidAuthorization } from './webpush'

describe('encrypt', () => {
  // The worked example from RFC 8291, section 5.
  it('matches the RFC 8291 example', async () => {
    const body = await encrypt(
      new TextEncoder().encode('When I grow up, I want to be a watermelon'),
      'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
      'BTBZMqHH6r4Tts7J_aSIgg',
      {
        salt: fromBase64Url('DGv6ra1nlYgDCS1FRnbzlw'),
        serverPrivate: fromBase64Url('yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw'),
        serverPublic: fromBase64Url('BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8'),
      },
    )
    expect(toBase64Url(body)).toBe(
      'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
    )
  })
})

describe('vapidAuthorization', () => {
  it('signs a token for the push service origin that the public key verifies', async () => {
    const keys = await createVapidKeys()
    const header = await vapidAuthorization('https://fcm.googleapis.com/fcm/send/abc', { ...keys, subject: 'https://lexicove.vercel.app' }, 0)
    const match = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(header)
    expect(match).not.toBeNull()
    const [, head, claims, signature, publicKey] = match!
    expect(JSON.parse(new TextDecoder().decode(fromBase64Url(claims!)))).toEqual({
      aud: 'https://fcm.googleapis.com',
      exp: 12 * 3600,
      sub: 'https://lexicove.vercel.app',
    })
    const verifier = await crypto.subtle.importKey('raw', fromBase64Url(publicKey!), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
    const valid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      verifier,
      fromBase64Url(signature!),
      new TextEncoder().encode(`${head}.${claims}`),
    )
    expect(valid).toBe(true)
  })
})
