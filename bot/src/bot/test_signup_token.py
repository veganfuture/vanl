from __future__ import annotations

import unittest

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from bot import signup_token


class SignupTokenTests(unittest.TestCase):
    def test_round_trip(self) -> None:
        private_key = Ed25519PrivateKey.generate()
        token = signup_token.build_signup_token(
            private_key, "11111111-1111-1111-1111-111111111111", now=1_000
        )

        aci = signup_token.verify_signup_token(
            private_key.public_key(), token, now=1_000
        )

        self.assertEqual(aci, "11111111-1111-1111-1111-111111111111")

    def test_rejects_expired_token(self) -> None:
        private_key = Ed25519PrivateKey.generate()
        token = signup_token.build_signup_token(private_key, "aci-1", now=1_000)

        with self.assertRaisesRegex(ValueError, "expired"):
            signup_token.verify_signup_token(
                private_key.public_key(),
                token,
                now=1_000 + signup_token.SIGNUP_TOKEN_TTL_SECONDS + 1,
            )

    def test_rejects_tampered_payload(self) -> None:
        private_key = Ed25519PrivateKey.generate()
        token = signup_token.build_signup_token(private_key, "aci-1", now=1_000)
        payload_b64, signature_b64 = token.split(".")

        # Sign for "aci-1" but splice in a token for a different ACI.
        other_token = signup_token.build_signup_token(private_key, "aci-2", now=1_000)
        other_payload_b64, _ = other_token.split(".")
        tampered = f"{other_payload_b64}.{signature_b64}"

        with self.assertRaisesRegex(ValueError, "Invalid signup token signature"):
            signup_token.verify_signup_token(
                private_key.public_key(), tampered, now=1_000
            )

    def test_rejects_wrong_signer(self) -> None:
        signer = Ed25519PrivateKey.generate()
        impostor = Ed25519PrivateKey.generate()
        token = signup_token.build_signup_token(signer, "aci-1", now=1_000)

        with self.assertRaisesRegex(ValueError, "Invalid signup token signature"):
            signup_token.verify_signup_token(impostor.public_key(), token, now=1_000)

    def test_rejects_malformed_token(self) -> None:
        private_key = Ed25519PrivateKey.generate()

        with self.assertRaisesRegex(ValueError, "Malformed signup token"):
            signup_token.verify_signup_token(
                private_key.public_key(), "not-a-token", now=1_000
            )

    def test_generate_keypair_round_trips_through_env_style_encoding(self) -> None:
        seed_b64, public_b64 = signup_token.generate_keypair()

        loaded = signup_token.load_private_key(seed_b64)

        self.assertEqual(signup_token.public_key_b64(loaded), public_b64)

    def test_two_tokens_for_the_same_aci_have_different_nonces(self) -> None:
        private_key = Ed25519PrivateKey.generate()

        first = signup_token.build_signup_token(private_key, "aci-1", now=1_000)
        second = signup_token.build_signup_token(private_key, "aci-1", now=1_000)

        self.assertNotEqual(first, second)


if __name__ == "__main__":
    unittest.main()
