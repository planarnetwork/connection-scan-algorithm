import type { StopID, Time, Trip } from "@gb-transit/gtfs-loader";
import type { AnyLeg, Transfer } from "./Journey.js";

export type Connection = TimetableConnection | Transfer;

/**
 * A trip's journey between two stations, boarded at one call and alighted at a later one.
 */
export interface TimetableConnection {
  origin: StopID;
  destination: StopID;
  departureTime: Time;
  arrivalTime: Time;
  trip: Trip;
}

export function isTransfer(connection: Connection | AnyLeg): connection is Transfer {
  return "duration" in connection;
}

export function isChangeRequired(a: Connection, b: Connection): boolean {
  return isTransfer(a) || isTransfer(b) || a.trip.tripId !== b.trip.tripId;
}
