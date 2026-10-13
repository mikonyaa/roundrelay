import Papa from "papaparse";
import { requireOperationalRoutes } from "../conductor/readiness";
import {
  LIMITS,
  projectSchema,
  type Diagnostic,
  type EventProject,
} from "../model/schema";
import { validateProject } from "../validate";

export type ImportPreview = {
  project: EventProject;
  diagnostics: Diagnostic[];
  source: string;
  missingIds: string[];
};
export function checkText(text: string): void {
  if (new TextEncoder().encode(text).length > LIMITS.bytes)
    throw new Error("Input exceeds the 2 MiB limit");
}
export function importJSON(text: string): ImportPreview {
  checkText(text);
  let depth = 0,
    inString = false,
    escape = false;
  for (const c of text) {
    if (inString) {
      if (escape) escape = false;
      else if (c === "\\") escape = true;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === "{" || c === "[") {
      if (++depth > LIMITS.depth)
        throw new Error("JSON exceeds maximum nesting depth 16");
    } else if (c === "}" || c === "]") depth--;
  }
  const value: unknown = JSON.parse(text.replace(/^\uFEFF/, ""));
  const parsed = projectSchema.safeParse(value);
  if (!parsed.success)
    throw new Error(
      parsed.error.issues
        .slice(0, 8)
        .map((i) => `${i.path.join(".") || "project"}: ${i.message}`)
        .join("\n"),
    );
  return {
    project: parsed.data,
    diagnostics: validateProject(parsed.data),
    source: "Portable JSON",
    missingIds: [],
  };
}
function parseCSV(
  text: string,
  headers: string[],
  maxRows: number,
): Record<string, string>[] {
  checkText(text);
  const result = Papa.parse<Record<string, string>>(
    text.replace(/^\uFEFF/, ""),
    { header: true, skipEmptyLines: "greedy", dynamicTyping: false },
  );
  if (result.errors.length)
    throw new Error(
      result.errors
        .slice(0, 8)
        .map((e) => `CSV row ${(e.row ?? 0) + 2}: ${e.message}`)
        .join("\n"),
    );
  if (result.meta.fields?.join(",") !== headers.join(","))
    throw new Error(`Expected CSV headers: ${headers.join(",")}`);
  if (result.data.length > maxRows || !result.data.length)
    throw new Error(`CSV requires 1–${maxRows} data rows`);
  for (const [i, row] of result.data.entries())
    for (const key of headers)
      if (!row[key]?.trim() || row[key].length > 120)
        throw new Error(
          `CSV row ${i + 2}, ${key}: missing or longer than 120 characters`,
        );
  return result.data;
}
export function importCSV(
  participantsText: string,
  assignmentsText: string,
  settings: { minSize: number; maxSize: number; durationMs: number },
): ImportPreview {
  const rows = parseCSV(
    participantsText,
    ["participant_id", "public_label"],
    60,
  );
  const assignments = parseCSV(
    assignmentsText,
    ["round", "group", "participant_id"],
    360,
  );
  const participants = rows.map((row) => ({
    participantId: row.participant_id,
    publicLabel: row.public_label,
  }));
  const orders = [...new Set(assignments.map((a) => Number(a.round)))].sort(
    (a, b) => a - b,
  );
  if (
    orders.some((o, i) => !Number.isInteger(o) || o !== i + 1) ||
    orders.length > 6
  )
    throw new Error("CSV rounds must be consecutive integers 1–6");
  const rounds = orders.map((order) => {
    const list = assignments.filter((a) => Number(a.round) === order);
    return {
      roundId: `r${order}`,
      order,
      publicTitle: `Round ${order}`,
      durationMs: settings.durationMs,
      groups: [...new Set(list.map((a) => a.group))].map((groupId) => ({
        groupId,
        publicLabel: groupId,
        minSize: settings.minSize,
        maxSize: settings.maxSize,
        enabled: true,
      })),
      assignments: list.map((a) => ({
        participantId: a.participant_id,
        groupId: a.group,
      })),
      status: "planned" as const,
      timer: null,
      frozen: null,
    };
  });
  const project: EventProject = {
    kind: "roundrelay-event",
    schemaVersion: 1,
    eventId: `csv-${crypto.randomUUID()}`,
    revision: 0,
    title: "Imported workshop",
    participants,
    rounds,
    availability: rounds.flatMap((r) =>
      participants.map((p) => ({
        roundId: r.roundId,
        participantId: p.participantId,
        available: r.assignments.some(
          (a) => a.participantId === p.participantId,
        ),
      })),
    ),
    constraints: { mustSeparate: [] },
    conductor: { activeRoundId: null, pendingDraft: null },
    repairHistory: [],
    metadata: {
      createdAt: new Date().toISOString(),
      appVersion: "0.1.0",
      source: "RoundRelay CSV pair",
    },
  };
  const parsed = projectSchema.safeParse(project);
  if (!parsed.success)
    throw new Error(
      parsed.error.issues
        .slice(0, 8)
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("\n"),
    );
  return {
    project,
    diagnostics: validateProject(project),
    source: "CSV pair · omitted participant/round rows mean absent",
    missingIds: [
      ...new Set(
        assignments
          .filter(
            (a) =>
              !participants.some((p) => p.participantId === a.participant_id),
          )
          .map((a) => a.participant_id),
      ),
    ],
  };
}
export const csvCell = (value: string): string => {
  const safe = /^[\s]*[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
};
export function exportRoutesCSV(p: EventProject): string {
  requireOperationalRoutes(p);
  const lines = [
    "plan_revision,round,status,participant_id,public_label,group",
  ];
  for (const r of [...p.rounds].sort((a, b) => a.order - b.order))
    for (const a of r.assignments) {
      const label =
        r.frozen?.publicParticipants.find(
          (x) => x.participantId === a.participantId,
        )?.publicLabel ??
        p.participants.find((x) => x.participantId === a.participantId)!
          .publicLabel;
      lines.push(
        [
          String(p.revision),
          String(r.order),
          r.status === "completed" ? "historical" : r.status,
          a.participantId,
          label,
          r.groups.find((g) => g.groupId === a.groupId)!.publicLabel,
        ]
          .map(csvCell)
          .join(","),
      );
    }
  return lines.join("\r\n");
}
