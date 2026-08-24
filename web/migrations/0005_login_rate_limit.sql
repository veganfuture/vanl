-- Adds per-IP tracking to login_challenges so startLogin can rate-limit OTP
-- sends both per-account and per-IP, per docs/threat-model.md's "OTP brute
-- force at login" mitigation ("rate-limited challenge creation per account
-- and per IP") - only per-attempt limiting (attempts_remaining) existed
-- before this. Nullable: dev/test requests with no client IP still work.
alter table login_challenges add column requested_ip text;
