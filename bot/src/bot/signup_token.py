from __future__ import annotations

import base64
import secrets
import time

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
    Ed25519PublicKey,
)

SIGNUP_TOKEN_TTL_SECONDS = 15 * 60
"""
How long a signup link stays valid after the bot sends it. Short enough that a
leaked/forwarded link is not useful for long, generous enough that someone
reads a Signal DM and clicks it within normal usage.
"""

_FIELD_SEPARATOR = "|"


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + padding)


def load_private_key(seed_b64: str) -> Ed25519PrivateKey:
    """
    Load the bot's signup-signing private key from its base64url-encoded raw
    32-byte seed (as read from the VANL_SIGNUP_PRIVATE_KEY environment variable).

    Returns: the private key
    """
    return Ed25519PrivateKey.from_private_bytes(_b64url_decode(seed_b64))


def public_key_b64(private_key: Ed25519PrivateKey) -> str:
    """
    Return the base64url-encoded raw public key, for sharing with the website
    (via its non-secret TOML config) so it can verify signatures from this key.

    Returns: base64url-encoded public key
    """
    public_key = private_key.public_key()
    raw = public_key.public_bytes_raw()
    return _b64url_encode(raw)


def generate_keypair() -> tuple[str, str]:
    """
    Generate a new Ed25519 keypair for signup-link signing.

    Returns: (private_key_seed_b64, public_key_b64)
    """
    private_key = Ed25519PrivateKey.generate()
    seed = private_key.private_bytes_raw()
    return _b64url_encode(seed), public_key_b64(private_key)


def build_signup_token(
    private_key: Ed25519PrivateKey, aci: str, now: float | None = None
) -> str:
    """
    Build a signed, single-use, time-limited signup token for the given Signal
    ACI. The website verifies this with the corresponding public key before
    letting someone create an account under that ACI.

    Args:
    - private_key - the bot's signup-signing private key
    - aci - the requester's Signal Account Identifier (UUID)
    - now - override for the current time (tests only)

    Returns: an opaque token string safe to embed in a URL query parameter
    """
    issued_at = int(now if now is not None else time.time())
    expires_at = issued_at + SIGNUP_TOKEN_TTL_SECONDS
    nonce = _b64url_encode(secrets.token_bytes(16))
    payload = _FIELD_SEPARATOR.join([aci, nonce, str(issued_at), str(expires_at)])
    signature = private_key.sign(payload.encode("utf-8"))
    return f"{_b64url_encode(payload.encode('utf-8'))}.{_b64url_encode(signature)}"


def build_signup_url(base_url: str, private_key: Ed25519PrivateKey, aci: str) -> str:
    """
    Build the full signup URL to send to a Signal user.

    Returns: e.g. "https://veganactivists.nl/signup?token=..."
    """
    token = build_signup_token(private_key, aci)
    return f"{base_url}?token={token}"


def verify_signup_token(
    public_key: Ed25519PublicKey, token: str, now: float | None = None
) -> str:
    """
    Verify a signup token (test/ops helper — the website is the real verifier,
    implemented independently in TypeScript; this exists so bot-side tests can
    assert round-trip correctness without depending on the website).

    Returns: the ACI the token was issued for

    Raises: ValueError if the signature, format, or expiry is invalid
    """
    try:
        payload_b64, signature_b64 = token.split(".")
        payload = _b64url_decode(payload_b64)
        signature = _b64url_decode(signature_b64)
    except ValueError as exc:
        raise ValueError("Malformed signup token") from exc

    try:
        public_key.verify(signature, payload)
    except InvalidSignature as exc:
        raise ValueError("Invalid signup token signature") from exc

    fields = payload.decode("utf-8").split(_FIELD_SEPARATOR)
    if len(fields) != 4:
        raise ValueError("Malformed signup token payload")
    aci, _nonce, _issued_at, expires_at = fields

    current_time = now if now is not None else time.time()
    if current_time > int(expires_at):
        raise ValueError("Signup token has expired")

    return aci
