import { describe, expect, it } from "vitest";
import {
  isChangeRequired, isTransferConnection, NO_CONNECTION, transferConnection, transferOf
} from "../../../src/journey/Connection.js";
import { connection, gtfsOf, st, trip } from "../util.js";

describe("Connection", () => {
  const gtfs = gtfsOf({
    trips: [trip("LN1111", [st("A", 1000), st("B", 1030), st("C", 1100)]), trip("LN1112", [st("A", 1000), st("B", 1030)])]
  });

  it("knows if it's a transfer", () => {
    expect(isTransferConnection(transferConnection(0))).toBe(true);
    expect(transferOf(transferConnection(3))).toBe(3);
  });

  it("knows if it's not a transfer", () => {
    expect(isTransferConnection(connection(gtfs, "LN1111", "A", "B"))).toBe(false);
    expect(isTransferConnection(NO_CONNECTION)).toBe(false);
  });

  it("knows if a change is required", () => {
    expect(isChangeRequired(gtfs.connections, connection(gtfs, "LN1111", "A", "B"), connection(gtfs, "LN1112", "A", "B"))).toBe(true);
  });

  it("knows if a change is not required", () => {
    expect(isChangeRequired(gtfs.connections, connection(gtfs, "LN1111", "A", "B"), connection(gtfs, "LN1111", "B", "C"))).toBe(false);
  });

  it("knows if a change is required between a transfer", () => {
    const timetableConnection = connection(gtfs, "LN1111", "A", "B");

    expect(isChangeRequired(gtfs.connections, timetableConnection, transferConnection(0))).toBe(true);
    expect(isChangeRequired(gtfs.connections, transferConnection(0), timetableConnection)).toBe(true);
  });

});
