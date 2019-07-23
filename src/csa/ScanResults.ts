import { Interchange } from "../gtfs/GtfsLoader";
import { isChangeRequired, TimetableConnection } from "../journey/Connection";
import { StopID, Time } from "../gtfs/Gtfs";
import { ConnectionIndex, OriginDepartureTimes } from "./ConnectionScanAlgorithm";
import { Transfer } from "../journey/Journey";

/**
 * Mutable object that stores the current earliest arrival and best connection indexes as the
 * connections are being scanned.
 */
export class ScanResults {
  private readonly connectionIndex: ConnectionIndex = {};

  constructor(
    private readonly interchange: Interchange,
    private readonly earliestArrivals: OriginDepartureTimes
  ) {}

  public isReachable(connection: TimetableConnection): boolean {
    return this.earliestArrivals.hasOwnProperty(connection.origin)
      && this.earliestArrivals[connection.origin] + this.getInterchange(connection) <= connection.departureTime;
  }

  public isBetter(connection: TimetableConnection): boolean {
    return !this.earliestArrivals.hasOwnProperty(connection.destination)
      || this.earliestArrivals[connection.destination] > connection.arrivalTime;
  }

  public setConnection(connection: TimetableConnection): boolean {
    const exists = this.connectionIndex.hasOwnProperty(connection.destination);
    this.earliestArrivals[connection.destination] = connection.arrivalTime;
    this.connectionIndex[connection.destination] = connection;

    return !exists;
  }

  public isTransferBetter(transfer: Transfer): boolean {
    return !this.earliestArrivals.hasOwnProperty(transfer.destination)
      || this.earliestArrivals[transfer.destination] > this.getTransferArrivalTime(transfer);
  }

  public setTransfer(transfer: Transfer): boolean {
    const exists = this.connectionIndex.hasOwnProperty(transfer.destination);
    this.earliestArrivals[transfer.destination] = this.getTransferArrivalTime(transfer);
    this.connectionIndex[transfer.destination] = transfer;

    return !exists;
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

  public isFinished(destinations: StopID[], departureTime: Time): boolean {
    return !destinations.some(d => !this.earliestArrivals[d] || departureTime < this.earliestArrivals[d]);
  }
}
