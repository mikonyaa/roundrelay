import { useEffect, useMemo, useRef, useState } from "react";
import { checksum, clone, ordered, type Draft } from "../model/schema";
import { sampleProject } from "../model/sample";
import { undoReason, protectionFingerprint } from "../history";
import { DEFAULT_OPTIONS, patchMatches, type Proposal } from "../planner";
import { clockAmbiguity, formatTime, remaining } from "../timer";
import { validateProject } from "../validate";
import { validateProposal } from "../validate/proposal";
import { exportRoutesCSV } from "../import";
import { channelName, publicPayload } from "../projector/payload";
import { PrintPreview } from "../print/PrintPreview";
import { useWorkshop } from "./useWorkshop";
import { ImportPanel } from "./ImportPanel";

export function download(
  name: string,
  text: string,
  type = "application/json",
) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
const emptyDraft = (): Draft => ({
  availabilityChanges: [],
  futureGroupChanges: [],
});
export function App() {
  const workshop = useWorkshop();
  const {
    project: p,
    dispatch,
    replace,
    readOnly,
    ready,
    saveStatus,
    message,
    setMessage,
  } = workshop;
  const [importing, setImporting] = useState(false),
    [printing, setPrinting] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [clockNotice, setClockNotice] = useState("");
  const [effective, setEffective] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [proposal, setProposal] = useState<Proposal | null>(null),
    [computing, setComputing] = useState(false);
  const [seed, setSeed] = useState(42),
    [budget, setBudget] = useState(30000),
    [correction, setCorrection] = useState(300);
  const worker = useRef<Worker | null>(null);
  const current = useRef(p);
  current.current = p;
  const sessionId = useRef(crypto.randomUUID());
  const channel = useRef<BroadcastChannel | null>(null);
  const future = p ? ordered(p).filter((r) => r.status === "planned") : [];
  const effectiveId = future.some((r) => r.roundId === effective)
    ? effective
    : (future[0]?.roundId ?? "");
  const active = p?.rounds.find((r) => r.roundId === p.conductor.activeRoundId);
  const display = active ?? future[0] ?? (p ? ordered(p).at(-1) : undefined);
  const diagnostics = useMemo(() => (p ? validateProject(p) : []), [p]);
  const fresh =
    !!p &&
    !!proposal &&
    proposal.baseRevision === p.revision &&
    proposal.protectedFingerprint === protectionFingerprint(p) &&
    patchMatches(p.conductor.pendingDraft, proposal.patch);
  const proposalError = useMemo(() => {
    if (!fresh || !p || !proposal || proposal.status !== "feasible")
      return null;
    try {
      validateProposal(p, proposal);
      return null;
    } catch (error) {
      return error instanceof Error
        ? error.message
        : "Candidate validation failed";
    }
  }, [p, proposal, fresh]);
  useEffect(() => {
    let wall = Date.now(),
      mono = performance.now(),
      interrupted = document.hidden;
    const visibility = () => {
      interrupted = true;
      setNow(Date.now());
    };
    document.addEventListener("visibilitychange", visibility);
    const tick = setInterval(() => {
      const nextWall = Date.now(),
        nextMono = performance.now();
      const notice = clockAmbiguity(
        nextWall - wall,
        nextMono - mono,
        interrupted || document.hidden || nextMono - mono > 2000,
      );
      if (notice) setClockNotice(notice);
      wall = nextWall;
      mono = nextMono;
      interrupted = document.hidden;
      setNow(nextWall);
    }, 250);
    return () => {
      clearInterval(tick);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  useEffect(() => {
    if (!("BroadcastChannel" in window) || readOnly) return;
    const bc = new BroadcastChannel(channelName(sessionId.current));
    channel.current = bc;
    const send = () => {
      if (current.current) bc.postMessage(publicPayload(current.current));
    };
    bc.onmessage = (e) => {
      if (e.data?.version === 1 && e.data?.type === "request-snapshot") send();
    };
    const heartbeat = setInterval(send, 1000);
    send();
    return () => {
      clearInterval(heartbeat);
      bc.close();
      channel.current = null;
    };
  }, [readOnly]);
  useEffect(() => {
    if (p) channel.current?.postMessage(publicPayload(p));
  }, [p]);
  useEffect(() => {
    worker.current?.terminate();
    worker.current = null;
    setComputing(false);
  }, [p?.revision, p?.eventId]);
  useEffect(() => () => worker.current?.terminate(), []);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        !(e.altKey && !e.ctrlKey && !e.metaKey) ||
        (e.target instanceof HTMLElement &&
          (e.target.matches("input,textarea,select") ||
            e.target.isContentEditable)) ||
        readOnly ||
        printing ||
        importing
      )
        return;
      if (e.code === "KeyS") {
        e.preventDefault();
        dispatch(
          active
            ? {
                type: active.status === "paused" ? "resume" : "pause",
                now: Date.now(),
              }
            : { type: "start", now: Date.now() },
        );
      }
      if (e.code === "KeyF") {
        e.preventDefault();
        dispatch({ type: "finish", now: Date.now() });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });
  const backup = () => {
    if (p)
      download(
        `roundrelay-${p.eventId}-v${p.revision}.json`,
        JSON.stringify(p, null, 2),
      );
  };
  const attend = (available: boolean) => {
    if (!p || !selected.length) return;
    const patch = clone(p.conductor.pendingDraft ?? emptyDraft());
    const order = future.find((r) => r.roundId === effectiveId)!.order;
    for (const r of future.filter((r) => r.order >= order))
      for (const participantId of selected) {
        patch.availabilityChanges = patch.availabilityChanges.filter(
          (a) =>
            !(a.roundId === r.roundId && a.participantId === participantId),
        );
        patch.availabilityChanges.push({
          participantId,
          roundId: r.roundId,
          available,
        });
      }
    dispatch({ type: "draft", patch });
    setSelected([]);
  };
  const groupEdit = (
    roundId: string,
    groupId: string,
    field: "minSize" | "maxSize" | "enabled",
    value: number | boolean,
  ) => {
    if (!p) return;
    const patch = clone(p.conductor.pendingDraft ?? emptyDraft());
    const group = p.rounds
      .find((r) => r.roundId === roundId)!
      .groups.find((g) => g.groupId === groupId)!;
    const edit = patch.futureGroupChanges.find(
      (g) => g.roundId === roundId && g.groupId === groupId,
    ) ?? {
      roundId,
      groupId,
      minSize: group.minSize,
      maxSize: group.maxSize,
      enabled: group.enabled,
    };
    const change = { ...edit, [field]: value };
    patch.futureGroupChanges = [
      ...patch.futureGroupChanges.filter(
        (g) => !(g.roundId === roundId && g.groupId === groupId),
      ),
      change,
    ];
    dispatch({ type: "draft", patch });
  };
  const preview = () => {
    if (!p?.conductor.pendingDraft || readOnly) return;
    worker.current?.terminate();
    setProposal(null);
    setComputing(true);
    setMessage("");
    const w = new Worker(new URL("../planner/worker.ts", import.meta.url), {
      type: "module",
    });
    worker.current = w;
    const revision = p.revision,
      eventId = p.eventId,
      requestId = crypto.randomUUID();
    w.onmessage = (
      e: MessageEvent<{ requestId: string; proposal: Proposal }>,
    ) => {
      if (
        worker.current !== w ||
        e.data.requestId !== requestId ||
        current.current?.revision !== revision ||
        current.current.eventId !== eventId
      )
        return;
      setProposal(e.data.proposal);
      setComputing(false);
      w.terminate();
      worker.current = null;
    };
    w.onerror = () => {
      setMessage(
        "Planner worker failed. Your draft and accepted plan are unchanged.",
      );
      setComputing(false);
      w.terminate();
      worker.current = null;
    };
    w.postMessage({
      requestId,
      base: clone(p),
      draft: clone(p.conductor.pendingDraft),
      options: { ...DEFAULT_OPTIONS, seed, iterationBudget: budget },
    });
  };
  const openProjector = () => {
    const url = new URL(location.href);
    url.hash = `/projector?session=${sessionId.current}`;
    const popup = window.open(url.href, "_blank");
    if (!popup) {
      setMessage(
        "Popup blocked. Allow popups for this site, then click Open projector again.",
      );
      return;
    }
    popup.opener = null;
    setMessage(
      "Projector opened. Standard labels: 2 groups per page at 1280 px, 4 at 1920 px. Long labels use wider groups and 6-name parts. Use its page controls.",
    );
  };
  if (printing && p)
    return <PrintPreview project={p} onClose={() => setPrinting(false)} />;
  return (
    <div className="app-shell">
      <a className="skip-link" href="#conductor">
        Skip to conductor
      </a>
      <header className="topbar">
        <a className="brand" href="#/" aria-label="RoundRelay home">
          <span className="brand-mark">
            r<span>r</span>
          </span>
          RoundRelay<span className="version">0.1.0</span>
        </a>
        <div className="save-state" role="status">
          <span
            className={
              saveStatus.startsWith("Saved") ? "saved-dot" : "unsaved-dot"
            }
          />
          {saveStatus}
        </div>
      </header>
      <main
        id="conductor"
        data-revision={p?.revision}
        data-protection={p ? checksum(protectionFingerprint(p)) : ""}
      >
        {!ready ? (
          <p className="empty">Opening your local workspace…</p>
        ) : !p ? (
          <section className="welcome">
            <span className="eyebrow">A LITTLE CALM FOR A BUSY ROOM</span>
            <h1>
              Keep the room
              <br />
              moving.
            </h1>
            <p>
              Run workshop rounds. When attendance changes,
              <br className="desktop-only" /> repair the future and keep the
              past intact.
            </p>
            <div className="button-row">
              <button
                className="primary"
                onClick={() => replace(sampleProject())}
              >
                Try 24-person sample <span aria-hidden="true">↗</span>
              </button>
              <button onClick={() => setImporting(true)}>
                Import your plan
              </button>
            </div>
            <div className="welcome-foot">
              <span>Local to your browser</span>
              <span>No accounts. No paid APIs.</span>
              <span>20–60 people / 3–6 rounds</span>
            </div>
          </section>
        ) : (
          <>
            <div className="event-heading">
              <div>
                <span className="eyebrow">
                  YOUR WORKSHOP / PLAN VERSION {p.revision}
                </span>
                <h1>{p.title}</h1>
                <p>
                  {p.participants.length} participants · {p.rounds.length}{" "}
                  rounds · scheduled encounters
                </p>
              </div>
              <nav className="utility-actions" aria-label="Event tools">
                <button onClick={backup}>Download backup</button>
                <button onClick={() => setPrinting(true)}>Print routes</button>
                <button disabled={readOnly} onClick={() => setImporting(true)}>
                  Import
                </button>
              </nav>
            </div>
            {readOnly && (
              <div className="notice">
                <strong>Read-only conductor.</strong> Another tab owns this
                workspace. Close it before recovering here.{" "}
                <button onClick={() => void workshop.recover()}>
                  Recover saved event
                </button>
              </div>
            )}
            {message && (
              <div className="notice" role="status">
                {message}
                <button className="text-button" onClick={() => setMessage("")}>
                  Dismiss
                </button>
              </div>
            )}
            {diagnostics.length > 0 && (
              <div className="error" role="alert">
                <strong>This is an invalid draft. Starting is blocked.</strong>
                <ul>
                  {diagnostics.slice(0, 10).map((d, i) => (
                    <li key={i}>
                      {d.path}: {d.message}
                    </li>
                  ))}
                </ul>
                <p>
                  Review the source file or repair future assignments using a
                  future group draft.
                </p>
              </div>
            )}
            <ol className="round-timeline" aria-label="Round progress">
              {ordered(p).map((r) => (
                <li
                  key={r.roundId}
                  className={r.roundId === display?.roundId ? "selected" : ""}
                >
                  <span className="round-number">
                    {r.status === "completed"
                      ? "✓"
                      : String(r.order).padStart(2, "0")}
                  </span>
                  <div>
                    <strong>{r.publicTitle}</strong>
                    <span>
                      {r.status === "completed"
                        ? "Completed · frozen"
                        : r.status}
                    </span>
                  </div>
                </li>
              ))}
            </ol>
            {display && (
              <section className="live-round">
                <div className="timer-pane">
                  <span className="eyebrow">
                    {active
                      ? "IN THE ROOM NOW"
                      : future.length
                        ? "UP NEXT"
                        : "WORKSHOP COMPLETE"}
                  </span>
                  <h2>
                    Round {display.order}
                    <span>{display.publicTitle}</span>
                  </h2>
                  <div className="timer" data-testid="timer">
                    {formatTime(
                      display.timer
                        ? remaining(display.timer, now)
                        : display.durationMs,
                    )}
                  </div>
                  <p className="timer-caption">
                    {active?.status === "paused"
                      ? "Paused · take your time"
                      : active && remaining(active.timer, now) === 0
                        ? "Time is up. Finish when the room is ready."
                        : active
                          ? "Running · you decide when to finish"
                          : future.length
                            ? "Ready when you are"
                            : "Every round has been completed"}
                  </p>
                  <div className="round-actions">
                    {!active ? (
                      <button
                        className="primary"
                        disabled={
                          !future.length ||
                          !!p.conductor.pendingDraft ||
                          !!diagnostics.length ||
                          readOnly
                        }
                        onClick={() =>
                          dispatch({ type: "start", now: Date.now() })
                        }
                      >
                        Start round {future[0]?.order ?? ""}
                      </button>
                    ) : (
                      <>
                        <button
                          className="primary"
                          disabled={readOnly}
                          onClick={() =>
                            dispatch({
                              type:
                                active.status === "paused" ? "resume" : "pause",
                              now: Date.now(),
                            })
                          }
                        >
                          {active.status === "paused" ? "Resume" : "Pause"}
                        </button>
                        <button
                          disabled={readOnly}
                          onClick={() =>
                            dispatch({ type: "finish", now: Date.now() })
                          }
                        >
                          Finish round
                        </button>
                      </>
                    )}
                    <button onClick={openProjector} disabled={readOnly}>
                      Open projector <span aria-hidden="true">↗</span>
                    </button>
                  </div>
                  {p.conductor.pendingDraft && (
                    <p className="pending-hint">
                      Future changes are pending. Apply or cancel before
                      starting the next round.
                    </p>
                  )}
                  {active && (
                    <details className="time-correction">
                      <summary>Correct remaining time</summary>
                      <label>
                        Remaining seconds
                        <input
                          type="number"
                          min="0"
                          max="14400"
                          value={correction}
                          onChange={(e) =>
                            setCorrection(Number(e.target.value))
                          }
                        />
                      </label>
                      <button
                        disabled={readOnly}
                        onClick={() => {
                          dispatch({
                            type: "correct-time",
                            now: Date.now(),
                            remainingMs: correction * 1000,
                          });
                          setClockNotice("");
                        }}
                      >
                        Set remaining time
                      </button>
                      <p>
                        System clock changes during sleep cannot reliably be
                        distinguished from elapsed time. Rounds never finish
                        automatically.
                      </p>
                    </details>
                  )}
                  {clockNotice && <p className="notice">{clockNotice}</p>}
                </div>
                <div className="current-plan">
                  <div className="section-heading">
                    <h3>
                      {active
                        ? "Current groups"
                        : future.length
                          ? "Next groups"
                          : "Final groups · historical"}
                    </h3>
                    <span>
                      {display.assignments.length} attending ·{" "}
                      {display.groups.filter((g) => g.enabled).length} groups
                    </span>
                  </div>
                  <div className="group-grid">
                    {display.groups
                      .filter((g) => g.enabled)
                      .map((g, i) => (
                        <article className="group" key={g.groupId}>
                          <h4>
                            <span>{String(i + 1).padStart(2, "0")}</span>
                            {g.publicLabel}
                            <small>
                              {
                                display.assignments.filter(
                                  (a) => a.groupId === g.groupId,
                                ).length
                              }
                            </small>
                          </h4>
                          <ul>
                            {display.assignments
                              .filter((a) => a.groupId === g.groupId)
                              .map((a, j) => (
                                <li key={`${a.participantId}-${j}`}>
                                  {display.frozen?.publicParticipants.find(
                                    (x) => x.participantId === a.participantId,
                                  )?.publicLabel ??
                                    p.participants.find(
                                      (x) =>
                                        x.participantId === a.participantId,
                                    )?.publicLabel ??
                                    a.participantId}
                                </li>
                              ))}
                          </ul>
                        </article>
                      ))}
                  </div>
                  <p className="small-note">
                    Projector preview: standard labels show 2 groups at
                    1280×720, 4 at 1920×1080 (10 names per group part). Long
                    labels show 1 / 2 wider groups (6 names per part). Public
                    labels only.
                  </p>
                </div>
              </section>
            )}
            {future.length > 0 && (
              <section className="future-section">
                <div className="section-heading">
                  <div>
                    <span className="eyebrow">WHEN THE ROOM CHANGES</span>
                    <h2>Repair only what comes next.</h2>
                  </div>
                  <span className="frozen-badge">
                    Current & completed stay frozen
                  </span>
                </div>
                <p>
                  Select people, then mark their availability from a future
                  round. All edits stay in a pending draft until you accept a
                  valid preview.
                </p>
                <fieldset disabled={readOnly}>
                  <div className="attendance-heading">
                    <label>
                      Effective from
                      <select
                        aria-label="Effective from round"
                        value={effectiveId}
                        onChange={(e) => setEffective(e.target.value)}
                      >
                        {future.map((r) => (
                          <option key={r.roundId} value={r.roundId}>
                            Round {r.order} · {r.publicTitle}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="button-row">
                      <button
                        disabled={!selected.length}
                        onClick={() => attend(false)}
                      >
                        Mark selected absent
                      </button>
                      <button
                        disabled={!selected.length}
                        onClick={() => attend(true)}
                      >
                        Mark selected present
                      </button>
                    </div>
                  </div>
                  <div className="attendance-list">
                    {p.participants.map((person) => {
                      const draft =
                        p.conductor.pendingDraft?.availabilityChanges.find(
                          (a) =>
                            a.participantId === person.participantId &&
                            a.roundId === effectiveId,
                        );
                      const accepted = p.availability.find(
                        (a) =>
                          a.participantId === person.participantId &&
                          a.roundId === effectiveId,
                      )?.available;
                      return (
                        <label
                          className={draft ? "draft-person" : ""}
                          key={person.participantId}
                        >
                          <input
                            type="checkbox"
                            aria-label={`Select ${person.publicLabel} (${person.participantId})`}
                            checked={selected.includes(person.participantId)}
                            onChange={(e) =>
                              setSelected(
                                e.target.checked
                                  ? [...selected, person.participantId]
                                  : selected.filter(
                                      (id) => id !== person.participantId,
                                    ),
                              )
                            }
                          />
                          <span>{person.publicLabel}</span>
                          <small>
                            {draft
                              ? `Draft: ${draft.available ? "present" : "absent"}`
                              : accepted
                                ? "Present"
                                : "Absent"}
                          </small>
                        </label>
                      );
                    })}
                  </div>
                  <details className="group-editor">
                    <summary>
                      Edit future group bounds · round{" "}
                      {future.find((r) => r.roundId === effectiveId)?.order}
                    </summary>
                    <p>
                      These bounds apply only to the selected future round and
                      stay in the same draft as attendance. Group IDs stay
                      stable.
                    </p>
                    <div className="bounds-list">
                      {future
                        .find((r) => r.roundId === effectiveId)
                        ?.groups.map((g) => {
                          const edit =
                            p.conductor.pendingDraft?.futureGroupChanges.find(
                              (x) =>
                                x.roundId === effectiveId &&
                                x.groupId === g.groupId,
                            ) ?? g;
                          return (
                            <div key={g.groupId}>
                              <strong>{g.publicLabel}</strong>
                              <label>
                                Min
                                <input
                                  aria-label={`${g.publicLabel} minimum`}
                                  type="number"
                                  min="0"
                                  max="60"
                                  value={edit.minSize}
                                  onChange={(e) =>
                                    groupEdit(
                                      effectiveId,
                                      g.groupId,
                                      "minSize",
                                      Number(e.target.value),
                                    )
                                  }
                                />
                              </label>
                              <label>
                                Max
                                <input
                                  aria-label={`${g.publicLabel} maximum`}
                                  type="number"
                                  min="0"
                                  max="60"
                                  value={edit.maxSize}
                                  onChange={(e) =>
                                    groupEdit(
                                      effectiveId,
                                      g.groupId,
                                      "maxSize",
                                      Number(e.target.value),
                                    )
                                  }
                                />
                              </label>
                              <label>
                                <input
                                  aria-label={`${g.publicLabel} enabled`}
                                  type="checkbox"
                                  checked={edit.enabled}
                                  onChange={(e) =>
                                    groupEdit(
                                      effectiveId,
                                      g.groupId,
                                      "enabled",
                                      e.target.checked,
                                    )
                                  }
                                />
                                Enabled
                              </label>
                            </div>
                          );
                        })}
                    </div>
                  </details>
                </fieldset>
                {p.conductor.pendingDraft && (
                  <div className="draft-bar">
                    <div>
                      <strong>Pending future draft</strong>
                      <span>
                        {p.conductor.pendingDraft.availabilityChanges.length}{" "}
                        attendance entries ·{" "}
                        {p.conductor.pendingDraft.futureGroupChanges.length}{" "}
                        group edits · accepted plan unchanged
                      </span>
                    </div>
                    <div className="button-row">
                      <button
                        className="primary"
                        disabled={computing || readOnly}
                        onClick={preview}
                      >
                        Preview repair
                      </button>
                      {computing && (
                        <button
                          onClick={() => {
                            worker.current?.terminate();
                            worker.current = null;
                            setComputing(false);
                            setMessage(
                              "Calculation cancelled. Pending draft preserved.",
                            );
                          }}
                        >
                          Cancel calculation
                        </button>
                      )}
                      <button
                        disabled={readOnly}
                        onClick={() => {
                          worker.current?.terminate();
                          dispatch({ type: "cancel-draft" });
                          setProposal(null);
                        }}
                      >
                        Cancel entire draft
                      </button>
                    </div>
                  </div>
                )}
                <details className="search-settings">
                  <summary>Bounded search settings</summary>
                  <div className="inline-fields">
                    <label>
                      Deterministic seed
                      <input
                        type="number"
                        aria-label="Planner seed"
                        value={seed}
                        onChange={(e) => {
                          setSeed(Number(e.target.value));
                          setProposal(null);
                        }}
                      />
                    </label>
                    <label>
                      Iteration budget
                      <input
                        type="number"
                        aria-label="Iteration budget"
                        min="0"
                        max="200000"
                        value={budget}
                        onChange={(e) => {
                          setBudget(Number(e.target.value));
                          setProposal(null);
                        }}
                      />
                    </label>
                  </div>
                  <p>
                    Up to 1.8 seconds in a worker. Budget exhaustion means
                    unsolved, never proof of impossibility.
                  </p>
                </details>
                {computing && (
                  <p role="status">
                    Searching in a separate worker… the current round keeps
                    running.
                  </p>
                )}
                {proposal && (
                  <section
                    className="repair-preview"
                    aria-label="Repair preview"
                  >
                    <div className="section-heading">
                      <h3>
                        {proposal.status === "feasible"
                          ? "Your future repair"
                          : proposal.status === "proven-infeasible"
                            ? "Proven capacity contradiction"
                            : proposal.status === "unsolved"
                              ? "Unsolved within this budget"
                              : "Planner error"}
                      </h3>
                      <span>
                        {proposal.iterations} iterations · {proposal.elapsedMs}{" "}
                        ms · {proposal.terminationReason}
                      </span>
                    </div>
                    {!fresh && (
                      <p className="error">
                        Preview is out of date. Compute a new preview.
                      </p>
                    )}
                    {proposalError && (
                      <p className="error" role="alert">
                        {proposalError}
                      </p>
                    )}
                    {proposal.diagnostics.map((d, i) => (
                      <p className="error" key={i}>
                        {d.message}
                      </p>
                    ))}
                    {proposal.score && !proposalError && (
                      <>
                        <div className="score-row">
                          <div>
                            <strong>{proposal.score.moved}</strong>
                            <span>Continuing attendee moves</span>
                          </div>
                          <div>
                            <strong>{proposal.score.added}</strong>
                            <span>Added round assignments</span>
                          </div>
                          <div>
                            <strong>{proposal.score.removed}</strong>
                            <span>Removed round assignments</span>
                          </div>
                          <div>
                            <strong>
                              {proposal.beforeScore.repeatedScheduledPairs} →{" "}
                              {proposal.score.repeatedScheduledPairs}
                            </strong>
                            <span>Repeated scheduled pairs</span>
                          </div>
                        </div>
                        <p className={fresh ? "success" : ""}>
                          {fresh
                            ? "Verified: current and completed rounds preserved; timer control state unchanged."
                            : "Frozen protection requires a fresh preview."}
                        </p>
                        <p>
                          Priority: fewer continuing-attendee moves, then fewer
                          repeated scheduled pairs, then size imbalance, then
                          IDs. This is a bounded repair, without a global
                          optimum claim.
                        </p>
                      </>
                    )}
                    {proposal.candidate?.rounds.map((after) => {
                      const before = p.rounds.find(
                        (r) => r.roundId === after.roundId,
                      )!;
                      const ids = [
                        ...new Set(
                          [...before.assignments, ...after.assignments].map(
                            (a) => a.participantId,
                          ),
                        ),
                      ];
                      const changes = ids
                        .map((id) => ({
                          id,
                          from: before.assignments.find(
                            (a) => a.participantId === id,
                          )?.groupId,
                          to: after.assignments.find(
                            (a) => a.participantId === id,
                          )?.groupId,
                        }))
                        .filter((x) => x.from !== x.to);
                      const bounds = after.groups.filter((g) => {
                        const old = before.groups.find(
                          (x) => x.groupId === g.groupId,
                        )!;
                        return (
                          old.minSize !== g.minSize ||
                          old.maxSize !== g.maxSize ||
                          old.enabled !== g.enabled
                        );
                      });
                      return (
                        <div className="round-diff" key={after.roundId}>
                          <h4>
                            Round {before.order} · {before.publicTitle}
                          </h4>
                          {!changes.length && !bounds.length && (
                            <p>No assignment or group changes.</p>
                          )}
                          {changes.length > 0 && (
                            <table>
                              <thead>
                                <tr>
                                  <th>Participant</th>
                                  <th>Before</th>
                                  <th>After</th>
                                  <th>Change</th>
                                </tr>
                              </thead>
                              <tbody>
                                {changes.map((c) => (
                                  <tr key={c.id}>
                                    <td>
                                      {p.participants.find(
                                        (x) => x.participantId === c.id,
                                      )?.publicLabel ?? c.id}
                                    </td>
                                    <td>
                                      {before.groups.find(
                                        (g) => g.groupId === c.from,
                                      )?.publicLabel ?? "Absent"}
                                    </td>
                                    <td>
                                      {after.groups.find(
                                        (g) => g.groupId === c.to,
                                      )?.publicLabel ?? "Absent"}
                                    </td>
                                    <td>
                                      {!c.from
                                        ? "Added"
                                        : !c.to
                                          ? "Removed"
                                          : "Moved"}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                          {bounds.map((g) => {
                            const old = before.groups.find(
                              (x) => x.groupId === g.groupId,
                            )!;
                            return (
                              <p key={g.groupId}>
                                {g.publicLabel}: bounds {old.minSize}–
                                {old.maxSize} → {g.minSize}–{g.maxSize};{" "}
                                {old.enabled ? "enabled" : "disabled"} →{" "}
                                {g.enabled ? "enabled" : "disabled"}
                              </p>
                            );
                          })}
                        </div>
                      );
                    })}
                    <button
                      className="primary"
                      disabled={
                        proposal.status !== "feasible" ||
                        !!proposalError ||
                        !fresh ||
                        readOnly ||
                        computing
                      }
                      onClick={() =>
                        dispatch({ type: "apply", proposal, now: Date.now() })
                      }
                    >
                      Apply future repair
                    </button>
                    <p className="small-note">
                      The pending attendance, group bounds and assignments are
                      applied together.
                    </p>
                  </section>
                )}
              </section>
            )}
            <section className="history-section">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">A SMALL, HONEST RECORD</span>
                  <h2>Repair history</h2>
                </div>
                <button
                  disabled={readOnly || !!undoReason(p)}
                  title={
                    undoReason(p) ?? "Restore the complete previous future plan"
                  }
                  onClick={() => {
                    dispatch({ type: "undo" });
                    setProposal(null);
                  }}
                >
                  Undo last repair
                </button>
              </div>
              <p>
                {undoReason(p) ??
                  "The last repair can be undone while its rounds are planned and this revision stays current."}
              </p>
              {!p.repairHistory.length ? (
                <p className="small-note">
                  No accepted repairs yet. Previews never change the plan.
                </p>
              ) : (
                <ol>
                  {p.repairHistory.map((h) => (
                    <li key={h.operationId}>
                      <strong>
                        Version {h.revisionAfter}{" "}
                        {h.undone ? "· undone" : "· accepted"}
                      </strong>
                      <span>
                        {h.moved} moves · {h.added} added · {h.removed} removed
                        round assignments
                      </span>
                      <small>
                        {h.plannerVersion} · input {h.inputHash}
                      </small>
                    </li>
                  ))}
                </ol>
              )}
            </section>
            <footer className="app-footer">
              <p>
                Local browser storage is not a backup. Download your event JSON
                to keep a portable copy.
              </p>
              <div>
                <button
                  onClick={() =>
                    download(
                      `roundrelay-routes-v${p.revision}.csv`,
                      exportRoutesCSV(p),
                      "text/csv",
                    )
                  }
                >
                  Export routes CSV
                </button>
                <span>Alt+S start / pause / resume · Alt+F finish</span>
              </div>
            </footer>
          </>
        )}
        {importing && (
          <ImportPanel
            hasProject={!!p}
            onImport={(q) => {
              replace(q);
              setProposal(null);
              setSelected([]);
            }}
            onClose={() => setImporting(false)}
          />
        )}
      </main>
      <footer className="site-footer">
        <span>RoundRelay · a local helper for live workshops</span>
        <span>No participant data leaves this browser.</span>
      </footer>
    </div>
  );
}
