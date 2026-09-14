import type { ReactNode } from "react";
import { type AppConfig, chainName, explorerAddress } from "../../chain/config";
import { shortAddress } from "../../lib/format";
import { LIVE_URL } from "../../live/client";
import { CONTRACTS_URL, IDENTITY_SPEC_URL, REPO_URL } from "./copy";

const PROVIDER_LABEL: Record<string, string> = {
  alchemy: "Alchemy",
  monad: "the Monad public RPC",
  local: "a local node",
};

/**
 * The credits: every claim here is read from the deployment's own config (chain, provider, addresses,
 * indexer endpoint), so a staging build never advertises what only production has.
 */
export function UnderTheHood({ config }: { config: AppConfig | undefined }) {
  const provider = config ? (PROVIDER_LABEL[config.rpcProvider] ?? config.rpcProvider) : null;
  const fallbacks = config?.rpcFallbackUrls.length ?? 0;
  return (
    <dl className="grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3" data-testid="under-the-hood">
      <Credit term="Monad" detail={config ? chainName(config.chainId) : "connecting…"}>
        Every seat, door key and check-in is a transaction. The fan path in the demo is three of them — mint,
        bind the door key, check in — each confirmed in about a second.
      </Credit>
      <Credit
        term="One passkey, many keys"
        detail={
          <a href={IDENTITY_SPEC_URL} className="link" target="_blank" rel="noreferrer">
            identity spec →
          </a>
        }
      >
        The WebAuthn PRF extension turns one passkey into an account key (Mera's default salt, so it is the
        same account in any Mera app), a presence key for the door and a vault key — each under its own salt.
      </Credit>
      <Credit
        term="Sponsored transactions"
        detail={config ? <Addr config={config} address={config.forwarder} label="forwarder" /> : null}
      >
        An ERC-2771 forwarder: your passkey signs the request, the relayer submits it and pays the gas, and
        the contract still sees your address as the sender. Free seats, door keys, listings and check-ins go
        this way; a paid seat is sent from your own account.
      </Credit>
      <Credit
        term="Envio HyperIndex"
        detail={
          LIVE_URL ? (
            <a href={LIVE_URL} className="link" target="_blank" rel="noreferrer">
              GraphQL endpoint →
            </a>
          ) : (
            <span data-testid="live-unconfigured">no indexer on this deployment</span>
          )
        }
      >
        Powers the Live layer: the organiser's door board, the city pulse on this page, a seat's provenance
        and your passport history — all read from the indexer, never invented client-side.
      </Credit>
      <Credit
        term="RPC"
        detail={
          provider
            ? `${provider}${fallbacks > 0 ? ` · ${fallbacks} fallback${fallbacks === 1 ? "" : "s"}` : ""}`
            : "connecting…"
        }
      >
        The browser reads the chain directly — seat maps refresh every few seconds, confirmations are polled
        several times a second — and falls over to the next endpoint on its own when one errors.
      </Credit>
      <Credit
        term="Contracts & source"
        detail={
          <span className="flex flex-wrap gap-x-3">
            {config ? <Addr config={config} address={config.factory} label="factory" /> : null}
            <a href={CONTRACTS_URL} className="link" target="_blank" rel="noreferrer">
              Solidity →
            </a>
            <a href={REPO_URL} className="link" target="_blank" rel="noreferrer">
              GitHub →
            </a>
          </span>
        }
      >
        A factory deploys one event contract per night — ERC-721 seats that only move through the capped
        resale — plus the forwarder. Foundry tests, shared test vectors and the indexer live in the same repo.
      </Credit>
    </dl>
  );
}

function Credit({ term, detail, children }: { term: string; detail: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-t border-line pt-4">
      <dt className="display text-2xl">{term}</dt>
      <dd className="text-sm text-paper/75">{children}</dd>
      {detail ? <dd className="mono text-[11px] text-muted">{detail}</dd> : null}
    </div>
  );
}

function Addr({ config, address, label }: { config: AppConfig; address: string; label: string }) {
  const href = explorerAddress(config, address);
  const text = `${label} ${shortAddress(address)}`;
  return href ? (
    <a href={href} className="link" target="_blank" rel="noreferrer" title={address}>
      {text} →
    </a>
  ) : (
    <span title={address}>{text}</span>
  );
}
