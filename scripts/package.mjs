import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
const exec = promisify(execFile);
const version = JSON.parse(await readFile("package.json", "utf8")).version;
const staging = path.resolve(".local/web-package");
await rm(staging, { recursive: true, force: true });
await mkdir(staging, { recursive: true });
await mkdir("artifacts", { recursive: true });
await cp("dist", path.join(staging, "app"), { recursive: true });
await mkdir(path.join(staging, "rehearsal-fixtures"), { recursive: true });
for (const [source, target] of [
  ["scripts/serve.mjs", "serve.mjs"],
  ["docs/README-OFFLINE.md", "README-OFFLINE.md"],
  ["LICENSE", "LICENSE"],
  ["docs/THIRD-PARTY-NOTICES.txt", "THIRD-PARTY-NOTICES.txt"],
  ["examples/workshop-24.json", "sample-event.json"],
  ["examples/participants-template.csv", "participants-template.csv"],
  ["examples/assignments-template.csv", "assignments-template.csv"],
  ...[
    "PROJECTION-PROTOCOL.md",
    "RECOVERY.md",
    "MIGRATION-0.1.1.md",
    "ROOM-REHEARSAL.md",
    "LOCAL-CANDIDATE-QA.md",
  ].map((name) => [`docs/${name}`, name]),
  ...["alpha20", "beta0", "alpha5", "invalid-group", "invalid-participant"].map(
    (name) => [
      `fixtures/lifecycle-${name}.json`,
      `rehearsal-fixtures/lifecycle-${name}.json`,
    ],
  ),
  ["fixtures/workshop-60.json", "rehearsal-fixtures/workshop-60.json"],
])
  await cp(source, path.join(staging, target));
await writeFile(
  path.join(staging, "build-info.json"),
  JSON.stringify(
    {
      version,
      sourceCommit:
        process.env.GITHUB_SHA ??
        (
          await exec("git", ["rev-parse", "HEAD"]).catch(() => ({
            stdout: "uncommitted-local",
          }))
        ).stdout.trim(),
      node: process.version,
      origin: process.env.GITHUB_ACTIONS ? "github-actions" : "local",
      sourceDirty: !!(
        await exec("git", ["status", "--porcelain"]).catch(() => ({
          stdout: "unknown",
        }))
      ).stdout.trim(),
      projectionProtocolVersion: 2,
      eventSchemaVersion: 1,
    },
    null,
    2,
  ) + "\n",
);
const zip = path.resolve(`artifacts/roundrelay-${version}-web.zip`);
await rm(zip, { force: true });
await exec(
  "zip",
  [
    "-q",
    "-r",
    zip,
    "app",
    "serve.mjs",
    "README-OFFLINE.md",
    "LICENSE",
    "THIRD-PARTY-NOTICES.txt",
    "sample-event.json",
    "participants-template.csv",
    "assignments-template.csv",
    "build-info.json",
    "PROJECTION-PROTOCOL.md",
    "RECOVERY.md",
    "MIGRATION-0.1.1.md",
    "ROOM-REHEARSAL.md",
    "LOCAL-CANDIDATE-QA.md",
    "rehearsal-fixtures",
  ],
  { cwd: staging },
);
console.log(zip);
