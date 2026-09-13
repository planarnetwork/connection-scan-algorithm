import * as fs from "node:fs";
import { ConnectionScanAlgorithm } from "../src/csa/ConnectionScanAlgorithm.js";
import { ScanResultsFactory } from "../src/csa/ScanResultsFactory.js";
import { loadGtfs } from "../src/gtfs/GtfsLoader.js";
import { journeyToString } from "../src/journey/Journey.js";
import { JourneyFactory } from "../src/journey/JourneyFactory.js";
import { DepartAfterQuery } from "../src/query/DepartAfterQuery.js";
import { MultipleCriteriaFilter } from "../src/query/MultipleCriteriaFilter.js";

async function run() {
  const filename = process.argv[2] || "gtfs.zip";
  const origins = process.argv[3] ? process.argv[3].split(",") : ["TBW"];
  const destinations = process.argv[4] ? process.argv[4].split(",") : ["NRW"];
  const time = process.argv[5] ? timeOf(process.argv[5]) : 9 * 3600;

  console.log(`Loading ${filename}`);
  console.time("initial load");
  const gtfs = await loadGtfs(fs.createReadStream(filename));
  console.timeEnd("initial load");

  const csa = new ConnectionScanAlgorithm(gtfs.connections, gtfs.transfers, new ScanResultsFactory(gtfs.interchange));
  const query = new DepartAfterQuery(csa, new JourneyFactory(gtfs.stations), [new MultipleCriteriaFilter()]);

  console.time("query");
  const results = query.plan(origins, destinations, new Date(), time);
  console.timeEnd("query");

  for (const result of results) {
    console.log(journeyToString(result));
  }
}

function timeOf(hhmm: string): number {
  const [hours, minutes] = hhmm.split(":").map(Number);

  return hours * 3600 + minutes * 60;
}

run().catch(e => console.error(e));
