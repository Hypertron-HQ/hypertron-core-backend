import type { EIP1193Provider } from "viem";
import type { SignerWalletAdapter } from "@solana/wallet-adapter-base";
import {
  getCctpContracts,
  isEvmBridgeChain,
  routeUsesStellar,
  type BridgeChainId,
} from "@/lib/bridge/cctp-config";
import { waitForCctpAttestation } from "@/lib/bridge/cctp-attestation";
import {
  approveStellarUsdcSpend,
  burnStellarUsdc,
  mintAndForwardOnStellar,
} from "@/lib/bridge/cctp-stellar";
import {
  approveEvmUsdc,
  burnEvmUsdcToDestination,
  createEvmWalletClient,
  receiveMessageOnEvm,
} from "@/lib/bridge/cctp-evm";
import { bridgeUsdcWithCircleKit, burnSolanaUsdcToStellar, mintUsdcOnSolana } from "@/lib/bridge/cctp-bridge-kit";
import { cctpSubunitsToStellarBurnSubunits, toCctpSubunits } from "@/lib/bridge/cctp-utils";

export type BridgeProgressStep =
  | "approve"
  | "burn"
  | "attestation"
  | "mint"
  | "complete"
  | "error";

export type BridgeProgressEvent = {
  step: BridgeProgressStep;
  message: string;
  txHash?: string;
};

export type ExecuteUsdcBridgeParams = {
  fromChain: BridgeChainId;
  toChain: BridgeChainId;
  amount: string;
  stellarAddress: string | null;
  evmAddress: `0x${string}` | null;
  evmProvider: EIP1193Provider | null;
  solanaAddress: string | null;
  solanaWallet: SignerWalletAdapter | null;
  destinationStellarAddress?: string;
  destinationEvmAddress?: `0x${string}`;
  destinationSolanaAddress?: string;
  onProgress?: (event: BridgeProgressEvent) => void;
  signal?: AbortSignal;
};

export type ExecuteUsdcBridgeResult = {
  success: true;
  steps: BridgeProgressEvent[];
};

function resolveDestination(params: ExecuteUsdcBridgeParams): {
  stellar?: string;
  evm?: `0x${string}`;
  solana?: string;
} {
  return {
    stellar: params.destinationStellarAddress ?? params.stellarAddress ?? undefined,
    evm: params.destinationEvmAddress ?? params.evmAddress ?? undefined,
    solana: params.destinationSolanaAddress ?? params.solanaAddress ?? undefined,
  };
}

