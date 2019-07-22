import { ConnectionIndex } from "../csa/ConnectionScanAlgorithm";
import { AnyLeg, Journey, TimetableLeg } from "./Journey";
import { StopID, StopTime, Time, Trip } from "../gtfs/Gtfs";
import { Connection, isChangeRequired, isTransfer } from "./Connection";

/**
 * Creates journeys from the connection index created by the connection scan algorithm.
 */
export class JourneyFactory {

  /**
   * Extract a result for each destination in the list.
   */
  public getJourneys(connections: ConnectionIndex, destinations: StopID[]): Journey[] {
    return destinations
      .map(d => this.getLegs(connections, d))
      .filter((c): c is AnyLeg[] => c !== null)
      .map(c => this.getCompactedLegs(c))
      .map(l => this.getJourney(l));
  }

  /**
   * Iterate backwards from the destination to the origin collecting connections into legs
   */
  private getLegs(connections: ConnectionIndex, destination: string): AnyLeg[] | null {
    let legs: Connection[][] = [];
    let legConnections: Connection[] = [];
    let previousConnection: Connection | null = null;

    while (connections[destination]) {
      const connection = connections[destination];

      if (previousConnection && isChangeRequired(previousConnection, connection)) {
        legs.push(legConnections.reverse());
        legConnections = [];
      }

      legConnections.push(connection);
      previousConnection = connection;
      destination = connection.origin;
    }

    legs.push(legConnections.reverse());

    return legConnections.length === 0 ? null : legs.reverse().map(cs => this.toLeg(cs));
  }

  /**
   * Convert a list of connections into a Transfer or a TimetableLeg
   */
  private toLeg(cs: Connection[]): AnyLeg {
    const firstConnection = cs[0];

    if (isTransfer(firstConnection)) {
      return firstConnection;
    }
    else {
      const origin = firstConnection.origin;
      const destination = cs[cs.length - 1].destination;
      const trip = firstConnection.trip;
      const stopTimes = this.getStopTimes(firstConnection.trip, origin, firstConnection.departureTime, destination);

      return { origin, destination, trip, stopTimes: stopTimes || [] };
    }
  }

  /**
   * Check for any redundant legs and replace them with new legs from the trip.
   */
  private getCompactedLegs(legs: AnyLeg[]): AnyLeg[] {
    const newLegs: AnyLeg[] = [];

    for (let i = legs.length - 1; i >= 0; i--) {
      if (isTransfer(legs[i])) {
        newLegs.push(legs[i]);
      }
      else {
        let legI = legs[i] as TimetableLeg;
        let lastDepartureTime = legI.stopTimes[0].departureTime;

        for (let j = i - 1; j >= 0; j--) {
          const legJ = legs[j];
          lastDepartureTime = isTransfer(legJ) ? lastDepartureTime - legJ.duration : legJ.stopTimes[0].departureTime;
          const stopTimes = this.getStopTimes(legI.trip, legJ.origin, lastDepartureTime, legI.destination);

          if (stopTimes) {
            legI.origin = legJ.origin;
            legI.stopTimes = stopTimes;
            i = j;
          }
        }

        newLegs.push(legI);
      }
    }

    return newLegs.reverse();
  }

  /**
   * Try to create a new leg from the trip, ensuring the new leg departs the origin no earlier than the given
   * departure time.
   */
  private getStopTimes(trip: Trip, origin: StopID, departureTime: Time, destination: StopID): StopTime[] | null {
    const start = trip.stopTimes.findIndex(c => c.pickUp && c.stop === origin && c.departureTime >= departureTime);
    const end = trip.stopTimes.findIndex((c, i) => c.dropOff && i > start && c.stop === destination);

    return start === -1 || end === -1 ? null : trip.stopTimes.slice(start, end + 1);
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
