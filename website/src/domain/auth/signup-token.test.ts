import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { verifySignupToken } from "./signup-token";

const REPO_ROOT = join(import.meta.dirname, "..", "..", "..", "..");
const BOT_PYTHON = join(REPO_ROOT, "bot", ".venv", "bin", "python");

function signWithBot(aci: string): { token: string; publicKeyB64: string } {
  const script = `
import json
from bot.signup_token import build_signup_token, generate_keypair, load_private_key

seed_b64, public_b64 = generate_keypair()
private_key = load_private_key(seed_b64)
token = build_signup_token(private_key, "${aci}", now=1_000)
print(json.dumps({"token": token, "publicKeyB64": public_b64}))
`;
  const output = execFileSync(BOT_PYTHON, ["-c", script], {
    cwd: join(REPO_ROOT, "bot"),
    env: { ...process.env, PYTHONPATH: join(REPO_ROOT, "bot", "src") },
  });
  return JSON.parse(output.toString("utf-8"));
}

// This is the real interop boundary between the bot (Python, signs) and the
// website (TypeScript, verifies) — skip only if the bot's venv isn't set up
// (e.g. a CI runner that only checks out the website), never silently.
const botAvailable = existsSync(BOT_PYTHON);

describe.skipIf(!botAvailable)(
  "verifySignupToken (cross-language, against the real bot signer)",
  () => {
    it("accepts a token actually signed by the Python bot", async () => {
      const { token, publicKeyB64 } = signWithBot("11111111-1111-1111-1111-111111111111");

      const payload = await verifySignupToken(publicKeyB64, token, 1_000);

      expect(payload.aci).toBe("11111111-1111-1111-1111-111111111111");
      expect(payload.issuedAt).toBe(1_000);
      expect(payload.expiresAt).toBe(1_000 + 15 * 60);
    });

    it("rejects that same token once it has expired", async () => {
      const { token, publicKeyB64 } = signWithBot("11111111-1111-1111-1111-111111111111");

      await expect(verifySignupToken(publicKeyB64, token, 1_000 + 15 * 60 + 1)).rejects.toThrow(
        /expired/,
      );
    });
  },
);

describe("verifySignupToken (format handling)", () => {
  it("rejects a token with no separator", async () => {
    await expect(verifySignupToken("anything", "not-a-token", 0)).rejects.toThrow(/Malformed/);
  });

  it("rejects a token with the wrong signature", async () => {
    const keyPair = (await crypto.subtle.generateKey("Ed25519", true, [
      "sign",
      "verify",
    ])) as CryptoKeyPair;
    const otherKeyPair = (await crypto.subtle.generateKey("Ed25519", true, [
      "sign",
      "verify",
    ])) as CryptoKeyPair;

    const payload = "aci-1|nonce-1|1000|2000";
    const payloadBytes = new TextEncoder().encode(payload);
    const signature = await crypto.subtle.sign("Ed25519", otherKeyPair.privateKey, payloadBytes);

    const publicKeyRaw = new Uint8Array(await crypto.subtle.exportKey("raw", keyPair.publicKey));
    const token = `${toB64Url(payloadBytes)}.${toB64Url(new Uint8Array(signature))}`;

    await expect(verifySignupToken(toB64Url(publicKeyRaw), token, 0)).rejects.toThrow(
      /Invalid signup token signature/,
    );
  });
});

function toB64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
