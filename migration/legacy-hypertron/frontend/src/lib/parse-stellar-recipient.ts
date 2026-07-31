const STELLAR_G_REGEX = /G[A-Z2-7]{55}/;

export function isValidStellarG(addr: string): boolean {
  const s = (addr || "").trim();
  return s.length === 56 && s.startsWith("G") && /^G[A-Z2-7]{55}$/.test(s);
}

export type ParsedRecipient =
  | { ok: true; address: string; label: string }
  | { ok: false; error: string };

/**
 * Extract a Stellar G... address from freeform recipient input
 * (raw address, or "Name · GABC…7K2M" style contact lines).
 */
export function parseStellarRecipient(input: string): ParsedRecipient {
  const raw = input.trim();
  if (!raw) {
    return { ok: false, error: "Recipient is required" };
  }

  if (isValidStellarG(raw)) {
    return { ok: true, address: raw, label: raw.slice(0, 8) + "…" + raw.slice(-4) };
  }

  const match = raw.match(STELLAR_G_REGEX);
  if (match && isValidStellarG(match[0])) {
    const address = match[0];
    const label = raw.includes("·")
      ? raw.split("·")[0]?.trim() || address.slice(0, 8) + "…" + address.slice(-4)
      : address.slice(0, 8) + "…" + address.slice(-4);
    return { ok: true, address, label };
  }

  if (raw.includes("@")) {
    return {
      ok: false,
      error: "Email-link delivery is not available yet. Enter a Stellar wallet address (G…).",
    };
  }

  return {
    ok: false,
    error: "Enter a valid Stellar wallet address (56 characters, starting with G).",
  };
}
