import type { Duration, StopID, StopTime, Time, Trip } from "@gb-transit/gtfs-loader";

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

export function journeyToString(j: Journey): string {
  return `${toTime(j.departureTime)}, ${toTime(j.arrivalTime)}, ${[j.legs[0].origin, ...j.legs.map(l => l.destination)].join("-")}`;
}

function toTime(time: Time): string {
  const hours = Math.floor(time / 3600);
  const minutes = Math.floor((time - hours * 3600) / 60);
  const seconds = time - hours * 3600 - minutes * 60;

  return [hours, minutes, seconds].map(n => n.toString().padStart(2, "0")).join(":");
}
