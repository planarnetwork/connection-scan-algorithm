import type { Interchange, StopID, Time, TripID } from "@gb-transit/gtfs-loader";
import { isChangeRequired, type TimetableConnection } from "../journey/Connection.js";
import type { Transfer } from "../journey/Journey.js";
import type { ConnectionIndex, OriginDepartureTimes } from "./ConnectionScanAlgorithm.js";

/**
 * Mutable object that stores the current earliest arrival and best connection indexes as the
 * connections are being scanned.
 */
export class ScanResults {
  private readonly connectionIndex: ConnectionIndex = {};
  private readonly tripArrivals: Record<TripID, Record<StopID, Time>> = {};

  constructor(
    private readonly interchange: Interchange,
    private readonly earliestArrivals: OriginDepartureTimes
  ) {}

  public isReachable(connection: TimetableConnection): boolean {
    const reachable = this.isReachableWithChange(connection) || this.isReachableFromSameService(connection);

    if (reachable) {
      this.tripArrivals[connection.trip.tripId] ??= {};
      this.tripArrivals[connection.trip.tripId][connection.destination] = connection.arrivalTime;
    }

    return reachable;
  }

  private isReachableFromSameService(connection: TimetableConnection): boolean {
    return Object.hasOwn(this.tripArrivals, connection.trip.tripId) &&
      this.tripArrivals[connection.trip.tripId][connection.origin] <= connection.departureTime;
  }

  private isReachableWithChange(connection: TimetableConnection): boolean {
    const interchange = this.connectionIndex[connection.origin] ? this.getInterchange(connection.origin) : 0;

    return Object.hasOwn(this.earliestArrivals, connection.origin)
      && this.earliestArrivals[connection.origin] + interchange <= connection.departureTime;
  }

  public isBetter(connection: TimetableConnection): boolean {
    const arrivalTime = this.earliestArrivals[connection.destination];

    return arrivalTime === undefined
      || arrivalTime > connection.arrivalTime
      || (arrivalTime === connection.arrivalTime && this.staysAboard(connection));
  }

  /**
   * Arriving at the same time without changing is better than arriving on another trip. A vehicle
   * that couples onto another runs as a trip of its own alongside both portions, so without this
   * whichever of them was scanned first would have the passenger change at the coupling.
   */
  private staysAboard(connection: TimetableConnection): boolean {
    const current = this.connectionIndex[connection.destination];

    return current !== undefined
      && isChangeRequired(current, connection)
      && this.isReachableFromSameService(connection);
  }

  /**
   * Returns true if the connection arrives earlier than the destination was reached before, rather
   * than at the same time on a trip the passenger stays aboard
   */
  public setConnection(connection: TimetableConnection): boolean {
    const previous = this.earliestArrivals[connection.destination];
    this.earliestArrivals[connection.destination] = connection.arrivalTime;
    this.connectionIndex[connection.destination] = connection;

    return previous === undefined || previous > connection.arrivalTime;
  }

  public isTransferBetter(transfer: Transfer): boolean {
    return !Object.hasOwn(this.earliestArrivals, transfer.destination)
      || this.earliestArrivals[transfer.destination] > this.getTransferArrivalTime(transfer);
  }

  public setTransfer(transfer: Transfer): void {
    this.earliestArrivals[transfer.destination] = this.getTransferArrivalTime(transfer);
    this.connectionIndex[transfer.destination] = transfer;
  }

  private getTransferArrivalTime(transfer: Transfer): Time {
    return this.earliestArrivals[transfer.origin] + transfer.duration + this.getInterchange(transfer.origin);
  }

  /**
   * A station the feed gave no interchange time for is one a change takes no time at
   */
  private getInterchange(station: StopID): Time {
    return this.interchange[station] ?? 0;
  }

  public getConnectionIndex(): ConnectionIndex {
    return this.connectionIndex;
  }

  public isFinished(destinations: StopID[], departureTime: Time): boolean {
    return !destinations.some(d => !this.earliestArrivals[d] || departureTime < this.earliestArrivals[d]);
  }
}
