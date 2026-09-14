import { Link } from "react-router";
import { type AppConfig, explorerAddress } from "../../chain/config";
import { CONTRACTS_URL, DOCS_URL, REPO_URL } from "./copy";

export function Footer({ config }: { config: AppConfig | undefined }) {
  const explorer = config ? explorerAddress(config, config.factory) : null;
  return (
    <footer className="site-inner border-t border-line py-10 text-sm text-muted">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="display text-2xl text-paper">Turnstile</div>
          <div className="mt-1 max-w-sm">
            Identity-bound tickets and access on Monad. Built for Monad Metropolis — Social, Attention &
            Culture.
          </div>
        </div>
        <ul className="mono flex flex-wrap gap-x-5 gap-y-2 text-[11px] uppercase tracking-[0.16em]">
          <li>
            <a href={REPO_URL} className="hover:text-paper" target="_blank" rel="noreferrer">
              GitHub
            </a>
          </li>
          <li>
            <a href={CONTRACTS_URL} className="hover:text-paper" target="_blank" rel="noreferrer">
              Contracts
            </a>
          </li>
          {explorer ? (
            <li>
              <a href={explorer} className="hover:text-paper" target="_blank" rel="noreferrer">
                Explorer
              </a>
            </li>
          ) : null}
          <li>
            <a href={DOCS_URL} className="hover:text-paper" target="_blank" rel="noreferrer">
              Docs
            </a>
          </li>
          <li>
            <Link to="/city" className="hover:text-paper">
              City
            </Link>
          </li>
          <li>
            <Link to="/organise" className="hover:text-paper">
              Organise
            </Link>
          </li>
          <li>
            <Link to="/me" className="hover:text-paper">
              Passport
            </Link>
          </li>
        </ul>
      </div>
    </footer>
  );
}
