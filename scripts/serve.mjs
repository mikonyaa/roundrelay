import http from "node:http";
import { readFile, realpath, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
const args = process.argv.slice(2);
if (
  args.length !== 2 ||
  args[0] !== "--port" ||
  !/^\d+$/.test(args[1]) ||
  Number(args[1]) > 65535
) {
  console.error("Usage: node serve.mjs --port 0 (or a port from 1 to 65535)");
  process.exit(1);
}
const root = await realpath(fileURLToPath(new URL("./app/", import.meta.url)));
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};
const server = http.createServer(async (req, res) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; connect-src 'self'; img-src 'self' data:; worker-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  );
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405);
    res.end("Method not allowed");
    return;
  }
  try {
    const raw = (req.url ?? "/").split("?")[0];
    const decoded = decodeURIComponent(raw);
    if (
      decoded.includes("\\") ||
      decoded.includes("\0") ||
      decoded.split("/").includes("..") ||
      !decoded.startsWith("/")
    ) {
      res.writeHead(400);
      res.end("Invalid path");
      return;
    }
    const relative = decoded === "/" ? "index.html" : decoded.slice(1);
    const filename = await realpath(path.resolve(root, relative));
    if (!filename.startsWith(root + path.sep)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }
    if (!(await stat(filename)).isFile()) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const data = await readFile(filename);
    res.writeHead(200, {
      "Content-Type":
        mime[path.extname(filename)] ?? "application/octet-stream",
      "Content-Length": data.length,
    });
    res.end(req.method === "HEAD" ? undefined : data);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
});
server.on("error", (error) => {
  console.error(
    `RoundRelay could not listen: ${error.message}. Choose --port 0 or another free port. No other process was stopped.`,
  );
  process.exitCode = 1;
});
server.listen(Number(args[1]), "127.0.0.1", () => {
  const address = server.address();
  console.log(`ROUNDRELAY_URL=http://127.0.0.1:${address.port}/`);
});
