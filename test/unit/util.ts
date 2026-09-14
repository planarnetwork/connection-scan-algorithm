import {
  type GTFSFeed, Service, type ServiceCalendar, type Stop, type StopID, type StopTime, type Time, type Transfer,
  type Trip
} from "@gb-transit/gtfs-loader";
import { type ConnectionIndex, ConnectionScanAlgorithm } from "../../src/csa/ConnectionScanAlgorithm.js";
import type { ScanResults } from "../../src/csa/ScanResults.js";
import { ScanResultsFactory } from "../../src/csa/ScanResultsFactory.js";
import { type GtfsData, toGtfsData } from "../../src/gtfs/GtfsLoader.js";
import type { Connection } from "../../src/journey/Connection.js";
import type { Journey, TimetableLeg } from "../../src/journey/Journey.js";
import { JourneyFactory } from "../../src/journey/JourneyFactory.js";
import { DepartAfterQuery } from "../../src/query/DepartAfterQuery.js";
import { MultipleCriteriaFilter } from "../../src/query/MultipleCriteriaFilter.js";

export const allDays = { 0: true, 1: true, 2: true, 3: true, 4: true, 5: true, 6: true };

export const everyDay = new Service(20190101, 20991231, allDays, {});

export const TUESDAY = new Date("2026-09-08T09:00:00");

/**
 * A call at a stop, arriving and departing at the same time.
 */
export function st(stop: StopID, time: Time): StopTime {
  return { stop, pickUp: true, dropOff: true, departureTime: time, arrivalTime: time };
}

/**
 * A call that can only be boarded.
 */
export function pickUpOnly(stop: StopID, time: Time): StopTime {
  return { ...st(stop, time), dropOff: false };
}

/**
 * A trip with the given calls, running every day unless given a calendar.
 */
export function trip(tripId: string, stopTimes: StopTime[], service: ServiceCalendar = everyDay): Trip {
  return { tripId, serviceId: tripId, service, stopTimes };
}

/**
 * A footpath, available all day.
 */
export function walk(origin: StopID, destination: StopID, duration: Time): Transfer {
  return { origin, destination, duration, startTime: 0, endTime: Number.MAX_SAFE_INTEGER };
}

/**
 * The footpaths indexed by the stop they leave from, as the loader gives them.
 */
export function byOrigin(...transfers: Transfer[]): GTFSFeed["transfers"] {
  const index: GTFSFeed["transfers"] = {};

  for (const transfer of transfers) {
    index[transfer.origin] ??= [];
    index[transfer.origin].push(transfer);
  }

  return index;
}

/**
 * A feed of the given trips and footpaths. A stop the feed has no entry for is a station of its own,
 * so a spec that is not about platforms can name its stations directly.
 */
export function feed(overrides: Partial<GTFSFeed> = {}): GTFSFeed {
  return {
    trips: [],
    transfers: {},
    links: [],
    interchange: {},
    stops: {},
    routes: {},
    agencies: {},
    areas: {},
    shapes: {},
    ...overrides
  };
}

/**
 * Stops that are platforms, each belonging to a station named by its stop_code. That is how the GB
 * rail feed identifies a station, and what the loader resolves a call to.
 */
export const platforms: Record<StopID, Stop> = {
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
};

function station(id: StopID): Stop {
  return { id, code: id, latitude: 0, longitude: 0, locationType: 1 };
}

function platform(id: StopID, parentStation: StopID): Stop {
  return { id, latitude: 0, longitude: 0, locationType: 0, parentStation };
}

export function gtfsOf(overrides: Partial<GTFSFeed>): GtfsData {
  return toGtfsData(feed(overrides));
}

/**
 * The connection of a trip between two stations, which a spec names rather than numbers.
 */
export function connection(gtfs: GtfsData, tripId: string, origin: StopID, destination: StopID): Connection {
  const { connections, stopTable, trips } = gtfs;

  for (let c = 0; c < connections.length; c++) {
    if (
      trips[connections.trip[c]].tripId === tripId &&
      stopTable.nameOf(connections.departureStation[c]) === origin &&
      stopTable.nameOf(connections.arrivalStation[c]) === destination
    ) {
      return c;
    }
  }

  throw new Error(`No connection of ${tripId} from ${origin} to ${destination}`);
}

/**
 * The footpath between two stations, as an index into the feed's transfers.
 */
export function transfer(gtfs: GtfsData, origin: StopID, destination: StopID): number {
  const { transfers, stopTable } = gtfs;

  for (let t = 0; t < transfers.transfer.length; t++) {
    if (stopTable.nameOf(transfers.origin[t]) === origin && stopTable.nameOf(transfers.destination[t]) === destination) {
      return t;
    }
  }

  throw new Error(`No footpath from ${origin} to ${destination}`);
}

/**
 * How the station was reached in at most the legs
 */
export function labelOf(index: ConnectionIndex, gtfs: GtfsData, station: StopID, legs: number): Connection {
  return index.connections[gtfs.stopTable.indexOf(station) * index.levels + legs];
}

export function resultsFor(gtfs: GtfsData, origins: Record<StopID, Time>, destinations: StopID[] = []): ScanResults {
  return new ScanResultsFactory(gtfs).create(origins, destinations);
}

/**
 * Take a connection as the scan does, which is only once it has been found reachable.
 */
export function take(results: ScanResults, c: Connection): void {
  if (!results.isReachable(c)) {
    throw new Error(`Connection ${c} is not reachable`);
  }

  results.setConnection(c);
}

/**
 * Plan over a feed with the pieces a caller would wire together.
 */
export function plan(overrides: Partial<GTFSFeed>, origins: StopID[], destinations: StopID[], time: Time): Journey[] {
  return queryOver(gtfsOf(overrides)).plan(origins, destinations, TUESDAY, time);
}

export function queryOver(gtfs: GtfsData, maxLegs?: number): DepartAfterQuery {
  return new DepartAfterQuery(
    new ConnectionScanAlgorithm(gtfs, new ScanResultsFactory(gtfs, maxLegs)),
    new JourneyFactory(gtfs),
    [new MultipleCriteriaFilter()]
  );
}

/**
 * Each leg as the trip it was taken on and the stations it ran between, or a walk.
 */
export function legsOf(journey: Journey): string[] {
  return journey.legs.map(leg => "trip" in leg
    ? `${(leg as TimetableLeg).trip.tripId}:${leg.origin}-${leg.destination}`
    : `walk:${leg.origin}-${leg.destination}`
  );
}
