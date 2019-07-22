import { Connection, TimetableConnection } from "../journey/Connection";
import { TransfersByOrigin } from "../gtfs/GtfsLoader";
import { DayOfWeek, StopID, Time } from "../gtfs/Gtfs";
import { ScanResults} from "./ScanResults";
import { ScanResultsFactory } from "./ScanResultsFactory";

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
  public scan(origins: OriginDepartureTimes, date: number, dow: DayOfWeek): ConnectionIndex {
    const results = this.resultsFactory.create({ ...origins });

    for (const origin in origins) {
      this.scanTransfers(results, origin);
    }

    for (const connection of this.connections) {
      if (connection.trip.service.runsOn(date, dow) && results.isReachable(connection) && results.isBetter(connection)) {
        results.setConnection(connection);
        // don't trigger transfer scan if we already had a time for the destination
        this.scanTransfers(results, connection.destination);
      }

      // cut off after connection arrival time > arrival time at destinations
    }

    return results.getConnectionIndex();
  }

  private scanTransfers(results: ScanResults, origin: StopID): void {
    for (const transfer of this.transfers[origin]) {
      if (results.isTransferBetter(transfer)) {
        results.setTransfer(transfer);

        // don't trigger transfer scan if we already had a time for the destination
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
