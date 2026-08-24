import { err, errAsync, ok, okAsync, Result, ResultAsync } from "neverthrow";

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

export type SignupTokenError = { readonly message: string };

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

const safeB64urlToBytes = Result.fromThrowable(b64urlToBytes, (): SignupTokenError => ({
  message: "Malformed base64url in signup token",
}));

function decodeTokenBytes(
  payloadB64: string,
  signatureB64: string,
  publicKeyB64: string,
): Result<
  { payloadBytes: Uint8Array; signatureBytes: Uint8Array; publicKeyBytes: Uint8Array },
  SignupTokenError
> {
  const payloadBytes = safeB64urlToBytes(payloadB64);
  if (payloadBytes.isErr()) {
    return err(payloadBytes.error);
  }
  const signatureBytes = safeB64urlToBytes(signatureB64);
  if (signatureBytes.isErr()) {
    return err(signatureBytes.error);
  }
  const publicKeyBytes = safeB64urlToBytes(publicKeyB64);
  if (publicKeyBytes.isErr()) {
    return err(publicKeyBytes.error);
  }
  return ok({
    payloadBytes: payloadBytes.value,
    signatureBytes: signatureBytes.value,
    publicKeyBytes: publicKeyBytes.value,
  });
}

export function verifySignupToken(
  publicKeyB64: string,
  token: string,
  now: number = Date.now() / 1000,
): ResultAsync<SignupTokenPayload, SignupTokenError> {
  const match = TOKEN_RE.exec(token);
  if (!match) {
    return errAsync({ message: "Malformed signup token" });
  }
  const [, payloadB64, signatureB64] = match;

  const decoded = decodeTokenBytes(payloadB64, signatureB64, publicKeyB64);
  if (decoded.isErr()) {
    return errAsync(decoded.error);
  }
  const { payloadBytes, signatureBytes, publicKeyBytes } = decoded.value;

  return ResultAsync.fromPromise(
    crypto.subtle.importKey("raw", publicKeyBytes as BufferSource, "Ed25519", false, ["verify"]),
    (): SignupTokenError => ({ message: "Invalid signup token public key" }),
  )
    .andThen((key) =>
      ResultAsync.fromPromise(
        crypto.subtle.verify(
          "Ed25519",
          key,
          signatureBytes as BufferSource,
          payloadBytes as BufferSource,
        ),
        (): SignupTokenError => ({ message: "Failed to verify signup token signature" }),
      ),
    )
    .andThen((valid): ResultAsync<void, SignupTokenError> => {
      if (!valid) {
        return errAsync({ message: "Invalid signup token signature" });
      }
      return okAsync(undefined);
    })
    .andThen((): ResultAsync<SignupTokenPayload, SignupTokenError> => {
      const payloadText = new TextDecoder().decode(payloadBytes);
      const fields = payloadText.split("|");
      if (fields.length !== 4) {
        return errAsync({ message: "Malformed signup token payload" });
      }
      const [aci, nonce, issuedAtRaw, expiresAtRaw] = fields;
      const issuedAt = Number(issuedAtRaw);
      const expiresAt = Number(expiresAtRaw);
      if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt)) {
        return errAsync({ message: "Malformed signup token payload" });
      }
      if (now > expiresAt) {
        return errAsync({ message: "Signup token has expired" });
      }
      return okAsync({ aci, nonce, issuedAt, expiresAt });
    });
}
