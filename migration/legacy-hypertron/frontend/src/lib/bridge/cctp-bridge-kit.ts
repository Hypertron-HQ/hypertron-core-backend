import { BridgeKit, Avalanche, AvalancheFuji, Ethereum, EthereumSepolia, Solana, SolanaDevnet } from "@circle-fin/bridge-kit";
import { createViemAdapterFromProvider } from "@circle-fin/adapter-viem-v2";
import { createSolanaAdapterFromProvider, type SolanaAdapter } from "@circle-fin/adapter-solana";
import type { EIP1193Provider } from "viem";
import type { SignerWalletAdapter } from "@solana/wallet-adapter-base";
import { Connection, type Transaction } from "@solana/web3.js";
import { getCctpNetworkMode, getStellarCctpChainDefinition, type BridgeChainId } from "@/lib/bridge/cctp-config";
import type { CctpAttestationMessage } from "@/lib/bridge/cctp-utils";
import { buildCctpForwarderHookData, resolveCctpEventNonce } from "@/lib/bridge/cctp-utils";
import { getStellarForwarderBytes32 } from "@/lib/bridge/cctp-stellar";

export type BridgeKitResult = Awaited<ReturnType<BridgeKit["bridge"]>>;

type BridgeKitChain = typeof Ethereum | typeof EthereumSepolia | typeof Avalanche | typeof AvalancheFuji | typeof Solana | typeof SolanaDevnet;

export function getSolanaConnection(): Connection {
  const mode = getCctpNetworkMode();
  return new Connection(
    mode === "mainnet" ? "https://api.mainnet-beta.solana.com" : "https://api.devnet.solana.com",
    "confirmed"
  );
}

function getBridgeKitChain(chain: BridgeChainId): BridgeKitChain {
  const mode = getCctpNetworkMode();
  if (chain === "ethereum") return mode === "mainnet" ? Ethereum : EthereumSepolia;
  if (chain === "avalanche") return mode === "mainnet" ? Avalanche : AvalancheFuji;
  if (chain === "solana") return mode === "mainnet" ? Solana : SolanaDevnet;
  throw new Error(`Unsupported Bridge Kit chain: ${chain}`);
}

function getBridgeKitStellarChain() {
  return getStellarCctpChainDefinition();
}

function solanaProviderFromWallet(wallet: SignerWalletAdapter) {
  if (!wallet.publicKey) throw new Error("Solana wallet is not connected.");
  return {
    isConnected: wallet.connected,
    publicKey: wallet.publicKey,
    connect: async () => {
      await wallet.connect();
      if (!wallet.publicKey) throw new Error("Solana wallet is not connected.");
      return { publicKey: wallet.publicKey };
    },
    disconnect: () => wallet.disconnect(),
    signTransaction: (transaction: unknown) => wallet.signTransaction(transaction as Transaction),
    signAllTransactions: wallet.signAllTransactions
      ? (transactions: unknown[]) => wallet.signAllTransactions!(transactions as Transaction[])
      : undefined,
  };
}

export async function createSolanaCircleAdapter(wallet: SignerWalletAdapter): Promise<SolanaAdapter> {
  return createSolanaAdapterFromProvider({
    provider: solanaProviderFromWallet(wallet),
    connection: getSolanaConnection(),
  });
}

export async function bridgeUsdcWithCircleKit(params: {
  fromChain: BridgeChainId;
  toChain: BridgeChainId;
  amount: string;
  evmProvider?: EIP1193Provider;
  solanaWallet?: SignerWalletAdapter;
  evmRecipient?: string;
  solanaRecipient?: string;
}): Promise<BridgeKitResult> {
  if (params.fromChain === "stellar" || params.toChain === "stellar") {
    throw new Error("Stellar routes use the native CCTP flow.");
  }

  const kit = new BridgeKit();
  const fromChain = getBridgeKitChain(params.fromChain);
  const toChain = getBridgeKitChain(params.toChain);

  if (params.fromChain === "ethereum" || params.fromChain === "avalanche") {
    if (!params.evmProvider) throw new Error("Connect an EVM wallet to bridge from this network.");
    const evmAdapter = await createViemAdapterFromProvider({ provider: params.evmProvider });

    if (params.toChain === "solana") {
      if (!params.solanaWallet?.publicKey) throw new Error("Connect a Solana wallet.");
      const solAdapter = await createSolanaCircleAdapter(params.solanaWallet);
      return kit.bridge({
        from: { adapter: evmAdapter, chain: fromChain },
        to: {
          adapter: solAdapter,
          chain: toChain,
          recipientAddress: params.solanaRecipient,
        },
        amount: params.amount,
        config: { transferSpeed: "FAST" },
      });
    }

    return kit.bridge({
      from: { adapter: evmAdapter, chain: fromChain },
      to: {
        adapter: evmAdapter,
        chain: toChain,
        recipientAddress: params.evmRecipient,
      },
      amount: params.amount,
      config: { transferSpeed: "FAST" },
    });
  }

  if (params.fromChain === "solana") {
    if (!params.solanaWallet?.publicKey) throw new Error("Connect a Solana wallet.");
    const solAdapter = await createSolanaCircleAdapter(params.solanaWallet);

    if (params.toChain === "ethereum" || params.toChain === "avalanche") {
      if (!params.evmProvider) throw new Error("Connect an EVM wallet.");
      const evmAdapter = await createViemAdapterFromProvider({ provider: params.evmProvider });
      return kit.bridge({
        from: { adapter: solAdapter, chain: fromChain },
        to: {
          adapter: evmAdapter,
          chain: toChain,
          recipientAddress: params.evmRecipient,
        },
        amount: params.amount,
        config: { transferSpeed: "FAST" },
      });
    }

    throw new Error("Unsupported Bridge Kit route.");
  }

  throw new Error("Unsupported Bridge Kit route.");
}

export async function burnSolanaUsdcToStellar(params: {
  wallet: SignerWalletAdapter;
  amountSubunits: bigint;
  stellarRecipient: string;
}): Promise<string> {
  const adapter = await createSolanaCircleAdapter(params.wallet);
  const fromChain = getBridgeKitChain("solana");
  const toChain = getBridgeKitStellarChain();
  const forwarder = getStellarForwarderBytes32();
  const hookData = buildCctpForwarderHookData(params.stellarRecipient);

  const prepared = await adapter.prepareAction(
    "cctp.v2.depositForBurnWithHook",
    {
      amount: params.amountSubunits,
      mintRecipient: forwarder,
      destinationCaller: forwarder,
      maxFee: BigInt(500),
      minFinalityThreshold: 1000,
      fromChain,
      toChain,
      hookData,
    },
    { chain: fromChain }
  );

  const txHash = await prepared.execute();
  if (!txHash) throw new Error("Solana burn transaction hash missing.");
  return txHash;
}

export async function mintUsdcOnSolana(params: {
  wallet: SignerWalletAdapter;
  attestation: CctpAttestationMessage;
  sourceChain: BridgeChainId;
}): Promise<string> {
  const adapter = await createSolanaCircleAdapter(params.wallet);
  const fromChain = getBridgeKitChain(params.sourceChain);
  const toChain = getBridgeKitChain("solana");
  const eventNonce = resolveCctpEventNonce(params.attestation);

  const prepared = await adapter.prepareAction(
    "cctp.v2.receiveMessage",
    {
      eventNonce,
      attestation: params.attestation.attestation,
      message: params.attestation.message,
      fromChain,
      toChain,
    },
    { chain: toChain }
  );

  const txHash = await prepared.execute();
  if (!txHash) throw new Error("Solana mint transaction hash missing.");
  return txHash;
}
