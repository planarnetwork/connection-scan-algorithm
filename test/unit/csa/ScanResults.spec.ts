import { describe, expect, it } from "vitest";
import { ScanResults } from "../../../src/csa/ScanResults.js";
import { ScanResultsFactory } from "../../../src/csa/ScanResultsFactory.js";
import { transferConnection } from "../../../src/journey/Connection.js";
import { byOrigin, connection, gtfsOf, labelOf, pickUpOnly, resultsFor, st, take, transfer, trip, walk } from "../util.js";

describe("ScanResults", () => {
  const gtfs = gtfsOf({
    trips: [
      trip("LN1111", [st("A", 1000), st("B", 1015)]),
      trip("LN1112", [st("A", 1000), st("B", 1010)]),
      trip("LN1113", [st("A", 1000), st("B", 1030)]),
      trip("LN1114", [st("B", 1030), st("C", 1100)])
    ],
    transfers: byOrigin(walk("A", "B", 10), walk("A", "C", 1000), walk("B", "C", 10))
  });

  it("knows if a connection is reachable", () => {
    const results = resultsFor(gtfs, { A: 900 });

    expect(results.isReachable(connection(gtfs, "LN1111", "A", "B"))).toBe(true);
  });

  it("knows if a connection is not reachable", () => {
    const results = resultsFor(gtfs, { A: 1200 });

    expect(results.isReachable(connection(gtfs, "LN1111", "A", "B"))).toBe(false);
  });

  it("knows if a connection is not reachable because of interchange", () => {
    const withInterchange = gtfsOf({
      trips: [trip("LN1111", [st("A", 1000), st("B", 1015)]), trip("LN1112", [st("B", 1030), st("C", 1100)])],
      interchange: { B: 100 }
    });
    const results = resultsFor(withInterchange, { A: 900 });

    take(results, connection(withInterchange, "LN1111", "A", "B"));

    expect(results.isReachable(connection(withInterchange, "LN1112", "B", "C"))).toBe(false);
  });

  it("changes in no time at a station with no interchange time", () => {
    const results = resultsFor(gtfs, { A: 900 });

    take(results, connection(gtfs, "LN1111", "A", "B"));

    expect(results.isReachable(connection(gtfs, "LN1114", "B", "C"))).toBe(true);
  });

  it("knows if a connection is better", () => {
    const results = resultsFor(gtfs, { A: 900 });

    take(results, connection(gtfs, "LN1111", "A", "B"));

    expect(results.isReachable(connection(gtfs, "LN1112", "A", "B"))).toBe(true);
    expect(results.isBetter(connection(gtfs, "LN1112", "A", "B"))).toBe(true);
  });

  it("knows if a connection is not better", () => {
    const results = resultsFor(gtfs, { A: 900 });

    take(results, connection(gtfs, "LN1111", "A", "B"));

    expect(results.isReachable(connection(gtfs, "LN1113", "A", "B"))).toBe(true);
    expect(results.isBetter(connection(gtfs, "LN1113", "A", "B"))).toBe(false);
  });

  it("does not keep a station reached no sooner in more legs", () => {
    const longer = gtfsOf({
      trips: [
        trip("1", [st("A", 1000), st("B", 1010)]),
        trip("2", [st("A", 1000), st("X", 1002)]),
        trip("3", [st("X", 1003), st("B", 1010)]),
        trip("4", [st("X", 1003), st("B", 1020)])
      ]
    });
    const results = resultsFor(longer, { A: 900 });

    take(results, connection(longer, "1", "A", "B"));
    take(results, connection(longer, "2", "A", "X"));

    for (const c of [connection(longer, "3", "X", "B"), connection(longer, "4", "X", "B")]) {
      expect(results.isReachable(c)).toBe(true);
      expect(results.isBetter(c)).toBe(false);
    }
  });

  it("keeps a station reached later in fewer legs alongside the sooner arrival", () => {
    const direct = gtfsOf({
      trips: [
        trip("1", [st("A", 1000), st("X", 1005)]),
        trip("2", [st("X", 1006), st("B", 1010)]),
        trip("3", [st("A", 1000), st("B", 1030)])
      ]
    });
    const results = resultsFor(direct, { A: 900 });

    take(results, connection(direct, "1", "A", "X"));
    take(results, connection(direct, "2", "X", "B"));

    const slower = connection(direct, "3", "A", "B");

    expect(results.isReachable(slower)).toBe(true);
    expect(results.isBetter(slower)).toBe(true);
    expect(results.setConnection(slower)).toBe(1);
    expect(labelOf(results.getConnectionIndex(), direct, "B", 1)).toBe(slower);
    expect(labelOf(results.getConnectionIndex(), direct, "B", 2)).toBe(connection(direct, "2", "X", "B"));
  });

  it("prefers staying aboard to changing onto a trip arriving at the same time", () => {
    const coupled = gtfsOf({
      trips: [
        trip("front", [st("A", 1000), st("B", 1015)]),
        trip("rear", [st("B", 1030), st("C", 1100)]),
        trip("through", [st("A", 1000), st("B", 1015), st("C", 1100)])
      ],
      interchange: { B: 5 }
    });
    const results = resultsFor(coupled, { A: 900 });

    for (const c of [connection(coupled, "front", "A", "B"), connection(coupled, "through", "A", "B"), connection(coupled, "rear", "B", "C")]) {
      if (results.isReachable(c) && results.isBetter(c)) {
        results.setConnection(c);
      }
    }

    const throughToC = connection(coupled, "through", "B", "C");

    expect(results.isReachable(throughToC)).toBe(true);
    expect(results.isBetter(throughToC)).toBe(true);
  });

  it("does not replace a trip with another arriving at the same time that it would have to change onto", () => {
    const parallel = gtfsOf({
      trips: [
        trip("1", [st("A", 1000), st("B", 1015)]),
        trip("2", [st("B", 1030), st("C", 1100)]),
        trip("3", [st("B", 1030), st("C", 1100)])
      ],
      interchange: { B: 5 }
    });
    const results = resultsFor(parallel, { A: 900 });

    take(results, connection(parallel, "1", "A", "B"));
    take(results, connection(parallel, "2", "B", "C"));

    const alsoToC = connection(parallel, "3", "B", "C");

    expect(results.isReachable(alsoToC)).toBe(true);
    expect(results.isBetter(alsoToC)).toBe(false);
  });

  it("replaces a trip with another arriving at the same time in fewer legs", () => {
    const shorter = gtfsOf({
      trips: [
        trip("1", [st("A", 1000), st("B", 1010)]),
        trip("2", [st("B", 1020), st("C", 1100)]),
        trip("3", [st("A", 1000), st("C", 1100)])
      ]
    });
    const results = resultsFor(shorter, { A: 900 });

    take(results, connection(shorter, "1", "A", "B"));

    expect(results.isReachable(connection(shorter, "2", "B", "C"))).toBe(true);
    expect(results.setConnection(connection(shorter, "2", "B", "C"))).toBe(2);

    const direct = connection(shorter, "3", "A", "C");

    expect(results.isReachable(direct)).toBe(true);
    expect(results.isBetter(direct)).toBe(true);
    expect(results.setConnection(direct)).toBe(1);
  });

  it("knows a transfer arriving at the same time in fewer legs is better", () => {
    const walks = gtfsOf({
      trips: [trip("1", [st("A", 1000), st("B", 1010)]), trip("2", [st("B", 1020), st("C", 1100)])],
      transfers: byOrigin(walk("A", "C", 100))
    });
    const results = resultsFor(walks, { A: 1000 });

    take(results, connection(walks, "1", "A", "B"));
    take(results, connection(walks, "2", "B", "C"));

    expect(results.isTransferBetter(transfer(walks, "A", "C"), 0)).toBe(true);
  });

  it("does not count a passenger aboard at a call the trip only picks up at", () => {
    const pickUps = gtfsOf({ trips: [trip("1", [pickUpOnly("A", 1000), pickUpOnly("B", 1060), st("C", 2000)])] });
    const results = resultsFor(pickUps, { A: 900 });

    expect(results.isReachable(connection(pickUps, "1", "A", "C"))).toBe(true);
    expect(results.isReachable(connection(pickUps, "1", "B", "C"))).toBe(false);
  });

  it("knows if a transfer is better", () => {
    const results = resultsFor(gtfs, { A: 900 });

    take(results, connection(gtfs, "LN1111", "A", "B"));

    expect(results.isTransferBetter(transfer(gtfs, "A", "B"), 0)).toBe(true);
  });

  it("knows if a transfer is not better", () => {
    const results = resultsFor(gtfs, { A: 900 });

    results.setTransfer(transfer(gtfs, "A", "C"), 0);

    expect(results.isTransferBetter(transfer(gtfs, "A", "C"), 0)).toBe(false);

    results.setTransfer(transfer(gtfs, "A", "B"), 0);

    expect(results.isTransferBetter(transfer(gtfs, "B", "C"), 1)).toBe(true);

    results.setTransfer(transfer(gtfs, "B", "C"), 1);

    expect(results.isTransferBetter(transfer(gtfs, "B", "C"), 1)).toBe(false);
  });

  it("walks a transfer from each number of legs a station is reached in", () => {
    const results = resultsFor(gtfs, { A: 900 });

    results.setTransfer(transfer(gtfs, "A", "B"), 0);
    results.setTransfer(transfer(gtfs, "B", "C"), 1);

    expect(results.isTransferBetter(transfer(gtfs, "A", "C"), 0)).toBe(true);

    results.setTransfer(transfer(gtfs, "A", "C"), 0);

    expect(labelOf(results.getConnectionIndex(), gtfs, "C", 1)).toBe(transferConnection(transfer(gtfs, "A", "C")));
    expect(labelOf(results.getConnectionIndex(), gtfs, "C", 2)).toBe(transferConnection(transfer(gtfs, "B", "C")));
  });

  it("knows whether a station is still reached by a transfer", () => {
    const walks = gtfsOf({
      trips: [trip("1", [st("A", 1000), st("C", 1015)])],
      transfers: byOrigin(walk("A", "B", 10), walk("B", "C", 10))
    });
    const results = resultsFor(walks, { A: 1000 });

    results.setTransfer(transfer(walks, "A", "B"), 0);
    results.setTransfer(transfer(walks, "B", "C"), 1);

    expect(results.isReachedByTransfer(transfer(walks, "B", "C"), 1)).toBe(true);

    take(results, connection(walks, "1", "A", "C"));

    expect(results.isReachedByTransfer(transfer(walks, "B", "C"), 1)).toBe(false);
  });

  it("charges the interchange time at both ends of a transfer", () => {
    const walking = gtfsOf({
      trips: [trip("1", [st("A", 1000), st("B", 1015)]), trip("2", [st("C", 1574), st("D", 1700)]), trip("3", [st("C", 1575), st("D", 1700)])],
      transfers: byOrigin(walk("B", "C", 60)),
      interchange: { B: 300, C: 200 }
    });
    const results = resultsFor(walking, { A: 900 });

    take(results, connection(walking, "1", "A", "B"));
    results.setTransfer(transfer(walking, "B", "C"), 1);

    expect(results.isReachable(connection(walking, "2", "C", "D"))).toBe(false);
    expect(results.isReachable(connection(walking, "3", "C", "D"))).toBe(true);
  });

  it("returns the connection index", () => {
    const results = resultsFor(gtfs, { A: 900 });

    take(results, connection(gtfs, "LN1111", "A", "B"));
    results.setTransfer(transfer(gtfs, "B", "C"), 1);

    expect(labelOf(results.getConnectionIndex(), gtfs, "B", 1)).toBe(connection(gtfs, "LN1111", "A", "B"));
    expect(labelOf(results.getConnectionIndex(), gtfs, "C", 2)).toBe(transferConnection(transfer(gtfs, "B", "C")));
  });

  it("indexes a station by the connection its trip was boarded from", () => {
    const through = gtfsOf({ trips: [trip("1", [st("A", 1000), st("B", 1015), st("C", 1030)])] });
    const results = resultsFor(through, { A: 900 });

    take(results, connection(through, "1", "A", "B"));
    take(results, connection(through, "1", "B", "C"));

    expect(labelOf(results.getConnectionIndex(), through, "C", 1)).toBe(connection(through, "1", "A", "B"));
  });

  it("is finished once a connection arrives after every destination was reached", () => {
    const results = resultsFor(gtfs, { A: 900 }, ["B"]);

    expect(results.isFinished(connection(gtfs, "LN1112", "A", "B"))).toBe(false);

    take(results, connection(gtfs, "LN1112", "A", "B"));

    expect(results.isFinished(connection(gtfs, "LN1112", "A", "B"))).toBe(false);
    expect(results.isFinished(connection(gtfs, "LN1111", "A", "B"))).toBe(true);
  });

});

describe("ScanResultsFactory", () => {

  it("creates a ScanResults object", () => {
    const gtfs = gtfsOf({});

    expect(new ScanResultsFactory(gtfs).create({ A: 900 }, [])).toBeInstanceOf(ScanResults);
  });

  it("needs room for at least one leg", () => {
    expect(() => new ScanResultsFactory(gtfsOf({}), 0)).toThrow();
  });

});
