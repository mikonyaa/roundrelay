import { useState } from "react";
import { importCSV, importJSON, type ImportPreview } from "../import";
import { LIMITS, type EventProject } from "../model/schema";

export function ImportPanel({
  onImport,
  hasProject,
  onClose,
}: {
  onImport: (p: EventProject) => void;
  hasProject: boolean;
  onClose: () => void;
}) {
  const [json, setJson] = useState("");
  const [participants, setParticipants] = useState("");
  const [assignments, setAssignments] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState("");
  const [min, setMin] = useState(4),
    [max, setMax] = useState(6),
    [duration, setDuration] = useState(300);
  const parse = (fn: () => ImportPreview) => {
    try {
      setPreview(fn());
      setError("");
    } catch (e) {
      setPreview(null);
      setError(e instanceof Error ? e.message : "Import failed");
    }
  };
  const file = async (f: File | undefined, setter: (s: string) => void) => {
    setPreview(null);
    if (!f) return;
    if (f.size > LIMITS.bytes) {
      setError("Input exceeds the 2 MiB limit");
      return;
    }
    setter(await f.text());
    setError("");
  };
  return (
    <section className="import-panel" aria-label="Import workshop">
      <div className="section-heading">
        <h2>Bring your plan</h2>
        <button onClick={onClose}>Close import</button>
      </div>
      <p>
        Review before replacing the open event. JSON preserves history and
        pending changes. CSV uses stable IDs; omitted round rows mean absent.
      </p>
      <div className="import-columns">
        <div>
          <h3>Portable event JSON</h3>
          <label>
            Choose JSON
            <input
              type="file"
              accept=".json"
              onChange={(e) => void file(e.target.files?.[0], setJson)}
            />
          </label>
          <label>
            Or paste event JSON
            <textarea
              aria-label="Event JSON"
              value={json}
              onChange={(e) => {
                setJson(e.target.value);
                setPreview(null);
              }}
            />
          </label>
          <button onClick={() => parse(() => importJSON(json))}>
            Preview JSON
          </button>
        </div>
        <div>
          <h3>Two CSV files</h3>
          <label>
            participants.csv
            <input
              type="file"
              accept=".csv"
              onChange={(e) => void file(e.target.files?.[0], setParticipants)}
            />
          </label>
          <label>
            assignments.csv
            <input
              type="file"
              accept=".csv"
              onChange={(e) => void file(e.target.files?.[0], setAssignments)}
            />
          </label>
          <div className="inline-fields">
            <label>
              Group minimum
              <input
                type="number"
                min="0"
                max="60"
                value={min}
                onChange={(e) => {
                  setMin(Number(e.target.value));
                  setPreview(null);
                }}
              />
            </label>
            <label>
              Group maximum
              <input
                type="number"
                min="0"
                max="60"
                value={max}
                onChange={(e) => {
                  setMax(Number(e.target.value));
                  setPreview(null);
                }}
              />
            </label>
            <label>
              Round seconds
              <input
                type="number"
                min="1"
                max="14400"
                value={duration}
                onChange={(e) => {
                  setDuration(Number(e.target.value));
                  setPreview(null);
                }}
              />
            </label>
          </div>
          <button
            onClick={() =>
              parse(() =>
                importCSV(participants, assignments, {
                  minSize: min,
                  maxSize: max,
                  durationMs: duration * 1000,
                }),
              )
            }
          >
            Preview CSV
          </button>
        </div>
      </div>
      {error && (
        <pre className="error" role="alert">
          {error}
        </pre>
      )}
      {preview && (
        <div className="import-review">
          <h3>{preview.project.title}</h3>
          <p>
            {preview.source} · {preview.project.participants.length}{" "}
            participants · {preview.project.rounds.length} rounds ·{" "}
            {preview.project.rounds.map((r) => r.groups.length).join("/")}{" "}
            groups per round
          </p>
          {preview.missingIds.length > 0 && (
            <p className="error">
              Missing participant IDs: {preview.missingIds.join(", ")}
            </p>
          )}
          {preview.diagnostics.length ? (
            <>
              <p className="error">
                Draft only. Starting is blocked until these hard constraints are
                repaired.
              </p>
              <ul>
                {preview.diagnostics.map((d, i) => (
                  <li key={i}>
                    {d.path}: {d.message}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="success">
              All hard constraints validated independently.
            </p>
          )}
          <p>
            {hasProject
              ? "This explicitly replaces the open event. Download its backup first if you need to keep it."
              : "Open this reviewed plan to begin."}
          </p>
          <button
            className="primary"
            onClick={() => {
              onImport(preview.project);
              onClose();
            }}
          >
            {hasProject
              ? "Replace open event with reviewed plan"
              : "Open reviewed plan"}
          </button>
        </div>
      )}
    </section>
  );
}
