import type { DateNumber, DayOfWeek, StopID, Time } from "@gb-transit/gtfs-loader";
import { ConnectionScanAlgorithm, type OriginDepartureTimes } from "../csa/ConnectionScanAlgorithm.js";
import type { Journey } from "../journey/Journey.js";
import { JourneyFactory } from "../journey/JourneyFactory.js";
import type { StopIdx, Timetable } from "../timetable/Timetable.js";
import type { JourneyFilter } from "./JourneyFilter.js";

/**
 * Implementation of CSA that searches for journeys between a set of origin and destinations.
 */
export class DepartAfterQuery {
  private readonly csa: ConnectionScanAlgorithm;
  private readonly resultsFactory: JourneyFactory;

  constructor(
    private readonly timetable: Timetable,
    private readonly filters: JourneyFilter[] = []
  ) {
    this.csa = new ConnectionScanAlgorithm(timetable);
    this.resultsFactory = new JourneyFactory(timetable);
  }

  /**
   * Plan a journey between the origin and destination set of stations on the given date and time
   */
  public plan(origins: StopID[], destinations: StopID[], date: Date, time: Time): Journey[] {
    const originTimes: OriginDepartureTimes = new Map();

    for (const origin of this.toStationIndexes(origins)) {
      originTimes.set(origin, time);
    }

    const to = this.toStationIndexes(destinations);

    if (originTimes.size === 0 || to.length === 0) {
      return [];
    }

    const results = this.csa.scan(originTimes, to, this.getDateNumber(date), date.getDay() as DayOfWeek);
    const journeys = this.resultsFactory.getJourneys(results, to);

    // apply each filter to the results
    return this.filters.reduce((rs, filter) => filter.apply(rs), journeys);
  }

  /**
   * A station the timetable does not have is one nothing runs to or from, so it is left out rather
   * than planned for
   */
  private toStationIndexes(stations: StopID[]): StopIdx[] {
    const indexes: StopIdx[] = [];

    for (const station of stations) {
      const index = this.timetable.stationIndex.get(station);

      if (index !== undefined) {
        indexes.push(index);
      }
    }

    return indexes;
  }

  // read in local time to agree with getDay(), otherwise the date and the day of week can describe different days
  private getDateNumber(date: Date): DateNumber {
    return date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
  }

}
