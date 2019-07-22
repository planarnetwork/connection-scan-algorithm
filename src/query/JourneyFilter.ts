import { Journey } from "../journey/Journey";

/**
 * Filter a number journeys
 */
export interface JourneyFilter {
  apply(journeys: Journey[]): Journey[];
}
