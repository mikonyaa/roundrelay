import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { lifecycleProject } from "../fixtures/lifecycle";
import { exportRoutesCSV, importJSON } from "../../src/import";
import { PrintPreview } from "../../src/print/PrintPreview";
import { publicPayload } from "../../src/projector/payload";
import { reduceProject } from "../../src/conductor";

describe("operational route boundary", () => {
  it("does not print an unknown destination as Not attending", () => {
    const p = lifecycleProject();
    p.rounds[0].assignments[0].groupId = "unknown-group";
    const html = renderToStaticMarkup(
      createElement(PrintPreview, { project: p, onClose() {} }),
    );
    expect(html).not.toContain("Not attending");
    expect(html).not.toContain('class="route"');
  });
  it("does not publish routes from a hard-invalid project", () => {
    const p = lifecycleProject();
    p.rounds[0].assignments[0].participantId = "unknown-person";
    expect(publicPayload(p).groups).toEqual([]);
  });
  it.each(["group", "participant", "missing"])(
    "blocks %s route faults while retaining portable draft backup",
    (fault) => {
      const p = lifecycleProject();
      if (fault === "group")
        p.rounds[0].assignments[0].groupId = "unknown-group";
      else if (fault === "participant")
        p.rounds[0].assignments[0].participantId = "unknown-person";
      else p.rounds[0].assignments.shift();
      const preview = importJSON(JSON.stringify(p));
      expect(preview.project).toEqual(p);
      expect(preview.diagnostics.length).toBeGreaterThan(0);
      expect(() => exportRoutesCSV(p)).toThrow(/routes unavailable/i);
      expect(() => reduceProject(p, { type: "start", now: 1000 })).toThrow();
      const html = renderToStaticMarkup(
        createElement(PrintPreview, { project: p, onClose() {} }),
      );
      expect(html).not.toContain('class="route"');
      expect(html).not.toContain("Not attending");
      expect(html).toContain("Routes unavailable");
      const projection = publicPayload(p);
      expect(projection.groups).toEqual([]);
      expect(projection.timer).toBeNull();
    },
  );
  it("keeps a valid accepted plan exportable while edits await acceptance, with explicit absence in print", () => {
    const p = lifecycleProject();
    p.conductor.pendingDraft = {
      availabilityChanges: [
        { participantId: "a", roundId: "round-1", available: false },
      ],
      futureGroupChanges: [],
    };
    expect(exportRoutesCSV(p)).toContain(
      '"20","1","planned","a","PUBLIC A","East"',
    );
    expect(
      renderToStaticMarkup(
        createElement(PrintPreview, { project: p, onClose() {} }),
      ),
    ).toContain("Pending changes have not been applied");
    p.conductor.pendingDraft = null;
    p.availability.find(
      (a) => a.roundId === "round-1" && a.participantId === "a",
    )!.available = false;
    p.rounds[0].assignments.shift();
    const html = renderToStaticMarkup(
      createElement(PrintPreview, { project: p, onClose() {} }),
    );
    expect(html).toContain("Not attending");
    expect(html).toContain('class="route"');
    expect(exportRoutesCSV(p)).not.toContain('"20","1","planned","a"');
    expect(exportRoutesCSV(p)).not.toContain("PRIVATE_");
  });
});
