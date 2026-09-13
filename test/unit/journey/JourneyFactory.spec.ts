import { describe, expect, it } from "vitest";
import type { TimetableLeg } from "../../../src/journey/Journey.js";
import { JourneyFactory } from "../../../src/journey/JourneyFactory.js";
import { byOrigin, connection, gtfsOf, legsOf, platforms, resultsFor, st, transfer, trip, walk } from "../util.js";

describe("JourneyFactory", () => {

  it("creates a journey from a connection index", () => {
    const gtfs = gtfsOf({ trips: [trip("1", [st("A", 1000), st("B", 1030)])] });
    const results = resultsFor(gtfs, { A: 1000 });

    results.setConnection(connection(gtfs, "1", "A", "B"));

    const [journey] = new JourneyFactory(gtfs).getJourneys(results.getConnectionIndex(), ["B"]);

    expect(journey.origin).toBe("A");
    expect(journey.destination).toBe("B");
    expect(journey.departureTime).toBe(1000);
    expect(journey.arrivalTime).toBe(1030);
  });

  it("returns no journey to a destination that was not reached or the feed does not have", () => {
    const gtfs = gtfsOf({ trips: [trip("1", [st("A", 1000), st("B", 1030)])] });
    const results = resultsFor(gtfs, { A: 1000 });

    expect(new JourneyFactory(gtfs).getJourneys(results.getConnectionIndex(), ["B", "Z"])).toEqual([]);
  });

  it("calculates the departure time", () => {
    const gtfs = gtfsOf({
      trips: [trip("1", [st("B", 1100), st("C", 1130)])],
      transfers: byOrigin(walk("A", "B", 60))
    });
    const results = resultsFor(gtfs, { A: 1000 });

    results.setTransfer(transfer(gtfs, "A", "B"));
    results.setConnection(connection(gtfs, "1", "B", "C"));

    const [journey] = new JourneyFactory(gtfs).getJourneys(results.getConnectionIndex(), ["C"]);

    expect(legsOf(journey)).toEqual(["walk:A-B", "1:B-C"]);
    expect(journey.departureTime).toBe(1040);
    expect(journey.arrivalTime).toBe(1130);
  });

  it("calculates the arrival time", () => {
    const gtfs = gtfsOf({
      trips: [trip("1", [st("B", 1100), st("C", 1130)])],
      transfers: byOrigin(walk("A", "B", 60), walk("C", "D", 60))
    });
    const results = resultsFor(gtfs, { A: 1000 });

    results.setTransfer(transfer(gtfs, "A", "B"));
    results.setConnection(connection(gtfs, "1", "B", "C"));
    results.setTransfer(transfer(gtfs, "C", "D"));

    const [journey] = new JourneyFactory(gtfs).getJourneys(results.getConnectionIndex(), ["D"]);

    expect(legsOf(journey)).toEqual(["walk:A-B", "1:B-C", "walk:C-D"]);
    expect(journey.departureTime).toBe(1040);
    expect(journey.arrivalTime).toBe(1190);
  });

  it("removes pointless legs", () => {
    const calls = [st("A", 1000), st("B", 1010), st("C", 1020), st("D", 1030), st("E", 1040)];
    const gtfs = gtfsOf({
      trips: [trip("LN1111", calls), trip("LN1112", calls), trip("LN1113", calls), trip("LN1114", calls)]
    });
    const results = resultsFor(gtfs, { A: 1000 });

    results.setConnection(connection(gtfs, "LN1111", "A", "B"));
    results.setConnection(connection(gtfs, "LN1112", "B", "C"));
    results.setConnection(connection(gtfs, "LN1113", "C", "D"));
    results.setConnection(connection(gtfs, "LN1114", "D", "E"));

    const [journey] = new JourneyFactory(gtfs).getJourneys(results.getConnectionIndex(), ["E"]);

    expect(legsOf(journey)).toEqual(["LN1114:A-E"]);
    expect(journey.departureTime).toBe(1000);
    expect(journey.arrivalTime).toBe(1040);
  });

  it("names the platforms a leg uses and leaves out the points it passes through", () => {
    const passing = { ...st("DIS2", 1100), pickUp: false, dropOff: false };
    const gtfs = gtfsOf({ stops: platforms, trips: [trip("1", [st("NRW1", 1000), passing, st("LST8", 1200)])] });
    const results = resultsFor(gtfs, { NRW: 900 });

    results.setConnection(connection(gtfs, "1", "NRW", "LST"));

    const [journey] = new JourneyFactory(gtfs).getJourneys(results.getConnectionIndex(), ["LST"]);
    const leg = journey.legs[0] as TimetableLeg;

    expect(leg.origin).toBe("NRW");
    expect(leg.destination).toBe("LST");
    expect(leg.stopTimes.map(s => s.stop)).toEqual(["NRW1", "LST8"]);
  });

});
