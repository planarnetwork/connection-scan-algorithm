import type { Trip } from "@gb-transit/gtfs-loader";
import { describe, expect, it } from "vitest";
import { toGtfsData } from "../../../src/gtfs/GtfsLoader.js";
import { everyDay, feed, st } from "../util.js";

function trip(tripId: string, ...stopTimes: Trip["stopTimes"]): Trip {
  return { tripId, serviceId: "1", service: everyDay, stopTimes };
}

function pairs(trips: Trip[], links = feed().links) {
  return toGtfsData(feed({ trips, links })).connections.map(c => `${c.origin}-${c.destination}`);
}

describe("toGtfsData", () => {

  it("creates connections between the stations the platforms belong to", () => {
    const gtfs = toGtfsData(feed({
      trips: [trip("1", st("NRW1", 1000), st("DIS2", 1100), st("LST8", 1200))]
    }));

    expect(gtfs.connections.map(c => [c.origin, c.destination, c.departureTime, c.arrivalTime])).toEqual([
      ["NRW", "DIS", 1000, 1100],
      ["DIS", "LST", 1100, 1200]
    ]);
    expect(gtfs.stations.get("NRW1")).toBe("NRW");
  });

  it("sorts the connections by arrival time", () => {
    const gtfs = toGtfsData(feed({
      trips: [
        trip("1", st("NRW1", 1000), st("LST8", 1300)),
        trip("2", st("DIS2", 1100), st("IPS1", 1200))
      ]
    }));

    expect(gtfs.connections.map(c => c.arrivalTime)).toEqual([1200, 1300]);
  });

  it("carries on past a call that can only be alighted at until one that can be boarded", () => {
    const setDownOnly = { ...st("DIS2", 1100), pickUp: false };

    expect(pairs([trip("1", st("NRW1", 1000), setDownOnly, st("LST8", 1200))])).toEqual(["NRW-DIS", "NRW-LST"]);
  });

  it("does not create a connection to or from a passing point", () => {
    const passing = { ...st("DIS2", 1100), pickUp: false, dropOff: false };

    expect(pairs([trip("1", st("NRW1", 1000), passing, st("LST8", 1200))])).toEqual(["NRW-LST"]);
  });

  it("does not create a connection between two platforms of one station", () => {
    expect(pairs([trip("1", st("NRW1", 1000), st("NRW2", 1005), st("LST8", 1200))])).toEqual(["NRW-LST"]);
  });

  it("adds the trip a passenger stays on across a coupling", () => {
    const connections = toGtfsData(feed({
      trips: [trip("front", st("NRW1", 1000), st("DIS2", 1100)), trip("rear", st("DIS1", 1130), st("LST8", 1230))],
      links: [{ fromTripId: "front", toTripId: "rear", fromStop: "DIS2", toStop: "DIS1" }]
    })).connections;

    expect(connections.map(c => `${c.trip.tripId}:${c.origin}-${c.destination}`)).toEqual([
      "front:NRW-DIS",
      "front_rear:NRW-DIS",
      "rear:DIS-LST",
      "front_rear:DIS-LST"
    ]);
  });

  it("indexes footpaths by the origin station and drops those within one", () => {
    const gtfs = toGtfsData(feed({
      transfers: {
        NRW1: [
          { origin: "NRW1", destination: "NRW2", duration: 300, startTime: 0, endTime: Number.MAX_SAFE_INTEGER },
          { origin: "NRW1", destination: "DIS2", duration: 600, startTime: 0, endTime: Number.MAX_SAFE_INTEGER }
        ]
      }
    }));

    expect(gtfs.transfers.NRW.map(t => [t.destination, t.duration])).toEqual([["DIS", 600]]);
  });

  it("reports interchange time against the station", () => {
    const gtfs = toGtfsData(feed({ interchange: { NRW1: 300 } }));

    expect(gtfs.interchange.NRW).toBe(300);
  });

});
