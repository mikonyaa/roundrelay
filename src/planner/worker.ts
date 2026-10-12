import { planRepair, type PlannerOptions } from "./index";
import type { Draft, EventProject } from "../model/schema";
const worker = self as unknown as {
  onmessage:
    | ((
        e: MessageEvent<{
          requestId: string;
          base: EventProject;
          draft: Draft;
          options: PlannerOptions;
        }>,
      ) => void)
    | null;
  postMessage: (value: unknown) => void;
};
worker.onmessage = (
  e: MessageEvent<{
    requestId: string;
    base: EventProject;
    draft: Draft;
    options: PlannerOptions;
  }>,
) => {
  worker.postMessage({
    requestId: e.data.requestId,
    proposal: planRepair(e.data.base, e.data.draft, e.data.options),
  });
};
