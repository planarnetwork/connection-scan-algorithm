import type { StopID, Time } from "@gb-transit/gtfs-loader";
import type { Connections } from "../gtfs/Connections.js";
import type { GtfsData, Transfers } from "../gtfs/GtfsLoader.js";
import { type StopIdx, UNKNOWN_STOP } from "../gtfs/StopTable.js";
import { type Connection, isChangeRequired, NO_CONNECTION, transferConnection } from "../journey/Connection.js";
import type { ConnectionIndex, OriginDepartureTimes } from "./ConnectionScanAlgorithm.js";

/**
 * Boarding time of a station that has not been reached. Larger than any real time, so it loses every
 * `<` comparison without needing a special case.
 */
export const NOT_REACHED = 0x7fffffff;

/** The trip has carried the passenger to none of its calls */
export const NOT_CARRIED = 0x7fffffff;

const LEG_BITS = 16;

/** More calls than any trip has, so that one fewer leg outranks any later call */
const CALLS_PER_LEG = 1 << LEG_BITS;

/** The connection is not in time to be boarded from any label of its station */
const NOT_BOARDABLE = 0;

/**
 * Mutable object that stores how each station has been reached as the connections are being scanned.
 *
 * A station has a label for each number of legs rather than one for its earliest arrival: an arrival
 * a few minutes later in fewer legs can still make the same onward trip, and the journey on from it
 * then takes fewer legs. Each label is the soonest the passenger can board at the station having taken
 * at most that many legs, so a station's labels never get later as the legs go up, and a connection is
 * boarded from the fewest legs that are in time for it.
 *
 * The last label holds `maxLegs` legs or more, and keeps how many. Past `maxLegs` a later arrival in
 * fewer legs is not kept, but the earliest arrival still takes the fewest legs, and boarding a trip
 * again from a call it carried the passenger to still takes a leg more than staying aboard.
 *
 * An origin's departure time is only its label of no legs. A train can be boarded there at that time,
 * but walking out of it is charged the interchange time, so the origin may still be reached some other
 * way in time to walk on sooner, and its other labels are left for that.
 *
 * Stations are held by index, and connections and footpaths by their index into the feed's, so
 * every question the scan asks of this is a few array reads.
 */
export class ScanResults {
  private readonly connections: Connections;
  private readonly transfers: Transfers;
  private readonly interchange: Int32Array;
  private readonly levels: number;
  private readonly origins: StopIdx[] = [];
  private readonly destinations: StopIdx[] = [];
  private readonly isDestination: Uint8Array;
  private latestDestinationArrival: Time;

