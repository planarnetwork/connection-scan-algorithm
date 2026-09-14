import type { StopID, Time } from "@gb-transit/gtfs-loader";
import type { Connections } from "../gtfs/Connections.js";
import type { GtfsData, Transfers } from "../gtfs/GtfsLoader.js";
import { type StopIdx, UNKNOWN_STOP } from "../gtfs/StopTable.js";
import { type Connection, isChangeRequired, NO_CONNECTION, transferConnection } from "../journey/Connection.js";
import type { ConnectionIndex, OriginDepartureTimes } from "./ConnectionScanAlgorithm.js";

/**
 * Arrival time of a station that has not been reached. Larger than any real time, so it loses every
 * `<` comparison without needing a special case.
 */
export const NOT_REACHED = 0x7fffffff;

/** The trip has carried the passenger to none of its calls */
export const NOT_CARRIED = 0x7fffffff;

/** More calls than any trip has, so that one fewer leg outranks any later call */
const CALLS_PER_LEG = 0x10000;

/**
 * Mutable object that stores the current earliest arrival and best connection indexes as the
 * connections are being scanned.
 *
 * Stations are held by index, and connections and footpaths by their index into the feed's, so
 * every question the scan asks of this is a few array reads.
 */
export class ScanResults {
  private readonly connections: Connections;
  private readonly transfers: Transfers;
  private readonly interchange: Int32Array;
  private readonly earliestArrivals: Int32Array;
  private readonly connectionIndex: ConnectionIndex;
  private readonly legs: Int32Array;
  private readonly origins: StopIdx[] = [];
  private readonly destinations: StopIdx[] = [];
  private readonly isDestination: Uint8Array;
  private latestDestinationArrival: Time;

  /**
   * The trip arrivals are the earliest call each trip has carried the passenger to. They are only
   * needed while the scan runs, so the factory gives every scan the same array. So are the trip
   * boardings, the connection each trip is boarded from, and their ranks. Those are only read for a
   * trip once it has carried the passenger, so need no clearing between scans.
   */
  constructor(
    gtfs: GtfsData,
    origins: OriginDepartureTimes,
    destinations: StopID[],
    private readonly tripArrivals: Int32Array,
    private readonly tripBoardings: Int32Array,
    private readonly tripBoardingRanks: Int32Array
  ) {
    this.connections = gtfs.connections;
    this.transfers = gtfs.transfers;
    this.interchange = gtfs.interchange;
    this.earliestArrivals = new Int32Array(gtfs.stopTable.size).fill(NOT_REACHED);
    this.connectionIndex = new Int32Array(gtfs.stopTable.size).fill(NO_CONNECTION);
    this.legs = new Int32Array(gtfs.stopTable.size);
    this.isDestination = new Uint8Array(gtfs.stopTable.size);

    for (const code of Object.keys(origins)) {
      const origin = gtfs.stopTable.indexOf(code);

      if (origin !== UNKNOWN_STOP) {
        this.origins.push(origin);
        this.earliestArrivals[origin] = origins[code];
      }
    }

    // a destination the feed does not have is one nothing can be waited for at
    for (const code of destinations) {
      const destination = gtfs.stopTable.indexOf(code);

      if (destination !== UNKNOWN_STOP) {
        this.destinations.push(destination);
        this.isDestination[destination] = 1;
      }
    }

    this.latestDestinationArrival = this.getLatestDestinationArrival();
  }

  /**
   * Once a trip has carried the passenger to a call, they are still aboard for any of its
   * connections from there on. Boarding it is not the same: a trip only picking up at a later call
   * has carried nobody to it.
   *
   * A trip that can be boarded at more than one call is boarded where the passenger has taken the
   * fewest legs to reach, and after that at the latest call. Boarding at the earliest call would
   * have a passenger who passed a later call of the trip on the way ride back through it. Both are
   * folded into one rank, lower being better, and kept per trip so that comparing against the
   * current boarding reads nothing from the connections.
   */
  public isReachable(c: Connection): boolean {
    const trip = this.connections.trip[c];

    if (this.isReachableWithChange(c)) {
      const rank = this.legs[this.connections.departureStation[c]] * CALLS_PER_LEG - this.connections.board[c];

      if (this.tripArrivals[trip] === NOT_CARRIED || rank < this.tripBoardingRanks[trip]) {
        this.tripBoardings[trip] = c;
        this.tripBoardingRanks[trip] = rank;
      }
    }
    else if (!this.isReachableFromSameService(c)) {
      return false;
    }

    this.tripArrivals[trip] = Math.min(this.tripArrivals[trip], this.connections.alight[c]);

    return true;
  }

