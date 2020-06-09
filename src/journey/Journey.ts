import { Duration, StopID, StopTime, Time, Trip } from "../gtfs/Gtfs";

/**
 * A leg
 */
export type AnyLeg = Transfer | TimetableLeg;

/**
 * A journey is a collection of legs
 */
export interface Journey {
  origin: StopID,
  destination: StopID,
  legs: AnyLeg[];
  departureTime: Time,
  arrivalTime: Time
}

/**
 * Leg of a journey
 */
export interface Leg {
  origin: StopID;
  destination: StopID;
}

/**
 * Leg with a defined departureTime and arrivalTime time
 */
export interface TimetableLeg extends Leg {
  stopTimes: StopTime[];
  trip: Trip;
}

/**
 * Leg with a duration instead of departureTime and arrivalTime time
 */
export interface Transfer extends Leg {
  duration: Duration;
  startTime: Time;
  endTime: Time;
}

export function journeyToString(j: Journey) {
  return toTime(j.departureTime) + ", " +
    toTime(j.arrivalTime) + ", " +
    [j.legs[0].origin, ...j.legs.map(l => l.destination)].join("-");
}

function toTime(time: number) {
  let hours: any   = Math.floor(time / 3600);
  let minutes: any = Math.floor((time - (hours * 3600)) / 60);
  let seconds: any = time - (hours * 3600) - (minutes * 60);

  if (hours   < 10) { hours   = "0" + hours; }
  if (minutes < 10) { minutes = "0" + minutes; }
  if (seconds < 10) { seconds = "0" + seconds; }

  return hours + ":" + minutes + ":" + seconds;
}