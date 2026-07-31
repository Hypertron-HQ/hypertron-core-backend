import { getCctpNetworkMode, getIrisApiBaseUrl, type BridgeChainId, CCTP_DOMAIN } from "@/lib/bridge/cctp-config";
import type { CctpAttestationMessage } from "@/lib/bridge/cctp-utils";

type AttestationResponse = {
  messages?: Array<
    CctpAttestationMessage & {
      eventNonce?: string;
    }
  >;
};

export async function waitForCctpAttestation(params: {
  sourceChain: BridgeChainId;
  transactionHash: string;
  signal?: AbortSignal;
  pollIntervalMs?: number;
  timeoutMs?: number;
}): Promise<CctpAttestationMessage> {
  const mode = getCctpNetworkMode();
  const baseUrl = getIrisApiBaseUrl(mode);
  const sourceDomain = CCTP_DOMAIN[params.sourceChain];
  const url = `${baseUrl}/v2/messages/${sourceDomain}?transactionHash=${encodeURIComponent(params.transactionHash)}`;
  const pollIntervalMs = params.pollIntervalMs ?? 5000;
  const timeoutMs = params.timeoutMs ?? 15 * 60 * 1000;
  const started = Date.now();

  while (true) {
    if (params.signal?.aborted) {
      throw new Error("Bridge cancelled.");
    }
    if (Date.now() - started > timeoutMs) {
      throw new Error("Timed out waiting for Circle attestation.");
    }

    const response = await fetch(url, { method: "GET", signal: params.signal });
    if (response.ok) {
      const data = (await response.json()) as AttestationResponse;
      const message = data.messages?.[0];
      if (message?.status === "complete" && message.message && message.attestation) {
        return {
          message: message.message,
          attestation: message.attestation,
          status: message.status,
          eventNonce: message.eventNonce,
        };
      }
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
}
