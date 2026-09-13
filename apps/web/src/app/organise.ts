// Organiser flow: passkey → (testnet drip) → `TurnstileFactory.createEvent` from the organiser's own
// account → the new room appears in the city. The factory is not ERC-2771-aware on purpose: the organiser
// is `msg.sender`, so publishing an event is the one action here that costs the user gas.
import type { QueryClient } from "@tanstack/react-query";
import { turnstileEventAbi, turnstileFactoryAbi } from "@turnstile/contracts/abi";
import {
  type Address,
  BaseError,
  ContractFunctionRevertedError,
  createWalletClient,
  type Hex,
  http,
  parseEventLogs,
} from "viem";
import { create } from "zustand";
import { chainFor, publicClientFor } from "../chain/client";
import { type AppConfig, configQueryKey } from "../chain/config";
import { useIdentity } from "../identity/store";
import { API_URL, api } from "../lib/api";
import { balanceOf, drip } from "../relayer/client";
import { VENUE_IDS } from "../venues/layout";
import { explain } from "./checkout";
import { buildCreateEventArgs, createEventGas, type EventDraft, metadataBaseURI } from "./event-draft";

export type OrganiseStep = "idle" | "identity" | "funding" | "creating" | "done" | "error";

interface OrganiseState {
  step: OrganiseStep;
  error: { code: string; message: string } | null;
  hash: Hex | null;
  created: { address: Address; eventId: string } | null;
  reset(): void;
  /** Resolves to the new event's address, or null when it failed (the error is in the store). */
  publish(config: AppConfig, draft: EventDraft, queryClient: QueryClient): Promise<Address | null>;
}

/** Custom error name from a viem simulation failure, or null when it was not a contract revert. */
export function revertName(error: unknown): string | null {
  if (!(error instanceof BaseError)) return null;
  const revert = error.walk((e) => e instanceof ContractFunctionRevertedError);
  return revert instanceof ContractFunctionRevertedError ? (revert.data?.errorName ?? null) : null;
}

export const useOrganise = create<OrganiseState>()((set) => ({
  step: "idle",
  error: null,
  hash: null,
  created: null,

  reset() {
    set({ step: "idle", error: null, hash: null, created: null });
  },

  async publish(config, draft, queryClient) {
    set({ step: "identity", error: null, hash: null, created: null });
    try {
      const organiser = await useIdentity.getState().ensureFan();
      const client = publicClientFor(config);
      const apiOrigin = API_URL || window.location.origin;

      // The factory hands out sequential ids, so the metadata prefix can name the event before it exists.
      const count = await client.readContract({
        address: config.factory,
        abi: turnstileFactoryAbi,
        functionName: "eventCount",
      });
      const expectedId = count + 1n;
      const args = buildCreateEventArgs(draft, {
        venueIds: VENUE_IDS,
        gates: [config.gate],
        baseURI: metadataBaseURI(apiOrigin, expectedId),
      });

      // Simulate first: a revert (InvalidConfig, InvalidTiers) surfaces here by name instead of as a
      // failed transaction the organiser paid for. The estimate falls back to a formula when the node
      // refuses to estimate for an unfunded account.
      let gas = createEventGas(draft);
      try {
        const estimate = await client.estimateContractGas({
          account: organiser.address,
          address: config.factory,
          abi: turnstileFactoryAbi,
          functionName: "createEvent",
          args: [args.config, args.tiers, args.gates],
        });
        gas = (estimate * 5n) / 4n;
      } catch (error) {
        const revert = revertName(error);
        if (revert) throw { code: revert, message: revert };
      }
      const gasPrice = await client.getGasPrice();
      const needed = (gas * gasPrice * 13n) / 10n;
      let balance = await balanceOf(config, organiser.address);
      if (balance < needed) {
        if (!config.drip.enabled) throw { code: "INSUFFICIENT_FUNDS_CREATE", message: "" };
        set({ step: "funding" });
        await drip(organiser.address);
        for (let i = 0; i < 20 && balance < needed; i++) {
          await new Promise((r) => setTimeout(r, 600));
          balance = await balanceOf(config, organiser.address);
        }
        if (balance < needed) throw { code: "INSUFFICIENT_FUNDS_CREATE", message: "" };
      }

      set({ step: "creating" });
      const wallet = createWalletClient({
        account: organiser.account,
        chain: chainFor(config),
        transport: http(config.rpcUrl),
      });
      const hash = await wallet.writeContract({
        address: config.factory,
        abi: turnstileFactoryAbi,
        functionName: "createEvent",
        args: [args.config, args.tiers, args.gates],
        gas,
      });
      set({ hash });
      const receipt = await client.waitForTransactionReceipt({ hash, timeout: 60_000 });
      if (receipt.status !== "success") throw { code: "REVERTED", message: "Publishing the event reverted." };
      const created = parseEventLogs({
        abi: turnstileFactoryAbi,
        eventName: "EventCreated",
        logs: receipt.logs,
      })[0];
      if (!created) throw { code: "NO_EVENT", message: "The factory did not report a new event." };
      const address = created.args.eventAddress;
      const eventId = created.args.eventId;

      // Someone else published in between: point the metadata prefix at the id we actually got.
      if (eventId !== expectedId) {
        const fix = await wallet.writeContract({
          address,
          abi: turnstileEventAbi,
          functionName: "setBaseURI",
          args: [metadataBaseURI(apiOrigin, eventId)],
          gas: 60_000n,
        });
        await client.waitForTransactionReceipt({ hash: fix, timeout: 60_000 });
      }

      // Skip the relayer's 15 s event cache so the new beacon lights up immediately.
      await queryClient.fetchQuery({
        queryKey: configQueryKey,
        queryFn: () => api<AppConfig>("/api/config?fresh=1"),
        staleTime: 0,
      });
      set({ step: "done", created: { address, eventId: eventId.toString() } });
      return address;
    } catch (error) {
      set({ step: "error", error: explain(error) });
      return null;
    }
  },
}));
