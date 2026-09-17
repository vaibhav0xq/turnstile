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
        Seats, door keys and check-ins are on-chain transactions.
      </Credit>
      <Credit
        term="One passkey, many keys"
        detail={
          <a href={IDENTITY_SPEC_URL} className="link" target="_blank" rel="noreferrer">
            identity spec →
          </a>
        }
      >
        Mera derives separate account, door and vault keys from one passkey using distinct salts.
      </Credit>
      <Credit
        term="Sponsored transactions"
        detail={config ? <Addr config={config} address={config.forwarder} label="forwarder" /> : null}
      >
        The ERC-2771 relayer sponsors free seats, door keys, resale actions and check-ins. Paid seats use your
        account.
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
        Indexes contracts for live door boards, city activity, seat provenance and passport history.
      </Credit>
      <Credit
        term="RPC"
        detail={
          provider
            ? `${provider}${fallbacks > 0 ? ` · ${fallbacks} fallback${fallbacks === 1 ? "" : "s"}` : ""}`
            : "connecting…"
        }
      >
        The browser reads the chain through this provider. The relayer submits through it too.
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
        The factory deploys an ERC-721 event contract. Identity-bound seats move only through capped resale.
      </Credit>
      <Credit term="Monad Metropolis" detail="Monad testnet · 10143">
        <ul className="flex flex-col gap-1">
          <li>Track: Social, Attention &amp; Culture.</li>
          <li>Best Mera-Powered UX on Monad: passkey account. No wallet or app.</li>
          <li>Mera: One Passkey, Many Keys: separate account, door and vault keys from one passkey.</li>
          <li>Envio HyperIndex: indexes contracts and feeds door board, city pulse and seat provenance.</li>
          <li>Best Projects using Alchemy: Monad RPC for the browser and relayer.</li>
        </ul>
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
