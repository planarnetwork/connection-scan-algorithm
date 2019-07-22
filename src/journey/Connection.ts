import { StopID, Time, Trip } from "../gtfs/Gtfs";
import { AnyLeg, Transfer } from "./Journey";

export type Connection = TimetableConnection | Transfer;

export interface TimetableConnection {
  origin: StopID;
  destination: StopID;
  departureTime: Time;
  arrivalTime: Time;
  trip: Trip;
}

export function isTransfer(connection: Connection | AnyLeg): connection is Transfer {
  return connection.hasOwnProperty("duration");
}

export function isChangeRequired(a: Connection, b: Connection): boolean {
  return isTransfer(a) || isTransfer(b) || a.trip.tripId !== b.trip.tripId;
}