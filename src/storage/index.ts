import { z } from "zod";
import { projectSchema, type EventProject } from "../model/schema";

const DATABASE = "roundrelay-v1";
const LEASE_MS = 5000;
const integer = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
// Additive local-record migration; portable event JSON remains schemaVersion 1.
const recordSchema = z.object({
  project: projectSchema.nullable(),
  generation: integer,
  owner: z.string(),
  expires: integer,
  leaseEpoch: integer.default(0),
});
type RecordValue = z.infer<typeof recordSchema>;
export type SaveResult = { generation: number };
export type StorageFence = { connection: number; leaseEpoch: number };
export class StorageConflict extends Error {}
export class StorageSuspended extends Error {}

export class ProjectStorage {
  private db: IDBDatabase | null = null;
  private opening: Promise<void> | null = null;
  private closing: Promise<void> | null = null;
  private connection = 0;
  private leaseEpoch = 0;
  readonly owner = crypto.randomUUID();

  get fence(): StorageFence {
    if (!this.db || !this.leaseEpoch)
      throw new StorageSuspended("Storage is not owned or connected");
    return { connection: this.connection, leaseEpoch: this.leaseEpoch };
  }
  open(): Promise<void> {
    if (this.closing) return this.closing.then(() => this.open());
    if (this.db) return Promise.resolve();
    if (this.opening) return this.opening;
    const connection = ++this.connection;
    const pending = new Promise<void>((resolve, reject) => {
      let abandoned = false;
      const request = indexedDB.open(DATABASE, 1);
      request.onupgradeneeded = () =>
        request.result.createObjectStore("workspace");
      request.onblocked = () => {
        abandoned = true;
        reject(
          new Error(
            "Storage upgrade is blocked. Close another RoundRelay tab and download a backup.",
          ),
        );
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        if (abandoned || connection !== this.connection) {
          db.close();
          reject(new StorageSuspended("Storage opening was superseded"));
          return;
        }
        this.db = db;
        const invalidate = () => {
          if (this.db === db) {
            this.db = null;
            this.leaseEpoch = 0;
            this.connection++;
          }
          db.close();
        };
        db.onversionchange = invalidate;
        db.onclose = invalidate;
        resolve();
      };
    });
    this.opening = pending;
    const clear = () => {
      if (this.opening === pending) this.opening = null;
    };
    void pending.then(clear, clear);
    return pending;
  }

  private transaction<T>(
    mode: IDBTransactionMode,
    connection: number,
    visit: (previous: RecordValue | null) => { value?: RecordValue; result: T },
  ): Promise<T> {
    if (!this.db || connection !== this.connection)
      return Promise.reject(
        new StorageSuspended(
          "Storage connection was suspended; resume before saving",
        ),
      );
    const db = this.db;
    return new Promise((resolve, reject) => {
      const tx = db.transaction("workspace", mode);
      const store = tx.objectStore("workspace");
      const request = store.get("current");
      let result: T;
      let failure: unknown;
      request.onsuccess = () => {
        try {
          if (connection !== this.connection || this.db !== db)
            throw new StorageSuspended(
              "Queued storage operation belongs to a retired connection",
            );
          const previous =
            request.result === undefined
              ? null
              : recordSchema.parse(request.result);
          const outcome = visit(previous);
          result = outcome.result;
          if (outcome.value)
            store.put(recordSchema.parse(outcome.value), "current");
        } catch (error) {
          failure = error;
          tx.abort();
        }
      };
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(failure ?? tx.error);
      tx.onabort = () =>
        reject(failure ?? tx.error ?? new Error("Storage transaction aborted"));
    });
  }

