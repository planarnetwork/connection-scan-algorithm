import type { Interchange } from "@gb-transit/gtfs-loader";
import type { OriginDepartureTimes } from "./ConnectionScanAlgorithm.js";
import { ScanResults } from "./ScanResults.js";

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
