#!/usr/bin/env node
"use strict";

const fs = require("fs");

const SECRET_KEYS = [
  "DATABASE_URL",
  "AUTH_SECRET",
  "SERVICE_ACCOUNT_API_KEY",
  "SERVICE_ACCOUNT_WALLET",
  "INTERNAL_SERVICE_TOKEN",
  "PAYMENT_POOL_ADDRESS",
  "MERCHANT_RECIPIENT",
];

// Live Render databases from docs/ops (core = hypertron, api = hypertron_api).
const LIVE_RENDER_DB_NAMES = new Set(["hypertron", "hypertron_api"]);

function parseEnv(file) {
  const text = fs.readFileSync(file, "utf8");
  const all = {};
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    all[k] = v;
  }
  return all;
}

function mongoDatabaseName(url) {
  const noQuery = String(url).split("?")[0];
  const slash = noQuery.lastIndexOf("/");
  if (slash < 0) return "";
  return decodeURIComponent(noQuery.slice(slash + 1)).trim();
}

function assertIsolatedDatabase(url) {
  const name = mongoDatabaseName(url);
  if (!name) {
    console.error("DATABASE_URL has no database name in the path.");
    process.exit(1);
  }
  if (
    LIVE_RENDER_DB_NAMES.has(name) &&
    process.env.ALLOW_SHARED_RENDER_DB !== "true"
  ) {
    console.error(
      `DATABASE_URL uses database "${name}", which is the live Render database.`,
    );
    console.error("Use a separate name such as hypertron_aws.");
    console.error("Refusing to deploy so Render payment links are not shared.");
    console.error(
      "Override only if you understand the risk: ALLOW_SHARED_RENDER_DB=true",
    );
    process.exit(1);
  }
  return name;
}

function assertSecrets(all) {
  const url = all.DATABASE_URL ?? "";
  const auth = all.AUTH_SECRET ?? "";
  if (!url || url.includes("USER:PASSWORD")) {
    console.error("DATABASE_URL in .env.aws is missing or still a placeholder.");
    process.exit(1);
  }
  if (!auth || auth.includes("replace-with")) {
    console.error("AUTH_SECRET in .env.aws is missing or still a placeholder.");
    process.exit(1);
  }
  return assertIsolatedDatabase(url);
}

const mode = process.argv[2];
const file = process.argv[3];
if (!mode || !file) {
  console.error(
    "usage: env-file.cjs <get KEY|secret-json|validate|db-name> <env-file>",
  );
  process.exit(1);
}

const all = parseEnv(file);

if (mode === "get") {
  const key = process.argv[4];
  process.stdout.write(all[key] ?? "");
  process.exit(0);
}

if (mode === "db-name") {
  process.stdout.write(mongoDatabaseName(all.DATABASE_URL ?? ""));
  process.exit(0);
}

if (mode === "validate") {
  const name = assertSecrets(all);
  process.stdout.write(`ok database=${name}\n`);
  process.exit(0);
}

if (mode === "secret-json") {
  assertSecrets(all);
  const out = {};
  for (const k of SECRET_KEYS) out[k] = all[k] ?? "";
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
}

console.error(`unknown mode: ${mode}`);
process.exit(1);
