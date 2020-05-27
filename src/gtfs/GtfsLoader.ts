import * as gtfs from "gtfs-stream";
import { pushNested, setNested } from "ts-array-utils";
import { Readable } from "stream";
import { TimeParser } from "./TimeParser";
import { Service } from "./Service";
import {CalendarIndex, StopID, StopIndex, StopTime, Time, Trip} from "./Gtfs";
import { TimetableConnection } from "../journey/Connection";
import { Transfer } from "..";

/**
 * Returns trips, transfers, interchange time and calendars from a GTFS zip.
 */
export class GtfsLoader {

  constructor(
    private readonly timeParser: TimeParser
  ) {}

  public load(input: Readable): Promise<GtfsData> {
    return new Promise(resolve => {
      const processor = new StatefulGtfsLoader(this.timeParser);

      input
          .pipe(gtfs({ raw: true }))
          .on("data", entity => processor[entity.type] && processor[entity.type](entity.data))
          .on("end", () => resolve(processor.finalize()));
    });

  }

}

/**
 * Encapsulation of the GTFS data while it is being loaded from the zip
 */
class StatefulGtfsLoader {
  private readonly trips: Trip[] = [];
  private readonly transfers = {};
  private readonly interchange = {};
  private readonly calendars: CalendarIndex = {};
  private readonly dates = {};
  private readonly stopTimes = {};
  private readonly stops = {};

  constructor(
    private readonly timeParser: TimeParser
  ) {}

  public link(row: any): void {
    const t = {
      origin: row.from_stop_id,
      destination: row.to_stop_id,
      duration: +row.duration,
      startTime: this.timeParser.getTime(row.start_time),
      endTime: this.timeParser.getTime(row.end_time)
    };

    pushNested(t, this.transfers, row.from_stop_id);
  }

  public calendar(row: any): void {
    this.calendars[row.service_id] = {
      serviceId: row.service_id,
      startDate: +row.start_date,
      endDate: +row.end_date,
      days: {
        0: row.sunday === "1",
        1: row.monday === "1",
        2: row.tuesday === "1",
        3: row.wednesday === "1",
        4: row.thursday === "1",
        5: row.friday === "1",
        6: row.saturday === "1"
      },
      include: {},
      exclude: {}
    };
  }

  public calendar_date(row: any): void {
    setNested(row.exception_type === "1", this.dates, row.service_id, row.date);
  }

  public trip(row: any): void {
    this.trips.push({ serviceId: row.service_id, tripId: row.trip_id, stopTimes: [], service: {} as any });
  }

  public stop_time(row: any): void {
    const stopTime = {
      stop: row.stop_id,
      departureTime: this.timeParser.getTime(row.departure_time),
      arrivalTime: this.timeParser.getTime(row.arrival_time),
      pickUp: row.pickup_type === "0",
      dropOff: row.drop_off_type === "0"
    };

    pushNested(stopTime, this.stopTimes, row.trip_id);
  }

  public transfer(row: any): void {
    if (row.from_stop_id === row.to_stop_id) {
      this.interchange[row.from_stop_id] = +row.min_transfer_time;
    }
    else {
      const t = {
        origin: row.from_stop_id,
        destination: row.to_stop_id,
        duration: +row.min_transfer_time,
        startTime: 0,
        endTime: Number.MAX_SAFE_INTEGER
      };

      pushNested(t, this.transfers, row.from_stop_id);
    }
  }

  public stop(row: any): void {
    const stop = {
      id: row.stop_id,
      code: row.stop_code,
      name: row.stop_name,
      description: row.stop_desc,
      latitude: +row.stop_lat,
      longitude: +row.stop_lon,
      timezone: row.zone_id
    };

    setNested(stop, this.stops, row.stop_id);
  }

  public finalize(): GtfsData {
    const services = {};
    const connections: TimetableConnection[] = [];

    for (const c of Object.values(this.calendars)) {
      services[c.serviceId] = new Service(c.startDate, c.endDate, c.days, this.dates[c.serviceId] || {});
    }

    for (const t of this.trips) {
      t.stopTimes = this.stopTimes[t.tripId];
      t.service = services[t.serviceId];

      connections.push(...this.getConnectionsFromTrip(t));
    }

    connections.sort((a, b) => a.arrivalTime - b.arrivalTime);

    for (const stop of Object.keys(this.stops)) {
      this.transfers[stop] = this.transfers[stop] || [];
    }

    return { connections, transfers: this.transfers, interchange: this.interchange, stops: this.stops };
  }

  private getConnectionsFromTrip(t: Trip): TimetableConnection[] {
    const connections: TimetableConnection[] = [];

    for (let i = 0; i < t.stopTimes.length - 1; i++) {
      if (t.stopTimes[i].pickUp) {
        // go through the stops adding connections until we have passed at least one pick up and drop off point
        // need the check for pick up points as a stopping pattern A(p/d) -> B(d) -> C(p/d) would create connections
        // A->B but not get you to C. This way we get A->B + A->C
        for (let j = i + 1; j < t.stopTimes.length; j++) {
          if (t.stopTimes[j].dropOff) {
            connections.push({
              origin: t.stopTimes[i].stop,
              destination: t.stopTimes[j].stop,
              departureTime: t.stopTimes[i].departureTime,
              arrivalTime: t.stopTimes[j].arrivalTime,
              trip: t
            });

            if (t.stopTimes[j].pickUp) {
              break;
            }
          }
        }
      }
    }

    return connections;
  }

}

/**
 * Transfers indexed by origin
 */
export type TransfersByOrigin = Record<StopID, Transfer[]>;

/**
 * Index of stop to interchange time
 */
export type Interchange = Record<StopID, Time>;

/**
 * Contents of the GTFS zip file
 */
export type GtfsData = {
  connections: TimetableConnection[],
  transfers: TransfersByOrigin,
  interchange: Interchange,
  stops: StopIndex
};
