import type { StopID } from "@gb-transit/gtfs-loader";
import type { GtfsData } from "../gtfs/GtfsLoader.js";
import type { OriginDepartureTimes } from "./ConnectionScanAlgorithm.js";
import { NOT_CARRIED, ScanResults } from "./ScanResults.js";

/**
 * Creates a new ScanResults object for a given set of origins and destinations
 */
export class ScanResultsFactory {
  private readonly tripArrivals: Int32Array;
  private readonly tripBoardings: Int32Array;
  private readonly tripBoardingRanks: Int32Array;

  constructor(
    private readonly gtfs: GtfsData
  ) {
    this.tripArrivals = new Int32Array(gtfs.trips.length);
    this.tripBoardings = new Int32Array(gtfs.trips.length);
    this.tripBoardingRanks = new Int32Array(gtfs.trips.length);
  }

  /**
   * The trip arrivals are shared between scans rather than allocated for each, so only the results
   * of the scan in progress can still be asked whether a connection is reachable.
   */
  public create(origins: OriginDepartureTimes, destinations: StopID[]): ScanResults {
    return new ScanResults(this.gtfs, origins, destinations, this.tripArrivals.fill(NOT_CARRIED), this.tripBoardings, this.tripBoardingRanks);
  }

}
