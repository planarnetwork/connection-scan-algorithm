import type { DateNumber, DayOfWeek, StopID, Time } from "@gb-transit/gtfs-loader";
import type { ConnectionScanAlgorithm, OriginDepartureTimes } from "../csa/ConnectionScanAlgorithm.js";
import type { Journey } from "../journey/Journey.js";
import type { JourneyFactory } from "../journey/JourneyFactory.js";
import type { JourneyFilter } from "./JourneyFilter.js";

/**
 * Implementation of CSA that searches for journeys between a set of origin and destinations.
 */
export class DepartAfterQuery {

  constructor(
    private readonly csa: ConnectionScanAlgorithm,
    private readonly resultsFactory: JourneyFactory,
    private readonly filters: JourneyFilter[] = []
  ) { }

  /**
   * Plan a journey between the origin and destination set of stations on the given date and time
   */
  public plan(origins: StopID[], destinations: StopID[], date: Date, time: Time): Journey[] {
    const originTimes: OriginDepartureTimes = {};

    for (const origin of origins) {
      originTimes[origin] = time;
    }

    const results = this.csa.scan(originTimes, destinations, this.getDateNumber(date), date.getDay() as DayOfWeek);
    const journeys = this.resultsFactory.getJourneys(results, destinations);

    // apply each filter to the results
    return this.filters.reduce((rs, filter) => filter.apply(rs), journeys);
  }

  // read in local time to agree with getDay(), otherwise the date and the day of week can describe different days
  private getDateNumber(date: Date): DateNumber {
    return date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
  }

}
