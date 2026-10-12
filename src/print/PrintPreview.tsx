import { ordered, type EventProject } from "../model/schema";
export function PrintPreview({
  project: p,
  onClose,
}: {
  project: EventProject;
  onClose: () => void;
}) {
  return (
    <div className="print-preview">
      <div className="print-toolbar">
        <button onClick={onClose}>Back to conductor</button>
        <button className="primary" onClick={() => window.print()}>
          Print routes & group plan
        </button>
        <p>
          Public labels only · {p.participants.length} routes · review all pages
          before printing
        </p>
      </div>
      <header className="print-title">
        <h1>{p.title}</h1>
        <p>
          Plan version {p.revision} · RoundRelay v0.1.0 · {p.eventId}
        </p>
        <p>
          Future routes below. Completed rounds are historical scheduled
          encounters.
        </p>
        {p.conductor.pendingDraft && (
          <strong>
            Pending changes have not been applied. This printout is the accepted
            plan.
          </strong>
        )}
      </header>
      <h2>Participant routes</h2>
      <div className="routes">
        {p.participants.map((person) => (
          <article className="route" key={person.participantId}>
            <header>
              <h3>{person.publicLabel}</h3>
              <small>
                Plan version {p.revision} · {person.participantId}
              </small>
            </header>
            <table>
              <thead>
                <tr>
                  <th>Round</th>
                  <th>Destination</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {ordered(p).map((r) => {
                  const a = r.assignments.find(
                    (a) => a.participantId === person.participantId,
                  );
                  const g = r.groups.find((g) => g.groupId === a?.groupId);
                  return (
                    <tr key={r.roundId}>
                      <td>
                        {r.order}. {r.publicTitle}
                      </td>
                      <td>{g?.publicLabel ?? "Not attending"}</td>
                      <td>
                        {r.status === "completed" ? "Historical" : r.status}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </article>
        ))}
      </div>
      <section className="print-groups">
        <h2>Group plan · version {p.revision}</h2>
        {ordered(p).map((r) => (
          <article className="round-print" key={r.roundId}>
            <h3>
              Round {r.order} · {r.publicTitle}{" "}
              {r.status === "completed" && "· Historical"}
            </h3>
            <div className="group-grid">
              {r.groups
                .filter((g) => g.enabled)
                .map((g) => (
                  <div className="group" key={g.groupId}>
                    <h4>{g.publicLabel}</h4>
                    <ul>
                      {r.assignments
                        .filter((a) => a.groupId === g.groupId)
                        .map((a) => (
                          <li key={a.participantId}>
                            {r.frozen?.publicParticipants.find(
                              (x) => x.participantId === a.participantId,
                            )?.publicLabel ??
                              p.participants.find(
                                (x) => x.participantId === a.participantId,
                              )?.publicLabel}
                          </li>
                        ))}
                    </ul>
                  </div>
                ))}
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
