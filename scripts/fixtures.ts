import { mkdirSync, writeFileSync } from "node:fs";
import { sampleProject } from "../src/model/sample";
import { csvCell } from "../src/import";
for (const dir of ["examples", "fixtures"]) mkdirSync(dir, { recursive: true });
for (const [name, project] of [
  ["workshop-24", sampleProject()],
  ["workshop-60", sampleProject(60, 6)],
  ["long-label-60", sampleProject(60, 6, 300000, true)],
] as const) {
  writeFileSync(
    `fixtures/${name}.json`,
    JSON.stringify(project, null, 2) + "\n",
  );
}
const sample = sampleProject();
writeFileSync(
  "examples/workshop-24.json",
  JSON.stringify(sample, null, 2) + "\n",
);
writeFileSync(
  "examples/participants.csv",
  [
    "participant_id,public_label",
    ...sample.participants.map((p) =>
      [p.participantId, p.publicLabel].map(csvCell).join(","),
    ),
  ].join("\r\n") + "\r\n",
);
writeFileSync(
  "examples/assignments.csv",
  [
    "round,group,participant_id",
    ...sample.rounds.flatMap((r) =>
      r.assignments.map((a) =>
        [String(r.order), a.groupId, a.participantId].map(csvCell).join(","),
      ),
    ),
  ].join("\r\n") + "\r\n",
);
writeFileSync(
  "examples/participants-template.csv",
  "participant_id,public_label\r\n",
);
writeFileSync(
  "examples/assignments-template.csv",
  "round,group,participant_id\r\n",
);
