import { useEffect, useRef, useState } from "react";
import type { EventProject } from "../model/schema";
import { channelName } from "./payload";
import { ProjectionPublisher, snapshotRequestSchema } from "./transport";

const CURSOR_KEY = "roundrelay-projection-v2";
function publisherForTab() {
  let saved: unknown = null;
  try {
    saved = JSON.parse(sessionStorage.getItem(CURSOR_KEY) ?? "null");
  } catch {
    /* Session storage may be disabled. */
  }
  return new ProjectionPublisher(saved, (cursor) => {
    try {
      sessionStorage.setItem(CURSOR_KEY, JSON.stringify(cursor));
    } catch {
      /* This mount still has an ordered in-memory cursor. */
    }
  });
}

export function useProjection(
  project: EventProject | null,
  readOnly: boolean,
  workspace: number,
) {
  const [publisher] = useState(publisherForTab);
  const current = useRef({ project, workspace });
  current.current = { project, workspace };
  const channel = useRef<BroadcastChannel | null>(null);
  useEffect(() => {
    if (!("BroadcastChannel" in window) || readOnly) return;
    const bc = new BroadcastChannel(channelName(publisher.sessionId));
    channel.current = bc;
    const send = () => {
      const { project, workspace } = current.current;
      if (project) bc.postMessage(publisher.snapshot(project, workspace));
    };
    bc.onmessage = (event) => {
      const request = snapshotRequestSchema.safeParse(event.data);
      if (request.success && request.data.sessionId === publisher.sessionId)
        send();
    };
    const heartbeat = setInterval(send, 1000);
    send();
    return () => {
      clearInterval(heartbeat);
      bc.close();
      channel.current = null;
    };
  }, [publisher, readOnly]);
  useEffect(() => {
    if (project && !readOnly)
      channel.current?.postMessage(publisher.snapshot(project, workspace));
  }, [project, workspace, publisher, readOnly]);
  return publisher.sessionId;
}
