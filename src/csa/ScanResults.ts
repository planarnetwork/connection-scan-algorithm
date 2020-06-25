import { Interchange } from "../gtfs/GtfsLoader";
import { TimetableConnection } from "../journey/Connection";
import { StopID, Time } from "../gtfs/Gtfs";
import { ConnectionIndex, OriginDepartureTimes } from "./ConnectionScanAlgorithm";
import { Transfer } from "../journey/Journey";

/**
 * Mutable object that stores the current earliest arrival and best connection indexes as the
 * connections are being scanned.
 */
export class ScanResults {
  private readonly connectionIndex: ConnectionIndex = {};
  private readonly tripArrivals: Record<number, ConnectionIndex> = {};

  constructor(
    private readonly interchange: Interchange,
    private readonly earliestArrivals: OriginDepartureTimes
  ) {}

  public isReachable(connection: TimetableConnection): boolean {
    const reachable = this.isReachableWithChange(connection) || this.isReachableFromSameService(connection);

    if (reachable) {
      this.tripArrivals[connection.trip.tripId] = this.tripArrivals[connection.trip.tripId] || {};
      this.tripArrivals[connection.trip.tripId][connection.destination] = connection.arrivalTime;
    }

    return reachable;
  }

  private isReachableFromSameService(connection: TimetableConnection): boolean {
    return this.tripArrivals.hasOwnProperty(connection.trip.tripId) &&
      this.tripArrivals[connection.trip.tripId][connection.origin] <= connection.departureTime;
  }

  private isReachableWithChange(connection: TimetableConnection): boolean {
    const interchange = this.connectionIndex[connection.origin] ? this.interchange[connection.origin] : 0;

    return this.earliestArrivals.hasOwnProperty(connection.origin)
      && this.earliestArrivals[connection.origin] + interchange <= connection.departureTime;
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

  public getConnectionIndex(): ConnectionIndex {
    return this.connectionIndex;
  }

  public isFinished(destinations: StopID[], departureTime: Time): boolean {
    return !destinations.some(d => !this.earliestArrivals[d] || departureTime < this.earliestArrivals[d]);
  }
}
