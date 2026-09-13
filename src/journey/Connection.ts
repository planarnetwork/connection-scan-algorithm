import type { Connections } from "../gtfs/Connections.js";

/**
 * How a station was reached: a connection by its index into the feed's connections, or a footpath
 * by its index into the feed's transfers. They are told apart by sign, so that one array can hold
 * how every station was reached.
 */
export type Connection = number;

/** A station reached by nothing: an origin, or one not reached at all */
export const NO_CONNECTION = -1;

export function transferConnection(transfer: number): Connection {
  return -2 - transfer;
}

export function isTransferConnection(connection: Connection): boolean {
  return connection <= -2;
}

export function transferOf(connection: Connection): number {
  return -2 - connection;
}

export function isChangeRequired(connections: Connections, a: Connection, b: Connection): boolean {
  return isTransferConnection(a) || isTransferConnection(b) || connections.trip[a] !== connections.trip[b];
}