export async function executeUsdcBridge(params: ExecuteUsdcBridgeParams): Promise<ExecuteUsdcBridgeResult> {
  const steps: BridgeProgressEvent[] = [];
  const emit = (event: BridgeProgressEvent) => {
    steps.push(event);
    params.onProgress?.(event);
  };

  const amountSubunits = toCctpSubunits(params.amount);
  const destination = resolveDestination(params);

  if (params.fromChain === params.toChain) {
    throw new Error("Choose different source and destination networks.");
  }

  if (!routeUsesStellar(params.fromChain, params.toChain)) {
    emit({ step: "burn", message: "Starting Circle CCTP transfer…" });
    const result = await bridgeUsdcWithCircleKit({
      fromChain: params.fromChain,
      toChain: params.toChain,
      amount: params.amount,
      evmProvider: params.evmProvider ?? undefined,
      solanaWallet: params.solanaWallet ?? undefined,
      evmRecipient: destination.evm,
      solanaRecipient: destination.solana,
    });

    if (result.state !== "success") {
      throw new Error("Bridge did not complete successfully.");
    }

    for (const step of result.steps) {
      if (step.state === "success" && step.txHash) {
        emit({ step: step.name === "mint" ? "mint" : step.name === "burn" ? "burn" : "approve", message: `${step.name} confirmed`, txHash: step.txHash });
      }
    }
    emit({ step: "complete", message: "USDC bridge completed." });
    return { success: true, steps };
  }

  if (params.fromChain === "stellar") {
    if (!params.stellarAddress) throw new Error("Connect your Stellar wallet (Freighter).");
    if (params.toChain === "ethereum" || params.toChain === "avalanche") {
      if (!destination.evm) throw new Error("Connect or specify an EVM recipient address.");
    }
    if (params.toChain === "solana") {
      if (!destination.solana) throw new Error("Connect or specify a Solana recipient address.");
    }

    emit({ step: "approve", message: "Approve USDC spend on Stellar…" });
    const approveTx = await approveStellarUsdcSpend({
      stellarAddress: params.stellarAddress,
      amountSubunits: cctpSubunitsToStellarBurnSubunits(amountSubunits),
    });
    emit({ step: "approve", message: "USDC approved on Stellar.", txHash: approveTx });

    emit({ step: "burn", message: "Burning USDC on Stellar…" });
    const burnTx = await burnStellarUsdc({
      stellarAddress: params.stellarAddress,
      amountCctpSubunits: amountSubunits,
      destinationChain: params.toChain,
      destinationAddress:
        params.toChain === "solana"
          ? destination.solana!
          : destination.evm!,
    });
    emit({ step: "burn", message: "USDC burned on Stellar.", txHash: burnTx });

    emit({ step: "attestation", message: "Waiting for Circle attestation…" });
    const attestation = await waitForCctpAttestation({
      sourceChain: "stellar",
      transactionHash: burnTx,
      signal: params.signal,
    });
    emit({ step: "attestation", message: "Attestation received." });

    if (isEvmBridgeChain(params.toChain)) {
      if (!params.evmProvider || !params.evmAddress) {
        throw new Error("Connect the destination EVM wallet to mint USDC.");
      }
      emit({ step: "mint", message: `Minting USDC on ${getCctpContracts().bridgeKitChainName[params.toChain]}…` });
      const walletClient = createEvmWalletClient(params.toChain, params.evmProvider);
      const mintTx = await receiveMessageOnEvm({
        chain: params.toChain,
        walletClient,
        account: params.evmAddress,
        attestation,
      });
      emit({ step: "mint", message: "USDC minted on destination.", txHash: mintTx });
    } else if (params.toChain === "solana") {
      if (!params.solanaWallet?.publicKey) throw new Error("Connect a Solana wallet to mint USDC.");
      emit({ step: "mint", message: "Minting USDC on Solana…" });
      const mintTx = await mintUsdcOnSolana({
        wallet: params.solanaWallet,
        attestation,
        sourceChain: "stellar",
      });
      emit({ step: "mint", message: "USDC minted on Solana.", txHash: mintTx });
    }

    emit({ step: "complete", message: "USDC bridge completed." });
    return { success: true, steps };
  }

  // Destination is Stellar
  if (!destination.stellar) throw new Error("Connect your Stellar wallet to receive USDC on Stellar.");
  if (!params.stellarAddress) throw new Error("Connect your Stellar wallet (Freighter).");

  if (isEvmBridgeChain(params.fromChain)) {
    if (!params.evmProvider || !params.evmAddress) throw new Error("Connect an EVM wallet for the source network.");
    emit({ step: "approve", message: "Approve USDC spend…" });
    const walletClient = createEvmWalletClient(params.fromChain, params.evmProvider);
    const approveTx = await approveEvmUsdc({
      chain: params.fromChain,
      walletClient,
      account: params.evmAddress,
      amountSubunits,
    });
    emit({ step: "approve", message: "USDC approved.", txHash: approveTx });

    emit({ step: "burn", message: "Burning USDC on source chain…" });
    const burnTx = await burnEvmUsdcToDestination({
      chain: params.fromChain,
      walletClient,
      account: params.evmAddress,
      amountSubunits,
      destinationChain: "stellar",
      destinationAddress: destination.stellar,
    });
    emit({ step: "burn", message: "USDC burned.", txHash: burnTx });

    emit({ step: "attestation", message: "Waiting for Circle attestation…" });
    const attestation = await waitForCctpAttestation({
      sourceChain: params.fromChain,
      transactionHash: burnTx,
      signal: params.signal,
    });
    emit({ step: "attestation", message: "Attestation received." });

    emit({ step: "mint", message: "Minting and forwarding USDC on Stellar…" });
    const mintTx = await mintAndForwardOnStellar({
      stellarAddress: params.stellarAddress,
      attestation,
    });
    emit({ step: "mint", message: "USDC received on Stellar.", txHash: mintTx });
    emit({ step: "complete", message: "USDC bridge completed." });
    return { success: true, steps };
  }

  if (params.fromChain === "solana") {
    if (!params.solanaWallet?.publicKey) throw new Error("Connect a Solana wallet.");
    emit({ step: "burn", message: "Burning USDC on Solana…" });
    const burnTx = await burnSolanaUsdcToStellar({
      wallet: params.solanaWallet,
      amountSubunits,
      stellarRecipient: destination.stellar!,
    });
    emit({ step: "burn", message: "USDC burned on Solana.", txHash: burnTx });
    emit({ step: "attestation", message: "Waiting for Circle attestation…" });
    const attestation = await waitForCctpAttestation({
      sourceChain: "solana",
      transactionHash: burnTx,
      signal: params.signal,
    });
    emit({ step: "attestation", message: "Attestation received." });
    emit({ step: "mint", message: "Minting and forwarding USDC on Stellar…" });
    const mintTx = await mintAndForwardOnStellar({
      stellarAddress: params.stellarAddress!,
      attestation,
    });
    emit({ step: "mint", message: "USDC received on Stellar.", txHash: mintTx });
    emit({ step: "complete", message: "USDC bridge completed." });
    return { success: true, steps };
  }

  throw new Error("Unsupported bridge route.");
}
