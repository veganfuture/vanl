/**
 * A general, message-type-agnostic backstop on how many messages one Signal
 * person can be sent via the bot in a window - sits underneath any
 * feature-specific limiter (e.g. auth/otp.ts's OTP_SEND_RATE_LIMIT_MAX,
 * which is the normal-path UX gate for login). Deliberately looser: this
 * should only ever trip from a bug (e.g. a retry loop) or a future message
 * type someone adds without wiring up its own spam protection.
 */
export const BOT_MESSAGE_RATE_LIMIT_MAX = 20;
export const BOT_MESSAGE_RATE_LIMIT_WINDOW_SECONDS = 60 * 60;
