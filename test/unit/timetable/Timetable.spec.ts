import { describe, expect, it } from "vitest";
import { createTimetable, type Timetable } from "../../../src/timetable/Timetable.js";
import { byOrigin, everyDay, feed, platforms, st, trip, walk } from "../util.js";

/**
 * The connections as the stations they run between, in the order the scan reads them.
 */
function pairs(timetable: Timetable): string[] {
  const { connections, stations } = timetable;

  return Array.from(
    { length: connections.length },
    (_, c) => `${stations[connections.departureStation[c]]}-${stations[connections.arrivalStation[c]]}`
  );
}

describe("createTimetable", () => {

  it("creates connections between the stations the platforms belong to", () => {
    const timetable = createTimetable(feed({
      stops: platforms,
      trips: [trip("1", [st("NRW1", 1000), st("DIS2", 1100), st("LST8", 1200)])]
    }));
    const { connections } = timetable;

    expect(pairs(timetable)).toEqual(["NRW-DIS", "DIS-LST"]);
    expect([...connections.departureTime]).toEqual([1000, 1100]);
    expect([...connections.arrivalTime]).toEqual([1100, 1200]);
    expect(timetable.stationIndex.get("NRW")).toBe(0);
    expect([...connections.board].map(k => timetable.calls[k].stop)).toEqual(["NRW1", "DIS2"]);
    expect([...connections.alight].map(k => timetable.calls[k].stop)).toEqual(["DIS2", "LST8"]);
  });

  it("sorts the connections by arrival, keeping the order they were created in where they arrive together", () => {
    const timetable = createTimetable(feed({
      trips: [
        trip("1", [st("A", 1000), st("D", 1300)]),
        trip("2", [st("B", 1100), st("C", 1200)]),
        trip("3", [st("E", 1250), st("F", 1300)])
      ]
    }));

    expect(pairs(timetable)).toEqual(["B-C", "A-D", "E-F"]);
    expect([...timetable.connections.trip].map(t => timetable.trips[t].tripId)).toEqual(["2", "1", "3"]);
  });

  it("carries on past a call that can only be alighted at until one that can be boarded", () => {
    const setDownOnly = { ...st("B", 1100), pickUp: false };
    const timetable = createTimetable(feed({ trips: [trip("1", [st("A", 1000), setDownOnly, st("C", 1200)])] }));

    expect(pairs(timetable)).toEqual(["A-B", "A-C"]);
  });

  it("does not create a connection to or from a passing point", () => {
    const passing = { ...st("B", 1100), pickUp: false, dropOff: false };
    const timetable = createTimetable(feed({ trips: [trip("1", [st("A", 1000), passing, st("C", 1200)])] }));

    expect(pairs(timetable)).toEqual(["A-C"]);
    expect(timetable.calls.map(call => call.stop)).toEqual(["A", "C"]);
  });

  it("does not create a connection between two platforms of one station", () => {
    const timetable = createTimetable(feed({
      stops: platforms,
      trips: [trip("1", [st("NRW1", 1000), st("NRW2", 1005), st("LST8", 1200)])]
    }));

    expect(pairs(timetable)).toEqual(["NRW-LST"]);
  });

  it("adds the trip a passenger stays on across a coupling", () => {
    const timetable = createTimetable(feed({
      stops: platforms,
      trips: [trip("front", [st("NRW1", 1000), st("DIS2", 1100)]), trip("rear", [st("DIS1", 1130), st("LST8", 1230)])],
      links: [{ fromTripId: "front", toTripId: "rear", fromStop: "DIS2", toStop: "DIS1" }]
    }));
    const { connections, trips } = timetable;

    expect(pairs(timetable).map((pair, c) => `${trips[connections.trip[c]].tripId}:${pair}`)).toEqual([
      "front:NRW-DIS",
      "front_rear:NRW-DIS",
      "rear:DIS-LST",
      "front_rear:DIS-LST"
    ]);
  });

  it("indexes footpaths by the origin station and drops those within one", () => {
    const timetable = createTimetable(feed({
      stops: platforms,
      trips: [trip("1", [st("NRW1", 1000), st("DIS2", 1100)])],
      transfers: byOrigin(walk("NRW1", "NRW2", 300), walk("NRW1", "DIS2", 600), walk("DIS1", "IPS1", 900))
    }));
    const { offsets, destination, duration, transfer } = timetable.transfers;
    const from = (code: string) => {
      const s = timetable.stationIndex.get(code)!;

      return Array.from({ length: offsets[s + 1] - offsets[s] }, (_, i) => offsets[s] + i);
    };

    expect(from("NRW").map(i => [timetable.stations[destination[i]], duration[i]])).toEqual([["DIS", 600]]);
    expect(from("DIS").map(i => transfer[i].destination)).toEqual(["IPS"]);
    expect(from("IPS")).toEqual([]);
  });

  it("reports interchange time against the station, and none where the feed gives none", () => {
    const timetable = createTimetable(feed({
      stops: platforms,
      trips: [trip("1", [st("NRW1", 1000), st("DIS2", 1100)])],
      interchange: { NRW1: 300 }
    }));

    expect(timetable.interchange[timetable.stationIndex.get("NRW")!]).toBe(300);
    expect(timetable.interchange[timetable.stationIndex.get("DIS")!]).toBe(0);
  });

  it("holds each calendar once, however many trips run to it", () => {
    const timetable = createTimetable(feed({
      trips: [trip("1", [st("A", 1000), st("B", 1100)]), trip("2", [st("B", 1200), st("C", 1300)], everyDay)]
    }));

    expect(timetable.services.length).toBe(1);
    expect([...timetable.tripService]).toEqual([0, 0]);
  });

});
