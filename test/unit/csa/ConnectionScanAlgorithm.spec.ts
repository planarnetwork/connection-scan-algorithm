import { Service } from "@gb-transit/gtfs-loader";
import { describe, expect, it } from "vitest";
import { ConnectionScanAlgorithm } from "../../../src/csa/ConnectionScanAlgorithm.js";
import { createTimetable, NOT_REACHED } from "../../../src/timetable/Timetable.js";
import { allDays, byOrigin, feed, legsOf, pickUpOnly, plan, st, trip, walk } from "../util.js";

describe("ConnectionScanAlgorithm", () => {

  it("plans a basic journey", () => {
    const [journey] = plan({
      trips: [trip("1", [st("A", 1000), st("B", 1015), st("C", 1045), st("D", 1115)])]
    }, ["A"], ["D"], 900);

    expect(journey.origin).toBe("A");
    expect(journey.destination).toBe("D");
    expect(legsOf(journey)).toEqual(["1:A-D"]);
    expect(journey.departureTime).toBe(1000);
    expect(journey.arrivalTime).toBe(1115);
  });

  it("returns no results when there is no connection", () => {
    expect(plan({
      trips: [trip("1", [st("A", 1000), st("B", 1015)]), trip("2", [st("C", 1100), st("D", 1115)])]
    }, ["A"], ["D"], 900)).toEqual([]);
  });

  it("returns no results when there is a missed connection", () => {
    expect(plan({
      trips: [trip("1", [st("A", 1000), st("B", 1015)]), trip("2", [st("B", 1000), st("D", 1030)])]
    }, ["A"], ["D"], 900)).toEqual([]);
  });

  it("returns no results for an origin or destination the feed does not have", () => {
    const trips = [trip("1", [st("A", 1000), st("B", 1015)])];

    expect(plan({ trips }, ["Z"], ["B"], 900)).toEqual([]);
    expect(plan({ trips }, ["A"], ["Y"], 900)).toEqual([]);
  });

  it("does not board a trip that does not run on the date", () => {
    const septemberOnly = new Service(20260901, 20260907, allDays, {});

    expect(plan({ trips: [trip("1", [st("A", 1000), st("B", 1015)], septemberOnly)] }, ["A"], ["B"], 900)).toEqual([]);
  });

  it("plans a journey that starts with a footpath", () => {
    const [journey] = plan({
      trips: [trip("1", [st("B", 1020), st("C", 1045), st("D", 1115)])],
      transfers: byOrigin(walk("A", "B", 10))
    }, ["A"], ["D"], 900);

    expect(legsOf(journey)).toEqual(["walk:A-B", "1:B-D"]);
    expect(journey.departureTime).toBe(1010);
    expect(journey.arrivalTime).toBe(1115);
  });

  it("plans a journey that ends with a footpath", () => {
    const [journey] = plan({
      trips: [trip("1", [st("A", 1000), st("B", 1015), st("C", 1045)])],
      transfers: byOrigin(walk("C", "D", 10))
    }, ["A"], ["D"], 900);

    expect(legsOf(journey)).toEqual(["1:A-C", "walk:C-D"]);
    expect(journey.departureTime).toBe(1000);
    expect(journey.arrivalTime).toBe(1055);
  });

  it("walks on from a station reached on foot again once a train reaches it sooner", () => {
    const [journey] = plan({
      trips: [trip("1", [st("A", 1000), st("B", 1100)]), trip("2", [st("C", 1200), st("D", 1300)])],
      transfers: byOrigin(walk("A", "B", 1000), walk("B", "C", 60))
    }, ["A"], ["D"], 900);

    expect(legsOf(journey)).toEqual(["1:A-B", "walk:B-C", "2:C-D"]);
    expect(journey.arrivalTime).toBe(1300);
  });

  it("does not change where there is less than the interchange time", () => {
    const trips = [trip("1", [st("A", 1000), st("B", 1015)]), trip("2", [st("B", 1030), st("C", 1100)])];

    expect(plan({ trips, interchange: { B: 100 } }, ["A"], ["C"], 900)).toEqual([]);
  });

  it("changes in no time at a station with no interchange time", () => {
    const [journey] = plan({
      trips: [trip("1", [st("A", 1000), st("B", 1015)]), trip("2", [st("B", 1015), st("C", 1100)])]
    }, ["A"], ["C"], 900);

    expect(legsOf(journey)).toEqual(["1:A-B", "2:B-C"]);
  });

  it("charges the interchange time at both ends of a footpath", () => {
    const trips = (departs: number) => [
      trip("1", [st("A", 1000), st("B", 1015)]),
      trip("2", [st("C", departs), st("D", 1700)])
    ];
    const overrides = { interchange: { B: 300, C: 200 }, transfers: byOrigin(walk("B", "C", 60)) };

    expect(plan({ ...overrides, trips: trips(1574) }, ["A"], ["D"], 900)).toEqual([]);
    expect(plan({ ...overrides, trips: trips(1575) }, ["A"], ["D"], 900).length).toBe(1);
  });

  /**
   * Two trips run in parallel. Trip 1 arrives earliest at B and C and trip 2 earliest at D. Changing
   * onto trip 2 at C is ruled out by the interchange time, but it could have been boarded at A, so the
   * scan reaches D on it. The connections found are trip 1 to C and trip 2 from C, and the journey is
   * tidied up by realising the whole of it can be made on trip 2.
   */
  it("checks for connections missed because of interchange time", () => {
    const [journey] = plan({
      trips: [
        trip("1", [st("A", 1000), st("B", 1010), st("C", 1020), st("D", 1040)]),
        trip("2", [st("A", 1005), st("B", 1015), st("C", 1025), st("D", 1035)])
      ],
      interchange: { A: 10, B: 10, C: 10, D: 10 }
    }, ["A"], ["D"], 900);

    expect(legsOf(journey)).toEqual(["2:A-D"]);
    expect(journey.departureTime).toBe(1005);
    expect(journey.arrivalTime).toBe(1035);
  });

  /**
   * Trips 1 and 2 run the same calls, both only picking up at A and B. Trip 3 reaches B before they
   * leave it, but not in time to change. Being aboard trip 2 from A does not make its connection from
   * B one the passenger can take, since trip 2 never carried them to B, only through it.
   */
  it("does not count a passenger aboard at a call the trip only picks up at", () => {
    const calls = [pickUpOnly("A", 1000), pickUpOnly("B", 1060), st("C", 2000)];
    const [journey] = plan({
      trips: [trip("1", calls), trip("2", calls), trip("3", [st("A", 1005), st("B", 1050)])],
      interchange: { B: 300 }
    }, ["A"], ["C"], 900);

    expect(legsOf(journey)).toEqual(["1:A-C"]);
  });

  /**
   * Trip 1 carries the passenger to C and on to D. Trip 2 leaves C for D at the same time, and is
   * scanned first, so it reaches D first. Trip 3 hops between two other stations in no time at the
   * moment both arrive, between the two in the scan, and must not end it before trip 1 is preferred.
   */
  it("keeps scanning for a trip to stay aboard past a connection that takes no time", () => {
    const [journey] = plan({
      trips: [
        trip("2", [st("C", 1000), st("D", 1060)]),
        trip("3", [st("E", 1060), st("F", 1060)]),
        trip("1", [st("A", 900), st("C", 1000), st("D", 1060)])
      ]
    }, ["A"], ["D"], 800);

    expect(legsOf(journey)).toEqual(["1:A-D"]);
  });

  it("gives each scan results of its own", () => {
    const timetable = createTimetable(feed({ trips: [trip("1", [st("A", 1000), st("B", 1100), st("C", 1200)])] }));
    const [a, b, c] = ["A", "B", "C"].map(code => timetable.stationIndex.get(code)!);
    const csa = new ConnectionScanAlgorithm(timetable);

    const fromA = csa.scan(new Map([[a, 900]]), [c], 20260908, 2);
    const fromB = csa.scan(new Map([[b, 900]]), [c], 20260908, 2);

    expect(fromA.earliestArrivals[b]).toBe(1100);
    expect(fromB.earliestArrivals[a]).toBe(NOT_REACHED);
    expect(fromB.earliestArrivals[c]).toBe(1200);
  });

});
