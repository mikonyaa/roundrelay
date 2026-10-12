import { spawn } from "node:child_process";
const server = spawn(process.execPath, ["serve.mjs", "--port", "0"], {
  cwd: ".local/web-package",
  stdio: ["ignore", "pipe", "pipe"],
});
try {
  const url = await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Suspension server timed out")),
      10000,
    );
    server.stdout.on("data", (chunk) => {
      const match = String(chunk).match(/ROUNDRELAY_URL=(\S+)/);
      if (match) {
        clearTimeout(timeout);
        resolve(match[1]);
      }
    });
    server.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error("Suspension server exited " + code));
    });
  });
  const test = spawn(process.execPath, ["scripts/suspension.mjs"], {
    stdio: "inherit",
    env: { ...process.env, ROUNDRELAY_URL: url },
  });
  const code = await new Promise((resolve) => test.on("exit", resolve));
  if (code) process.exitCode = code;
} finally {
  server.kill("SIGTERM");
}
