import type { StopID } from "@gb-transit/gtfs-loader";
import type { GtfsData } from "../gtfs/GtfsLoader.js";
import { NO_CONNECTION } from "../journey/Connection.js";
import type { OriginDepartureTimes } from "./ConnectionScanAlgorithm.js";
import { NOT_CARRIED, NOT_REACHED, ScanResults } from "./ScanResults.js";

/**
 * Creates a new ScanResults object for a given set of origins and destinations
 */
export class ScanResultsFactory {
  private readonly boardingTimes: Int32Array;
  private readonly connectionIndex: Int32Array;
  private readonly tripArrivals: Int32Array;
  private readonly tripBoardings: Int32Array;
  private readonly tripBoardingRanks: Int32Array;

  /**
   * Stations are labelled for each number of legs up to `maxLegs`, the last label holding that many
   * or more. A journey of more legs is still found, but past it a journey in fewer legs is no longer
   * told apart from a sooner one in more.
   */
  constructor(
    private readonly gtfs: GtfsData,
    private readonly maxLegs = 8
  ) {
    if (maxLegs < 1) {
      throw new Error(`A journey has at least one leg, not ${maxLegs}`);
    }

    this.boardingTimes = new Int32Array(gtfs.stopTable.size * (maxLegs + 1));
    this.connectionIndex = new Int32Array(gtfs.stopTable.size * (maxLegs + 1));
    this.tripArrivals = new Int32Array(gtfs.trips.length);
    this.tripBoardings = new Int32Array(gtfs.trips.length);
    this.tripBoardingRanks = new Int32Array(gtfs.trips.length);
  }

  /**
   * The labels and trip arrivals are shared between scans rather than allocated for each, so only the
   * results of the scan in progress can still be asked whether a connection is reachable, and the
   * connection index a scan returns is only good until the next scan starts.
   */
  public create(origins: OriginDepartureTimes, destinations: StopID[]): ScanResults {
    return new ScanResults(
      this.gtfs,
      origins,
      destinations,
      this.maxLegs,
      this.boardingTimes.fill(NOT_REACHED),
      this.connectionIndex.fill(NO_CONNECTION),
      this.tripArrivals.fill(NOT_CARRIED),
      this.tripBoardings,
      this.tripBoardingRanks
    );
  }

}
