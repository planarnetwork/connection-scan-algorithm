import type { Time } from "@gb-transit/gtfs-loader";
import type { StopIdx } from "./StopTable.js";

/**
 * Every connection in the timetable as parallel arrays, so that connection `c` is
 * `departureStation[c]`, `arrivalTime[c]` and so on. A scan reads millions of them in order, and
 * reading numbers out of arrays is far quicker than reading fields out of an object each.
 */
export interface Connections {
  length: number;
  departureStation: Int32Array;
  arrivalStation: Int32Array;
  departureTime: Int32Array;
  arrivalTime: Int32Array;
  /** Index into the feed's trips */
  trip: Int32Array;
  /** The position within its trip's calls of the call the connection is boarded at */
  board: Int32Array;
  /** The position within its trip's calls of the call the connection is alighted at */
  alight: Int32Array;
}

/**
 * Connections as they are added, which become Connections once they are sorted.
 */
export class ConnectionList {
  private connections = allocate(1 << 16);
  private length = 0;

  public push(
    departureStation: StopIdx,
    arrivalStation: StopIdx,
    departureTime: Time,
    arrivalTime: Time,
    trip: number,
    board: number,
    alight: number
  ): void {
    if (this.length === this.connections.length) {
      this.connections = copy(this.connections, allocate(this.length * 2), this.length);
    }

    const c = this.length++;

    this.connections.departureStation[c] = departureStation;
    this.connections.arrivalStation[c] = arrivalStation;
    this.connections.departureTime[c] = departureTime;
    this.connections.arrivalTime[c] = arrivalTime;
    this.connections.trip[c] = trip;
    this.connections.board[c] = board;
    this.connections.alight[c] = alight;
  }

  /**
   * The connections sorted by arrival time. Times are whole seconds within a day or two, so a
   * counting sort does this in linear time, and it is stable: connections arriving together keep the
   * order they were added in.
   */
  public sortByArrival(): Connections {
    const { arrivalTime } = this.connections;
    let latest = 0;

    for (let c = 0; c < this.length; c++) {
      latest = Math.max(latest, arrivalTime[c]);
    }

    const position = new Int32Array(latest + 2);

    for (let c = 0; c < this.length; c++) {
      position[arrivalTime[c] + 1]++;
    }

    for (let time = 1; time < position.length; time++) {
      position[time] += position[time - 1];
    }

    const sorted = allocate(this.length);

    for (let c = 0; c < this.length; c++) {
      const to = position[arrivalTime[c]]++;

      sorted.departureStation[to] = this.connections.departureStation[c];
      sorted.arrivalStation[to] = this.connections.arrivalStation[c];
      sorted.departureTime[to] = this.connections.departureTime[c];
      sorted.arrivalTime[to] = arrivalTime[c];
      sorted.trip[to] = this.connections.trip[c];
      sorted.board[to] = this.connections.board[c];
      sorted.alight[to] = this.connections.alight[c];
    }

    return sorted;
  }

}

/**
 * The first connection arriving at or after the time. Nothing arriving earlier can have been
 * boarded after it, so that is where a scan from the time starts.
 */
export function firstArrivingAt(connections: Connections, time: Time): number {
  let low = 0;
  let high = connections.length;

  while (low < high) {
    const middle = (low + high) >>> 1;

    if (connections.arrivalTime[middle] < time) {
      low = middle + 1;
    }
    else {
      high = middle;
    }
  }

  return low;
}

function allocate(length: number): Connections {
  return {
    length,
    departureStation: new Int32Array(length),
    arrivalStation: new Int32Array(length),
    departureTime: new Int32Array(length),
    arrivalTime: new Int32Array(length),
    trip: new Int32Array(length),
    board: new Int32Array(length),
    alight: new Int32Array(length)
  };
}

function copy(from: Connections, to: Connections, length: number): Connections {
  to.departureStation.set(from.departureStation.subarray(0, length));
  to.arrivalStation.set(from.arrivalStation.subarray(0, length));
  to.departureTime.set(from.departureTime.subarray(0, length));
  to.arrivalTime.set(from.arrivalTime.subarray(0, length));
  to.trip.set(from.trip.subarray(0, length));
  to.board.set(from.board.subarray(0, length));
  to.alight.set(from.alight.subarray(0, length));

  return to;
}
