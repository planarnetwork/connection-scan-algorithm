import type { DateNumber, DayOfWeek, StopID, Time } from "@gb-transit/gtfs-loader";
import type { TransfersByOrigin } from "../gtfs/GtfsLoader.js";
import type { Connection, TimetableConnection } from "../journey/Connection.js";
import type { ScanResults } from "./ScanResults.js";
import type { ScanResultsFactory } from "./ScanResultsFactory.js";

/**
 * Implementation of the connection scan algorithm.
 */
export class ConnectionScanAlgorithm {

  constructor(
    private readonly connections: TimetableConnection[],
    private readonly transfers: TransfersByOrigin,
    private readonly resultsFactory: ScanResultsFactory
  ) {}

  /**
   * Return an index of connections that achieve the earliest arrival time at each stop.
   */
  public scan(
    origins: OriginDepartureTimes,
    destinations: StopID[],
    date: DateNumber,
    dow: DayOfWeek
  ): ConnectionIndex {
    const results = this.resultsFactory.create({ ...origins });

    for (const origin in origins) {
      this.scanTransfers(results, origin);
    }

    for (const c of this.connections) {
      if (c.trip.service.runsOn(date, dow) && results.isReachable(c) && results.isBetter(c)) {
        if (results.setConnection(c)) {
          this.scanTransfers(results, c.destination);
        }
        if (results.isFinished(destinations, c.departureTime)) {
          break;
        }
      }
    }

    return results.getConnectionIndex();
  }

  /**
   * Walk every footpath out of a station whenever it is reached earlier than it was, not only the
   * first time: a station first reached on foot is often then reached sooner by train, and the
   * footpaths onwards from it have to start from the earlier time.
   */
  private scanTransfers(results: ScanResults, origin: StopID): void {
    for (const transfer of this.transfers[origin] ?? []) {
      if (results.isTransferBetter(transfer)) {
        results.setTransfer(transfer);
        this.scanTransfers(results, transfer.destination);
      }
    }
  }

}

/**
 * Index of connections that achieve the earliest arrivalTime time at each stop.
 */
export type ConnectionIndex = Record<StopID, Connection>;

/**
 * Index of departure stations and their departure time
 */
export type OriginDepartureTimes = Record<StopID, Time>;
