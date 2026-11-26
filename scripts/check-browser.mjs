import { spawn } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const cwd = fileURLToPath(new URL("../", import.meta.url));
const output = await mkdtemp(join(tmpdir(), "atlas-browser-"));
const port = process.env.ATLAS_QA_PORT ?? "43119";
const url = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, [
  fileURLToPath(new URL("../node_modules/vite/bin/vite.js", import.meta.url)),
  "--host", "127.0.0.1", "--port", port, "--strictPort",
], {
  cwd, stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, ATLAS_VITE_CACHE_DIR: join(output, "vite-cache") },
});
let serverLog = "", serverExit = false;
server.stdout.on("data", data => { serverLog += data; });
server.stderr.on("data", data => { serverLog += data; });
server.on("exit", () => { serverExit = true; });
const scripts = process.argv.slice(2);
const checks = scripts.length ? scripts : ["check-restored-resource-links", "check-ui-system"];
try {
  const deadline = Date.now() + 30_000;
  while (true) {
    if (serverExit) throw new Error(`Test server failed: ${serverLog}`);
    if (Date.now() > deadline) throw new Error(`Test server timeout: ${serverLog}`);
    try {
      if ((await fetch(url)).ok) break;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  for (const check of checks) {
    if (!/^check-[a-z-]+$/.test(check)) throw new Error(`Invalid check name: ${check}`);
    const status = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [`scripts/${check}.mjs`], {
        cwd, stdio: "inherit",
        env: {
          ...process.env, CHROME_PATH: process.env.CHROME_PATH ?? chromium.executablePath(),
          APP_URL: url, ATLAS_URL: url, SCREENSHOT_DIR: output, ATLAS_QA_OUTPUT: output,
        },
      });
      child.on("error", reject);
      child.on("exit", resolve);
    });
    if (status !== 0) throw new Error(`${check} exited with ${status}`);
  }
  console.log(`PASS: browser checks used isolated synthetic workspaces on port ${port}.`);
} finally {
  server.kill();
  await writeFile(join(output, "server.log"), serverLog);
  console.log(`Browser evidence: ${output}`);
}
