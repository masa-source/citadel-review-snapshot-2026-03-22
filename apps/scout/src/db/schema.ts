/**
 * IndexedDB スキーマ定義のみ。メインスレッドの db.ts と Worker の両方から利用する。
 * window や singleton に依存するコードは含めない。
 */

import Dexie, { type Table } from "dexie";
import { DEXIE_SCHEMA } from "./schema.generated";
import type {
  Company,
  Instrument,
  MissionMeta,
  OwnedInstrument,
  Part,
  Report,
  ReportClient,
  ReportFormat,
  ReportSite,
  ReportOwnedInstrument,
  ReportWorker,
  SchemaDefinition,
  Site,
  TableDefinition,
  TargetInstrument,
  TargetInstrumentTable,
  UsedPart,
  Worker,
} from "@citadel/types";

export const DB_NAME = "ReportSystemDB";

/**
 * Dexie による IndexedDB スキーマ。db.json と同等の全テーブルを定義。
 */
export class ReportDatabase extends Dexie {
  companies!: Table<Company, string>;
  workers!: Table<Worker, string>;
  instruments!: Table<Instrument, string>;
  schemaDefinitions!: Table<SchemaDefinition, string>;
  sites!: Table<Site, string>;
  parts!: Table<Part, string>;
  ownedInstruments!: Table<OwnedInstrument, string>;
  tableDefinitions!: Table<TableDefinition, string>;
  reports!: Table<Report, string>;
  reportFormats!: Table<ReportFormat, string>;
  reportSites!: Table<ReportSite, string>;
  reportClients!: Table<ReportClient, string>;
  reportWorkers!: Table<ReportWorker, string>;
  targetInstruments!: Table<TargetInstrument, string>;
  targetInstrumentTables!: Table<TargetInstrumentTable, string>;
  usedParts!: Table<UsedPart, string>;
  reportOwnedInstruments!: Table<ReportOwnedInstrument, string>;
  missions!: Table<MissionMeta & { id?: string }, string>;

  constructor() {
    super(DB_NAME);
    const { reportFormats: _rf, ...dexieSchemaV2 } = DEXIE_SCHEMA;
    void _rf; // exclude reportFormats from v2 spread
    this.version(2).stores({
      ...dexieSchemaV2,
      missions: "missionId",
    });
    this.version(3).stores({
      ...DEXIE_SCHEMA,
      missions: "missionId",
    });
  }
}
