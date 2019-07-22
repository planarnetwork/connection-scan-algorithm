import { Interchange } from "../gtfs/GtfsLoader";
import { isChangeRequired, isTransfer, TimetableConnection } from "../journey/Connection";
import { Time } from "../gtfs/Gtfs";
import { ConnectionIndex, OriginDepartureTimes } from "./ConnectionScanAlgorithm";
import { Transfer } from "../journey/Journey";

/**
 * Mutable object that stores the current earliest arrival and best connection indexes as the
 * connections are being scanned.
 */
export class ScanResults {
  private readonly connectionIndex: ConnectionIndex = {};

  constructor(
    private readonly earliestArrivals: OriginDepartureTimes,
    private readonly interchange: Interchange
  ) {}

  public isReachable(connection: TimetableConnection): boolean {
    return this.earliestArrivals.hasOwnProperty(connection.origin)
      && this.earliestArrivals[connection.origin] + this.getInterchange(connection) <= connection.departureTime;
  }

  public isBetter(connection: TimetableConnection): boolean {
    return !this.earliestArrivals.hasOwnProperty(connection.destination)
      || this.earliestArrivals[connection.destination] > connection.arrivalTime;
  }

  public setConnection(connection: TimetableConnection): void {
    this.earliestArrivals[connection.destination] = connection.arrivalTime;
    this.connectionIndex[connection.destination] = connection;
  }

  public isTransferBetter(transfer: Transfer): boolean {
    return !this.earliestArrivals.hasOwnProperty(transfer.destination)
      || this.earliestArrivals[transfer.destination] > this.getTransferArrivalTime(transfer);
  }

  public setTransfer(transfer: Transfer): void {
    this.earliestArrivals[transfer.destination] = this.getTransferArrivalTime(transfer);
    this.connectionIndex[transfer.destination] = transfer;
  }

  private getTransferArrivalTime(transfer: Transfer): Time {
    return this.earliestArrivals[transfer.origin] + transfer.duration + this.interchange[transfer.origin];
  }

  private getInterchange(connection: TimetableConnection): Time {
    // maybe fake a trip ID
    const requiresInterchange = this.connectionIndex.hasOwnProperty(connection.origin)
      && isChangeRequired(this.connectionIndex[connection.origin], connection);

    return requiresInterchange ? this.interchange[connection.origin] : 0;
  }

  public getConnectionIndex(): ConnectionIndex {
    return this.connectionIndex;
  }
}
