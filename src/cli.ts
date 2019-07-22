import * as fs from "fs";
import { GtfsLoader } from "./gtfs/GtfsLoader";
import { TimeParser } from "./gtfs/TimeParser";
import { ConnectionScanAlgorithm } from "./csa/ConnectionScanAlgorithm";
import { ScanResultsFactory } from "./csa/ScanResultsFactory";
import { JourneyFactory } from "./journey/JourneyFactory";
import { DepartAfterQuery } from "./query/DepartAfterQuery";
import { MultipleCriteriaFilter } from "./query/MultipleCriteriaFilter";
import { Journey } from "./journey/Journey";

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

function journeyToString(j: Journey) {
  return toTime(j.departureTime) + ", " +
    toTime(j.arrivalTime) + ", " +
    [j.legs[0].origin, ...j.legs.map(l => l.destination)].join("-");
}

function toTime(time: number) {
  let hours: any   = Math.floor(time / 3600);
  let minutes: any = Math.floor((time - (hours * 3600)) / 60);
  let seconds: any = time - (hours * 3600) - (minutes * 60);

  if (hours   < 10) { hours   = "0" + hours; }
  if (minutes < 10) { minutes = "0" + minutes; }
  if (seconds < 10) { seconds = "0" + seconds; }

  return hours + ":" + minutes + ":" + seconds;
}

main().catch(e => console.error(e));
