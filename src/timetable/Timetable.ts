import {
  type GTFSFeed, type GTFSSource, loadGTFS, normalise, type ServiceCalendar, type StopID, type StopIndex,
  type StopTime, type Transfer, type Trip
} from "@gb-transit/gtfs-loader";

/**
 * Arrival time of a station that has not been reached. Larger than any real time, so it loses every
 * `<` comparison without needing a special case.
 */
export const NOT_REACHED = 0x7fffffff;

/**
 * Dense index of a station, in the range [0, number of stations).
 */
export type StopIdx = number;

/**
 * Every connection in the timetable, sorted by arrival time, as parallel arrays so that a scan
 * reads integers in order rather than chasing an object per connection.
 */
export interface Connections {
  length: number;
  departureStation: Int32Array;
  arrivalStation: Int32Array;
  departureTime: Int32Array;
  arrivalTime: Int32Array;
  /** Index into the timetable's trips */
  trip: Int32Array;
  /** The call the connection is boarded at, as an index into the timetable's calls */
  board: Int32Array;
  /** The call the connection is alighted at, as an index into the timetable's calls */
  alight: Int32Array;
}

/**
 * The footpaths out of each station. Station `s` owns `[offsets[s], offsets[s + 1])` of the rest.
 */
export interface Transfers {
  /** Bounds of each station's slice. Its length is the number of stations + 1 */
  offsets: Int32Array;
  origin: Int32Array;
  destination: Int32Array;
  duration: Int32Array;
  /** Parallel to the rest, the footpath as the feed gave it, which is what a journey returns */
  transfer: Transfer[];
}

/**
 * The feed as the connection scan reads it.
 *
 * Stations are numbered as they are met, and everything the scan touches is indexed by those
 * numbers. The codes, the feed's trips and its stop times are kept alongside for the journeys that
 * are built from a scan's results.
 */
export interface Timetable {
  /** Station code of each station index */
  stations: StopID[];
  stationIndex: Map<StopID, StopIdx>;
  /** Interchange time at each station, in seconds */
  interchange: Int32Array;
  transfers: Transfers;
  connections: Connections;
  trips: Trip[];
  /** Index into services of each trip's calendar */
  tripService: Int32Array;
  /** Each distinct calendar once, since far fewer of them than trips have to be asked about a date */
  services: ServiceCalendar[];
  /**
   * The calls a passenger can use, of every trip in turn. Trip `t` owns `[callOffsets[t],
   * callOffsets[t + 1])` of calls and callStations.
   */
  callOffsets: Int32Array;
  calls: StopTime[];
  callStations: Int32Array;
  /** the feed's stops, as it gave them, which may identify individual platforms */
  stops: StopIndex;
}

/**
 * Returns the timetable of a GTFS zip.
 */
export async function loadTimetable(source: GTFSSource): Promise<Timetable> {
  return createTimetable(await loadGTFS(source));
}

/**
 * Puts a feed into the terms the connection scan works in.
 *
 * `normalise` resolves stops to the station they belong to, defines footpaths and interchange times
 * at those stations, picks out the calls a passenger can actually use, and adds a trip for each
 * coupling so that staying on a vehicle that carries on as another service is one trip rather than
 * a change. What is left here is numbering the stations and turning each trip into connections
 * between them, sorted as the scan reads them.
 */
export function createTimetable(feed: GTFSFeed): Timetable {
  const { trips, calls: tripCalls, transfers, interchange, stations: stationOf } = normalise(feed);
  const stations: StopID[] = [];
  const stationIndex = new Map<StopID, StopIdx>();

  const intern = (code: StopID): StopIdx => {
    let index = stationIndex.get(code);

    if (index === undefined) {
      index = stations.length;
      stations.push(code);
      stationIndex.set(code, index);
    }

    return index;
  };

  const callOffsets = new Int32Array(trips.length + 1);
  const calls: StopTime[] = [];
  const callStationList: StopIdx[] = [];

  for (let t = 0; t < trips.length; t++) {
    callOffsets[t] = calls.length;

    for (const call of tripCalls[t]) {
      calls.push(call);
      callStationList.push(intern(stationOf.get(call.stop) ?? call.stop));
    }
  }

  callOffsets[trips.length] = calls.length;

  const callStations = Int32Array.from(callStationList);

  for (const transfer of transfers) {
    intern(transfer.origin);
    intern(transfer.destination);
  }

  const interchangeTimes = new Int32Array(stations.length);

  for (const station of Object.keys(interchange)) {
    const index = stationIndex.get(station);

    if (index !== undefined) {
      interchangeTimes[index] = interchange[station];
    }
  }

  const { tripService, services } = indexServices(trips);

  return {
    stations,
    stationIndex,
    interchange: interchangeTimes,
    transfers: indexTransfers(transfers, stationIndex, stations.length),
    connections: sortByArrival(createConnections(trips.length, callOffsets, calls, callStations)),
    trips,
    tripService,
    services,
    callOffsets,
    calls,
    callStations,
    stops: feed.stops
  };
}

