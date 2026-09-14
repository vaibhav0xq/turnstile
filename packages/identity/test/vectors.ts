import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const read = <T>(name: string): T =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`../vectors/${name}`, import.meta.url)), "utf8")) as T;

export type KdfVector = {
  prfOutput: `0x${string}`;
  account: { mnemonic: string; privateKey: `0x${string}`; address: `0x${string}` };
  door: Array<{
    event: { chainId: number; eventAddress: `0x${string}` };
    hkdf: { salt: string; info: string };
    privateKey: `0x${string}`;
    address: `0x${string}`;
  }>;
  vault: { key: `0x${string}`; iv: `0x${string}`; aad: string; plaintextJson: string; blob: string };
};

export type EntryVector = {
  domain: { name: string; version: string; chainId: number; verifyingContract: `0x${string}` };
  typeString: string;
  message: { eventId: string; tokenId: string; slot: string };
  typeHash: `0x${string}`;
  domainSeparator: `0x${string}`;
  structHash: `0x${string}`;
  digest: `0x${string}`;
  signer: `0x${string}`;
  doorKeyPrivateKey: `0x${string}`;
  signature: `0x${string}`;
  r: `0x${string}`;
  s: `0x${string}`;
  v: number;
  entryCode: string;
  entryCodeCompact: string;
  entryCodeBase45: string;
};

export type BindVector = {
  domain: { name: string; version: string; chainId: number; verifyingContract: `0x${string}` };
  typeString: string;
  message: { tokenId: string; doorKey: `0x${string}`; nonce: string; deadline: string };
  typeHash: `0x${string}`;
  domainSeparator: `0x${string}`;
  structHash: `0x${string}`;
  digest: `0x${string}`;
  signer: `0x${string}`;
  signerPrivateKey: `0x${string}`;
  signature: `0x${string}`;
  r: `0x${string}`;
  s: `0x${string}`;
  v: number;
};

export const kdfVector = read<KdfVector>("kdf.json");
export const entryVector = read<EntryVector>("entry.json");
export const bindVector = read<BindVector>("bind.json");