  private isReachableFromSameService(c: Connection): boolean {
    return this.tripArrivals[this.connections.trip[c]] <= this.connections.board[c];
  }

  private isReachableWithChange(c: Connection): boolean {
    const origin = this.connections.departureStation[c];
    const interchange = this.connectionIndex[origin] === NO_CONNECTION ? 0 : this.interchange[origin];

    return this.earliestArrivals[origin] + interchange <= this.connections.departureTime[c];
  }

  /**
   * Arriving at the same time is better in fewer legs, as the stations reached from here and the
   * trips boarded here count their legs from it.
   */
  public isBetter(c: Connection): boolean {
    const destination = this.connections.arrivalStation[c];
    const arrivalTime = this.earliestArrivals[destination];

    if (arrivalTime !== this.connections.arrivalTime[c]) {
      return arrivalTime > this.connections.arrivalTime[c];
    }

    const legs = this.legsTo(c);

    return legs < this.legs[destination] || (legs === this.legs[destination] && this.staysAboard(c));
  }

  /**
   * Arriving at the same time in as many legs without changing is better than arriving on another
   * trip. A vehicle that couples onto another runs as a trip of its own alongside both portions, so
   * without this whichever of them was scanned first would have the passenger change at the coupling.
   */
  private staysAboard(c: Connection): boolean {
    const current = this.connectionIndex[this.connections.arrivalStation[c]];

    return current !== NO_CONNECTION
      && isChangeRequired(this.connections, current, c)
      && this.isReachableFromSameService(c);
  }

  /**
   * Returns true if the connection reaches the destination earlier or in fewer legs than before,
   * rather than at the same time in as many on a trip the passenger stays aboard
   */
  public setConnection(c: Connection): boolean {
    const destination = this.connections.arrivalStation[c];
    const previous = this.earliestArrivals[destination];
    const previousLegs = this.legs[destination];

    this.connectionIndex[destination] = this.tripBoardings[this.connections.trip[c]];
    this.legs[destination] = this.legsTo(c);

    return this.arrive(destination, this.connections.arrivalTime[c]) < previous || this.legs[destination] < previousLegs;
  }

  private legsTo(c: Connection): number {
    return this.legs[this.connections.departureStation[this.tripBoardings[this.connections.trip[c]]]] + 1;
  }

  public isTransferBetter(t: number): boolean {
    const destination = this.transfers.destination[t];
    const arrivalTime = this.getTransferArrivalTime(t);

    return this.earliestArrivals[destination] > arrivalTime
      || (this.earliestArrivals[destination] === arrivalTime && this.legs[this.transfers.origin[t]] + 1 < this.legs[destination]);
  }

  public setTransfer(t: number): void {
    const destination = this.transfers.destination[t];

    this.connectionIndex[destination] = transferConnection(t);
    this.legs[destination] = this.legs[this.transfers.origin[t]] + 1;
    this.arrive(destination, this.getTransferArrivalTime(t));
  }

  private getTransferArrivalTime(t: number): Time {
    const origin = this.transfers.origin[t];

    return this.earliestArrivals[origin] + this.transfers.duration[t] + this.interchange[origin];
  }

  private arrive(station: StopIdx, time: Time): Time {
    this.earliestArrivals[station] = time;

    if (this.isDestination[station] === 1) {
      this.latestDestinationArrival = this.getLatestDestinationArrival();
    }

    return time;
  }

  private getLatestDestinationArrival(): Time {
    let latest = this.destinations.length === 0 ? -1 : 0;

    for (const destination of this.destinations) {
      latest = Math.max(latest, this.earliestArrivals[destination]);
    }

    return latest;
  }

  public getOrigins(): StopIdx[] {
    return this.origins;
  }

  public getConnectionIndex(): ConnectionIndex {
    return this.connectionIndex;
  }

  /**
   * Every destination has been reached before the connection arrives, so neither it nor any after
   * it can arrive sooner, or at the same time on a trip the passenger is aboard.
   */
  public isFinished(c: Connection): boolean {
    return this.connections.arrivalTime[c] > this.latestDestinationArrival;
  }
}
