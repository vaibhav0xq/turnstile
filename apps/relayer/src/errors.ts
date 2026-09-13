import { erc2771ForwarderAbi, turnstileEventAbi } from "@turnstile/contracts/abi";
import { type Abi, ContractFunctionRevertedError, decodeErrorResult, type Hex } from "viem";

const eventAbi: Abi = turnstileEventAbi;
const forwarderAbi: Abi = erc2771ForwarderAbi;

export type DecodedRevert = { code: string; message: string; args?: readonly unknown[] };

function rawData(error: unknown): Hex | undefined {
  let value: unknown = error;
  for (let depth = 0; depth < 8 && value && typeof value === "object"; depth++) {
    const item = value as { data?: unknown; cause?: unknown };
    if (typeof item.data === "string" && /^0x[0-9a-f]+$/i.test(item.data)) return item.data as Hex;
    value = item.cause;
  }
  return undefined;
}

export function decodeContractError(error: unknown): DecodedRevert {
  let value: unknown = error;
  for (let depth = 0; depth < 8 && value && typeof value === "object"; depth++) {
    if (value instanceof ContractFunctionRevertedError && value.data?.errorName) {
      const args = value.data.args;
      return {
        code: value.data.errorName,
        message: value.shortMessage,
        ...(args ? { args: [...args] } : {}),
      };
    }
    value = (value as { cause?: unknown }).cause;
  }
  const data = rawData(error);
  if (data) {
    for (const abi of [eventAbi, forwarderAbi]) {
      try {
        const decoded = decodeErrorResult({ abi, data });
        return {
          code: decoded.errorName,
          message: `Contract reverted with ${decoded.errorName}`,
          ...(decoded.args ? { args: [...decoded.args] } : {}),
        };
      } catch {
        // Try the other ABI.
      }
    }
  }
  return { code: "CONTRACT_REVERTED", message: error instanceof Error ? error.message : "Contract reverted" };
}
