// Local chain for apps/web + apps/relayer: deploys the contracts to a running anvil (127.0.0.1:8545,
// chain 31337) and seeds the two demo events, idempotently. Start anvil first:
//   anvil --chain-id 31337
// then `pnpm dev:chain`. Uses anvil's well-known accounts: #0 deployer/organiser, #1 relayer, #2 gate,
// #3 demo fan. Nothing here touches a real network — the testnet path is docs/deploy-monad-testnet.md.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RPC = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const ANVIL = {
  deployer: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", // #0
  gate: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC", // #2 (address only; key lives in apps/relayer/.env)
};
const contracts = join(dirname(fileURLToPath(import.meta.url)), "..", "packages", "contracts");
const deployments = join(contracts, "deployments", "31337.json");

async function rpc(method, params = []) {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = await res.json();
  if (body.error) throw new Error(`${method}: ${body.error.message}`);
  return body.result;
}

function forge(args, env = {}) {
  const r = spawnSync("forge", args, { cwd: contracts, stdio: "inherit", env: { ...process.env, ...env } });
  if (r.error) throw r.error;
  if (r.status !== 0) process.exit(r.status ?? 1);
}

let chainId;
try {
  chainId = Number(await rpc("eth_chainId"));
} catch (error) {
  console.error(`no chain at ${RPC} — start \`anvil --chain-id 31337\` first (${error.message})`);
  process.exit(1);
}
if (chainId !== 31337) {
  console.error(`chain ${chainId} at ${RPC} is not the local anvil (31337); refusing`);
  process.exit(1);
}

let factory = existsSync(deployments) ? JSON.parse(readFileSync(deployments, "utf8")).factory : undefined;
const deployed = factory && (await rpc("eth_getCode", [factory, "latest"])) !== "0x";
if (!deployed) {
  console.log("[dev-chain] deploying forwarder + implementation + factory");
  forge(["script", "script/Deploy.s.sol", "--rpc-url", RPC, "--private-key", ANVIL.deployer, "--broadcast"]);
  factory = JSON.parse(readFileSync(deployments, "utf8")).factory;
} else {
  console.log(`[dev-chain] factory already deployed at ${factory}`);
}

// eventCount() selector
const count = Number(await rpc("eth_call", [{ to: factory, data: "0x71be2e4a" }, "latest"]));
if (count === 0) {
  console.log("[dev-chain] seeding the two demo events (doors in 3 days; gate = anvil #2)");
  forge(
    [
      "script",
      "script/CreateDemoEvent.s.sol",
      "--rpc-url",
      RPC,
      "--private-key",
      ANVIL.deployer,
      "--broadcast",
    ],
    { GATE_ADDRESS: ANVIL.gate, START_IN: "259200", BASE_URI: "http://localhost:5173/api/events/" },
  );
} else {
  console.log(`[dev-chain] ${count} event(s) already seeded`);
}
console.log(`[dev-chain] ready — factory ${factory} on ${RPC}`);
