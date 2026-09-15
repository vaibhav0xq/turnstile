import { randomBytes } from "node:crypto";
import { formatEther } from "viem";
import { gateAccount, publicClient, relayerAccount, settings } from "./config.ts";
import { txGas } from "./forward-request.ts";
import { QueueFullError, QueueTimeoutError, TransactionQueue } from "./queue.ts";
import { type ActionClass, type Denial, SpendGuard, type SpendStatus } from "./spend-guard.ts";

/** Random per-process id: the sweep calls `/api/health` a few times and expects to see one. */
export const instanceId = randomBytes(3).toString("hex");

/** One queue per wallet: the relayer key (relay + drip) and the gate key never share nonces. */
export const relayerQueue = new TransactionQueue({
  max: settings.spend.queueMax,
  maxWaitMs: settings.spend.queueMaxWaitMs,
});
export const gateQueue = new TransactionQueue({
  max: settings.spend.queueMax,
  maxWaitMs: settings.spend.queueMaxWaitMs,
});

// Monad charges gas at the limit, so the worst case of one action is its gas cap at the current price.
// The price is refreshed lazily (once a minute) and falls back to the last value on RPC errors; the
// starting value is Monad's flat testnet base fee, which is also a safe over-estimate on anvil.
const GAS_PRICE_TTL_MS = 60_000;
const DEFAULT_GAS_PRICE = 100_000_000_000n;
export const GATE_CHECK_IN_GAS = 180_000n;
let gasPrice = { value: DEFAULT_GAS_PRICE, at: 0 };

export function currentGasPrice(): bigint {
  if (Date.now() - gasPrice.at >= GAS_PRICE_TTL_MS) {
    gasPrice = { ...gasPrice, at: Date.now() };
    publicClient
      .getGasPrice()
      .then((value) => {
        gasPrice = { value, at: Date.now() };
      })
      .catch(() => undefined);
  }
  return gasPrice.value;
}

const maxRelayGas = Object.values(txGas).reduce((max, gas) => (gas > max ? gas : max), 0n);

export function estimateCostWei(action: ActionClass): bigint {
  const price = currentGasPrice();
  switch (action) {
    case "relay":
      return maxRelayGas * price;
    case "drip":
      return settings.dripAmount + 21_000n * price;
    case "gate":
      return GATE_CHECK_IN_GAS * price;
  }
}

export const spendGuard = new SpendGuard({
  limits: settings.spend.limits,
  wallets: {
    relayer: { address: relayerAccount.address, reserveWei: settings.spend.relayerReserveWei },
    gate: { address: gateAccount.address, reserveWei: settings.spend.gateReserveWei },
  },
  estimateCostWei,
  getBalance: (address) => publicClient.getBalance({ address }),
});

/** Wire shape of a refusal, plus the `Retry-After` the route should send. */
export function denialResponse(denial: Denial) {
  const { status, retryAfterSec, ...error } = denial;
  return { status, retryAfterSec, body: { error: { ...error, retryAfterSec } } };
}

/** A refused queue slot is a `BUSY` 503, distinct from the limiter's 429 so the client can retry sooner. */
export function queueDenial(error: unknown) {
  if (error instanceof QueueFullError || error instanceof QueueTimeoutError) {
    return {
      status: 503,
      retryAfterSec: 5,
      body: {
        error: {
          code: "BUSY",
          message: "The relayer is busy with other transactions; try again in a few seconds",
          retryAfterSec: 5,
        },
      },
    };
  }
  return null;
}

export async function sponsorshipStatus() {
  const status: SpendStatus = await spendGuard.status();
  const wallet = (name: "relayer" | "gate") => {
    const w = status.wallets[name];
    return {
      address: w.address,
      balanceWei: w.balanceWei,
      balanceMon: w.balanceWei === null ? null : formatEther(w.balanceWei),
      reserveWei: w.reserveWei,
      inflight: w.inflight,
      ok: w.ok,
    };
  };
  return {
    paused: status.paused,
    wallets: { relayer: wallet("relayer"), gate: wallet("gate") },
    budgets: status.budgets,
    spentWei: status.spentWei,
    queue: {
      relayer: { pending: relayerQueue.pending, max: relayerQueue.max },
      gate: { pending: gateQueue.pending, max: gateQueue.max },
    },
  };
}
