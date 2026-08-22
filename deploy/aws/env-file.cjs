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

const mode = process.argv[2];
const file = process.argv[3];
if (!mode || !file) {
  console.error("usage: env-file.cjs <get KEY|secret-json> <env-file>");
  process.exit(1);
}

const all = parseEnv(file);

if (mode === "get") {
  const key = process.argv[4];
  process.stdout.write(all[key] ?? "");
  process.exit(0);
}

if (mode === "secret-json") {
  const out = {};
  for (const k of SECRET_KEYS) out[k] = all[k] ?? "";
  if (!out.DATABASE_URL || out.DATABASE_URL.includes("USER:PASSWORD")) {
    console.error("DATABASE_URL in .env.aws is missing or still a placeholder.");
    process.exit(1);
  }
  if (!out.AUTH_SECRET || out.AUTH_SECRET.includes("replace-with")) {
    console.error("AUTH_SECRET in .env.aws is missing or still a placeholder.");
    process.exit(1);
  }
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
}

console.error(`unknown mode: ${mode}`);
process.exit(1);
