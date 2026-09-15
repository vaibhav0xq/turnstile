import { type Address, getAddress, isAddress } from "viem";
import { publicClient, relayerAccount, relayerWallet, settings } from "./config.ts";
import { isDenial } from "./spend-guard.ts";
import { currentGasPrice, denialResponse, queueDenial, relayerQueue, spendGuard } from "./sponsorship.ts";

const lastDrip = new Map<Address, number>();
const DRIP_COOLDOWN_MS = 600_000;
// Sent with an explicit 21k gas limit — exactly a plain transfer. Without it the node would estimate, and
// a recipient contract with an expensive fallback could turn one "drip" into an arbitrarily large gas bill
// (Monad charges the limit); with it such a recipient simply reverts at 21k.
const DRIP_GAS = 21_000n;

export async function drip(value: unknown) {
  if (!settings.dripEnabled)
    return { status: 403, body: { error: { code: "DRIP_DISABLED", message: "Drip is disabled" } } };
  const rawTo = value && typeof value === "object" ? (value as { to?: unknown }).to : undefined;
  if (typeof rawTo !== "string" || !isAddress(rawTo)) {
    return { status: 400, body: { error: { code: "INVALID_ADDRESS", message: "to must be an address" } } };
  }
  const to = getAddress(rawTo);
  const previous = lastDrip.get(to) ?? 0;
  if (previous > Date.now() - DRIP_COOLDOWN_MS) {
    const retryAfterSec = Math.max(1, Math.ceil((previous + DRIP_COOLDOWN_MS - Date.now()) / 1000));
    return {
      status: 429,
      retryAfterSec,
      body: { error: { code: "RATE_LIMITED", message: "Address was dripped recently", retryAfterSec } },
    };
  }
  // Floor, hourly/daily drip budget and this address's daily share, before any chain read.
  const denied = await spendGuard.admit("drip", to);
  if (denied) return denialResponse(denied);
  const balance = await publicClient.getBalance({ address: to });
  if (balance >= settings.dripAmount / 2n) {
    return { status: 409, body: { error: { code: "ALREADY_FUNDED", message: "Address already has funds" } } };
  }
  const queued = relayerQueue.run(async () => {
    const charge = await spendGuard.charge("drip", to);
    if (isDenial(charge)) return denialResponse(charge);
    try {
      const hash = await relayerWallet.sendTransaction({
        account: relayerAccount,
        to,
        value: settings.dripAmount,
        gas: DRIP_GAS,
      });
      lastDrip.set(to, Date.now());
      return { hash, charge };
    } catch (error) {
      charge.settle(settings.dripAmount + DRIP_GAS * currentGasPrice());
      throw error;
    }
  });
  let sent: Awaited<typeof queued>;
  try {
    sent = await queued;
  } catch (error) {
    const busy = queueDenial(error);
    if (busy) return busy;
    throw error;
  }
  if ("status" in sent) return sent;
  // The receipt wait happens outside the queue: the next transaction can go out on the pending nonce.
  try {
    const receipt = await publicClient.waitForTransactionReceipt({ hash: sent.hash, timeout: 30_000 });
    sent.charge.settle(settings.dripAmount + DRIP_GAS * receipt.effectiveGasPrice);
  } catch (error) {
    sent.charge.settle(settings.dripAmount + DRIP_GAS * currentGasPrice());
    throw error;
  }
  console.log(`tx drip ${sent.hash}`);
  return { status: 200, body: { hash: sent.hash, amountWei: settings.dripAmount } };
}
