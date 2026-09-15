import type { Address } from "viem";

/**
 * What the relayer will pay for, and when it stops.
 *
 * Three independent brakes, checked in this order:
 *  1. reserve floor — a wallet whose balance would drop below its reserve (counting work already in
 *     flight) sponsors nothing more; the operator tops it up, nothing is ever drained to zero;
 *  2. class budgets — sponsored actions per rolling hour and rolling day, per action class
 *     (`relay` = forwarded fan actions, `drip` = testnet top-ups, `gate` = check-ins);
 *  3. per-address quotas — actions per rolling day for one fan address (`relay`) or one recipient (`drip`),
 *     so a single account cannot eat the class budget.
 *
 * `admit` is the cheap pre-check at the door of a request; `charge` is the one that counts, taken right
 * before the transaction is sent (inside the wallet's queue) so concurrent admissions cannot overshoot a
 * budget by more than the queue depth. Everything lives in memory: a restart starts the windows empty, and
 * the guard assumes the single-process deployment the queue assumes too.
 */
export type ActionClass = "relay" | "drip" | "gate";
export type WalletName = "relayer" | "gate";

const WALLET_FOR: Record<ActionClass, WalletName> = { relay: "relayer", drip: "relayer", gate: "gate" };
export const HOUR_MS = 3_600_000;
export const DAY_MS = 86_400_000;

export interface SpendLimits {
  hourly: Record<ActionClass, number>;
  daily: Record<ActionClass, number>;
  /** Per-address rolling-day quotas; `gate` has no caller address to key on. */
  perAddressDaily: Record<Exclude<ActionClass, "gate">, number>;
}

export interface WalletPolicy {
  address: Address;
  reserveWei: bigint;
}

export interface SpendGuardOptions {
  limits: SpendLimits;
  wallets: Record<WalletName, WalletPolicy>;
  /** Worst-case cost of one action of the class (gas limit × gas price, plus the drip amount). */
  estimateCostWei: (action: ActionClass) => bigint;
  getBalance: (address: Address) => Promise<bigint>;
  /** How long a balance read is trusted before it is refreshed (a send invalidates it anyway). */
  balanceTtlMs?: number;
  now?: () => number;
}

export type Denial =
  | {
      code: "SPONSOR_PAUSED";
      status: 503;
      message: string;
      retryAfterSec: number;
      wallet: WalletName;
    }
  | {
      code: "BUDGET_EXHAUSTED";
      status: 429;
      message: string;
      retryAfterSec: number;
      window: "hour" | "day";
    }
  | { code: "QUOTA_EXCEEDED"; status: 429; message: string; retryAfterSec: number };

export interface Charge {
  /** Call exactly once when the transaction is done, with its cost when known (gas limit × price paid). */
  settle: (costWei?: bigint) => void;
}

export function isDenial(value: Denial | Charge): value is Denial {
  return "code" in value;
}

export interface WalletStatus {
  address: Address;
  balanceWei: bigint | null;
  reserveWei: bigint;
  /** Charged sends not yet settled, and the wei reserved for them (each at its own class's estimate). */
  inflight: number;
  reservedWei: bigint;
  ok: boolean;
}

export interface SpendStatus {
  paused: boolean;
  wallets: Record<WalletName, WalletStatus>;
  budgets: Record<
    ActionClass,
    {
      hour: { used: number; limit: number };
      day: { used: number; limit: number };
      perAddressDay: number | null;
    }
  >;
  /** Estimated spend from settled transactions (wei), both wallets together. */
  spentWei: { hour: bigint; day: bigint };
}

/** Timestamps inside a rolling window; pruned on every read so memory follows the limit, not the traffic. */
export class RollingWindow {
  readonly windowMs: number;
  private readonly stamps: number[] = [];
  constructor(windowMs: number) {
    this.windowMs = windowMs;
  }

  private prune(now: number): void {
    const cutoff = now - this.windowMs;
    let drop = 0;
    while (drop < this.stamps.length && (this.stamps[drop] as number) <= cutoff) drop++;
    if (drop > 0) this.stamps.splice(0, drop);
  }

  count(now: number): number {
    this.prune(now);
    return this.stamps.length;
  }

  add(now: number): void {
    this.prune(now);
    this.stamps.push(now);
  }

  /** Seconds until the oldest entry leaves the window (0 when empty). */
  retryAfterSec(now: number): number {
    this.prune(now);
    const oldest = this.stamps[0];
    return oldest === undefined ? 0 : Math.max(1, Math.ceil((oldest + this.windowMs - now) / 1000));
  }
}

