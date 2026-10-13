import type { EventProject } from "../model/schema";
import { validateProject } from "../validate";

export function operationalReadiness(project: EventProject) {
  // A pending edit is not the accepted route plan. Validate that plan independently.
  const diagnostics = validateProject({
    ...project,
    conductor: { ...project.conductor, pendingDraft: null },
  });
  const routeReason = diagnostics.length
    ? "Routes unavailable: repair the hard-invalid draft before projecting, printing or exporting routes. Download backup remains available."
    : null;
  return {
    diagnostics,
    routesReady: !routeReason,
    routeReason,
    startReason:
      routeReason ??
      (project.conductor.pendingDraft
        ? "Apply or cancel the pending future draft before starting a round"
        : null),
  };
}

export function requireOperationalRoutes(project: EventProject) {
  const { routeReason } = operationalReadiness(project);
  if (routeReason) throw new Error(routeReason);
}
