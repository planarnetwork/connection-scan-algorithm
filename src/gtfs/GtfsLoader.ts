import {
  type GTFSFeed, type GTFSSource, type Interchange, loadGTFS, normalise, type StopID, type StopIndex,
  type StopTime, type Trip
} from "@gb-transit/gtfs-loader";
import type { Transfer } from "../journey/Journey.js";
import { ConnectionList, type Connections } from "./Connections.js";
import { type StopIdx, StopTable, UNKNOWN_STOP } from "./StopTable.js";
import { TripCalendar } from "./TripCalendar.js";

/**
 * Returns connections, transfers and interchange times from a GTFS zip.
 */
export async function loadGtfs(source: GTFSSource): Promise<GtfsData> {
  return toGtfsData(await loadGTFS(source));
}

/**
 * Puts a feed into the terms the connection scan works in.
 *
 * `normalise` resolves stops to the station they belong to, defines footpaths and interchange times
 * at those stations, picks out the calls a passenger can actually use, and adds a trip for each
 * coupling so that staying on a vehicle that carries on as another service is one trip rather than
 * a change. What is left here is numbering those stations and turning each trip into connections
 * between them, sorted as the scan reads them.
 */
export function toGtfsData(feed: GTFSFeed): GtfsData {
  const { trips, calls, transfers, interchange, stations } = normalise(feed);
  const stops = new StopTable();
  const connections = new ConnectionList();

  for (let t = 0; t < trips.length; t++) {
    addConnections(connections, t, calls[t], calls[t].map(c => stops.intern(stations.get(c.stop) ?? c.stop)));
  }

  return {
    connections: connections.sortByArrival(),
    transfers: indexTransfersByOrigin(transfers, stops),
    interchange: indexInterchange(interchange, stops),
    calendar: new TripCalendar(trips),
    trips,
    stopTable: stops,
    stops: feed.stops,
    stations
  };
}

/**
 * Go through the calls adding connections until at least one pick up and set down point has been
 * passed. A stopping pattern A(p/d) -> B(d) -> C(p/d) would otherwise create A->B but never reach C,
 * so this gives A->B and A->C.
 */
function addConnections(connections: ConnectionList, trip: number, calls: StopTime[], station: StopIdx[]): void {
  for (let i = 0; i < calls.length - 1; i++) {
    if (calls[i].pickUp) {
      for (let j = i + 1; j < calls.length; j++) {
        if (calls[j].dropOff) {
          // two calls at one station are a stop and a start, not a journey between places
          if (station[i] !== station[j]) {
            connections.push(station[i], station[j], calls[i].departureTime, calls[j].arrivalTime, trip, i, j);
          }

          if (calls[j].pickUp) {
            break;
          }
        }
      }
    }
  }
}

/**
 * `normalise` returns footpaths as a flat list, the scan asks for them by origin. Each station's
 * footpaths keep the order the feed gave them in.
 */
function indexTransfersByOrigin(transfers: Transfer[], stops: StopTable): Transfers {
  for (const transfer of transfers) {
    stops.intern(transfer.origin);
    stops.intern(transfer.destination);
  }

  const offsets = new Int32Array(stops.size + 1);

  for (const transfer of transfers) {
    offsets[stops.indexOf(transfer.origin) + 1]++;
  }

  for (let s = 1; s <= stops.size; s++) {
    offsets[s] += offsets[s - 1];
  }

  const next = offsets.slice(0, stops.size);
  const index: Transfers = {
    offsets,
    origin: new Int32Array(transfers.length),
    destination: new Int32Array(transfers.length),
    duration: new Int32Array(transfers.length),
    transfer: new Array(transfers.length)
  };

  for (const transfer of transfers) {
    const t = next[stops.indexOf(transfer.origin)]++;

    index.origin[t] = stops.indexOf(transfer.origin);
    index.destination[t] = stops.indexOf(transfer.destination);
    index.duration[t] = transfer.duration;
    index.transfer[t] = transfer;
  }

  return index;
}

/**
 * The interchange time at each station, by index. A station the feed gave no time for is one a
 * change takes no time at.
 */
function indexInterchange(interchange: Interchange, stops: StopTable): Int32Array {
  const times = new Int32Array(stops.size);

  for (const station of Object.keys(interchange)) {
    const index = stops.indexOf(station);

    if (index !== UNKNOWN_STOP) {
      times[index] = interchange[station];
    }
  }

  return times;
}

/**
 * The footpaths out of each station. Station `s` owns `[offsets[s], offsets[s + 1])` of the rest,
 * so footpath `t` leaves `origin[t]` for `destination[t]`.
 */
export interface Transfers {
  /** Bounds of each station's footpaths. Its length is the number of stations + 1 */
  offsets: Int32Array;
  origin: Int32Array;
  destination: Int32Array;
  duration: Int32Array;
  /** The footpath as the feed gave it, which is what a journey returns */
  transfer: Transfer[];
}

/**
 * Contents of the GTFS zip file
 */
export type GtfsData = {
  /** every connection between two stations, sorted by arrival time */
  connections: Connections,
  transfers: Transfers,
  /** interchange time at each station, by index */
  interchange: Int32Array,
  /** which trips run on a date */
  calendar: TripCalendar,
  /** the trips the connections run on, by index */
  trips: Trip[],
  /** the stations the connections run between, numbered */
  stopTable: StopTable,
  /** the feed's stops, as it gave them, which may identify individual platforms */
  stops: StopIndex,
  /** feed stop id to the station it belongs to, which is what journeys are planned between */
  stations: Map<StopID, StopID>
};