class Meter {
  readonly hour = new RollingWindow(HOUR_MS);
  readonly day = new RollingWindow(DAY_MS);
  readonly perAddress = new Map<string, RollingWindow>();
  /** Settled cost per window: `[at, costWei]` pairs. */
  readonly spent: { at: number; costWei: bigint }[] = [];
}

const ACTIONS: ActionClass[] = ["relay", "drip", "gate"];
const MON = 10n ** 18n;

function mon(wei: bigint): string {
  const whole = wei / MON;
  const frac = ((wei % MON) * 1000n) / MON;
  return `${whole}.${frac.toString().padStart(3, "0")}`;
}

export class SpendGuard {
  private readonly limits: SpendLimits;
  private readonly wallets: Record<WalletName, WalletPolicy>;
  private readonly estimateCostWei: (action: ActionClass) => bigint;
  private readonly getBalance: (address: Address) => Promise<bigint>;
  private readonly balanceTtlMs: number;
  private readonly now: () => number;
  private readonly meters: Record<ActionClass, Meter> = {
    relay: new Meter(),
    drip: new Meter(),
    gate: new Meter(),
  };
  private readonly inflight: Record<WalletName, number> = { relayer: 0, gate: 0 };
  // Exact wei held back per wallet for charged, unsettled sends: a drip and a relay cost different amounts,
  // so a count × the current action's estimate would misprice whichever class is in flight.
  private readonly reservedWei: Record<WalletName, bigint> = { relayer: 0n, gate: 0n };
  private readonly balances: Partial<Record<WalletName, { value: bigint; at: number }>> = {};
  private readonly reads: Partial<Record<WalletName, Promise<bigint>>> = {};

  constructor(options: SpendGuardOptions) {
    this.limits = options.limits;
    this.wallets = options.wallets;
    this.estimateCostWei = options.estimateCostWei;
    this.getBalance = options.getBalance;
    this.balanceTtlMs = options.balanceTtlMs ?? 5_000;
    this.now = options.now ?? Date.now;
  }

  /** Cached per wallet; concurrent callers share one read. */
  private balanceOf(wallet: WalletName): Promise<bigint> {
    const cached = this.balances[wallet];
    const now = this.now();
    if (cached && now - cached.at < this.balanceTtlMs) return Promise.resolve(cached.value);
    const inflight = this.reads[wallet];
    if (inflight) return inflight;
    const read = this.getBalance(this.wallets[wallet].address)
      .then((value) => {
        this.balances[wallet] = { value, at: this.now() };
        return value;
      })
      .finally(() => {
        delete this.reads[wallet];
      });
    this.reads[wallet] = read;
    return read;
  }

  private invalidate(wallet: WalletName): void {
    delete this.balances[wallet];
  }

  /**
   * Reserve check for `extraWei` more on top of what is already held back for work in flight (charged and
   * not yet settled). A failed balance read counts as paused: sponsoring blind is how a wallet gets drained.
   */
  private async floor(action: ActionClass, extraWei: bigint): Promise<Denial | null> {
    const wallet = WALLET_FOR[action];
    const policy = this.wallets[wallet];
    let balance: bigint;
    try {
      balance = await this.balanceOf(wallet);
    } catch {
      return {
        code: "SPONSOR_PAUSED",
        status: 503,
        message: "Sponsorship is paused: the relayer cannot read its balance right now",
        retryAfterSec: 15,
        wallet,
      };
    }
    const committed = this.reservedWei[wallet] + extraWei;
    if (balance - committed < policy.reserveWei) {
      return {
        code: "SPONSOR_PAUSED",
        status: 503,
        message:
          wallet === "gate"
            ? `The door is paused: the gate wallet is at its reserve (${mon(balance)} MON)`
            : `Sponsorship is paused: the relayer wallet is at its reserve (${mon(balance)} MON)`,
        retryAfterSec: 60,
        wallet,
      };
    }
    return null;
  }

