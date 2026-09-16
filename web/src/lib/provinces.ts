/**
 * The 12 Dutch provinces - a fixed, closed set (Postgres `province` enum,
 * migrations/0002_events.sql). No lookup table/endpoint needed (see
 * docs/architecture.md's Event notes), so both the province filter UI and
 * the /api/events query-param validation import this same list directly.
 */
export const PROVINCES = [
  "Drenthe",
  "Flevoland",
  "Friesland",
  "Gelderland",
  "Groningen",
  "Limburg",
  "Noord-Brabant",
  "Noord-Holland",
  "Overijssel",
  "Utrecht",
  "Zeeland",
  "Zuid-Holland",
] as const;
