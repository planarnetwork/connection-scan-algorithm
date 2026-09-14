import { isCall, type StopID, type StopTime, type Time, type Trip } from "@gb-transit/gtfs-loader";
import type { ConnectionIndex } from "../csa/ConnectionScanAlgorithm.js";
import type { GtfsData } from "../gtfs/GtfsLoader.js";
import { type StopIdx, UNKNOWN_STOP } from "../gtfs/StopTable.js";
import { type Connection, isTransferConnection, NO_CONNECTION, transferOf } from "./Connection.js";
import { type AnyLeg, isTransfer, type Journey } from "./Journey.js";

/**
 * Creates journeys from the connection index created by the connection scan algorithm.
 */
export class JourneyFactory {

  /**
   * Connections run between stations while a trip's stop times name platforms, so a leg is cut from
   * its trip by asking which station each call is at.
   */
  constructor(
    private readonly gtfs: GtfsData
  ) {}

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
   * Iterate backwards from the destination to the origin, each station giving the leg that reached it
   */
  private getLegs(connections: ConnectionIndex, destination: StopID): AnyLeg[] | null {
    const legs: AnyLeg[] = [];
    let station = this.gtfs.stopTable.indexOf(destination);

    while (station !== UNKNOWN_STOP && connections[station] !== NO_CONNECTION) {
      const connection = connections[station];

      legs.push(this.toLeg(connection, station));
      station = isTransferConnection(connection)
        ? this.gtfs.transfers.origin[transferOf(connection)]
        : this.gtfs.connections.departureStation[connection];
    }

    return legs.length === 0 ? null : legs.reverse();
  }

  /**
   * Convert the connection a trip was boarded from into a TimetableLeg to the station, or a footpath
   * into a Transfer
   */
  private toLeg(connection: Connection, station: StopIdx): AnyLeg {
    const { connections, stopTable, transfers, trips } = this.gtfs;

    if (isTransferConnection(connection)) {
      return transfers.transfer[transferOf(connection)];
    }
    else {
      const origin = stopTable.nameOf(connections.departureStation[connection]);
      const destination = stopTable.nameOf(station);
      const trip = trips[connections.trip[connection]];
      const stopTimes = this.getStopTimes(trip, origin, connections.departureTime[connection], destination);

      return { origin, destination, trip, stopTimes: stopTimes || [] };
    }
  }

  /**
   * Check for any redundant legs and replace them with new legs from the trip.
   */
  private getCompactedLegs(legs: AnyLeg[]): AnyLeg[] {
    const newLegs: AnyLeg[] = [];

    for (let i = legs.length - 1; i >= 0; i--) {
      const legI = legs[i];

      if (isTransfer(legI)) {
        newLegs.push(legI);
      }
      else {
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
   * Try to create a new leg from the trip, ensuring the new leg departs the origin no earlier than
   * the given departure time. The stop times are the feed's own, so a leg between two stations still
   * says which platform it uses at each end, but the points the trip only passes are left out.
   */
  private getStopTimes(trip: Trip, origin: StopID, departureTime: Time, destination: StopID): StopTime[] | null {
    const stopTimes = trip.stopTimes;
    const start = stopTimes.findIndex(
      c => c.pickUp && c.departureTime >= departureTime && this.stationOf(c) === origin
    );
    const end = stopTimes.findIndex((c, i) => c.dropOff && i > start && this.stationOf(c) === destination);

    return start === -1 || end === -1 ? null : stopTimes.slice(start, end + 1).filter(isCall);
  }

  private stationOf(stopTime: StopTime): StopID {
    return this.gtfs.stations.get(stopTime.stop) ?? stopTime.stop;
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