  async read(): Promise<RecordValue | null> {
    await this.open();
    return this.transaction("readonly", this.connection, (previous) => ({
      result: previous,
    }));
  }
  async claim(): Promise<{
    owned: boolean;
    generation: number;
    project: EventProject | null;
    leaseEpoch: number;
  }> {
    await this.open();
    const connection = this.connection;
    const result = await this.transaction(
      "readwrite",
      connection,
      (previous) => {
        const value = previous ?? {
          project: null,
          generation: 0,
          owner: "",
          expires: 0,
          leaseEpoch: 0,
        };
        if (
          value.owner &&
          value.owner !== this.owner &&
          value.expires > Date.now()
        )
          return {
            result: {
              owned: false,
              generation: value.generation,
              project: value.project,
              leaseEpoch: value.leaseEpoch,
            },
          };
        const sameLease =
          value.owner === this.owner &&
          value.leaseEpoch === this.leaseEpoch &&
          this.leaseEpoch > 0 &&
          value.expires > Date.now();
        const claimed = {
          ...value,
          owner: this.owner,
          expires: Date.now() + LEASE_MS,
          leaseEpoch: value.leaseEpoch + (sameLease ? 0 : 1),
        };
        return {
          value: claimed,
          result: {
            owned: true,
            generation: claimed.generation,
            project: claimed.project,
            leaseEpoch: claimed.leaseEpoch,
          },
        };
      },
    );
    if (connection !== this.connection)
      throw new StorageSuspended("Claim belongs to a retired connection");
    this.leaseEpoch = result.owned ? result.leaseEpoch : 0;
    return result;
  }
  private requireLease(
    value: RecordValue | null,
    fence: StorageFence,
  ): RecordValue {
    if (
      !value ||
      value.owner !== this.owner ||
      value.leaseEpoch !== fence.leaseEpoch ||
      this.leaseEpoch !== fence.leaseEpoch
    )
      throw new StorageConflict(
        "Another tab owns this event. Download your backup before recovering the saved state.",
      );
    return value;
  }
  renew(fence = this.fence): Promise<void> {
    return this.transaction("readwrite", fence.connection, (previous) => {
      const value = this.requireLease(previous, fence);
      return {
        value: { ...value, expires: Date.now() + LEASE_MS },
        result: undefined,
      };
    });
  }
  save(
    project: EventProject,
    expectedGeneration: number,
    fence = this.fence,
  ): Promise<SaveResult> {
    const snapshot = projectSchema.parse(project);
    return this.transaction("readwrite", fence.connection, (previous) => {
      const value = this.requireLease(previous, fence);
      if (value.generation !== expectedGeneration)
        throw new StorageConflict(
          "Save conflict. Download your snapshot as a backup before recovering the saved event.",
        );
      const generation = expectedGeneration + 1;
      return {
        value: {
          ...value,
          project: snapshot,
          generation,
          expires: Date.now() + LEASE_MS,
        },
        result: { generation },
      };
    });
  }

  release(): Promise<void> {
    if (this.closing) return this.closing;
    const db = this.db,
      opening = this.opening,
      leaseEpoch = this.leaseEpoch;
    this.connection++;
    this.db = null;
    this.leaseEpoch = 0;
    // Close this exact handle synchronously; a late release never closes a new connection.
    const released = db
      ? new Promise<void>((resolve) => {
          try {
            const tx = db.transaction("workspace", "readwrite");
            const store = tx.objectStore("workspace");
            const request = store.get("current");
            request.onsuccess = () => {
              const value = request.result as RecordValue | undefined;
              if (
                value?.owner === this.owner &&
                (value.leaseEpoch ?? 0) === leaseEpoch
              )
                store.put({ ...value, expires: 0, owner: "" }, "current");
            };
            tx.oncomplete = tx.onerror = tx.onabort = () => resolve();
          } catch {
            resolve();
          }
          db.close();
        })
      : Promise.resolve();
    const pending = Promise.all([released, opening?.catch(() => {})]).then(
      () => {},
    );
    this.closing = pending;
    void pending.then(() => {
      if (this.closing === pending) this.closing = null;
    });
    return pending;
  }
}