/**
 * Go through each trip's calls adding connections until at least one pick up and set down point has
 * been passed. A stopping pattern A(p/d) -> B(d) -> C(p/d) would otherwise create A->B but never
 * reach C, so this gives A->B and A->C.
 *
 * The connections are counted before they are written, so that each array is allocated once.
 */
function createConnections(
  numTrips: number,
  callOffsets: Int32Array,
  calls: StopTime[],
  callStations: Int32Array
): Connections {
  const visit = (add: (trip: number, i: number, j: number) => void): void => {
    for (let t = 0; t < numTrips; t++) {
      const end = callOffsets[t + 1];

      for (let i = callOffsets[t]; i < end - 1; i++) {
        if (calls[i].pickUp) {
          for (let j = i + 1; j < end; j++) {
            if (calls[j].dropOff) {
              // two calls at one station are a stop and a start, not a journey between places
              if (callStations[i] !== callStations[j]) {
                add(t, i, j);
              }

              if (calls[j].pickUp) {
                break;
              }
            }
          }
        }
      }
    }
  };

  let length = 0;
  visit(() => length++);

  const connections = allocateConnections(length);
  let c = 0;

  visit((t, i, j) => {
    connections.departureStation[c] = callStations[i];
    connections.arrivalStation[c] = callStations[j];
    connections.departureTime[c] = calls[i].departureTime;
    connections.arrivalTime[c] = calls[j].arrivalTime;
    connections.trip[c] = t;
    connections.board[c] = i;
    connections.alight[c] = j;
    c++;
  });

  return connections;
}

/**
 * A counting sort on arrival time. Times are whole seconds within a day or two, so this is linear,
 * and it is stable: connections arriving together keep the order they were created in.
 */
function sortByArrival(unsorted: Connections): Connections {
  const { length, arrivalTime } = unsorted;
  let latest = 0;

  for (let c = 0; c < length; c++) {
    latest = Math.max(latest, arrivalTime[c]);
  }

  const position = new Int32Array(latest + 2);

  for (let c = 0; c < length; c++) {
    position[arrivalTime[c] + 1]++;
  }

  for (let time = 1; time < position.length; time++) {
    position[time] += position[time - 1];
  }

  const sorted = allocateConnections(length);

  for (let c = 0; c < length; c++) {
    const to = position[arrivalTime[c]]++;

    sorted.departureStation[to] = unsorted.departureStation[c];
    sorted.arrivalStation[to] = unsorted.arrivalStation[c];
    sorted.departureTime[to] = unsorted.departureTime[c];
    sorted.arrivalTime[to] = arrivalTime[c];
    sorted.trip[to] = unsorted.trip[c];
    sorted.board[to] = unsorted.board[c];
    sorted.alight[to] = unsorted.alight[c];
  }

  return sorted;
}

function allocateConnections(length: number): Connections {
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

/**
 * `normalise` returns footpaths as a flat list, the scan asks for them by origin. Each station's
 * footpaths keep the order the feed gave them in.
 */
function indexTransfers(
  transfers: Transfer[],
  stationIndex: Map<StopID, StopIdx>,
  numStations: number
): Transfers {
  const offsets = new Int32Array(numStations + 1);

  for (const transfer of transfers) {
    offsets[stationIndex.get(transfer.origin)! + 1]++;
  }

  for (let s = 1; s <= numStations; s++) {
    offsets[s] += offsets[s - 1];
  }

  const next = offsets.slice(0, numStations);
  const index: Transfers = {
    offsets,
    origin: new Int32Array(transfers.length),
    destination: new Int32Array(transfers.length),
    duration: new Int32Array(transfers.length),
    transfer: new Array(transfers.length)
  };

  for (const transfer of transfers) {
    const origin = stationIndex.get(transfer.origin)!;
    const i = next[origin]++;

    index.origin[i] = origin;
    index.destination[i] = stationIndex.get(transfer.destination)!;
    index.duration[i] = transfer.duration;
    index.transfer[i] = transfer;
  }

  return index;
}

function indexServices(trips: Trip[]): { tripService: Int32Array, services: ServiceCalendar[] } {
  const tripService = new Int32Array(trips.length);
  const services: ServiceCalendar[] = [];
  const serviceIndex = new Map<ServiceCalendar, number>();

  for (let t = 0; t < trips.length; t++) {
    let index = serviceIndex.get(trips[t].service);

    if (index === undefined) {
      index = services.length;
      services.push(trips[t].service);
      serviceIndex.set(trips[t].service, index);
    }

    tripService[t] = index;
  }

  return { tripService, services };
}
