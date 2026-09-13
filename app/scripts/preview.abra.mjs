import { spawn } from "node:child_process";
import { openSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const out = openSync(join(process.env.TEMP, "opencode", "preview.log"), "a");
const c = spawn(
  process.execPath,
  [join(here, "..", "node_modules", "vite", "bin", "vite.js"), "preview", "--port", "4199", "--strictPort"],
  { cwd: join(here, ".."), stdio: ["ignore", out, out], detached: true, windowsHide: false },
);
c.unref();
console.log("preview pid", c.pid);