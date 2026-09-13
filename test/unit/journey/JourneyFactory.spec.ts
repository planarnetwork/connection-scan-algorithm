import { describe, expect, it } from "vitest";
import { ScanResults } from "../../../src/csa/ScanResults.js";
import { JourneyFactory } from "../../../src/journey/JourneyFactory.js";
import type { TimetableLeg } from "../../../src/journey/Journey.js";
import { c, setStopTimes, st, t } from "../util.js";

describe("JourneyFactory", () => {
  const factory = new JourneyFactory(new Map());

  it("creates a journey from a connection index", () => {
    const results = new ScanResults({ A: 1000 }, {});
    const connections = [
      c("A", "B", 1000, 1030)
    ];

    setStopTimes(connections);

    for (const connection of connections) {
      results.setConnection(connection);
    }

    const [journey] = factory.getJourneys(results.getConnectionIndex(), ["B"]);

    expect(journey.origin).toBe("A");
    expect(journey.destination).toBe("B");
    expect(journey.departureTime).toBe(1000);
    expect(journey.arrivalTime).toBe(1030);
  });

  it("calculates the departure time", () => {
    const results = new ScanResults({ A: 1000 }, {});
    const connections = [
      c("B", "C", 1100, 1130)
    ];

    setStopTimes(connections);
    results.setTransfer(t("A", "B", 60));

    for (const connection of connections) {
      results.setConnection(connection);
    }

    const [journey] = factory.getJourneys(results.getConnectionIndex(), ["C"]);

    expect(journey.origin).toBe("A");
    expect(journey.destination).toBe("C");
    expect(journey.departureTime).toBe(1040);
    expect(journey.arrivalTime).toBe(1130);
  });

  it("calculates the arrival time", () => {
    const results = new ScanResults({ A: 1000 }, {});
    const connections = [
      c("B", "C", 1100, 1130)
    ];

    setStopTimes(connections);
    results.setTransfer(t("A", "B", 60));
    results.setTransfer(t("C", "D", 60));

    for (const connection of connections) {
      results.setConnection(connection);
    }

    const [journey] = factory.getJourneys(results.getConnectionIndex(), ["D"]);

    expect(journey.origin).toBe("A");
    expect(journey.destination).toBe("D");
    expect(journey.departureTime).toBe(1040);
    expect(journey.arrivalTime).toBe(1190);
  });

  it("removes pointless legs", () => {
    const results = new ScanResults({ A: 1000 }, {});
    const connections = [
      c("A", "B", 1000, 1010, "LN1111"),
      c("B", "C", 1010, 1020, "LN1112"),
      c("C", "D", 1020, 1030, "LN1113"),
      c("D", "E", 1030, 1040, "LN1114")
    ];
    const stopTimes = [st("A", 1000), st("B", 1010), st("C", 1020), st("D", 1030), st("E", 1040)];

    for (const connection of connections) {
      connection.trip.stopTimes = stopTimes;
      results.setConnection(connection);
    }

    const [journey] = factory.getJourneys(results.getConnectionIndex(), ["E"]);

    expect(journey.origin).toBe("A");
    expect(journey.destination).toBe("E");
    expect(journey.departureTime).toBe(1000);
    expect(journey.arrivalTime).toBe(1040);
    expect(journey.legs.length).toBe(1);
  });

  it("cuts a leg from the trip by the station each platform belongs to, leaving out passing points", () => {
    const stations = new Map([["NRW1", "NRW"], ["DIS2", "DIS"], ["LST8", "LST"]]);
    const results = new ScanResults({}, { NRW: 900 });
    const connection = c("NRW", "LST", 1000, 1200);
    const passing = { ...st("DIS2", 1100), pickUp: false, dropOff: false };

    connection.trip.stopTimes = [st("NRW1", 1000), passing, st("LST8", 1200)];
    results.setConnection(connection);

    const [journey] = new JourneyFactory(stations).getJourneys(results.getConnectionIndex(), ["LST"]);
    const leg = journey.legs[0] as TimetableLeg;

    expect(leg.origin).toBe("NRW");
    expect(leg.destination).toBe("LST");
    expect(leg.stopTimes.map(s => s.stop)).toEqual(["NRW1", "LST8"]);
  });

});
