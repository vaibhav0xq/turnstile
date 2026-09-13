import { turnstileEventAbi } from "@turnstile/contracts/abi";
import { decodeEntryCode, isSlotAcceptable, recoverEntrySigner } from "@turnstile/identity/entry";
import { type Address, getAddress, zeroAddress } from "viem";
import { chainId, gateAccount, gateWallet, publicClient } from "./config.ts";
import { decodeContractError } from "./errors.ts";
import { findEvent } from "./events.ts";
import { transactionQueue } from "./queue.ts";

type LookupSuccess = {
  ok: true;
  tokenId: bigint;
  eventAddress: Address;
  eventName: string;
  holder: Address;
  tier: { index: number; name: string };
  slot: bigint;
  signature: `0x${string}`;
};
type LookupFailure = { ok: false; status: number; code: string; message: string; [key: string]: unknown };
export type LookupResult = LookupSuccess | LookupFailure;

export async function lookupEntry(text: unknown): Promise<LookupResult> {
  if (typeof text !== "string")
    return { ok: false, status: 400, code: "CODE_FORMAT_INVALID", message: "code must be a string" };
  let code: ReturnType<typeof decodeEntryCode>;
  try {
    code = decodeEntryCode(text);
  } catch (error) {
    return {
      ok: false,
      status: 400,
      code: "CODE_FORMAT_INVALID",
      message: error instanceof Error ? error.message : "Invalid entry code",
    };
  }
  if (code.event.chainId !== chainId) {
    return { ok: false, status: 400, code: "WRONG_CHAIN", message: "Entry code is for another chain" };
  }
  const address = getAddress(code.event.eventAddress);
  const event = await findEvent(address);
  if (!event) return { ok: false, status: 404, code: "UNKNOWN_EVENT", message: "Unknown event" };
  let states: readonly {
    holder: Address;
    doorKey: Address;
    checkedInAt: bigint;
    listingPrice: bigint;
    listed: boolean;
  }[];
  let tier: readonly [number, { name: string; price: bigint; firstSeat: number; seatCount: number }];
  try {
    const results = await Promise.all([
      publicClient.readContract({
        address,
        abi: turnstileEventAbi,
        functionName: "seatStates",
        args: [code.message.tokenId, 1n],
      }),
      publicClient.readContract({
        address,
        abi: turnstileEventAbi,
        functionName: "tierOf",
        args: [code.message.tokenId],
      }),
    ]);
    states = results[0] as typeof states;
    tier = results[1] as typeof tier;
  } catch (error) {
    return {
      ok: false,
      status: 404,
      code: "NO_TICKET",
      message: error instanceof Error ? error.message : "Unknown seat",
    };
  }
  const state = states[0];
  if (!state || state.holder === zeroAddress)
    return { ok: false, status: 404, code: "NO_TICKET", message: "Seat has no ticket" };
  if (state.checkedInAt !== 0n) {
    return {
      ok: false,
      status: 409,
      code: "ALREADY_CHECKED_IN",
      message: "Ticket is already checked in",
      checkedInAt: state.checkedInAt,
    };
  }
  if (state.doorKey === zeroAddress)
    return { ok: false, status: 409, code: "NO_DOOR_KEY", message: "Ticket has no door key" };
  const chainAccepts = await publicClient.readContract({
    address,
    abi: turnstileEventAbi,
    functionName: "isSlotAcceptable",
    args: [code.message.slot],
  });
  if (!chainAccepts || !isSlotAcceptable(code.message.slot)) {
    const currentSlot = await publicClient.readContract({
      address,
      abi: turnstileEventAbi,
      functionName: "currentSlot",
    });
    return { ok: false, status: 409, code: "SLOT_EXPIRED", message: "Entry code has expired", currentSlot };
  }
  let signer: Address;
  try {
    signer = await recoverEntrySigner(code.event, code.message, code.signature);
  } catch {
    return { ok: false, status: 409, code: "BAD_SIGNATURE", message: "Entry signature is invalid" };
  }
  if (signer.toLowerCase() !== state.doorKey.toLowerCase()) {
    return {
      ok: false,
      status: 409,
      code: "BAD_SIGNATURE",
      message: "Entry signature does not match door key",
    };
  }
  return {
    ok: true,
    tokenId: code.message.tokenId,
    eventAddress: address,
    eventName: event.name,
    holder: getAddress(state.holder),
    tier: { index: Number(tier[0]), name: tier[1].name },
    slot: code.message.slot,
    signature: code.signature,
  };
}

export async function checkIn(text: unknown) {
  const lookup = await lookupEntry(text);
  if (!lookup.ok) return lookup;
  const args = [lookup.tokenId, lookup.slot, lookup.signature] as const;
  try {
    await publicClient.simulateContract({
      account: gateAccount,
      address: lookup.eventAddress,
      abi: turnstileEventAbi,
      functionName: "checkIn",
      args,
      gas: 180_000n,
    } as never);
  } catch (error) {
    return { ok: false, status: 409, ...decodeContractError(error) };
  }
  const started = Date.now();
  return transactionQueue.run(async () => {
    const hash = await gateWallet.writeContract({
      address: lookup.eventAddress,
      abi: turnstileEventAbi,
      functionName: "checkIn",
      args,
      gas: 180_000n,
    } as never);
    const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 30_000 });
    console.log(`tx gate ${hash} ${receipt.gasUsed}`);
    return {
      ...lookup,
      hash,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed,
      ms: Date.now() - started,
    };
  });
}
