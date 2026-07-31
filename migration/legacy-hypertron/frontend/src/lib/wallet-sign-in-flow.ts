import { isConnected, requestAccess, signMessage } from "@stellar/freighter-api";

export type WalletSignInResult =
  | { ok: true; walletAddress: string }
  | { ok: false; error: string };

function encodeSignedMessage(rawSig: string | Uint8Array): string | null {
  if (typeof rawSig === "string") return rawSig;
  if (rawSig instanceof Uint8Array) {
    let bin = "";
    for (let i = 0; i < rawSig.length; i += 1) bin += String.fromCharCode(rawSig[i]!);
    return btoa(bin);
  }
  return null;
}

/** Connect Freighter, sign the server challenge, and establish a wallet dashboard session. */
export async function runWalletSignInFlow(
  onStatus?: (message: string) => void
): Promise<WalletSignInResult> {
  onStatus?.("Connecting to Freighter…");

  const connected = await isConnected();
  if (!connected?.isConnected) {
    return { ok: false, error: "Install the Freighter browser extension to continue." };
  }

  const access = await requestAccess();
  if (access?.error || !access?.address) {
    return { ok: false, error: access?.error?.message ?? "Could not get wallet address." };
  }
  const walletAddress = access.address;

  onStatus?.("Requesting sign-in challenge…");
  const chRes = await fetch("/api/auth/challenge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletAddress }),
  });
  const chJson = await chRes.json().catch(() => ({}));
  if (!chRes.ok) {
    return {
      ok: false,
      error: typeof chJson.error === "string" ? chJson.error : "Challenge failed.",
    };
  }

  const challengeId = chJson.challengeId as string;
  const message = chJson.message as string;
  if (!challengeId || !message) {
    return { ok: false, error: "Invalid challenge response." };
  }

  onStatus?.("Sign the message in Freighter to continue…");
  const signResult = await signMessage(message, { address: walletAddress });
  if (signResult?.error || signResult?.signedMessage == null) {
    return { ok: false, error: signResult?.error?.message ?? "Signing was cancelled or failed." };
  }

  const signedMessageB64 = encodeSignedMessage(signResult.signedMessage);
  if (!signedMessageB64) {
    return { ok: false, error: "Unexpected signature format from wallet." };
  }

  onStatus?.("Verifying signature…");
  const vRes = await fetch("/api/auth/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({
      challengeId,
      walletAddress,
      signedMessage: signedMessageB64,
    }),
  });
  const vJson = await vRes.json().catch(() => ({}));
  if (!vRes.ok) {
    return {
      ok: false,
      error: typeof vJson.error === "string" ? vJson.error : "Verification failed.",
    };
  }

  try {
    localStorage.setItem("freighter_public_key", walletAddress);
    localStorage.removeItem("freighter_disconnected");
  } catch {
    /* ignore */
  }

  return { ok: true, walletAddress };
}
