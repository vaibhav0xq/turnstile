// Runs `forge <args>` from a package directory, or skips cleanly when Foundry is not installed.
// Lets root `pnpm test` / `pnpm build` recurse into packages/contracts without making Foundry a hard
// requirement for the TypeScript-only workflow (the contracts CI job always has forge).
// Installs Soldeer dependencies first when ./dependencies is missing (fresh clone).
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const args = process.argv.slice(2);
const shell = process.platform === "win32";

function forge(forgeArgs) {
  const result = spawnSync("forge", forgeArgs, { stdio: "inherit", shell });
  if (result.error && result.error.code === "ENOENT") return null;
  if (result.error) throw result.error;
  return result.status ?? 1;
}

if (args[0] !== "soldeer" && !existsSync("dependencies")) {
  console.log("[contracts] dependencies/ missing — running `forge soldeer install` first");
  const status = forge(["soldeer", "install"]);
  if (status === null) {
    console.log(
      `[contracts] forge not found — skipping \`forge ${args.join(" ")}\` (install: https://getfoundry.sh)`,
    );
    process.exit(0);
  }
  if (status !== 0) process.exit(status);
}

const status = forge(args);
if (status === null) {
  console.log(
    `[contracts] forge not found — skipping \`forge ${args.join(" ")}\` (install: https://getfoundry.sh)`,
  );
  process.exit(0);
}
process.exit(status);
