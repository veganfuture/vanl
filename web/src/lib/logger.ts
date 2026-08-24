import pino from "pino";
import { loadConfig } from "./config";

const config = loadConfig();

/** Structured, server-side logger. Not imported by client-rendered components. */
export const logger = pino({
  level: config.logging.level,
  transport: process.env.NODE_ENV !== "production" ? { target: "pino-pretty" } : undefined,
});
