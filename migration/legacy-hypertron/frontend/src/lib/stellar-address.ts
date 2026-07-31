/** Minimal Stellar account id check (G + 55 base32 chars). */
export function isValidStellarAddress(addr: string): boolean {
  const s = (addr || "").trim();
  return s.length === 56 && s.startsWith("G");
}
