/**
 * Detect Prisma DB connection errors so we can return 503 instead of 500
 * and avoid noisy stack traces when DATABASE_URL is unreachable.
 */
const CONNECTION_ERROR_CODES = [
  "P1001", // Can't reach DB server
  "P1017", // Server closed the connection
];
const CONNECTION_ERROR_MESSAGES = [
  "Error creating a database connection",
  "No route to host",
  "DNS resolution",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "ENOTFOUND",
];

export function isPrismaConnectionError(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const err = e as { name?: string; code?: string; message?: string; cause?: unknown };
  if (err.name === "PrismaClientInitializationError") return true;
  if (typeof err.code === "string" && CONNECTION_ERROR_CODES.includes(err.code)) return true;
  const msg = String(err.message ?? err.cause ?? "");
  return CONNECTION_ERROR_MESSAGES.some((m) => msg.includes(m));
}

export const DB_UNAVAILABLE_MESSAGE =
  "Database unavailable. Check DATABASE_URL in .env and that MongoDB is reachable (network/VPN).";
