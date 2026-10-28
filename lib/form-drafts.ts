import { getClinicContext } from "@/lib/clinic-db";
import { vetraCore } from "@/lib/vetra-core";

/** Keeps an unfinished form private to the signed-in user and active clinic. */
export async function getFormDraftStorageKey(form: string) {
  try {
    const [{ data: { user } }, clinic] = await Promise.all([
      vetraCore.auth.getUser(),
      getClinicContext(),
    ]);

    if (!user) return null;
    return `vetra-form-draft:${form}:${user.id}:${clinic.clinic_id}`;
  } catch {
    return null;
  }
}

export function readFormDraft<T>(key: string): T | null {
  try {
    const value = window.localStorage.getItem(key);
    return value ? JSON.parse(value) as T : null;
  } catch {
    return null;
  }
}

export function writeFormDraft(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be unavailable or full; the form remains usable in memory.
  }
}

export function clearFormDraft(key: string | null) {
  if (!key) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore storage failures while keeping the completed form flow intact.
  }
}

function openDraftFilesDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open("vetra-form-draft-files", 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("attachments")) {
        request.result.createObjectStore("attachments");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function writeFormDraftFiles<T>(key: string, files: T) {
  try {
    const db = await openDraftFilesDb();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("attachments", "readwrite");
      transaction.objectStore("attachments").put(files, key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    db.close();
  } catch {
    // File attachments are best-effort when browser storage is unavailable.
  }
}

export async function readFormDraftFiles<T>(key: string): Promise<T | null> {
  try {
    const db = await openDraftFilesDb();
    const files = await new Promise<T | null>((resolve, reject) => {
      const request = db.transaction("attachments", "readonly").objectStore("attachments").get(key);
      request.onsuccess = () => resolve((request.result as T | undefined) ?? null);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return files;
  } catch {
    return null;
  }
}

export async function clearFormDraftFiles(key: string | null) {
  if (!key) return;
  try {
    const db = await openDraftFilesDb();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("attachments", "readwrite");
      transaction.objectStore("attachments").delete(key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    db.close();
  } catch {
    // Ignore storage failures while keeping the completed form flow intact.
  }
}
