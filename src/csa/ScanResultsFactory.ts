import { Interchange } from "../gtfs/GtfsLoader";
import { OriginDepartureTimes } from "./ConnectionScanAlgorithm";
import { ScanResults } from "./ScanResults";

/**
 * Creates a new ScanResults object for a given set of origins
 */
export class ScanResultsFactory {

  constructor(
    private readonly interchange: Interchange
  ) { }

  public create(origins: OriginDepartureTimes): ScanResults {
    return new ScanResults(this.interchange, origins);
  }

}