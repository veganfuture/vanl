/**
 * Verifies signup tokens signed by the bot (see bot/src/bot/signup_token.py
 * for the matching signer and the shared payload format:
 * "aci|nonce|issued_at|expires_at", Ed25519-signed, base64url(payload) +
 * "." + base64url(signature)).
 */
const TOKEN_RE = /^([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/;

export type SignupTokenPayload = {
  aci: string;
  nonce: string;
  issuedAt: number;
  expiresAt: number;
};

function b64urlToBytes(value: string): Uint8Array {
  const padded = value + "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = padded.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function verifySignupToken(
  publicKeyB64: string,
  token: string,
  now: number = Date.now() / 1000,
): Promise<SignupTokenPayload> {
  const match = TOKEN_RE.exec(token);
  if (!match) {
    throw new Error("Malformed signup token");
  }
  const [, payloadB64, signatureB64] = match;
  const payloadBytes = b64urlToBytes(payloadB64);
  const signatureBytes = b64urlToBytes(signatureB64);

  const key = await crypto.subtle.importKey(
    "raw",
    b64urlToBytes(publicKeyB64) as BufferSource,
    "Ed25519",
    false,
    ["verify"],
  );
  const valid = await crypto.subtle.verify(
    "Ed25519",
    key,
    signatureBytes as BufferSource,
    payloadBytes as BufferSource,
  );
  if (!valid) {
    throw new Error("Invalid signup token signature");
  }

  const payloadText = new TextDecoder().decode(payloadBytes);
  const fields = payloadText.split("|");
  if (fields.length !== 4) {
    throw new Error("Malformed signup token payload");
  }
  const [aci, nonce, issuedAtRaw, expiresAtRaw] = fields;
  const issuedAt = Number(issuedAtRaw);
  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt)) {
    throw new Error("Malformed signup token payload");
  }
  if (now > expiresAt) {
    throw new Error("Signup token has expired");
  }

  return { aci, nonce, issuedAt, expiresAt };
}
