import { describe, expect, it } from "vitest";
import { type GtfsData, toGtfsData } from "../../../src/gtfs/GtfsLoader.js";
import { UNKNOWN_STOP } from "../../../src/gtfs/StopTable.js";
import { allDays, byOrigin, everyDay, feed, platforms, st, trip, walk } from "../util.js";
import { Service } from "@gb-transit/gtfs-loader";

/**
 * The connections as the stations they run between, in the order the scan reads them.
 */
function pairs(gtfs: GtfsData): string[] {
  const { connections, stopTable } = gtfs;

  return Array.from(
    { length: connections.length },
    (_, c) => `${stopTable.nameOf(connections.departureStation[c])}-${stopTable.nameOf(connections.arrivalStation[c])}`
  );
}

describe("toGtfsData", () => {

  it("creates connections between the stations the platforms belong to", () => {
    const gtfs = toGtfsData(feed({
      stops: platforms,
      trips: [trip("1", [st("NRW1", 1000), st("DIS2", 1100), st("LST8", 1200)])]
    }));
    const { connections } = gtfs;

    expect(pairs(gtfs)).toEqual(["NRW-DIS", "DIS-LST"]);
    expect([...connections.departureTime]).toEqual([1000, 1100]);
    expect([...connections.arrivalTime]).toEqual([1100, 1200]);
    expect([...connections.board]).toEqual([0, 1]);
    expect([...connections.alight]).toEqual([1, 2]);
    expect(gtfs.stopTable.indexOf("NRW")).toBe(0);
    expect(gtfs.stopTable.indexOf("NRW1")).toBe(UNKNOWN_STOP);
    expect(gtfs.stations.get("NRW1")).toBe("NRW");
  });

  it("sorts the connections by arrival, keeping the order they were created in where they arrive together", () => {
    const gtfs = toGtfsData(feed({
      trips: [
        trip("1", [st("A", 1000), st("D", 1300)]),
        trip("2", [st("B", 1100), st("C", 1200)]),
        trip("3", [st("E", 1250), st("F", 1300)])
      ]
    }));

    expect(pairs(gtfs)).toEqual(["B-C", "A-D", "E-F"]);
    expect([...gtfs.connections.trip].map(t => gtfs.trips[t].tripId)).toEqual(["2", "1", "3"]);
  });

  it("carries on past a call that can only be alighted at until one that can be boarded", () => {
    const setDownOnly = { ...st("B", 1100), pickUp: false };
    const gtfs = toGtfsData(feed({ trips: [trip("1", [st("A", 1000), setDownOnly, st("C", 1200)])] }));

    expect(pairs(gtfs)).toEqual(["A-B", "A-C"]);
  });

  it("does not create a connection to or from a passing point", () => {
    const passing = { ...st("B", 1100), pickUp: false, dropOff: false };
    const gtfs = toGtfsData(feed({ trips: [trip("1", [st("A", 1000), passing, st("C", 1200)])] }));

    expect(pairs(gtfs)).toEqual(["A-C"]);
    expect([...gtfs.connections.alight]).toEqual([1]);
  });

  it("does not create a connection between two platforms of one station", () => {
    const gtfs = toGtfsData(feed({
      stops: platforms,
      trips: [trip("1", [st("NRW1", 1000), st("NRW2", 1005), st("LST8", 1200)])]
    }));

    expect(pairs(gtfs)).toEqual(["NRW-LST"]);
  });

  it("adds the trip a passenger stays on across a coupling", () => {
    const gtfs = toGtfsData(feed({
      stops: platforms,
      trips: [trip("front", [st("NRW1", 1000), st("DIS2", 1100)]), trip("rear", [st("DIS1", 1130), st("LST8", 1230)])],
      links: [{ fromTripId: "front", toTripId: "rear", fromStop: "DIS2", toStop: "DIS1" }]
    }));
    const { connections, trips } = gtfs;

    expect(pairs(gtfs).map((pair, c) => `${trips[connections.trip[c]].tripId}:${pair}`)).toEqual([
      "front:NRW-DIS",
      "front_rear:NRW-DIS",
      "rear:DIS-LST",
      "front_rear:DIS-LST"
    ]);
  });

  it("indexes footpaths by the origin station and drops those within one", () => {
    const gtfs = toGtfsData(feed({
      stops: platforms,
      trips: [trip("1", [st("NRW1", 1000), st("DIS2", 1100)])],
      transfers: byOrigin(walk("NRW1", "NRW2", 300), walk("NRW1", "DIS2", 600), walk("DIS1", "IPS1", 900))
    }));
    const { offsets, destination, duration, transfer } = gtfs.transfers;
    const from = (code: string) => {
      const s = gtfs.stopTable.indexOf(code);

      return Array.from({ length: offsets[s + 1] - offsets[s] }, (_, i) => offsets[s] + i);
    };

    expect(from("NRW").map(i => [gtfs.stopTable.nameOf(destination[i]), duration[i]])).toEqual([["DIS", 600]]);
    expect(from("DIS").map(i => transfer[i].destination)).toEqual(["IPS"]);
    expect(from("IPS")).toEqual([]);
  });

  it("reports interchange time against the station, and none where the feed gives none", () => {
    const gtfs = toGtfsData(feed({
      stops: platforms,
      trips: [trip("1", [st("NRW1", 1000), st("DIS2", 1100)])],
      interchange: { NRW1: 300 }
    }));

    expect(gtfs.interchange[gtfs.stopTable.indexOf("NRW")]).toBe(300);
    expect(gtfs.interchange[gtfs.stopTable.indexOf("DIS")]).toBe(0);
  });

  it("knows which trips run on a date, asking each calendar once", () => {
    let asked = 0;
    const counting = { runsOn: () => { asked++; return true; }, dayEarlier: () => counting };
    const septemberOnly = new Service(20260901, 20260907, allDays, {});
    const gtfs = toGtfsData(feed({
      trips: [
        trip("1", [st("A", 1000), st("B", 1100)], counting),
        trip("2", [st("B", 1200), st("C", 1300)], counting),
        trip("3", [st("C", 1400), st("D", 1500)], septemberOnly),
        trip("4", [st("D", 1600), st("E", 1700)], everyDay)
      ]
    }));

    expect([...gtfs.calendar.runningOn(20260908, 2)]).toEqual([1, 1, 0, 1]);
    expect([...gtfs.calendar.runningOn(20260908, 2)]).toEqual([1, 1, 0, 1]);
    expect(asked).toBe(1);
    expect([...gtfs.calendar.runningOn(20260905, 6)]).toEqual([1, 1, 1, 1]);
  });

});
