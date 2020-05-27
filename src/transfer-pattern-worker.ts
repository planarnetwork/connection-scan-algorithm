import { TransferPatternRepository } from "./transfer-pattern/TransferPatternRepository";
import * as fs from "fs";
import { GtfsLoader } from "./gtfs/GtfsLoader";
import { TimeParser } from "./gtfs/TimeParser";
import { ScanResultsFactory } from "./csa/ScanResultsFactory";
import { JourneyFactory } from "./journey/JourneyFactory";
import { TransferPatternConnectionScan } from "./transfer-pattern/TransferPatternConnectionScan";
import { DayOfWeek } from "./gtfs/Gtfs";

/**
 * Worker that finds transfer patterns for a given station
 */
async function worker(filename: string, date: Date): Promise<void> {
  const db = getDatabase();
  const repository = new TransferPatternRepository(db);
  const dateNumber = getDateNumber(date);
  const dayOfWeek = date.getDay() as DayOfWeek;
  const loader = new GtfsLoader(new TimeParser());
  const gtfs = await loader.load(fs.createReadStream(filename));
  const connections = gtfs.connections.filter(c => c.trip.service.runsOn(dateNumber, dayOfWeek));
  const csa = new TransferPatternConnectionScan(
    connections,
    gtfs.transfers,
    new ScanResultsFactory(gtfs.interchange),
    new JourneyFactory()
  );

  process.on("message", async stop => {
    const results = csa.getShortestPathTree(stop);

    await repository.storeTransferPatterns(results);

    morePlease();
  });

  process.on("SIGUSR2", () => db.end().then(() => process.exit()));

  morePlease();
}

function morePlease() {
  (process as any).send("ready");
}

function getDatabase() {
  return require("mysql2/promise").createPool({
    // host: process.env.DATABASE_HOSTNAME || "localhost",
    socketPath: "/run/mysqld/mysqld.sock",
    user: process.env.DATABASE_USERNAME || "root",
    password: process.env.DATABASE_PASSWORD || "",
    database: process.env.OJP_DATABASE_NAME || "ojp",
    connectionLimit: 3,
  });
}

function getDateNumber(date: Date): number {
  const str = date.toISOString();

  return parseInt(str.slice(0, 4) + str.slice(5, 7) + str.slice(8, 10), 10);
}

if (process.argv[2] && process.argv[3]) {
  worker(process.argv[2], new Date(process.argv[3])).catch(err => {
    console.error(err);
    process.exit();
  });
}
else {
  console.log("Please specify a date and GTFS file.");
}
