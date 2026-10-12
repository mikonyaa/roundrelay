import { projectSchema, type EventProject } from "../model/schema";

const DATABASE = "roundrelay-v1";
const LEASE_MS = 5000;
type RecordValue = {
  project: EventProject | null;
  generation: number;
  owner: string;
  expires: number;
};
export type SaveResult = { generation: number };
export class StorageConflict extends Error {}
export class ProjectStorage {
  private db: IDBDatabase | null = null;
  readonly owner = crypto.randomUUID();
  async open(): Promise<void> {
    this.db = await new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE, 1);
      request.onupgradeneeded = () =>
        request.result.createObjectStore("workspace");
      request.onblocked = () =>
        reject(
          new Error(
            "Storage upgrade is blocked. Close another RoundRelay tab and download a backup.",
          ),
        );
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        request.result.onversionchange = () => request.result.close();
        resolve(request.result);
      };
    });
  }
  async read(): Promise<RecordValue | null> {
    if (!this.db) throw new Error("Storage is unavailable");
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction("workspace", "readonly");
      const request = transaction.objectStore("workspace").get("current");
      transaction.oncomplete = () =>
        resolve((request.result as RecordValue | undefined) ?? null);
      transaction.onerror = () => reject(transaction.error);
    });
  }
  async claim(): Promise<{
    owned: boolean;
    generation: number;
    project: EventProject | null;
  }> {
    if (!this.db) throw new Error("Storage is unavailable");
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction("workspace", "readwrite");
      const store = tx.objectStore("workspace");
      const request = store.get("current");
      let value: RecordValue;
      let owned = false;
      request.onsuccess = () => {
        value = (request.result as RecordValue | undefined) ?? {
          project: null,
          generation: 0,
          owner: "",
          expires: 0,
        };
        if (
          !value.owner ||
          value.owner === this.owner ||
          value.expires < Date.now()
        ) {
          owned = true;
          value = {
            ...value,
            owner: this.owner,
            expires: Date.now() + LEASE_MS,
          };
          store.put(value, "current");
        }
      };
      tx.oncomplete = () => {
        try {
          if (value.project) projectSchema.parse(value.project);
          resolve({
            owned,
            generation: value.generation,
            project: value.project,
          });
        } catch (error) {
          reject(error);
        }
      };
      tx.onerror = () => reject(tx.error);
      tx.onabort = () =>
        reject(tx.error ?? new Error("Storage transaction aborted"));
    });
  }
  async renew(): Promise<void> {
    if (!this.db) throw new Error("Storage is unavailable");
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction("workspace", "readwrite"),
        store = tx.objectStore("workspace");
      const request = store.get("current");
      let conflict = false;
      request.onsuccess = () => {
        const value = request.result as RecordValue;
        if (value?.owner !== this.owner) {
          conflict = true;
          return;
        }
        store.put({ ...value, expires: Date.now() + LEASE_MS }, "current");
      };
      tx.oncomplete = () =>
        conflict
          ? reject(
              new StorageConflict(
                "Another tab owns this event. Reload to recover its saved state.",
              ),
            )
          : resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
  async save(
    project: EventProject,
    expectedGeneration: number,
  ): Promise<SaveResult> {
    if (!this.db) throw new Error("Storage is unavailable");
    projectSchema.parse(project);
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction("workspace", "readwrite"),
        store = tx.objectStore("workspace");
      const request = store.get("current");
      let conflict = false;
      request.onsuccess = () => {
        const previous = request.result as RecordValue | undefined;
        if (
          previous?.owner !== this.owner ||
          previous.generation !== expectedGeneration
        ) {
          conflict = true;
          return;
        }
        store.put(
          {
            project,
            generation: expectedGeneration + 1,
            owner: this.owner,
            expires: Date.now() + LEASE_MS,
          },
          "current",
        );
      };
      tx.oncomplete = () =>
        conflict
          ? reject(
              new StorageConflict(
                "Save conflict. Your snapshot is still available as a backup; reload before taking ownership.",
              ),
            )
          : resolve({ generation: expectedGeneration + 1 });
      tx.onerror = () => reject(tx.error);
      tx.onabort = () =>
        reject(tx.error ?? new Error("Save transaction aborted"));
    });
  }
  async release(): Promise<void> {
    if (!this.db) return;
    await new Promise<void>((resolve) => {
      const tx = this.db!.transaction("workspace", "readwrite"),
        store = tx.objectStore("workspace");
      const request = store.get("current");
      request.onsuccess = () => {
        const v = request.result as RecordValue | undefined;
        if (v?.owner === this.owner)
          store.put({ ...v, expires: 0, owner: "" }, "current");
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
    this.db.close();
    this.db = null;
  }
}
