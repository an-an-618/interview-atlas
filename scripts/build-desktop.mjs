import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const cwd = fileURLToPath(new URL("../", import.meta.url));
const platform = process.argv[2] ?? process.platform;
if (platform !== process.platform || !["darwin", "win32"].includes(platform)) {
  console.error("Build desktop installers on the matching macOS or Windows host.");
  process.exit(1);
}
function run(command, args, env = process.env) {
  const result = spawnSync(command, args, { cwd, env, stdio: "inherit" });
  if (result.error) console.error(result.error.message);
  if (result.status !== 0) process.exit(result.status ?? 1);
}
const env = platform === "darwin"
  ? { ...process.env, MACOSX_DEPLOYMENT_TARGET: "15.0" }
  : process.env;
run(process.execPath, [
  require.resolve("@tauri-apps/cli/tauri.js"), "build",
  "--bundles", platform === "darwin" ? "app" : "nsis,msi",
], env);
if (platform === "darwin") run("bash", ["scripts/create-macos-dmg.sh"], env);
