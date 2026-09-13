import type { Journey } from "../journey/Journey.js";

/**
 * Filter a number journeys
 */
export interface JourneyFilter {
  apply(journeys: Journey[]): Journey[];
}
