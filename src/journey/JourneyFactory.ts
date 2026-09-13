import type { Time } from "@gb-transit/gtfs-loader";
import { isTransferArrival, transferIndex } from "../csa/ConnectionScanAlgorithm.js";
import { NOT_ARRIVED, type ScanResults } from "../csa/ScanResults.js";
import type { StopIdx, Timetable } from "../timetable/Timetable.js";
import { type AnyLeg, isTransfer, type Journey } from "./Journey.js";

/**
 * A leg while it is still in the timetable's terms: a footpath by its index, or a trip between two of
 * its calls.
 */
type Part = FootpathPart | TripPart;

interface FootpathPart {
  transfer: number;
}

interface TripPart {
  trip: number;
  /** Index into the timetable's calls of the call boarded at */
  start: number;
  /** Index into the timetable's calls of the call alighted at */
  end: number;
  origin: StopIdx;
  destination: StopIdx;
}

const isFootpath = (part: Part): part is FootpathPart => "transfer" in part;

/**
 * Creates journeys from the results of a connection scan.
 */
export class JourneyFactory {

  constructor(
    private readonly timetable: Timetable
  ) {}

  /**
   * Extract a result for each destination in the list.
   */
  public getJourneys(results: ScanResults, destinations: StopIdx[]): Journey[] {
    const journeys: Journey[] = [];

    for (const destination of destinations) {
      const parts = this.getParts(results, destination);

      if (parts !== null) {
        journeys.push(this.getJourney(this.getCompactedParts(parts).map(part => this.toLeg(part))));
      }
    }

    return journeys;
  }

  /**
   * Iterate backwards from the destination to the origin, collecting consecutive connections of one
   * trip into a single part
   */
  private getParts(results: ScanResults, destination: StopIdx): Part[] | null {
    const { connections, transfers } = this.timetable;
    const parts: Part[] = [];
    let station = destination;

    while (results.arrivedBy[station] !== NOT_ARRIVED) {
      const arrivedBy = results.arrivedBy[station];

      if (isTransferArrival(arrivedBy)) {
        const transfer = transferIndex(arrivedBy);

        parts.push({ transfer });
        station = transfers.origin[transfer];
      }
      else {
        const previous = parts[parts.length - 1];
        const trip = connections.trip[arrivedBy];

        station = connections.departureStation[arrivedBy];

        if (previous !== undefined && !isFootpath(previous) && previous.trip === trip) {
          previous.start = connections.board[arrivedBy];
          previous.origin = station;
        }
        else {
          parts.push({
            trip,
            start: connections.board[arrivedBy],
            end: connections.alight[arrivedBy],
            origin: station,
            destination: connections.arrivalStation[arrivedBy]
          });
        }
      }
    }

    return parts.length === 0 ? null : parts.reverse();
  }

  /**
   * Check for any redundant parts and replace them with the trip of a later one, boarded earlier.
   */
  private getCompactedParts(parts: Part[]): Part[] {
    const { calls, transfers } = this.timetable;
    const compacted: Part[] = [];

    for (let i = parts.length - 1; i >= 0; i--) {
      const partI = parts[i];

      if (isFootpath(partI)) {
        compacted.push(partI);
      }
      else {
        let lastDepartureTime = calls[partI.start].departureTime;

        for (let j = i - 1; j >= 0; j--) {
          const partJ = parts[j];
          const origin = isFootpath(partJ) ? transfers.origin[partJ.transfer] : partJ.origin;

          lastDepartureTime = isFootpath(partJ)
            ? lastDepartureTime - transfers.duration[partJ.transfer]
            : calls[partJ.start].departureTime;

          const start = this.findStart(partI.trip, origin, lastDepartureTime);
          const end = start === -1 ? -1 : this.findEnd(partI.trip, start, partI.destination);

          if (end !== -1) {
            partI.origin = origin;
            partI.start = start;
            partI.end = end;
            i = j;
          }
        }

        compacted.push(partI);
      }
    }

    return compacted.reverse();
  }

  /**
   * The first call of the trip at the station that can be boarded no earlier than the time
   */
  private findStart(trip: number, station: StopIdx, departureTime: Time): number {
    const { callOffsets, calls, callStations } = this.timetable;

    for (let k = callOffsets[trip]; k < callOffsets[trip + 1]; k++) {
      if (callStations[k] === station && calls[k].pickUp && calls[k].departureTime >= departureTime) {
        return k;
      }
    }

    return -1;
  }

  /**
   * The first call of the trip after the one boarded that can be alighted at the station
   */
  private findEnd(trip: number, start: number, station: StopIdx): number {
    const { callOffsets, calls, callStations } = this.timetable;

    for (let k = start + 1; k < callOffsets[trip + 1]; k++) {
      if (callStations[k] === station && calls[k].dropOff) {
        return k;
      }
    }

    return -1;
  }

  /**
   * A part in the terms a journey is returned in. The stop times are the feed's own, so a leg between
   * two stations still says which platform it uses at each end.
   */
  private toLeg(part: Part): AnyLeg {
    const { stations, trips, calls, transfers } = this.timetable;

    if (isFootpath(part)) {
      return transfers.transfer[part.transfer];
    }

    return {
      origin: stations[part.origin],
      destination: stations[part.destination],
      trip: trips[part.trip],
      stopTimes: calls.slice(part.start, part.end + 1)
    };
  }

  private getJourney(legs: AnyLeg[]): Journey {
    return {
      origin: legs[0].origin,
      destination: legs[legs.length - 1].destination,
      arrivalTime: this.getArrivalTime(legs),
      departureTime: this.getDepartureTime(legs),
      legs: legs
    };
  }

  private getDepartureTime(legs: AnyLeg[]): Time {
    let transferDuration = 0;

    for (const leg of legs) {
      if (isTransfer(leg)) {
        transferDuration += leg.duration;
      }
      else {
        return leg.stopTimes[0].departureTime - transferDuration;
      }
    }

    return 0;
  }

  private getArrivalTime(legs: AnyLeg[]): Time {
    let transferDuration = 0;

    for (let i = legs.length - 1; i >= 0; i--) {
      const leg = legs[i];

      if (isTransfer(leg)) {
        transferDuration += leg.duration;
      }
      else {
        return leg.stopTimes[leg.stopTimes.length - 1].arrivalTime + transferDuration;
      }
    }

    return 0;
  }

}
