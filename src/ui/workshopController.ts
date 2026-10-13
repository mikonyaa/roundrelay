import { reduceProject, type Command } from "../conductor";
import {
  canonical,
  clone,
  projectSchema,
  type EventProject,
} from "../model/schema";
import { ProjectStorage, StorageConflict } from "../storage";

export type WorkshopState = {
  project: EventProject | null;
  saveStatus: string;
  readOnly: boolean;
  ready: boolean;
  message: string;
  workspaceVersion: number;
  recoveryNeeded: boolean;
};
const equal = (a: EventProject | null, b: EventProject | null) =>
  canonical(a) === canonical(b);

// Owns the write queue and page lifecycle; React only subscribes and renders commands.
export class WorkshopController {
  private state: WorkshopState = {
    project: null,
    saveStatus: "Opening local storage…",
    readOnly: false,
    ready: false,
    message: "",
    workspaceVersion: 0,
    recoveryNeeded: false,
  };
  private listeners = new Set<() => void>();
  private queue = Promise.resolve();
  private resuming: Promise<void> | null = null;
  private epoch = 0;
  private suspended = true;
  private failed = false;
  private generation = 0;
  private latest = 0;
  private committed: EventProject | null = null;
  private polling = false;
  constructor(private readonly storage = new ProjectStorage()) {}
  snapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private update(change: Partial<WorkshopState>) {
    this.state = { ...this.state, ...change };
    for (const listener of this.listeners) listener();
  }
  setMessage = (message: string) => this.update({ message });

  resume = (recover = false): Promise<void> => {
    if (!this.suspended && this.resuming) return this.resuming;
    if (!recover && !this.suspended && this.state.ready && !this.failed)
      return Promise.resolve();
    const previousResume = this.resuming;
    const epoch = ++this.epoch;
    this.suspended = false;
    this.update({ readOnly: true, saveStatus: "Reopening local storage…" });
    const task = (async () => {
      try {
        await previousResume;
        await this.queue;
        if (epoch !== this.epoch || this.suspended) return;
        await this.storage.open();
        const result = await this.storage.claim();
        if (epoch !== this.epoch || this.suspended) return;
        const dirty = !equal(this.state.project, this.committed);
        const changedElsewhere = !equal(result.project, this.committed);
        this.generation = result.generation;
        this.failed = false;
        if (!result.owned) {
          if (!dirty) {
            this.committed = result.project;
            this.update({ project: result.project });
          }
          this.update({
            readOnly: true,
            ready: true,
            recoveryNeeded: true,
            saveStatus: dirty
              ? "Unsaved · another conductor owns the event · download a backup"
              : "Read-only · another conductor tab owns this event",
            message: recover
              ? "The conductor is still active in another tab. Close it, then recover here."
              : "",
          });
          return;
        }
        if (dirty && changedElsewhere && !recover) {
          this.failed = true;
          this.update({
            ready: true,
            readOnly: true,
            recoveryNeeded: true,
            saveStatus:
              "Unsaved · saved event changed while suspended · download a backup",
            message:
              "Your unsaved draft is still here. Download its backup before Recover saved event loads the other tab’s committed snapshot.",
          });
          return;
        }
        this.committed = result.project;
        const project = dirty && !recover ? this.state.project : result.project;
        this.update({
          project,
          ready: true,
          readOnly: false,
          recoveryNeeded: false,
          saveStatus: "Saved locally",
          workspaceVersion: this.state.workspaceVersion + 1,
          message: recover
            ? "Recovered the last committed snapshot."
            : this.state.message,
        });
        if (dirty && !recover && project) this.persist(project);
      } catch (error) {
        if (epoch !== this.epoch || this.suspended) return;
        this.failed = true;
        this.update({
          ready: true,
          // Allow an in-memory event and backup when IndexedDB is unavailable at startup.
          readOnly: !!this.committed,
          recoveryNeeded: true,
          saveStatus: `Storage unavailable · ${error instanceof Error ? error.message : "unknown error"}`,
          message: recover
            ? error instanceof Error
              ? error.message
              : "Recovery failed"
            : this.state.message,
        });
      }
    })();
    this.resuming = task;
    void task.then(() => {
      if (this.resuming === task) this.resuming = null;
    });
    return task;
  };
  recover = () => this.resume(true);
  suspend = (): Promise<void> => {
    if (this.suspended) return this.storage.release();
    this.suspended = true;
    this.epoch++;
    this.update({
      readOnly: true,
      saveStatus: "Storage suspended · returning will reopen the saved event",
    });
    return this.storage.release();
  };
  poll = async () => {
    if (
      this.suspended ||
      this.failed ||
      this.resuming ||
      !this.state.ready ||
      this.polling
    )
      return;
    this.polling = true;
    const epoch = this.epoch;
    try {
      if (this.state.readOnly) {
        const value = await this.storage.read();
        if (
          value &&
          epoch === this.epoch &&
          equal(this.state.project, this.committed)
        ) {
          this.committed = value.project;
          this.generation = value.generation;
          this.update({ project: value.project });
        }
      } else await this.storage.renew();
    } catch (error) {
      if (epoch !== this.epoch || this.suspended) return;
      this.failed = true;
      this.update({
        readOnly: true,
        recoveryNeeded: true,
        saveStatus: `Unsaved · ${error instanceof Error ? error.message : "Storage error"} · download a backup`,
      });
    } finally {
      this.polling = false;
    }
  };

  private persist(project: EventProject) {
    const next = clone(project);
    const serial = ++this.latest;
    const epoch = this.epoch;
    this.update({ project: next, message: "" });
    if (this.failed) {
      this.update({
        saveStatus: "Unsaved · download a backup",
        recoveryNeeded: true,
      });
      return;
    }
    const fence = this.storage.fence;
    this.update({ saveStatus: "Saving…" });
    this.queue = this.queue.then(async () => {
      if (epoch !== this.epoch || this.suspended || this.failed) return;
      try {
        const result = await this.storage.save(next, this.generation, fence);
        // A committed transaction remains authoritative even if pagehide happened just afterwards.
        this.committed = next;
        this.generation = result.generation;
        if (epoch === this.epoch && serial === this.latest)
          this.update({ saveStatus: "Saved locally" });
      } catch (error) {
        if (epoch !== this.epoch || this.suspended) return;
        this.failed = true;
        this.update({
          readOnly: error instanceof StorageConflict || this.state.readOnly,
          recoveryNeeded: true,
          saveStatus: `Unsaved · ${error instanceof Error ? error.message : "Storage error"} · download a backup`,
        });
      }
    });
  }
  dispatch = (command: Command) => {
    if (this.state.readOnly || this.suspended || !this.state.project) return;
    try {
      const next = reduceProject(this.state.project, command);
      if (next !== this.state.project) this.persist(next);
    } catch (error) {
      this.setMessage(
        error instanceof Error ? error.message : "Command failed",
      );
    }
  };
  replace = (project: EventProject) => {
    if (this.state.readOnly || this.suspended) return;
    projectSchema.parse(project);
    this.update({ workspaceVersion: this.state.workspaceVersion + 1 });
    this.persist(project);
  };
}