  /**
   * The labels' boarding times and connections are only needed while the scan runs and until its
   * journeys are read, so the factory gives every scan the same arrays, filled afresh. So are the trip
   * arrivals, the earliest call each trip has carried the passenger to, and the trip boardings, the
   * connection each trip is boarded from, and their ranks. Those are only read for a trip once it has
   * carried the passenger, so need no clearing between scans, and nor do the legs of each station's
   * last label, only read once the label is set.
   */
  constructor(
    gtfs: GtfsData,
    origins: OriginDepartureTimes,
    destinations: StopID[],
    private readonly maxLegs: number,
    private readonly boardingTimes: Int32Array,
    private readonly connectionIndex: Int32Array,
    private readonly tripArrivals: Int32Array,
    private readonly tripBoardings: Int32Array,
    private readonly tripBoardingRanks: Int32Array,
    private readonly lastLabelLegs: Int32Array
  ) {
    this.connections = gtfs.connections;
    this.transfers = gtfs.transfers;
    this.interchange = gtfs.interchange;
    this.levels = maxLegs + 1;
    this.isDestination = new Uint8Array(gtfs.stopTable.size);

    for (const code of Object.keys(origins)) {
      const origin = gtfs.stopTable.indexOf(code);

      if (origin !== UNKNOWN_STOP) {
        this.origins.push(origin);
        this.boardingTimes[origin * this.levels] = origins[code];
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
    const legs = this.getBoardingLegs(c);

    if (legs !== NOT_BOARDABLE) {
      const rank = legs * CALLS_PER_LEG - this.connections.board[c];

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

  /**
   * One leg more than the fewest the passenger can reach the connection's station in, in time for it
   */
  private getBoardingLegs(c: Connection): number {
    const station = this.connections.departureStation[c];
    const row = station * this.levels;
    const departureTime = this.connections.departureTime[c];

    if (this.boardingTimes[row + this.maxLegs] > departureTime && this.boardingTimes[row] > departureTime) {
      return NOT_BOARDABLE;
    }

    let level = 0;

    while (this.boardingTimes[row + level] > departureTime) {
      level++;
    }

    return (level === this.maxLegs ? this.lastLabelLegs[station] : level) + 1;
  }

  /**
   * The connection reaches its station sooner than in as many legs before, or at the same time in
   * fewer legs than the last label or on a trip the passenger stays aboard.
   */
  public isBetter(c: Connection): boolean {
    const legs = this.getLegs(c);
    const label = this.getLabel(this.connections.arrivalStation[c], legs);
    const boardingTime = this.getBoardingTime(c);

    return boardingTime < this.boardingTimes[label]
      || (boardingTime === this.boardingTimes[label] && (this.hasFewerLegs(label, legs) || this.staysAboard(c, label, legs)));
  }

  /**
   * Arriving at the same time in as many legs without changing is better than arriving on another
   * trip. A vehicle that couples onto another runs as a trip of its own alongside both portions, so
   * without this whichever of them was scanned first would have the passenger change at the coupling.
   * A label reached as soon in fewer legs is not one this trip got to in as many.
   */
  private staysAboard(c: Connection, label: number, legs: number): boolean {
    const current = this.connectionIndex[label];

    return this.isExactLegs(label, legs)
      && current !== NO_CONNECTION
      && isChangeRequired(this.connections, current, c)
      && this.isReachableFromSameService(c);
  }

  /**
   * The label was reached in the legs, rather than as soon in fewer. A label of one leg always was: the
   * only label of fewer is an origin's departure.
   */
  private isExactLegs(label: number, legs: number): boolean {
    const level = label % this.levels;

    return level === this.maxLegs
      ? this.lastLabelLegs[(label - level) / this.levels] === legs
      : level === 1 || this.boardingTimes[label - 1] !== this.boardingTimes[label];
  }

  private hasFewerLegs(label: number, legs: number): boolean {
    const level = label % this.levels;

    return level === this.maxLegs && legs < this.lastLabelLegs[(label - level) / this.levels];
  }

  /**
   * Returns the legs the connection reaches its station in if that is sooner or in fewer legs than
   * before, or 0 if it reaches it at the same time on a trip the passenger stays aboard
   */
  public setConnection(c: Connection): number {
    const legs = this.getLegs(c);
    const station = this.connections.arrivalStation[c];
    const label = this.getLabel(station, legs);
    const boardingTime = this.getBoardingTime(c);
    const isImproved = boardingTime < this.boardingTimes[label] || this.hasFewerLegs(label, legs);

    this.reach(station, legs, boardingTime, this.tripBoardings[this.connections.trip[c]]);

    return isImproved ? legs : 0;
  }

  /**
   * The legs of the trip's boarding: its rank rounded up to whole legs
   */
  private getLegs(c: Connection): number {
    return (this.tripBoardingRanks[this.connections.trip[c]] + CALLS_PER_LEG - 1) >> LEG_BITS;
  }

  private getLabel(station: StopIdx, legs: number): number {
    return station * this.levels + Math.min(legs, this.maxLegs);
  }

  private getBoardingTime(c: Connection): Time {
    return this.connections.arrivalTime[c] + this.interchange[this.connections.arrivalStation[c]];
  }

  /**
   * Label the station as reached in the legs, and in every number of legs more that it was not
   * reached sooner in
   */
  private reach(station: StopIdx, legs: number, boardingTime: Time, connection: Connection): void {
    const end = (station + 1) * this.levels;
    let label = this.getLabel(station, legs);

    for (; label < end && this.boardingTimes[label] >= boardingTime; label++) {
      this.boardingTimes[label] = boardingTime;
      this.connectionIndex[label] = connection;
    }

    if (label === end) {
      this.lastLabelLegs[station] = legs;
    }

    if (this.isDestination[station] === 1) {
      this.latestDestinationArrival = this.getLatestDestinationArrival();
    }
  }

  /**
   * The footpath, walked from the station reached in the legs, reaches its destination sooner than in
   * as many legs before, or at the same time in fewer legs than the last label
   */
  public isTransferBetter(t: number, legs: number): boolean {
    const boardingTime = this.getTransferBoardingTime(t, legs);
    const label = this.getTransferLabel(t, legs);

    return boardingTime < this.boardingTimes[label]
      || (boardingTime === this.boardingTimes[label] && this.hasFewerLegs(label, legs + 1));
  }

  public setTransfer(t: number, legs: number): void {
    this.reach(this.transfers.destination[t], this.getLegsAfterWalking(legs), this.getTransferBoardingTime(t, legs), transferConnection(t));
  }

  /**
   * The footpath, walked from the station reached in the legs, is still how its destination was reached
   * in the legs after it. Where the label was reached as soon in fewer legs, it was walked on from in
   * those, and walking on from it again in more could go back and forth between two stations.
   */
  public isReachedByTransfer(t: number, legs: number): boolean {
    const label = this.getTransferLabel(t, legs);

    return this.connectionIndex[label] === transferConnection(t) && this.isExactLegs(label, legs + 1);
  }

  /**
   * A footpath is a leg of its own
   */
  public getLegsAfterWalking(legs: number): number {
    return legs + 1;
  }

  private getTransferLabel(t: number, legs: number): number {
    return this.getLabel(this.transfers.destination[t], legs + 1);
  }

  /**
   * A footpath is charged the interchange time at both ends. An origin's label has none in it, as a
   * train can be boarded there without it, so walking from an origin adds it.
   */
  private getTransferBoardingTime(t: number, legs: number): Time {
    const origin = this.transfers.origin[t];
    const setOff = this.boardingTimes[this.getLabel(origin, legs)] + (legs === 0 ? this.interchange[origin] : 0);

    return setOff + this.transfers.duration[t] + this.interchange[this.transfers.destination[t]];
  }

  private getLatestDestinationArrival(): Time {
    let latest = this.destinations.length === 0 ? -1 : 0;

    for (const destination of this.destinations) {
      const row = destination * this.levels;
      const boardingTime = this.boardingTimes[row + this.maxLegs];
      const arrival = boardingTime === NOT_REACHED ? NOT_REACHED : boardingTime - this.interchange[destination];

      latest = Math.max(latest, Math.min(arrival, this.boardingTimes[row]));
    }

    return latest;
  }

  public getOrigins(): StopIdx[] {
    return this.origins;
  }

  public getConnectionIndex(): ConnectionIndex {
    return { levels: this.levels, boardingTimes: this.boardingTimes, connections: this.connectionIndex };
  }

  /**
   * Every destination has been reached before the connection arrives, so neither it nor any after
   * it can arrive sooner, or at the same time on a trip the passenger is aboard or in fewer legs.
   */
  public isFinished(c: Connection): boolean {
    return this.connections.arrivalTime[c] > this.latestDestinationArrival;
  }
}
