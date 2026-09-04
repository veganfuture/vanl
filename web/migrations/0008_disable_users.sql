-- Lets a site admin lock an account out of logging in without deleting it
-- (deleted_at is a distinct, harder-to-reverse concept - see users table in
-- 0001_auth.sql). Nullable timestamp mirrors deleted_at's own convention:
-- null = enabled, set = disabled since that moment.
alter table users add column disabled_at timestamptz;
