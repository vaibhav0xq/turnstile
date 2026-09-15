import { erc2771ForwarderAbi } from "@turnstile/contracts/abi";
import { concat } from "viem";
import { deployment, publicClient, relayerAccount, relayerWallet } from "./config.ts";
import { decodeContractError } from "./errors.ts";
import { findEvent } from "./events.ts";
import {
  type ForwardRequest,
  relayGas,
  txGas,
  type Validation,
  validateRelayBody,
} from "./forward-request.ts";
import { isDenial } from "./spend-guard.ts";
import { currentGasPrice, denialResponse, queueDenial, relayerQueue, spendGuard } from "./sponsorship.ts";

export { type ForwardRequest, relayGas, type Validation, validateRelayBody };

function executable(request: ForwardRequest) {
  return {
    from: request.from,
    to: request.to,
    value: request.value,
    gas: request.gas,
    deadline: Number(request.deadline), // uint48 in the ABI → number in viem's tuple type
    data: request.data,
    signature: request.signature,
  };
}

export async function relay(body: unknown) {
  const validated = validateRelayBody(body);
  if (!validated.ok) return { status: 400, body: { error: validated } };
  const { request, action } = validated;
  // Spend safety first: a paused or exhausted relayer answers before it spends RPC reads on the request.
  const denied = await spendGuard.admit("relay", request.from);
  if (denied) return denialResponse(denied);
  if (!(await findEvent(request.to))) {
    return {
      status: 400,
      body: { error: { code: "UNKNOWN_EVENT", message: "Target is not a Turnstile event" } },
    };
  }
  if (request.nonce !== undefined) {
    const nonce = await publicClient.readContract({
      address: deployment.forwarder,
      abi: erc2771ForwarderAbi,
      functionName: "nonces",
      args: [request.from],
    });
    if (nonce !== request.nonce)
      return { status: 400, body: { error: { code: "BAD_FORWARD_REQUEST", message: "Nonce mismatch" } } };
  }
  const forwardRequest = executable(request);
  const verified = await publicClient.readContract({
    address: deployment.forwarder,
    abi: erc2771ForwarderAbi,
    functionName: "verify",
    args: [forwardRequest],
  });
  if (!verified)
    return {
      status: 400,
      body: { error: { code: "BAD_FORWARD_REQUEST", message: "Forward request verification failed" } },
    };
  try {
    await publicClient.call({
      account: deployment.forwarder,
      to: request.to,
      data: concat([request.data, request.from]),
    });
  } catch (error) {
    return { status: 409, body: { error: decodeContractError(error) } };
  }
  try {
    await publicClient.simulateContract({
      account: relayerAccount,
      address: deployment.forwarder,
      abi: erc2771ForwarderAbi,
      functionName: "execute",
      args: [forwardRequest],
      value: 0n,
      gas: txGas[action],
    });
  } catch (error) {
    return { status: 409, body: { error: decodeContractError(error) } };
  }
  const started = Date.now();
  const queued = relayerQueue.run(async () => {
    // The charge that counts happens here, in turn, so a burst of admitted requests cannot overshoot a
    // budget by more than the queue depth; the floor is re-read against work already in flight.
    const charge = await spendGuard.charge("relay", request.from);
    if (isDenial(charge)) return denialResponse(charge);
    try {
      const hash = await relayerWallet.writeContract({
        address: deployment.forwarder,
        abi: erc2771ForwarderAbi,
        functionName: "execute",
        args: [forwardRequest],
        value: 0n,
        gas: txGas[action],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 30_000 });
      charge.settle(txGas[action] * receipt.effectiveGasPrice);
      console.log(`tx relay ${hash} ${receipt.gasUsed}`);
      return {
        status: 200,
        body: {
          hash,
          blockNumber: receipt.blockNumber,
          status: receipt.status,
          gasUsed: receipt.gasUsed,
          ms: Date.now() - started,
        },
      };
    } catch (error) {
      // The send may still have landed (a receipt timeout): count the gas cap so the floor stays honest.
      charge.settle(txGas[action] * currentGasPrice());
      throw error;
    }
  });
  return queued.catch((error) => {
    const busy = queueDenial(error);
    if (busy) return busy;
    throw error;
  });
}
