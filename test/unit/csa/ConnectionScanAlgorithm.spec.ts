import { describe, expect, it } from "vitest";
import { ConnectionScanAlgorithm } from "../../../src/csa/ConnectionScanAlgorithm.js";
import { ScanResultsFactory } from "../../../src/csa/ScanResultsFactory.js";
import { JourneyFactory } from "../../../src/journey/JourneyFactory.js";
import { c, defaultInterchange, setStopTimes } from "../util.js";

describe("ConnectionScanAlgorithm", () => {
  const scanResultsFactory = new ScanResultsFactory(defaultInterchange);
  const journeyResultsFactory = new JourneyFactory(new Map());
  const noTransfers = { A: [], B: [], C: [], D: [] };

  it("plan a basic journey", () => {
    const timetable = [
      c("A", "B", 1000, 1015),
      c("B", "C", 1020, 1045),
      c("C", "D", 1100, 1115),
    ];

    setStopTimes(timetable);

    const scanner = new ConnectionScanAlgorithm(timetable, noTransfers, scanResultsFactory);
    const results = scanner.scan({ A: 900 }, ["D"], 20190101, 0);
    const [journey] = journeyResultsFactory.getJourneys(results, ["D"]);

    expect(journey.origin).toBe("A");
    expect(journey.destination).toBe("D");
    expect(journey.legs.length).toBe(1);
    expect(journey.departureTime).toBe(1000);
    expect(journey.arrivalTime).toBe(1115);
  });

  it("returns no results when there is no connection", () => {
    const timetable = [
      c("A", "B", 1000, 1015),
      c("C", "D", 1100, 1115),
    ];

    setStopTimes(timetable);

    const scanner = new ConnectionScanAlgorithm(timetable, noTransfers, scanResultsFactory);
    const results = scanner.scan({ A: 900 }, ["D"], 20190101, 0);

    expect(journeyResultsFactory.getJourneys(results, ["D"])).toEqual([]);
  });

  it("returns no results when there is a missed connection", () => {
    const timetable = [
      c("A", "B", 1000, 1015),
      c("B", "C", 1000, 1030),
      c("C", "D", 1100, 1115),
    ];

    setStopTimes(timetable);

    const scanner = new ConnectionScanAlgorithm(timetable, noTransfers, scanResultsFactory);
    const results = scanner.scan({ A: 900 }, ["D"], 20190101, 0);

    expect(journeyResultsFactory.getJourneys(results, ["D"])).toEqual([]);
  });

  it("returns no results for an origin or destination the feed does not have", () => {
    const timetable = [
      c("A", "B", 1000, 1015),
    ];

    setStopTimes(timetable);

    const scanner = new ConnectionScanAlgorithm(timetable, {}, scanResultsFactory);
    const results = scanner.scan({ Z: 900 }, ["Y"], 20190101, 0);

    expect(journeyResultsFactory.getJourneys(results, ["Y"])).toEqual([]);
  });

  it("plan a journey that starts with a transfer", () => {
    const timetable = [
      c("B", "C", 1020, 1045),
      c("C", "D", 1100, 1115),
    ];

    setStopTimes(timetable);

    const transfers = {
      ...noTransfers,
      A: [
        { origin: "A", destination: "B", duration: 10, startTime: 0, endTime: Number.MAX_SAFE_INTEGER },
      ]
    };

    const scanner = new ConnectionScanAlgorithm(timetable, transfers, scanResultsFactory);
    const results = scanner.scan({ A: 900 }, ["D"], 20190101, 0);
    const [journey] = journeyResultsFactory.getJourneys(results, ["D"]);

    expect(journey.origin).toBe("A");
    expect(journey.destination).toBe("D");
    expect(journey.legs.length).toBe(2);
    expect(journey.departureTime).toBe(1010);
    expect(journey.arrivalTime).toBe(1115);
  });

  it("plan a journey that ends with a transfer", () => {
    const timetable = [
      c("A", "B", 1000, 1015),
      c("B", "C", 1020, 1045),
    ];

    setStopTimes(timetable);

    const transfers = {
      ...noTransfers,
      C: [
        { origin: "C", destination: "D", duration: 10, startTime: 0, endTime: Number.MAX_SAFE_INTEGER },
      ]
    };

    const scanner = new ConnectionScanAlgorithm(timetable, transfers, scanResultsFactory);
    const results = scanner.scan({ A: 900 }, ["D"], 20190101, 0);
    const [journey] = journeyResultsFactory.getJourneys(results, ["D"]);

    expect(journey.origin).toBe("A");
    expect(journey.destination).toBe("D");
    expect(journey.legs.length).toBe(2);
    expect(journey.departureTime).toBe(1000);
    expect(journey.arrivalTime).toBe(1055);
  });

  it("walks on from a station reached on foot again once a train reaches it sooner", () => {
    const aToB = [c("A", "B", 1000, 1100, "1")];
    const cToD = [c("C", "D", 1200, 1300, "2")];

    setStopTimes(aToB);
    setStopTimes(cToD);

    const transfers = {
      A: [{ origin: "A", destination: "B", duration: 1000, startTime: 0, endTime: Number.MAX_SAFE_INTEGER }],
      B: [{ origin: "B", destination: "C", duration: 60, startTime: 0, endTime: Number.MAX_SAFE_INTEGER }]
    };

    const scanner = new ConnectionScanAlgorithm([...aToB, ...cToD], transfers, new ScanResultsFactory({}));
    const results = scanner.scan({ A: 900 }, ["D"], 20190101, 0);
    const [journey] = journeyResultsFactory.getJourneys(results, ["D"]);

    expect(journey.legs.map(l => `${l.origin}-${l.destination}`)).toEqual(["A-B", "B-C", "C-D"]);
    expect(journey.arrivalTime).toBe(1300);
  });

  /**
   * In this scenario there are two trips running in parallel. Trip 1 arrives earliest at A, B and C and Trip 2 arrives
   * earliest at D. It is not possible to change onto the second trip at C because of the interchange change, however
   * the algorithm should detect that it was possible to board at A and add the connection. The list of connections
   * will be incorrect as it will use trip 1 for A->B, B->C and then trip 2 for C->D. The results factory tidies this
   * up by realising that the whole journey could be made on a single trip (trip 2).
   */
  it("checks for connections missed because of interchange time", () => {
    const trip1 = [
      c("A", "B", 1000, 1010, "1"),
      c("B", "C", 1010, 1020, "1"),
      c("C", "D", 1020, 1040, "1"),
    ];

    setStopTimes(trip1);

    const trip2 = [
      c("A", "B", 1005, 1015, "2"),
      c("B", "C", 1015, 1025, "2"),
      c("C", "D", 1025, 1035, "2"),
    ];

    setStopTimes(trip2);

    const timetable = [...trip1, ...trip2].sort((a, b) => a.arrivalTime - b.arrivalTime);

    const resultsFactory = new ScanResultsFactory({ A: 10, B: 10, C: 10, D: 10 });
    const scanner = new ConnectionScanAlgorithm(timetable, noTransfers, resultsFactory);
    const results = scanner.scan({ A: 900 }, ["D"], 20200101, 0);
    const [journey] = journeyResultsFactory.getJourneys(results, ["D"]);

    expect(journey.origin).toBe("A");
    expect(journey.destination).toBe("D");
    expect(journey.legs.length).toBe(1);
    expect(journey.departureTime).toBe(1005);
    expect(journey.arrivalTime).toBe(1035);
  });

});
