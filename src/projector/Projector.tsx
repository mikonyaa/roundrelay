import { useEffect, useState } from "react";
import { channelName, type PublicPayload } from "./payload";
import { ProjectionReceiver } from "./transport";
import { formatTime, remaining } from "../timer";

export function Projector() {
  const sessionId =
    new URLSearchParams(location.hash.split("?")[1]).get("session") ?? "";
  const [payload, setPayload] = useState<PublicPayload | null>(null);
  const [lastUpdate, setLastUpdate] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [page, setPage] = useState(0);
  const [message, setMessage] = useState("");
  const [small, setSmall] = useState(innerWidth <= 1400);
  useEffect(() => {
    const resize = () => setSmall(innerWidth <= 1400);
    window.addEventListener("resize", resize);
    const tick = setInterval(() => setNow(Date.now()), 250);
    if (!/^[a-f0-9-]{36}$/.test(sessionId) || !("BroadcastChannel" in window)) {
      setMessage("Open this screen using Open projector in the conductor.");
      return () => {
        clearInterval(tick);
        window.removeEventListener("resize", resize);
      };
    }
    const channel = new BroadcastChannel(channelName(sessionId));
    const receiver = new ProjectionReceiver(sessionId);
    channel.onmessage = (e) => {
      if (receiver.accept(e.data)) {
        setPayload(receiver.payload);
        setLastUpdate(receiver.lastAcceptedAt);
      }
    };
    const requestSnapshot = () =>
      channel.postMessage({ version: 2, type: "request-snapshot", sessionId });
    requestSnapshot();
    const request = setInterval(requestSnapshot, 3000);
    return () => {
      clearInterval(tick);
      clearInterval(request);
      channel.close();
      window.removeEventListener("resize", resize);
    };
  }, [sessionId]);
  const longLabels = !!payload?.groups.some(
    (g) =>
      g.publicLabel.length > 40 ||
      g.participants.some((name) => name.length > 40),
  );
  const perPage = longLabels ? (small ? 1 : 2) : small ? 2 : 4;
  const namesPerPart = longLabels ? 6 : 10;
  const parts =
    payload?.groups.flatMap((g, groupIndex) =>
      Array.from(
        {
          length: Math.max(1, Math.ceil(g.participants.length / namesPerPart)),
        },
        (_, part) => ({
          ...g,
          groupIndex,
          part,
          totalParts: Math.ceil(g.participants.length / namesPerPart),
          participants: g.participants.slice(
            part * namesPerPart,
            (part + 1) * namesPerPart,
          ),
        }),
      ),
    ) ?? [];
  const pages = Math.ceil(parts.length / perPage);
  const effectivePage = Math.min(page, Math.max(0, pages - 1));
  const fullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      setMessage(
        "Fullscreen is unavailable. Use the browser fullscreen control.",
      );
    }
  };
  const expired =
    payload?.status === "running" && remaining(payload.timer, now) === 0;
  return (
    <main
      className={`projector${longLabels && small ? " projector-wide-group" : ""}`}
    >
      <header className="projector-header">
        <div>
          <span className="eyebrow">ROUNDRELAY / ROOM VIEW</span>
          <h1>{payload?.publicTitle ?? "Connecting to conductor…"}</h1>
          <p>{payload?.roundLabel ?? "Waiting for a public snapshot"}</p>
        </div>
        <div className="projector-time">
          <strong data-testid="projector-timer">
            {payload?.timer
              ? formatTime(remaining(payload.timer, now))
              : payload?.status === "unavailable"
                ? "Unavailable"
                : "Ready"}
          </strong>
          <span>
            {expired ? "Time is up · wait for your host" : payload?.status}
          </span>
        </div>
      </header>
      <div className="projector-connection" role="status">
        {lastUpdate && now - lastUpdate > 6500
          ? "Disconnected / stale · waiting for the conductor"
          : payload
            ? `${payload.status === "unavailable" ? "Connected · routes unavailable" : "Live"} · plan version ${payload.revision}`
            : "Waiting for conductor"}
        {message && ` · ${message}`}
      </div>
      <section className="projector-groups" aria-label="Current groups">
        {parts
          .slice(effectivePage * perPage, (effectivePage + 1) * perPage)
          .map((g, i) => (
            <article key={i}>
              <h2>
                <span>{String(g.groupIndex + 1).padStart(2, "0")}</span>
                {g.publicLabel}
                {g.totalParts > 1 && (
                  <small>
                    part {g.part + 1}/{g.totalParts}
                  </small>
                )}
              </h2>
              <ul>
                {g.participants.map((name, j) => (
                  <li key={j}>{name}</li>
                ))}
              </ul>
            </article>
          ))}
      </section>
      <footer className="projector-controls">
        <div>
          {pages > 1 && (
            <>
              <button
                disabled={effectivePage === 0}
                onClick={() => setPage(effectivePage - 1)}
              >
                Previous page
              </button>
              <span>
                Page {effectivePage + 1} of {pages}
              </span>
              <button
                disabled={effectivePage === pages - 1}
                onClick={() => setPage(effectivePage + 1)}
              >
                Next page
              </button>
            </>
          )}
        </div>
        <button onClick={() => void fullscreen()}>Fullscreen / exit</button>
        <span>Same browser · public labels only · Esc exits fullscreen</span>
      </footer>
    </main>
  );
}