  private budgets(action: ActionClass, address: string | undefined, now: number): Denial | null {
    const meter = this.meters[action];
    if (meter.hour.count(now) >= this.limits.hourly[action]) {
      return {
        code: "BUDGET_EXHAUSTED",
        status: 429,
        message: `The relayer's hourly ${action} budget is used up`,
        retryAfterSec: meter.hour.retryAfterSec(now),
        window: "hour",
      };
    }
    if (meter.day.count(now) >= this.limits.daily[action]) {
      return {
        code: "BUDGET_EXHAUSTED",
        status: 429,
        message: `The relayer's daily ${action} budget is used up`,
        retryAfterSec: meter.day.retryAfterSec(now),
        window: "day",
      };
    }
    if (action !== "gate" && address !== undefined) {
      const window = meter.perAddress.get(address.toLowerCase());
      if (window && window.count(now) >= this.limits.perAddressDaily[action]) {
        return {
          code: "QUOTA_EXCEEDED",
          status: 429,
          message:
            action === "drip"
              ? "This address has had its share of the testnet drip for today"
              : "This account has used its sponsored actions for today",
          retryAfterSec: window.retryAfterSec(now),
        };
      }
    }
    return null;
  }

  /** Pre-check at the door of a request: nothing is counted. */
  async admit(action: ActionClass, address?: string): Promise<Denial | null> {
    return (
      (await this.floor(action, this.estimateCostWei(action))) ?? this.budgets(action, address, this.now())
    );
  }

  /**
   * The check that counts: call right before the send, inside the wallet's queue. The action's worst-case
   * cost is held back before the (async) balance read and the budget is checked and counted in one
   * synchronous step after it, so concurrent charges see each other.
   */
  async charge(action: ActionClass, address?: string): Promise<Denial | Charge> {
    const wallet = WALLET_FOR[action];
    const costWei = this.estimateCostWei(action);
    this.inflight[wallet]++;
    this.reservedWei[wallet] += costWei;
    const denied = (await this.floor(action, 0n)) ?? this.budgets(action, address, this.now());
    if (denied) {
      this.inflight[wallet]--;
      this.reservedWei[wallet] -= costWei;
      return denied;
    }
    const now = this.now();
    const meter = this.meters[action];
    meter.hour.add(now);
    meter.day.add(now);
    if (action !== "gate" && address !== undefined) {
      const key = address.toLowerCase();
      const window = meter.perAddress.get(key) ?? new RollingWindow(DAY_MS);
      window.add(now);
      meter.perAddress.set(key, window);
    }
    let settled = false;
    return {
      settle: (paidWei) => {
        if (settled) return;
        settled = true;
        this.inflight[wallet]--;
        this.reservedWei[wallet] -= costWei;
        this.invalidate(wallet);
        if (paidWei !== undefined && paidWei > 0n) meter.spent.push({ at: this.now(), costWei: paidWei });
        this.pruneSpent(meter);
        this.pruneAddresses(meter);
      },
    };
  }

  private pruneSpent(meter: Meter): void {
    const cutoff = this.now() - DAY_MS;
    while (meter.spent.length > 0 && (meter.spent[0] as { at: number }).at <= cutoff) meter.spent.shift();
  }

  private pruneAddresses(meter: Meter): void {
    const now = this.now();
    for (const [key, window] of meter.perAddress) if (window.count(now) === 0) meter.perAddress.delete(key);
  }

  async status(): Promise<SpendStatus> {
    const now = this.now();
    const wallets = {} as Record<WalletName, WalletStatus>;
    for (const name of ["relayer", "gate"] as const) {
      const policy = this.wallets[name];
      let balance: bigint | null = null;
      try {
        balance = await this.balanceOf(name);
      } catch {
        balance = null;
      }
      wallets[name] = {
        address: policy.address,
        balanceWei: balance,
        reserveWei: policy.reserveWei,
        inflight: this.inflight[name],
        reservedWei: this.reservedWei[name],
        ok: balance !== null && balance - this.reservedWei[name] >= policy.reserveWei,
      };
    }
    const budgets = {} as SpendStatus["budgets"];
    let hourWei = 0n;
    let dayWei = 0n;
    for (const action of ACTIONS) {
      const meter = this.meters[action];
      this.pruneSpent(meter);
      for (const entry of meter.spent) {
        dayWei += entry.costWei;
        if (entry.at > now - HOUR_MS) hourWei += entry.costWei;
      }
      budgets[action] = {
        hour: { used: meter.hour.count(now), limit: this.limits.hourly[action] },
        day: { used: meter.day.count(now), limit: this.limits.daily[action] },
        perAddressDay: action === "gate" ? null : this.limits.perAddressDaily[action],
      };
    }
    return {
      paused: !wallets.relayer.ok || !wallets.gate.ok,
      wallets,
      budgets,
      spentWei: { hour: hourWei, day: dayWei },
    };
  }
}
