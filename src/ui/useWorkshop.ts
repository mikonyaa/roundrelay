import { useEffect, useRef, useState } from "react";
import { reduceProject, type Command } from "../conductor";
import { ProjectStorage, StorageConflict } from "../storage";
import { clone, type EventProject } from "../model/schema";

export function useWorkshop() {
  const [project, setProject] = useState<EventProject | null>(null);
  const current = useRef<EventProject | null>(null);
  const [saveStatus, setSaveStatus] = useState("Opening local storage…");
  const [readOnly, setReadOnly] = useState(false);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("");
  const storage = useRef(new ProjectStorage());
  const generation = useRef(0);
  const queue = useRef(Promise.resolve());
  const latest = useRef(0);
  const failed = useRef(false);
  const adopt = (p: EventProject | null) => {
    current.current = p;
    setProject(p);
  };
  useEffect(() => {
    let alive = true;
    const init = async () => {
      try {
        await storage.current.open();
        const result = await storage.current.claim();
        if (!alive) return;
        generation.current = result.generation;
        adopt(result.project);
        setReadOnly(!result.owned);
        setSaveStatus(
          result.owned
            ? "Saved locally"
            : "Read-only · another conductor tab owns this event",
        );
      } catch (e) {
        failed.current = true;
        setSaveStatus(
          `Storage unavailable · ${e instanceof Error ? e.message : "unknown error"}`,
        );
      }
      setReady(true);
    };
    void init();
    const pagehide = () => {
      void storage.current.release();
    };
    window.addEventListener("pagehide", pagehide);
    return () => {
      alive = false;
      window.removeEventListener("pagehide", pagehide);
      void storage.current.release();
    };
  }, []);
  useEffect(() => {
    if (!ready || failed.current) return;
    const interval = window.setInterval(() => {
      if (readOnly) {
        void storage.current
          .read()
          .then((v) => {
            if (v && !failed.current) {
              adopt(v.project);
              generation.current = v.generation;
            }
          })
          .catch(() => {});
      } else
        void storage.current.renew().catch((e) => {
          setReadOnly(true);
          failed.current = true;
          setSaveStatus(e instanceof Error ? e.message : "Storage error");
        });
    }, 1500);
    return () => window.clearInterval(interval);
  }, [ready, readOnly]);
  const persist = (next: EventProject) => {
    adopt(next);
    setMessage("");
    const serial = ++latest.current;
    if (failed.current) {
      setSaveStatus("Unsaved · download a backup");
      return;
    }
    setSaveStatus("Saving…");
    queue.current = queue.current.then(async () => {
      if (failed.current) return;
      try {
        const result = await storage.current.save(
          clone(next),
          generation.current,
        );
        generation.current = result.generation;
        if (serial === latest.current) setSaveStatus("Saved locally");
      } catch (e) {
        failed.current = true;
        if (e instanceof StorageConflict) setReadOnly(true);
        setSaveStatus(
          `Unsaved · ${e instanceof Error ? e.message : "Storage error"} · download a backup`,
        );
      }
    });
  };
  const dispatch = (command: Command) => {
    if (readOnly || !current.current) return;
    try {
      const next = reduceProject(current.current, command);
      if (next !== current.current) persist(next);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Command failed");
    }
  };
  const replace = (p: EventProject) => {
    if (!readOnly) persist(clone(p));
  };
  const recover = async () => {
    try {
      await queue.current;
      const result = await storage.current.claim();
      if (!result.owned) {
        setMessage(
          "The conductor is still active in another tab. Close it, then recover here.",
        );
        return;
      }
      generation.current = result.generation;
      failed.current = false;
      adopt(result.project);
      setReadOnly(false);
      setSaveStatus("Saved locally");
      setMessage("Recovered the last committed snapshot.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Recovery failed");
    }
  };
  return {
    project,
    dispatch,
    replace,
    saveStatus,
    readOnly,
    ready,
    message,
    setMessage,
    recover,
  };
}
