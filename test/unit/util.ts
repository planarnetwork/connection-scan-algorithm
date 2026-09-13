import { type GTFSFeed, Service, type StopID, type StopTime, type Time, type TripID } from "@gb-transit/gtfs-loader";
import type { TimetableConnection } from "../../src/journey/Connection.js";
import type { Transfer } from "../../src/journey/Journey.js";

export const allDays = { 0: true, 1: true, 2: true, 3: true, 4: true, 5: true, 6: true };

export const everyDay = new Service(20190101, 20991231, allDays, {});

export const defaultInterchange = {
  A: 0,
  B: 0
};

/**
 * A connection on the given trip, which calls nowhere until setStopTimes is given its connections.
 */
export function c(
  origin: StopID,
  destination: StopID,
  departureTime: Time,
  arrivalTime: Time,
  tripId: TripID = "LN1111"
): TimetableConnection {
  return {
    origin,
    destination,
    departureTime,
    arrivalTime,
    trip: {
      tripId,
      serviceId: "1",
      stopTimes: [],
      service: everyDay
    }
  };
}

/**
 * A footpath, available all day.
 */
export function t(origin: StopID, destination: StopID, duration: Time): Transfer {
  return { origin, destination, duration, startTime: 0, endTime: 2359 };
}

/**
 * A call at a stop, arriving and departing at the same time.
 */
export function st(stop: StopID, time: Time): StopTime {
  return { stop, pickUp: true, dropOff: true, departureTime: time, arrivalTime: time };
}

/**
 * Give every connection the stop times of the trip they make up together.
 */
export function setStopTimes(connections: TimetableConnection[]): void {
  const stopTimes = connections.map(connection => st(connection.origin, connection.departureTime));
  const last = connections[connections.length - 1];

  stopTimes.push(st(last.destination, last.arrivalTime));

  for (const connection of connections) {
    connection.trip.stopTimes = stopTimes;
  }
}

/**
 * A feed whose stops are platforms, each belonging to a station named by its stop_code. That is how
 * the GB rail feed identifies a station, and what `normalise` resolves a call to.
 */
export function feed(overrides: Partial<GTFSFeed> = {}): GTFSFeed {
  return {
    trips: [],
    transfers: {},
    links: [],
    interchange: {},
    stops: {
      NRW: station("NRW"),
      NRW1: platform("NRW1", "NRW"),
      NRW2: platform("NRW2", "NRW"),
      DIS: station("DIS"),
      DIS1: platform("DIS1", "DIS"),
      DIS2: platform("DIS2", "DIS"),
      LST: station("LST"),
      LST8: platform("LST8", "LST"),
      IPS: station("IPS"),
      IPS1: platform("IPS1", "IPS")
    },
    routes: {},
    agencies: {},
    areas: {},
    shapes: {},
    ...overrides
  };
}

function station(id: StopID) {
  return { id, code: id, latitude: 0, longitude: 0, locationType: 1 };
}

function platform(id: StopID, parentStation: StopID) {
  return { id, latitude: 0, longitude: 0, locationType: 0, parentStation };
}
