/**
 * 同期用 Web Worker。IndexedDB の export / merge をメインスレッドから切り離す。
 */

import type { DatabaseSchema } from "@citadel/types";
import { TABLE_KEYS } from "@citadel/types";
import { ReportDatabase } from "../db/schema";
import type { WorkerCommand, WorkerEvent } from "../services/manage/workerProtocol";

const SORT_ORDER_TABLES: (keyof DatabaseSchema)[] = [
  "reportSites",
  "reportClients",
  "reportWorkers",
  "targetInstruments",
  "targetInstrumentTables",
  "reportOwnedInstruments",
  "usedParts",
];

let workerDb: ReportDatabase | null = null;

async function getDb(): Promise<ReportDatabase> {
  if (!workerDb) {
    workerDb = new ReportDatabase();
    await workerDb.open();
  }
  return workerDb;
}

function post(event: WorkerEvent): void {
  self.postMessage(event);
}

function postProgress(progress: number, message?: string): void {
  post({ type: "PROGRESS", progress, message });
}

function postError(message: string, code?: string): void {
  post({ type: "ERROR", message, code });
}

async function handleExportDatabase(): Promise<void> {
  const db = await getDb();
  const data = {} as DatabaseSchema;
  const total = TABLE_KEYS.length;
  for (let i = 0; i < total; i++) {
    const key = TABLE_KEYS[i];
    let rows = await db.table(key).toArray();
    if (SORT_ORDER_TABLES.includes(key)) {
      const withSort = rows as { sortOrder?: number }[];
      withSort.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
      rows = withSort.map((row, index) => ({ ...row, sortOrder: index }));
    }
    (data as Record<keyof DatabaseSchema, unknown>)[key] = rows;
    postProgress(Math.round((100 * (i + 1)) / total), key);
  }
  post({ type: "EXPORT_RESULT", data });
}

async function handleMergeIntoDb(payload: {
  data: Partial<DatabaseSchema>;
  clearFirst: boolean;
}): Promise<void> {
  const db = await getDb();
  const { data, clearFirst } = payload;
  const total = TABLE_KEYS.length;
  await db.transaction("rw", TABLE_KEYS, async () => {
    if (clearFirst) {
      await Promise.all(TABLE_KEYS.map((key) => db.table(key).clear()));
    }
    for (let i = 0; i < total; i++) {
      const key = TABLE_KEYS[i];
      const rows = data[key];
      if (rows && rows.length > 0) {
        await db.table(key).bulkPut(rows);
      }
      postProgress(Math.round((100 * (i + 1)) / total), key);
    }
  });
  post({ type: "DONE" });
}

self.onmessage = async (ev: MessageEvent<WorkerCommand>) => {
  const cmd = ev.data;
  if (!cmd || typeof cmd !== "object" || !("type" in cmd)) {
    postError("Invalid command");
    return;
  }
  try {
    switch (cmd.type) {
      case "EXPORT_DATABASE":
        await handleExportDatabase();
        break;
      case "MERGE_INTO_DB":
        await handleMergeIntoDb(cmd.payload);
        break;
      default:
        postError(`Unknown command: ${(cmd as { type: string }).type}`);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    postError(message, "WORKER_ERROR");
  }
};
