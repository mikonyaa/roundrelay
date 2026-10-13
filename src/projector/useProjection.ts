import { useEffect, useRef, useState } from "react";
import type { EventProject } from "../model/schema";
import { channelName } from "./payload";
import { ProjectionPublisher, snapshotRequestSchema } from "./transport";

const CURSOR_KEY = "roundrelay-projection-v2";
function publisherForTab() {
  let saved: unknown = null;
  try {
    // New tabs can inherit a copy of sessionStorage from their opener. Only a reload or
    // history return continues this tab's stream; fresh document navigation gets its own.
    const navigation = performance.getEntriesByType("navigation")[0] as
      | PerformanceNavigationTiming
      | undefined;
    if (navigation?.type === "reload" || navigation?.type === "back_forward")
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
    const disconnect = () => {
      clearInterval(heartbeat);
      bc.close();
      if (channel.current === bc) channel.current = null;
    };
    window.addEventListener("pagehide", disconnect);
    send();
    return () => {
      window.removeEventListener("pagehide", disconnect);
      disconnect();
    };
  }, [publisher, readOnly, workspace]);
  useEffect(() => {
    if (project && !readOnly)
      channel.current?.postMessage(publisher.snapshot(project, workspace));
  }, [project, workspace, publisher, readOnly]);
  return publisher.sessionId;
}
