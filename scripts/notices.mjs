import { readFile, writeFile } from "node:fs/promises";
const lock = JSON.parse(await readFile("package-lock.json", "utf8"));
const inventory = Object.entries(lock.packages)
  .filter(([key]) => key)
  .map(([key, value]) => ({
    name: key.slice(key.lastIndexOf("node_modules/") + 13),
    version: value.version,
    license: value.license ?? "See package license",
    dev: value.dev ?? false,
  }))
  .sort((a, b) => a.name.localeCompare(b.name));
await writeFile(
  "docs/dependencies.json",
  JSON.stringify(inventory, null, 2) + "\n",
);
const packages = [
  "react",
  "react-dom",
  "scheduler",
  "zod",
  "papaparse",
  "@fontsource/dm-sans",
  "@fontsource/ibm-plex-mono",
];
let notices =
  "RoundRelay v0.1.0 third-party notices\n====================================\n\nPlanner and examples are original MIT-licensed RoundRelay code/data.\nNo competitor source code is incorporated. Fonts are bundled locally.\n\n";
for (const name of packages) {
  const dir = `node_modules/${name}/`;
  const meta = JSON.parse(await readFile(dir + "package.json", "utf8"));
  let license;
  for (const filename of ["LICENSE", "LICENSE.txt", "LICENSE.md", "OFL.txt"]) {
    try {
      license = await readFile(dir + filename, "utf8");
      break;
    } catch {
      /* Try standard license filenames. */
    }
  }
  if (!license) throw new Error(`Missing runtime license: ${name}`);
  notices += `\n--- ${name} ${meta.version} (${meta.license}) ---\n${license}\n`;
}
await writeFile("docs/THIRD-PARTY-NOTICES.txt", notices.trimEnd() + "\n");
console.log(
  `Checked ${inventory.length} locked packages; included full licenses for ${packages.length} runtime packages.`,
);
