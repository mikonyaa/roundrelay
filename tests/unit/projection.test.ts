import { describe, expect, it } from "vitest";
import {
  ProjectionPublisher,
  ProjectionReceiver,
} from "../../src/projector/transport";
import { lifecycleProject } from "../fixtures/lifecycle";
import { validateProject } from "../../src/validate";

describe("public transport order independent of business revision", () => {
  it("publishes validated independent fixtures and accepts replacement and same-event older restore", () => {
    const publisher = new ProjectionPublisher();
    const receiver = new ProjectionReceiver(publisher.sessionId);
    const alpha = lifecycleProject();
    expect(validateProject(alpha)).toEqual([]);
    expect(receiver.accept(publisher.snapshot(alpha, 1), 100)).toBe(true);
    expect(
      receiver.accept(
        publisher.snapshot(lifecycleProject("beta", 0, "BETA"), 2),
        200,
      ),
    ).toBe(true);
    expect(receiver.payload?.publicTitle).toBe("BETA");
    expect(receiver.payload?.revision).toBe(0);
    expect(
      receiver.accept(
        publisher.snapshot(lifecycleProject("alpha", 5, "ALPHA restored"), 3),
        300,
      ),
    ).toBe(true);
    expect(receiver.payload?.publicTitle).toBe("ALPHA restored");
    expect(receiver.payload?.revision).toBe(5);
  });
  it("rejects duplicate/reordered/retired-epoch packets without updating freshness", () => {
    const publisher = new ProjectionPublisher();
    const receiver = new ProjectionReceiver(publisher.sessionId);
    const old = publisher.snapshot(lifecycleProject(), 1);
    const newest = publisher.snapshot(lifecycleProject("beta", 0, "BETA"), 2);
    expect(receiver.accept(newest, 200)).toBe(true);
    for (const packet of [
      old,
      newest,
      { ...old, sequence: newest.sequence + 100 },
    ]) {
      expect(receiver.accept(packet, 9999)).toBe(false);
      expect(receiver.lastAcceptedAt).toBe(200);
      expect(receiver.payload?.publicTitle).toBe("BETA");
    }
  });
  it("rejects malformed envelope and wrong session without freshness or content", () => {
    const publisher = new ProjectionPublisher();
    const receiver = new ProjectionReceiver(publisher.sessionId);
    const good = publisher.snapshot(lifecycleProject(), 1);
    for (const packet of [
      { ...good, version: 1 },
      { ...good, sequence: 0 },
      { ...good, sequence: Number.MAX_SAFE_INTEGER + 1 },
      { ...good, workspaceEpoch: -1 },
      { ...good, sessionId: crypto.randomUUID() },
      { ...good, privateNote: "PRIVATE_LIFECYCLE_CANARY" },
      {
        ...good,
        payload: { ...good.payload, privateNote: "PRIVATE_LIFECYCLE_CANARY" },
      },
      {
        ...good,
        payload: {
          ...good.payload,
          groups: [{ publicLabel: "East", participants: [123] }],
        },
      },
    ]) {
      expect(receiver.accept(packet, 9999)).toBe(false);
      expect(receiver.lastAcceptedAt).toBe(0);
      expect(receiver.payload).toBeNull();
    }
  });
  it("accepts new heartbeats but retains the sequence across a publisher restart", () => {
    let saved: unknown;
    const publisher = new ProjectionPublisher(null, (cursor) => {
      saved = cursor;
    });
    const receiver = new ProjectionReceiver(publisher.sessionId);
    const before = publisher.snapshot(lifecycleProject(), 1);
    expect(receiver.accept(before, 100)).toBe(true);
    expect(
      receiver.accept(publisher.snapshot(lifecycleProject(), 1), 200),
    ).toBe(true);
    expect(receiver.lastAcceptedAt).toBe(200);
    const restarted = new ProjectionPublisher(saved);
    expect(restarted.sessionId).toBe(publisher.sessionId);
    expect(
      receiver.accept(
        restarted.snapshot(lifecycleProject("beta", 0, "BETA"), 1),
        300,
      ),
    ).toBe(true);
    expect(receiver.accept(before, 9999)).toBe(false);
    expect(receiver.lastAcceptedAt).toBe(300);
    expect(receiver.payload?.publicTitle).toBe("BETA");
    expect(
      JSON.stringify(restarted.snapshot(lifecycleProject(), 2)),
    ).not.toContain("PRIVATE_");
  });
});
