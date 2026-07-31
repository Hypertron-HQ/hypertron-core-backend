import {
  Address,
  Contract,
  rpc,
  TransactionBuilder,
  xdr,
  nativeToScVal,
} from "@stellar/stellar-sdk";
import { signTransaction } from "@stellar/freighter-api";
import {
  CCTP_DOMAIN,
  getCctpContracts,
  getCctpNetworkMode,
  getStellarNetworkPassphrase,
  getStellarRpcUrl,
  resolveStellarUsdcContractId,
} from "@/lib/bridge/cctp-config";
import {
  cctpSubunitsToStellarBurnSubunits,
  contractStrkeyToBytes32,
  evmAddressToBytes32,
  hexToBuffer,
  solanaAddressToBytes32,
  type CctpAttestationMessage,
} from "@/lib/bridge/cctp-utils";
import type { BridgeChainId } from "@/lib/bridge/cctp-config";

async function signWithFreighter(xdrEnvelope: string, address: string): Promise<string> {
  const result = await signTransaction(xdrEnvelope, { address, networkPassphrase: getStellarNetworkPassphrase(getCctpNetworkMode()) });
  if (result?.error || !result?.signedTxXdr) {
    throw new Error(result?.error?.message ?? "Freighter signing was cancelled or failed.");
  }
  return result.signedTxXdr;
}

async function submitSorobanContractCall(params: {
  stellarAddress: string;
  contractId: string;
  method: string;
  args: xdr.ScVal[];
}): Promise<string> {
  const mode = getCctpNetworkMode();
  const server = new rpc.Server(getStellarRpcUrl(mode));
  const account = await server.getAccount(params.stellarAddress);
  const contract = new Contract(params.contractId);

  const tx = new TransactionBuilder(account, {
    fee: "10000000",
    networkPassphrase: getStellarNetworkPassphrase(mode),
  })
    .addOperation(contract.call(params.method, ...params.args))
    .setTimeout(180)
    .build();

  const simulated = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(simulated)) {
    throw new Error(String((simulated as { error?: string }).error ?? "Stellar simulation failed."));
  }

  const prepared = rpc.assembleTransaction(tx, simulated).build();
  const signedXdr = await signWithFreighter(prepared.toXDR(), params.stellarAddress);
  const signedTx = TransactionBuilder.fromXDR(signedXdr, getStellarNetworkPassphrase(mode));
  const sendResult = await server.sendTransaction(signedTx);
  if (sendResult.status === "ERROR") {
    throw new Error(`Stellar transaction failed: ${JSON.stringify(sendResult)}`);
  }

  let getResult = await server.getTransaction(sendResult.hash);
  while (getResult.status === "NOT_FOUND") {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    getResult = await server.getTransaction(sendResult.hash);
  }

  if (getResult.status !== "SUCCESS") {
    throw new Error(`Stellar transaction did not succeed: ${JSON.stringify(getResult)}`);
  }

  return sendResult.hash;
}

export async function approveStellarUsdcSpend(params: {
  stellarAddress: string;
  amountSubunits: bigint;
}): Promise<string> {
  const contracts = getCctpContracts();
  const usdcContract = resolveStellarUsdcContractId(getCctpNetworkMode());
  const server = new rpc.Server(getStellarRpcUrl(getCctpNetworkMode()));
  const latestLedger = await server.getLatestLedger();
  const expirationLedger = latestLedger.sequence + 100_000;

  return submitSorobanContractCall({
    stellarAddress: params.stellarAddress,
    contractId: usdcContract,
    method: "approve",
    args: [
      new Address(params.stellarAddress).toScVal(),
      new Address(contracts.stellar.tokenMessengerMinter).toScVal(),
      nativeToScVal(params.amountSubunits, { type: "i128" }),
      nativeToScVal(expirationLedger, { type: "u32" }),
    ],
  });
}

function destinationMintRecipientBytes(destinationChain: BridgeChainId, destinationAddress: string): xdr.ScVal {
  if (destinationChain === "ethereum" || destinationChain === "avalanche") {
    return xdr.ScVal.scvBytes(Buffer.from(evmAddressToBytes32(destinationAddress).slice(2), "hex"));
  }
  if (destinationChain === "solana") {
    return xdr.ScVal.scvBytes(Buffer.from(solanaAddressToBytes32(destinationAddress)));
  }
  throw new Error("Unsupported destination chain for Stellar burn.");
}

export async function burnStellarUsdc(params: {
  stellarAddress: string;
  amountCctpSubunits: bigint;
  destinationChain: BridgeChainId;
  destinationAddress: string;
  maxFeeSubunits?: bigint;
}): Promise<string> {
  const contracts = getCctpContracts();
  const burnAmount = cctpSubunitsToStellarBurnSubunits(params.amountCctpSubunits);
  const maxFee = params.maxFeeSubunits ?? BigInt(100_000);

  return submitSorobanContractCall({
    stellarAddress: params.stellarAddress,
    contractId: contracts.stellar.tokenMessengerMinter,
    method: "deposit_for_burn",
    args: [
      new Address(params.stellarAddress).toScVal(),
      nativeToScVal(burnAmount, { type: "i128" }),
      nativeToScVal(CCTP_DOMAIN[params.destinationChain], { type: "u32" }),
      destinationMintRecipientBytes(params.destinationChain, params.destinationAddress),
      new Address(resolveStellarUsdcContractId(getCctpNetworkMode())).toScVal(),
      xdr.ScVal.scvBytes(Buffer.alloc(32)),
      nativeToScVal(maxFee, { type: "i128" }),
      nativeToScVal(1000, { type: "u32" }),
    ],
  });
}

export async function mintAndForwardOnStellar(params: {
  stellarAddress: string;
  attestation: CctpAttestationMessage;
}): Promise<string> {
  const contracts = getCctpContracts();
  return submitSorobanContractCall({
    stellarAddress: params.stellarAddress,
    contractId: contracts.stellar.cctpForwarder,
    method: "mint_and_forward",
    args: [
      xdr.ScVal.scvBytes(hexToBuffer(params.attestation.message)),
      xdr.ScVal.scvBytes(hexToBuffer(params.attestation.attestation)),
    ],
  });
}

export function getStellarForwarderBytes32(): `0x${string}` {
  return contractStrkeyToBytes32(getCctpContracts().stellar.cctpForwarder);
}
