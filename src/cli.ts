import * as fs from "fs";
import { GtfsLoader } from "./gtfs/GtfsLoader";
import { TimeParser } from "./gtfs/TimeParser";
import { ConnectionScanAlgorithm } from "./csa/ConnectionScanAlgorithm";
import { ScanResultsFactory } from "./csa/ScanResultsFactory";
import { JourneyFactory } from "./journey/JourneyFactory";
import { DepartAfterQuery } from "./query/DepartAfterQuery";
import { MultipleCriteriaFilter } from "./query/MultipleCriteriaFilter";
import { journeyToString } from "./journey/Journey";

async function main() {
  const loader = new GtfsLoader(new TimeParser());

  console.time("initial load");
  const gtfs = await loader.load(fs.createReadStream("/home/linus/Downloads/gb-rail-latest.zip"));
  console.timeEnd("initial load");

  const csa = new ConnectionScanAlgorithm(gtfs.connections, gtfs.transfers, new ScanResultsFactory(gtfs.interchange));
  const query = new DepartAfterQuery(csa, new JourneyFactory(), [new MultipleCriteriaFilter()]);

  console.time("query");
  const results = query.plan(["TBW"], ["NRW"], new Date(), 9 * 3600);
  console.timeEnd("query");

  results.forEach(result => console.log(journeyToString(result)));
}

main().catch(e => console.error(e));
