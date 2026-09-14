import type { DateNumber, DayOfWeek, StopID, Time } from "@gb-transit/gtfs-loader";
import { type Connections, firstArrivingAt } from "../gtfs/Connections.js";
import type { GtfsData, Transfers } from "../gtfs/GtfsLoader.js";
import type { StopIdx } from "../gtfs/StopTable.js";
import type { TripCalendar } from "../gtfs/TripCalendar.js";
import type { ScanResults } from "./ScanResults.js";
import type { ScanResultsFactory } from "./ScanResultsFactory.js";

/**
 * Implementation of the connection scan algorithm.
 */
export class ConnectionScanAlgorithm {
  private readonly connections: Connections;
  private readonly transfers: Transfers;
  private readonly calendar: TripCalendar;

  constructor(
    gtfs: GtfsData,
    private readonly resultsFactory: ScanResultsFactory
  ) {
    this.connections = gtfs.connections;
    this.transfers = gtfs.transfers;
    this.calendar = gtfs.calendar;
  }

  /**
   * Return an index of how each station was reached soonest in each number of legs.
   */
  public scan(
    origins: OriginDepartureTimes,
    destinations: StopID[],
    date: DateNumber,
    dow: DayOfWeek
  ): ConnectionIndex {
    const results = this.resultsFactory.create(origins, destinations);
    const running = this.calendar.runningOn(date, dow);
    const departureTime = Math.min(...Object.values(origins));

    for (const origin of results.getOrigins()) {
      this.scanTransfers(results, origin, 0);
    }

    for (let c = firstArrivingAt(this.connections, departureTime); c < this.connections.length; c++) {
      if (results.isFinished(c)) {
        break;
      }
      if (running[this.connections.trip[c]] && results.isReachable(c) && results.isBetter(c)) {
        const legs = results.setConnection(c);

        if (legs !== 0) {
          this.scanTransfers(results, this.connections.arrivalStation[c], legs);
        }
      }
    }

    return results.getConnectionIndex();
  }

  /**
   * Walk every footpath out of a station whenever it is reached sooner in some number of legs than
   * it was, not only the first time: a station first reached on foot is often then reached sooner by
   * train, and the footpaths onwards from it have to start from the earlier time and count on from
   * the legs it was reached in.
   *
   * Every footpath out of the station is taken before any is walked on from. Walking on from each as
   * it is taken would walk on from a station reached through a neighbour, only to reach it sooner
   * directly and walk on from it all over again.
   */
  private scanTransfers(results: ScanResults, origin: StopIdx, legs: number): void {
    const start = this.transfers.offsets[origin];
    const end = this.transfers.offsets[origin + 1];

    for (let t = start; t < end; t++) {
      if (results.isTransferBetter(t, legs)) {
        results.setTransfer(t, legs);
      }
    }

    for (let t = start; t < end; t++) {
      if (results.isReachedByTransfer(t, legs)) {
        this.scanTransfers(results, this.transfers.destination[t], results.getLegsAfterWalking(legs));
      }
    }
  }

}

/**
 * How each station was reached soonest in each number of legs. A station has a row of `levels` labels,
 * so the label of a station in some legs is at `station * levels + legs`: the soonest it was reached
 * in at most that many. The first label is the origins, reached in none, and the last holds that many
 * legs or more.
 */
export interface ConnectionIndex {
  levels: number;
  /**
   * When a passenger reaching the station by the label can board a trip there: the arrival plus the
   * station's interchange time, or the departure time at an origin. NOT_REACHED where nothing reaches
   * it in so few legs.
   */
  boardingTimes: Int32Array;
  /**
   * The connection the last leg's trip was boarded from, or the footpath, or NO_CONNECTION at an origin
   * or where nothing reaches the station. Each is one leg.
   */
  connections: Int32Array;
}

/**
 * Index of departure stations and their departure time
 */
export type OriginDepartureTimes = Record<StopID, Time>;
