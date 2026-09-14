import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, type Server } from "node:http";
import test from "node:test";
import { parseUrlList, planRpc, providerLabel, rpcHost, transportFor } from "../src/rpc.ts";

test("parseUrlList keeps only http(s) URLs and trims", () => {
  assert.deepEqual(parseUrlList(undefined), []);
  assert.deepEqual(parseUrlList(""), []);
  assert.deepEqual(parseUrlList(" https://a.example/rpc , http://127.0.0.1:8545,, ws://nope, junk "), [
    "https://a.example/rpc",
    "http://127.0.0.1:8545",
  ]);
});

test("providerLabel names known providers from the hostname only", () => {
  assert.equal(providerLabel("https://monad-testnet.g.alchemy.com/v2/SECRET-KEY"), "alchemy");
  assert.equal(providerLabel("https://testnet-rpc.monad.xyz"), "monad");
  assert.equal(providerLabel("https://rpc.ankr.com/monad_testnet/KEY"), "ankr");
  assert.equal(providerLabel("http://127.0.0.1:8545"), "local");
  assert.equal(providerLabel("https://rpc.someprovider.io/x"), "someprovider");
  assert.equal(providerLabel("not a url"), "unknown");
});

test("rpcHost never includes the path (where API keys live)", () => {
  assert.equal(rpcHost("https://monad-testnet.g.alchemy.com/v2/SECRET-KEY"), "monad-testnet.g.alchemy.com");
  assert.equal(rpcHost("http://127.0.0.1:8545/"), "127.0.0.1:8545");
  assert.equal(rpcHost("nope"), "invalid");
});

test("planRpc drops a fallback equal to the primary", () => {
  const plan = planRpc("https://a.example", ["https://a.example", "https://b.example"]);
  assert.deepEqual(plan, { primary: "https://a.example", fallbacks: ["https://b.example"], provider: "a" });
});

test("transportFor is plain http without fallbacks and a fallback transport with them", () => {
  const plain = transportFor(planRpc("http://127.0.0.1:8545", []))({ chain: undefined });
  assert.equal(plain.config.type, "http");
  const layered = transportFor(planRpc("http://127.0.0.1:8545", ["http://127.0.0.1:8546"]), { batch: true })({
    chain: undefined,
  });
  assert.equal(layered.config.type, "fallback");
  const { transports } = layered.value as {
    transports: { config: { methods?: { exclude?: string[] } } }[];
  };
  assert.equal(transports.length, 2);
  assert.equal(transports[0]?.config.methods, undefined);
  assert.deepEqual(transports[1]?.config.methods?.exclude, ["eth_sendRawTransaction", "eth_sendTransaction"]);
});

test("fallback transport fails reads over but pins sends to the primary", async () => {
  const calls: string[] = [];
  const primary = await rpcServer("primary", false, calls);
  const secondary = await rpcServer("secondary", true, calls);
  try {
    const transport = transportFor(planRpc(primary.url, [secondary.url]))({
      chain: undefined,
      retryCount: 0,
    });
    const block = await transport.request({ method: "eth_blockNumber" });
    assert.equal(block, "0x2a");
    assert.deepEqual(calls, ["primary eth_blockNumber", "secondary eth_blockNumber"]);
    calls.length = 0;
    await assert.rejects(transport.request({ method: "eth_sendRawTransaction", params: ["0x00"] }));
    // viem retries a 5xx on the same transport (as plain http() does); the point is that no attempt
    // ever reaches the secondary.
    assert.ok(calls.length >= 1);
    assert.deepEqual(new Set(calls), new Set(["primary eth_sendRawTransaction"]));
  } finally {
    await Promise.all([primary.close(), secondary.close()]);
  }
});

/** A tiny JSON-RPC server that either answers every read with 0x2a or fails with HTTP 503. */
async function rpcServer(name: string, ok: boolean, calls: string[]) {
  const server: Server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk: Buffer) => {
      body += chunk.toString();
    });
    request.on("end", () => {
      const payload = JSON.parse(body) as { id: number; method: string };
      calls.push(`${name} ${payload.method}`);
      if (!ok) {
        response.writeHead(503, { "content-type": "text/plain" });
        response.end("down");
        return;
      }
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ jsonrpc: "2.0", id: payload.id, result: "0x2a" }));
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as { port: number };
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((done) => server.close(() => done())),
  };
}
