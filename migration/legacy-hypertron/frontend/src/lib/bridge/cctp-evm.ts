import {
  createPublicClient,
  createWalletClient,
  custom,
  encodeFunctionData,
  http,
  type EIP1193Provider,
  type WalletClient,
} from "viem";
import { avalanche, avalancheFuji, mainnet, sepolia } from "viem/chains";
import {
  CCTP_DOMAIN,
  getCctpContracts,
  getCctpNetworkMode,
  type BridgeChainId,
} from "@/lib/bridge/cctp-config";
import { buildCctpForwarderHookData, evmAddressToBytes32, solanaAddressToBytes32, type CctpAttestationMessage } from "@/lib/bridge/cctp-utils";
import { getStellarForwarderBytes32 } from "@/lib/bridge/cctp-stellar";

const MESSAGE_TRANSMITTER_ABI = [
  {
    type: "function",
    name: "receiveMessage",
    stateMutability: "nonpayable",
    inputs: [
      { name: "message", type: "bytes" },
      { name: "attestation", type: "bytes" },
    ],
    outputs: [{ name: "success", type: "bool" }],
  },
] as const;

const ERC20_APPROVE_ABI = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

const TOKEN_MESSENGER_ABI = [
  {
    type: "function",
    name: "depositForBurn",
    stateMutability: "nonpayable",
    inputs: [
      { name: "amount", type: "uint256" },
      { name: "destinationDomain", type: "uint32" },
      { name: "mintRecipient", type: "bytes32" },
      { name: "burnToken", type: "address" },
      { name: "destinationCaller", type: "bytes32" },
      { name: "maxFee", type: "uint256" },
      { name: "minFinalityThreshold", type: "uint32" },
    ],
    outputs: [{ name: "nonce", type: "uint64" }],
  },
  {
    type: "function",
    name: "depositForBurnWithHook",
    stateMutability: "nonpayable",
    inputs: [
      { name: "amount", type: "uint256" },
      { name: "destinationDomain", type: "uint32" },
      { name: "mintRecipient", type: "bytes32" },
      { name: "burnToken", type: "address" },
      { name: "destinationCaller", type: "bytes32" },
      { name: "maxFee", type: "uint256" },
      { name: "minFinalityThreshold", type: "uint32" },
      { name: "hookData", type: "bytes" },
    ],
    outputs: [{ name: "nonce", type: "uint64" }],
  },
] as const;

function getEvmChain(chain: BridgeChainId) {
  const mode = getCctpNetworkMode();
  if (chain === "ethereum") {
    return mode === "mainnet" ? mainnet : sepolia;
  }
  if (chain === "avalanche") {
    return mode === "mainnet" ? avalanche : avalancheFuji;
  }
  throw new Error("Unsupported EVM chain.");
}

export function createEvmWalletClient(chain: BridgeChainId, provider: EIP1193Provider): WalletClient {
  return createWalletClient({
    chain: getEvmChain(chain),
    transport: custom(provider),
  });
}

export function createEvmPublicClient(chain: BridgeChainId) {
  return createPublicClient({
    chain: getEvmChain(chain),
    transport: http(),
  });
}

export async function approveEvmUsdc(params: {
  chain: BridgeChainId;
  walletClient: WalletClient;
  account: `0x${string}`;
  amountSubunits: bigint;
}): Promise<`0x${string}`> {
  const contracts = getCctpContracts();
  const hash = await params.walletClient.writeContract({
    account: params.account,
    chain: getEvmChain(params.chain),
    address: contracts.evm.usdc,
    abi: ERC20_APPROVE_ABI,
    functionName: "approve",
    args: [contracts.evm.tokenMessenger, params.amountSubunits],
  });
  const publicClient = createEvmPublicClient(params.chain);
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

export async function burnEvmUsdcToDestination(params: {
  chain: BridgeChainId;
  walletClient: WalletClient;
  account: `0x${string}`;
  amountSubunits: bigint;
  destinationChain: BridgeChainId;
  destinationAddress: string;
  maxFeeSubunits?: bigint;
}): Promise<`0x${string}`> {
  const contracts = getCctpContracts();
  const maxFee = params.maxFeeSubunits ?? BigInt(500);
  const destinationDomain = CCTP_DOMAIN[params.destinationChain];

  if (params.destinationChain === "stellar") {
    const forwarder = getStellarForwarderBytes32();
    const hookData = buildCctpForwarderHookData(params.destinationAddress);
    const hash = await params.walletClient.writeContract({
      account: params.account,
      chain: getEvmChain(params.chain),
      address: contracts.evm.tokenMessenger,
      abi: TOKEN_MESSENGER_ABI,
      functionName: "depositForBurnWithHook",
      args: [
        params.amountSubunits,
        destinationDomain,
        forwarder,
        contracts.evm.usdc,
        forwarder,
        maxFee,
        1000,
        hookData,
      ],
    });
    const publicClient = createEvmPublicClient(params.chain);
    await publicClient.waitForTransactionReceipt({ hash });
    return hash;
  }

  const mintRecipient =
    params.destinationChain === "solana"
      ? (`0x${Buffer.from(solanaAddressToBytes32(params.destinationAddress)).toString("hex")}` as `0x${string}`)
      : evmAddressToBytes32(params.destinationAddress);

  const hash = await params.walletClient.writeContract({
    account: params.account,
    chain: getEvmChain(params.chain),
    address: contracts.evm.tokenMessenger,
    abi: TOKEN_MESSENGER_ABI,
    functionName: "depositForBurn",
    args: [
      params.amountSubunits,
      destinationDomain,
      mintRecipient,
      contracts.evm.usdc,
      "0x0000000000000000000000000000000000000000000000000000000000000000",
      maxFee,
      1000,
    ],
  });
  const publicClient = createEvmPublicClient(params.chain);
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

export async function receiveMessageOnEvm(params: {
  chain: BridgeChainId;
  walletClient: WalletClient;
  account: `0x${string}`;
  attestation: CctpAttestationMessage;
}): Promise<`0x${string}`> {
  const contracts = getCctpContracts();
  const hash = await params.walletClient.writeContract({
    account: params.account,
    chain: getEvmChain(params.chain),
    address: contracts.evm.messageTransmitter,
    abi: MESSAGE_TRANSMITTER_ABI,
    functionName: "receiveMessage",
    args: [params.attestation.message as `0x${string}`, params.attestation.attestation as `0x${string}`],
  });
  const publicClient = createEvmPublicClient(params.chain);
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

export function encodeReceiveMessageCalldata(attestation: CctpAttestationMessage): `0x${string}` {
  return encodeFunctionData({
    abi: MESSAGE_TRANSMITTER_ABI,
    functionName: "receiveMessage",
    args: [attestation.message as `0x${string}`, attestation.attestation as `0x${string}`],
  });
}
