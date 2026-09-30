import type {
  AtomicQuestion,
  Interview,
  InterviewAIReview,
  Preference,
  ResumeExperience,
  ReviewEvent,
  SyncBlock,
  Workspace,
  WorkspaceExport,
} from "../domain/types";
import { emptyWorkspace } from "../domain/workspace";

const DATABASE_NAME = "interview-atlas";
const DATABASE_VERSION = 5;

const stores = {
  interviews: "interviews",
  questions: "questions",
  syncBlocks: "syncBlocks",
  resumeExperiences: "resumeExperiences",
  aiReviews: "aiReviews",
  reviewEvents: "reviewEvents",
  preferences: "preferences",
} as const;

const dataStoreNames = [
  stores.interviews,
  stores.questions,
  stores.syncBlocks,
  stores.resumeExperiences,
  stores.aiReviews,
  stores.reviewEvents,
] as const;

export interface WorkspaceRepository {
  load(): Promise<Workspace>;
  save(workspace: Workspace): Promise<void>;
  clear(): Promise<void>;
  export(workspace: Workspace): WorkspaceExport;
  getPreference<T>(key: string): Promise<T | null>;
  setPreference<T>(key: string, value: T): Promise<void>;
}

function normalizeQuestion(question: AtomicQuestion): AtomicQuestion {
  const normalized = {
    ...question,
    notes: typeof question.notes === "string" ? question.notes : "",
  } as AtomicQuestion & { originalQuestion?: unknown };
  delete normalized.originalQuestion;
  return normalized;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed"));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
  });
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
      const database = request.result;
      dataStoreNames.forEach((storeName) => {
        if (!database.objectStoreNames.contains(storeName)) {
          database.createObjectStore(storeName, { keyPath: "id" });
        }
      });
      if (!database.objectStoreNames.contains(stores.preferences)) {
        database.createObjectStore(stores.preferences, { keyPath: "key" });
      }
      if (event.oldVersion < 5) {
        const cursorRequest = request.transaction
          ?.objectStore(stores.questions)
          .openCursor();
        if (cursorRequest) {
          cursorRequest.onsuccess = () => {
            const cursor = cursorRequest.result;
            if (!cursor) return;

            const question = cursor.value as Record<string, unknown>;
            if ("originalQuestion" in question) {
              delete question.originalQuestion;
            }
            if (typeof question.notes !== "string") question.notes = "";
            cursor.update(question);
            cursor.continue();
          };
        }
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Unable to open local workspace"));
    request.onblocked = () =>
      reject(new Error("Local workspace upgrade is blocked by another tab"));
  });
}

async function readAll<T>(
  transaction: IDBTransaction,
  storeName: string,
): Promise<T[]> {
  return requestResult(
    transaction.objectStore(storeName).getAll() as IDBRequest<T[]>,
  );
}

async function loadWorkspace(): Promise<Workspace> {
  const database = await openDatabase();
  const transaction = database.transaction([...dataStoreNames], "readonly");
  const completed = transactionComplete(transaction);

  try {
    const [
      interviews,
      questions,
      syncBlocks,
      resumeExperiences,
      aiReviews,
      reviewEvents,
    ] = await Promise.all([
      readAll<Interview>(transaction, stores.interviews),
      readAll<AtomicQuestion>(transaction, stores.questions),
      readAll<SyncBlock>(transaction, stores.syncBlocks),
      readAll<ResumeExperience>(transaction, stores.resumeExperiences),
      readAll<InterviewAIReview>(transaction, stores.aiReviews),
      readAll<ReviewEvent>(transaction, stores.reviewEvents),
    ]);
    await completed;
    return {
      interviews,
      questions: questions.map(normalizeQuestion),
      syncBlocks,
      resumeExperiences,
      aiReviews,
      reviewEvents,
    };
  } finally {
    database.close();
  }
}

function replaceStore<T extends { id: string }>(
  transaction: IDBTransaction,
  storeName: string,
  values: T[],
): void {
  const store = transaction.objectStore(storeName);
  store.clear();
  values.forEach((value) => store.put(value));
}

async function saveWorkspace(workspace: Workspace): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction([...dataStoreNames], "readwrite");
  const completed = transactionComplete(transaction);

  try {
    replaceStore(transaction, stores.interviews, workspace.interviews);
    replaceStore(
      transaction,
      stores.questions,
      workspace.questions.map(normalizeQuestion),
    );
    replaceStore(transaction, stores.syncBlocks, workspace.syncBlocks);
    replaceStore(
      transaction,
      stores.resumeExperiences,
      workspace.resumeExperiences,
    );
    replaceStore(transaction, stores.aiReviews, workspace.aiReviews);
    replaceStore(transaction, stores.reviewEvents, workspace.reviewEvents);
    await completed;
  } finally {
    database.close();
  }
}

async function clearWorkspace(): Promise<void> {
  await saveWorkspace(emptyWorkspace());
}

async function getPreference<T>(key: string): Promise<T | null> {
  const database = await openDatabase();
  const transaction = database.transaction(stores.preferences, "readonly");
  const completed = transactionComplete(transaction);

  try {
    const preference = await requestResult(
      transaction.objectStore(stores.preferences).get(key) as IDBRequest<
        Preference | undefined
      >,
    );
    await completed;
    return preference ? (preference.value as T) : null;
  } finally {
    database.close();
  }
}

async function setPreference<T>(key: string, value: T): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(stores.preferences, "readwrite");
  const completed = transactionComplete(transaction);

  try {
    transaction.objectStore(stores.preferences).put({ key, value } satisfies Preference);
    await completed;
  } finally {
    database.close();
  }
}

export const indexedDbRepository: WorkspaceRepository = {
  load: loadWorkspace,
  save: saveWorkspace,
  clear: clearWorkspace,
  getPreference,
  setPreference,
  export: (workspace) => ({
    formatVersion: 4,
    exportedAt: new Date().toISOString(),
    ...workspace,
    questions: workspace.questions.map(normalizeQuestion),
  }),
};
