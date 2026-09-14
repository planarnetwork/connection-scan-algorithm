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
   * Return an index of connections that achieve the earliest arrival time at each station.
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
      this.scanTransfers(results, origin);
    }

    for (let c = firstArrivingAt(this.connections, departureTime); c < this.connections.length; c++) {
      if (results.isFinished(c)) {
        break;
      }
      if (running[this.connections.trip[c]] && results.isReachable(c) && results.isBetter(c)) {
        if (results.setConnection(c)) {
          this.scanTransfers(results, this.connections.arrivalStation[c]);
        }
      }
    }

    return results.getConnectionIndex();
  }

  /**
   * Walk every footpath out of a station whenever it is reached earlier or in fewer legs than it
   * was, not only the first time: a station first reached on foot is often then reached sooner by
   * train, and the footpaths onwards from it have to start from the earlier time and count on from
   * the fewer legs.
   *
   * Every footpath out of the station is taken before any is walked on from. Walking on from each as
   * it is taken would walk on from a station reached through a neighbour, only to reach it sooner
   * directly and walk on from it all over again.
   */
  private scanTransfers(results: ScanResults, origin: StopIdx): void {
    const start = this.transfers.offsets[origin];
    const end = this.transfers.offsets[origin + 1];

    for (let t = start; t < end; t++) {
      if (results.isTransferBetter(t)) {
        results.setTransfer(t);
      }
    }

    for (let t = start; t < end; t++) {
      if (results.isReachedByTransfer(t)) {
        this.scanTransfers(results, this.transfers.destination[t]);
      }
    }
  }

}

/**
 * How the earliest arrival at each station was made, by station index: the connection its trip was
 * boarded from, or the footpath, or NO_CONNECTION where nothing reaches it. Each is one leg.
 */
export type ConnectionIndex = Int32Array;

/**
 * Index of departure stations and their departure time
 */
export type OriginDepartureTimes = Record<StopID, Time>;
