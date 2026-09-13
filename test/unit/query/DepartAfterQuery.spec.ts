import { type GTFSFeed, Service, type ServiceCalendar } from "@gb-transit/gtfs-loader";
import { describe, expect, it } from "vitest";
import type { TimetableLeg } from "../../../src/journey/Journey.js";
import type { DepartAfterQuery } from "../../../src/query/DepartAfterQuery.js";
import { allDays, gtfsOf, platforms, queryOver, st, trip, TUESDAY } from "../util.js";

function query(overrides: Partial<GTFSFeed>): DepartAfterQuery {
  return queryOver(gtfsOf({ stops: platforms, ...overrides }));
}

function tripsOf(legs: unknown[]): string[] {
  return (legs as TimetableLeg[]).map(leg => leg.trip.tripId);
}

describe("DepartAfterQuery", () => {

  const front = trip("front", [st("NRW1", 1000), st("DIS2", 1100)]);
  const rear = trip("rear", [st("DIS1", 1130), st("LST8", 1230)]);
  const coupling = { fromTripId: "front", toTripId: "rear", fromStop: "DIS2", toStop: "DIS1" };

  it("plans between stations and returns the platforms used", () => {
    const [journey] = query({ trips: [front] }).plan(["NRW"], ["DIS"], TUESDAY, 900);
    const [leg] = journey.legs as TimetableLeg[];

    expect(journey.origin).toBe("NRW");
    expect(journey.destination).toBe("DIS");
    expect(leg.stopTimes.map(s => s.stop)).toEqual(["NRW1", "DIS2"]);
  });

  it("stays aboard across a coupling rather than changing where there is time to", () => {
    const journeys = query({ trips: [front, rear], links: [coupling], interchange: { DIS: 10 } })
      .plan(["NRW"], ["LST"], TUESDAY, 900);

    expect(journeys.length).toBe(1);
    expect(tripsOf(journeys[0].legs)).toEqual(["front_rear"]);
    expect(journeys[0].departureTime).toBe(1000);
    expect(journeys[0].arrivalTime).toBe(1230);
  });

  it("stays aboard across a coupling that is shorter than the interchange time", () => {
    const journeys = query({ trips: [front, rear], links: [coupling], interchange: { DIS: 3600 } })
      .plan(["NRW"], ["LST"], TUESDAY, 900);

    expect(journeys.length).toBe(1);
    expect(tripsOf(journeys[0].legs)).toEqual(["front_rear"]);
  });

  it("stays aboard the portion that goes where the passenger is going after a split", () => {
    const toIpswich = trip("ips", [st("DIS1", 1130), st("IPS1", 1200)]);
    const journeys = query({
      trips: [front, rear, toIpswich],
      links: [coupling, { fromTripId: "front", toTripId: "ips", fromStop: "DIS2", toStop: "DIS1" }],
      interchange: { DIS: 10 }
    }).plan(["NRW"], ["IPS"], TUESDAY, 900);

    expect(journeys.length).toBe(1);
    expect(tripsOf(journeys[0].legs)).toEqual(["front_ips"]);
  });

  it("stays aboard a portion that leaves after midnight on the next service day", () => {
    const tuesdayOnly = new Service(20260908, 20260908, allDays, {});
    const wednesdayOnly = new Service(20260909, 20260909, allDays, {});
    const late = trip("late", [st("NRW1", 84000), st("DIS2", 85800)], tuesdayOnly);
    const afterMidnight = trip("after", [st("DIS1", 600), st("LST8", 4200)], wednesdayOnly);

    const journeys = query({
      trips: [late, afterMidnight],
      links: [{ fromTripId: "late", toTripId: "after", fromStop: "DIS2", toStop: "DIS1" }],
      interchange: { DIS: 3600 }
    }).plan(["NRW"], ["LST"], TUESDAY, 80000);

    expect(journeys.length).toBe(1);
    expect(tripsOf(journeys[0].legs)).toEqual(["late_after"]);
    expect(journeys[0].arrivalTime).toBe(86400 + 4200);
  });

  it("asks the calendar for the local date when the UTC date is a day behind", () => {
    const days: [number, number][] = [];

    // 00:30 on Tuesday 8 September in London is still Monday 7 September in UTC
    inTimezone("Europe/London", () => recording(days).plan(["NRW"], ["DIS"], new Date("2026-09-08T00:30:00+01:00"), 900));

    expect(days).toEqual([[20260908, 2]]);
  });

  it("asks the calendar for the local date when the UTC date is a day ahead", () => {
    const days: [number, number][] = [];

    // 20:00 on Tuesday 8 September in New York is already Wednesday 9 September in UTC
    inTimezone("America/New_York", () => recording(days).plan(["NRW"], ["DIS"], new Date("2026-09-08T20:00:00-04:00"), 900));

    expect(days).toEqual([[20260908, 2]]);
  });

});

/**
 * A query over a single trip, whose calendar records the day it is asked about.
 */
function recording(days: [number, number][]): DepartAfterQuery {
  const calendar: ServiceCalendar = {
    runsOn: (date, dow) => {
      days.push([date, dow]);

      return true;
    },
    dayEarlier: () => calendar
  };

  return query({ trips: [trip("1", [st("NRW1", 1000), st("DIS2", 1100)], calendar)] });
}

/**
 * Run with the machine clock in the given zone so that the local and UTC dates differ predictably,
 * whatever zone the machine running the test is in.
 */
function inTimezone(timezone: string, fn: () => unknown): void {
  const original = process.env.TZ;
  process.env.TZ = timezone;

  try {
    fn();
  }
  finally {
    if (original === undefined) {
      delete process.env.TZ;
    }
    else {
      process.env.TZ = original;
    }
  }
}
