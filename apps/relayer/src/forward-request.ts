// Pure validation of a relayed ERC-2771 request: no environment, no chain — unit-testable on its own.
import { type Address, getAddress, type Hex, isAddress, isHex, toFunctionSelector } from "viem";

export const relayGas = { buy: 200_000, bindDoorKey: 110_000, list: 90_000, delist: 40_000 } as const;
export const txGas = { buy: 320_000n, bindDoorKey: 250_000n, list: 240_000n, delist: 190_000n } as const;
const selectorNames = new Map<Hex, keyof typeof relayGas>([
  [toFunctionSelector("buy(uint256)"), "buy"],
  [toFunctionSelector("bindDoorKey(uint256,address)"), "bindDoorKey"],
  [toFunctionSelector("list(uint256,uint96)"), "list"],
  [toFunctionSelector("delist(uint256)"), "delist"],
]);

export type ForwardRequest = {
  from: Address;
  to: Address;
  value: bigint;
  gas: bigint;
  nonce?: bigint;
  deadline: bigint;
  data: Hex;
  signature: Hex;
};
export type Validation =
  | { ok: true; request: ForwardRequest; action: keyof typeof relayGas }
  | { ok: false; code: string; message: string };

function decimal(value: unknown, field: string): bigint {
  if (typeof value !== "string" || !/^[0-9]+$/.test(value))
    throw new Error(`${field} must be a decimal string`);
  return BigInt(value);
}

export function validateRelayBody(body: unknown, nowSeconds = Math.floor(Date.now() / 1000)): Validation {
  try {
    if (!body || typeof body !== "object") throw new Error("body must be an object");
    const request = (body as { request?: unknown }).request;
    if (!request || typeof request !== "object") throw new Error("request must be an object");
    const value = request as {
      from?: unknown;
      to?: unknown;
      value?: unknown;
      gas?: unknown;
      nonce?: unknown;
      deadline?: unknown;
      data?: unknown;
      signature?: unknown;
    };
    if (
      typeof value.from !== "string" ||
      !isAddress(value.from) ||
      typeof value.to !== "string" ||
      !isAddress(value.to)
    ) {
      throw new Error("from and to must be addresses");
    }
    if (typeof value.data !== "string" || !isHex(value.data) || value.data.length < 10) {
      throw new Error("data must contain a selector");
    }
    if (typeof value.signature !== "string" || !isHex(value.signature))
      throw new Error("signature must be hex");
    const parsed: ForwardRequest = {
      from: getAddress(value.from),
      to: getAddress(value.to),
      value: decimal(value.value, "value"),
      gas: decimal(value.gas, "gas"),
      deadline: decimal(value.deadline, "deadline"),
      data: value.data,
      signature: value.signature,
      ...(value.nonce === undefined ? {} : { nonce: decimal(value.nonce, "nonce") }),
    };
    if (parsed.value !== 0n)
      return { ok: false, code: "VALUE_NOT_ZERO", message: "Relayed value must be zero" };
    const action = selectorNames.get(parsed.data.slice(0, 10) as Hex);
    if (!action) return { ok: false, code: "SELECTOR_NOT_ALLOWED", message: "Function is not relayable" };
    if (parsed.gas > BigInt(relayGas[action]))
      return { ok: false, code: "GAS_TOO_HIGH", message: "Requested gas exceeds cap" };
    if (parsed.deadline <= BigInt(nowSeconds) || parsed.deadline > BigInt(nowSeconds + 3600)) {
      return { ok: false, code: "BAD_DEADLINE", message: "Deadline must be within the next hour" };
    }
    return { ok: true, request: parsed, action };
  } catch (error) {
    return {
      ok: false,
      code: "INVALID_REQUEST",
      message: error instanceof Error ? error.message : "Invalid request",
    };
  }
}
