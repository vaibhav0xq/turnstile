import { type Address, getAddress, isAddress } from "viem";
import { publicClient, relayerAccount, relayerWallet, settings } from "./config.ts";
import { transactionQueue } from "./queue.ts";

const lastDrip = new Map<Address, number>();

export async function drip(value: unknown) {
  if (!settings.dripEnabled)
    return { status: 403, body: { error: { code: "DRIP_DISABLED", message: "Drip is disabled" } } };
  const rawTo = value && typeof value === "object" ? (value as { to?: unknown }).to : undefined;
  if (typeof rawTo !== "string" || !isAddress(rawTo)) {
    return { status: 400, body: { error: { code: "INVALID_ADDRESS", message: "to must be an address" } } };
  }
  const to = getAddress(rawTo);
  const previous = lastDrip.get(to) ?? 0;
  if (previous > Date.now() - 600_000) {
    return {
      status: 429,
      body: { error: { code: "RATE_LIMITED", message: "Address was dripped recently" } },
    };
  }
  const balance = await publicClient.getBalance({ address: to });
  if (balance >= settings.dripAmount / 2n) {
    return { status: 409, body: { error: { code: "ALREADY_FUNDED", message: "Address already has funds" } } };
  }
  const hash = await transactionQueue.run(() =>
    relayerWallet.sendTransaction({ account: relayerAccount, to, value: settings.dripAmount }),
  );
  await publicClient.waitForTransactionReceipt({ hash, timeout: 30_000 });
  lastDrip.set(to, Date.now());
  console.log(`tx drip ${hash}`);
  return { status: 200, body: { hash, amountWei: settings.dripAmount } };
}
