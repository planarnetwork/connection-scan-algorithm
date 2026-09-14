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
   * Extract a result for each destination in the list: its earliest arrival, in the fewest legs that
   * arrive then.
   */
  public getJourneys(index: ConnectionIndex, destinations: StopID[]): Journey[] {
    return destinations
      .map(d => this.getLegs(index, d))
      .filter((c): c is AnyLeg[] => c !== null)
      .map(l => this.getJourney(l));
  }

  /**
   * Iterate backwards from the destination to the origin, each label giving the leg that reached it.
   * The label before a leg is the fewest legs its station was reached in, in time for the leg: the
   * label it was taken from, or one reached as soon in fewer legs since.
   */
  private getLegs(index: ConnectionIndex, destination: StopID): AnyLeg[] | null {
    const { connections, transfers, interchange, stopTable } = this.gtfs;
    const { levels, boardingTimes } = index;
    const legs: AnyLeg[] = [];
    let station = stopTable.indexOf(destination);

    if (station === UNKNOWN_STOP) {
      return null;
    }

    let label = this.getLabel(index, station, boardingTimes[(station + 1) * levels - 1]);

    while (index.connections[label] !== NO_CONNECTION) {
      const connection = index.connections[label];

      legs.push(this.toLeg(connection, station));

      if (isTransferConnection(connection)) {
        const t = transferOf(connection);
        const setOff = boardingTimes[label] - interchange[station] - transfers.duration[t];

        station = transfers.origin[t];
        label = this.getLabel(index, station, setOff);

        // walking from an origin is charged the interchange time its label does not have in it
        if (label % levels === 0 && boardingTimes[label] + interchange[station] > setOff) {
          label = this.getLabel(index, station, setOff, 1);
        }
      }
      else {
        station = connections.departureStation[connection];
        label = this.getLabel(index, station, connections.departureTime[connection]);
      }
    }

    return legs.length === 0 ? null : legs.reverse();
  }

  /**
   * The label of the fewest legs the station can be boarded at by the time in
   */
  private getLabel(index: ConnectionIndex, station: StopIdx, time: Time, fewestLegs = 0): number {
    let label = station * index.levels + fewestLegs;

    while (index.boardingTimes[label] > time) {
      label++;
    }

    return label;
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
