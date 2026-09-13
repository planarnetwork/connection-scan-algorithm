import {
  type GTFSFeed, type GTFSSource, type Interchange, loadGTFS, normalise, type StopID, type StopIndex,
  type StopTime, type Trip
} from "@gb-transit/gtfs-loader";
import type { TimetableConnection } from "../journey/Connection.js";
import type { Transfer } from "../journey/Journey.js";

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
 * a change. What is left here is turning each trip into connections between stations, sorted as the
 * scan reads them.
 */
export function toGtfsData(feed: GTFSFeed): GtfsData {
  const { trips, calls, transfers, interchange, stations } = normalise(feed);
  const connections: TimetableConnection[] = [];

  for (let t = 0; t < trips.length; t++) {
    addConnections(connections, trips[t], calls[t], stations);
  }

  connections.sort((a, b) => a.arrivalTime - b.arrivalTime);

  return {
    connections,
    transfers: indexTransfersByOrigin(transfers),
    interchange,
    stops: feed.stops,
    stations
  };
}

/**
 * Go through the calls adding connections until at least one pick up and set down point has been
 * passed. A stopping pattern A(p/d) -> B(d) -> C(p/d) would otherwise create A->B but never reach C,
 * so this gives A->B and A->C.
 */
function addConnections(
  connections: TimetableConnection[],
  trip: Trip,
  calls: StopTime[],
  stations: Map<StopID, StopID>
): void {
  const station = calls.map(c => stations.get(c.stop) ?? c.stop);

  for (let i = 0; i < calls.length - 1; i++) {
    if (calls[i].pickUp) {
      for (let j = i + 1; j < calls.length; j++) {
        if (calls[j].dropOff) {
          // two calls at one station are a stop and a start, not a journey between places
          if (station[i] !== station[j]) {
            connections.push({
              origin: station[i],
              destination: station[j],
              departureTime: calls[i].departureTime,
              arrivalTime: calls[j].arrivalTime,
              trip
            });
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
 * `normalise` returns footpaths as a flat list, the scan asks for them by origin.
 */
function indexTransfersByOrigin(transfers: Transfer[]): TransfersByOrigin {
  const index: TransfersByOrigin = {};

  for (const transfer of transfers) {
    index[transfer.origin] ??= [];
    index[transfer.origin].push(transfer);
  }

  return index;
}

/**
 * Transfers indexed by origin station
 */
export type TransfersByOrigin = Record<StopID, Transfer[]>;

/**
 * Contents of the GTFS zip file
 */
export type GtfsData = {
  /** every connection between two stations, sorted by arrival time */
  connections: TimetableConnection[],
  transfers: TransfersByOrigin,
  /** interchange time at each station */
  interchange: Interchange,
  /** the feed's stops, as it gave them, which may identify individual platforms */
  stops: StopIndex,
  /** feed stop id to the station it belongs to, which is what journeys are planned between */
  stations: Map<StopID, StopID>
};
