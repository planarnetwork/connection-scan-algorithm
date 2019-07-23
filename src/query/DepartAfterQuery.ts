
import { keyValue } from "ts-array-utils";
import { ConnectionScanAlgorithm } from "../csa/ConnectionScanAlgorithm";
import { JourneyFactory } from "../journey/JourneyFactory";
import { StopID, Time, DayOfWeek } from "../gtfs/Gtfs";
import { Journey } from "../journey/Journey";
import { JourneyFilter } from "./JourneyFilter";

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
   * Plan a journey between the origin and destination set of stops on the given date and time
   */
  public plan(origins: StopID[], destinations: StopID[], date: Date, time: Time): Journey[] {
    const originTimes = origins.reduce(keyValue(origin => [origin, time]), {});
    const dateNumber = this.getDateNumber(date);
    const dayOfWeek = date.getDay() as DayOfWeek;
    const results = this.csa.scan(originTimes, destinations, dateNumber, dayOfWeek);
    const journeys = this.resultsFactory.getJourneys(results, destinations);

    // apply each filter to the results
    return this.filters.reduce((rs, filter) => filter.apply(rs), journeys);
  }

  private getDateNumber(date: Date): number {
    const str = date.toISOString();

    return parseInt(str.slice(0, 4) + str.slice(5, 7) + str.slice(8, 10), 10);
  }

}