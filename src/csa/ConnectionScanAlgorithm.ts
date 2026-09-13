import type { DateNumber, DayOfWeek, Time } from "@gb-transit/gtfs-loader";
import { NOT_REACHED, type StopIdx, type Timetable } from "../timetable/Timetable.js";
import { NOT_ARRIVED, type ScanResults } from "./ScanResults.js";

/** The trip has carried the passenger to none of its calls */
const NOT_CARRIED = 0x7fffffff;

/**
 * Implementation of the connection scan algorithm.
 */
export class ConnectionScanAlgorithm {
  /** Per trip, the earliest of its calls it has carried the passenger to. Reused across scans */
  private readonly carriedTo: Int32Array;
  private readonly isDestination: Uint8Array;
  private calendarDate: DateNumber = -1;
  private readonly runs: Uint8Array;

  constructor(
    private readonly timetable: Timetable
  ) {
    this.carriedTo = new Int32Array(timetable.trips.length);
    this.isDestination = new Uint8Array(timetable.stations.length);
    this.runs = new Uint8Array(timetable.trips.length);
  }

  /**
   * Scan for the earliest arrival at every station, and the connection or footpath that achieves it.
   *
   * The results are the scan's own, so a later scan does not change them.
   */
  public scan(
    origins: OriginDepartureTimes,
    destinations: StopIdx[],
    date: DateNumber,
    dow: DayOfWeek
  ): ScanResults {
    const { stations, connections, interchange } = this.timetable;
    const { departureStation, arrivalStation, departureTime, arrivalTime, trip, board, alight } = connections;
    const results: ScanResults = {
      earliestArrivals: new Int32Array(stations.length).fill(NOT_REACHED),
      arrivedBy: new Int32Array(stations.length).fill(NOT_ARRIVED)
    };
    const { earliestArrivals, arrivedBy } = results;
    const runs = this.calendar(date, dow);
    const carriedTo = this.carriedTo.fill(NOT_CARRIED);
    let departure = NOT_REACHED;

    for (const [origin, time] of origins) {
      earliestArrivals[origin] = time;
      departure = Math.min(departure, time);
    }

    for (const destination of destinations) {
      this.isDestination[destination] = 1;
    }

    let target = this.latestArrival(earliestArrivals, destinations);

    for (const origin of origins.keys()) {
      target = this.scanTransfers(results, origin, destinations, target);
    }

    // nothing arriving before the earliest departure can have been boarded after it
    for (let c = firstArrivingAt(arrivalTime, departure); c < connections.length; c++) {
      // every destination has been reached before this connection arrives, so neither it nor any
      // after it can arrive sooner, or at the same time on the trip the passenger is aboard
      if (arrivalTime[c] > target) {
        break;
      }

      const t = trip[c];

      if (runs[t] === 0) {
        continue;
      }

      const origin = departureStation[c];
      const change = arrivedBy[origin] === NOT_ARRIVED ? 0 : interchange[origin];
      // once the trip has carried the passenger to a call, they are still aboard for any of its
      // connections from there on. Being boarded at a call is not the same: a trip only picking up
      // at a later call has carried nobody to it
      const aboard = carriedTo[t] <= board[c];

      if (!aboard && earliestArrivals[origin] + change > departureTime[c]) {
        continue;
      }

      if (alight[c] < carriedTo[t]) {
        carriedTo[t] = alight[c];
      }

      const destination = arrivalStation[c];
      const previous = earliestArrivals[destination];

      if (arrivalTime[c] < previous) {
        earliestArrivals[destination] = arrivalTime[c];
        arrivedBy[destination] = c;
        target = this.scanTransfers(results, destination, destinations, target);
      }
      // arriving at the same time without changing is better than arriving on another trip: a
      // vehicle that couples onto another runs as a trip of its own alongside both portions, so
      // without this whichever of them was scanned first would have the passenger change
      else if (arrivalTime[c] === previous && aboard && arrivedOnAnotherTrip(results, destination, t, trip)) {
        arrivedBy[destination] = c;
      }
    }

    for (const destination of destinations) {
      this.isDestination[destination] = 0;
    }

    return results;
  }

  /**
   * Walk every footpath out of a station whenever it is reached earlier than it was, not only the
   * first time: a station first reached on foot is often then reached sooner by train, and the
   * footpaths onwards from it have to start from the earlier time.
   *
   * A footpath is charged the interchange time of the station it leaves, and boarding at the
   * station it reaches charges that one's.
   *
   * Returns the latest arrival at any destination, which a footpath reaching one may have moved.
   */
  private scanTransfers(results: ScanResults, origin: StopIdx, destinations: StopIdx[], target: Time): Time {
    const { offsets, destination, duration } = this.timetable.transfers;
    const { earliestArrivals, arrivedBy } = results;
    const leave = earliestArrivals[origin] + this.timetable.interchange[origin];

    if (this.isDestination[origin] === 1) {
      target = this.latestArrival(earliestArrivals, destinations);
    }

    for (let i = offsets[origin]; i < offsets[origin + 1]; i++) {
      const to = destination[i];
      const arrival = leave + duration[i];

      if (arrival < earliestArrivals[to]) {
        earliestArrivals[to] = arrival;
        arrivedBy[to] = transferArrival(i);
        target = this.scanTransfers(results, to, destinations, target);
      }
    }

    return target;
  }

  private latestArrival(earliestArrivals: Int32Array, destinations: StopIdx[]): Time {
    let latest = destinations.length === 0 ? -1 : 0;

    for (const destination of destinations) {
      latest = Math.max(latest, earliestArrivals[destination]);
    }

    return latest;
  }

  /**
   * Whether each trip runs on the date. Every distinct calendar is asked once, and the answer kept
   * until a scan is made for another date.
   */
  private calendar(date: DateNumber, dow: DayOfWeek): Uint8Array {
    if (this.calendarDate !== date) {
      const { services, tripService } = this.timetable;
      const serviceRuns = services.map(service => service.runsOn(date, dow) ? 1 : 0);

      for (let t = 0; t < tripService.length; t++) {
        this.runs[t] = serviceRuns[tripService[t]];
      }

      this.calendarDate = date;
    }

    return this.runs;
  }

}

/**
 * The first connection arriving at or after the time, by binary search of the sorted arrivals.
 */
function firstArrivingAt(arrivalTime: Int32Array, time: Time): number {
  let low = 0;
  let high = arrivalTime.length;

  while (low < high) {
    const middle = (low + high) >>> 1;

    if (arrivalTime[middle] < time) {
      low = middle + 1;
    }
    else {
      high = middle;
    }
  }

  return low;
}

function arrivedOnAnotherTrip(results: ScanResults, station: StopIdx, t: number, trip: Int32Array): boolean {
  const current = results.arrivedBy[station];

  return current !== NOT_ARRIVED && (isTransferArrival(current) || trip[current] !== t);
}

/**
 * A footpath is recorded as a negative number, so that one array can say how every station was
 * reached: a connection by its index, a footpath by its index below -1.
 */
export const transferArrival = (transfer: number): number => -2 - transfer;

export const isTransferArrival = (arrivedBy: number): boolean => arrivedBy <= -2;

export const transferIndex = (arrivedBy: number): number => -2 - arrivedBy;

/**
 * The departure time from each origin station
 */
export type OriginDepartureTimes = Map<StopIdx, Time>;
