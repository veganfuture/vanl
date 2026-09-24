-- countLoginChallengesForIpSince (auth_repository.ts) runs `where
-- requested_ip = ... and created_at > ...` on every OTP send - the per-IP
-- half of the login rate limit (docs/threat-model.md's "OTP brute force at
-- login" mitigation, see 0005_login_rate_limit.sql). login_challenges rows
-- are never pruned by expires_at (only deleted by id once consumed - see
-- deleteLoginChallenge), so without an index this degrades into a
-- full-table scan on the very code path an attacker would hammer.
create index login_challenges_requested_ip_created_idx on login_challenges (requested_ip, created_at);
