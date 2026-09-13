import { describe, expect, it } from "vitest";
import { ScanResults } from "../../../src/csa/ScanResults.js";
import { ScanResultsFactory } from "../../../src/csa/ScanResultsFactory.js";
import { c, defaultInterchange, t } from "../util.js";

describe("ScanResults", () => {

  it("knows if a connection is reachable", () => {
    const connection = c("A", "B", 1000, 1015);
    const results = new ScanResults(defaultInterchange, { A: 900 });

    expect(results.isReachable(connection)).toBe(true);
  });

  it("knows if a connection is not reachable", () => {
    const connection = c("A", "B", 1000, 1015);
    const results = new ScanResults(defaultInterchange, { A: 1200 });

    expect(results.isReachable(connection)).toBe(false);
  });

  it("knows if a connection is not reachable because of interchange", () => {
    const connection1 = c("A", "B", 1000, 1015, "LN1111");
    const connection2 = c("B", "C", 1030, 1100, "LN1112");
    const results = new ScanResults({ B: 100 }, { A: 900 });

    results.setConnection(connection1);

    expect(results.isReachable(connection2)).toBe(false);
  });

  it("changes in no time at a station with no interchange time", () => {
    const connection1 = c("A", "B", 1000, 1015, "LN1111");
    const connection2 = c("B", "C", 1015, 1100, "LN1112");
    const results = new ScanResults({}, { A: 900 });

    results.setConnection(connection1);

    expect(results.isReachable(connection2)).toBe(true);
  });

  it("knows if a connection is better", () => {
    const connection1 = c("A", "B", 1000, 1015);
    const connection2 = c("A", "B", 1000, 1010);
    const results = new ScanResults(defaultInterchange, { A: 900 });

    results.setConnection(connection1);

    expect(results.isBetter(connection2)).toBe(true);
  });

  it("knows if a connection is not better", () => {
    const connection1 = c("A", "B", 1000, 1015);
    const connection2 = c("A", "B", 1000, 1030);
    const results = new ScanResults(defaultInterchange, { A: 900 });

    results.setConnection(connection1);

    expect(results.isBetter(connection2)).toBe(false);
  });

  it("prefers staying aboard to changing onto a trip arriving at the same time", () => {
    const toB = c("A", "B", 1000, 1015, "front");
    const rearToC = c("B", "C", 1030, 1100, "rear");
    const throughToB = c("A", "B", 1000, 1015, "through");
    const throughToC = c("B", "C", 1030, 1100, "through");
    const results = new ScanResults({ B: 5 }, { A: 900 });

    for (const connection of [toB, throughToB, rearToC]) {
      if (results.isReachable(connection) && results.isBetter(connection)) {
        results.setConnection(connection);
      }
    }

    expect(results.isReachable(throughToC)).toBe(true);
    expect(results.isBetter(throughToC)).toBe(true);
  });

  it("does not replace a trip with another arriving at the same time that it would have to change onto", () => {
    const toB = c("A", "B", 1000, 1015, "1");
    const toC = c("B", "C", 1030, 1100, "2");
    const alsoToC = c("B", "C", 1030, 1100, "3");
    const results = new ScanResults({ B: 5 }, { A: 900 });

    results.setConnection(toB);
    results.setConnection(toC);

    expect(results.isReachable(alsoToC)).toBe(true);
    expect(results.isBetter(alsoToC)).toBe(false);
  });

  it("knows if a transfer is better", () => {
    const connection1 = c("A", "B", 1000, 1015);
    const connection2 = t("A", "B", 10);
    const results = new ScanResults(defaultInterchange, { A: 900 });

    results.setConnection(connection1);

    expect(results.isTransferBetter(connection2)).toBe(true);
  });

  it("knows if a transfer is not better", () => {
    const connection1 = c("A", "B", 1000, 1015);
    const connection2 = t("A", "B", 1000);
    const results = new ScanResults(defaultInterchange, { A: 900 });

    results.setConnection(connection1);

    expect(results.isTransferBetter(connection2)).toBe(false);
  });

  it("charges the interchange time at both ends of a walk", () => {
    const results = new ScanResults({ B: 300, C: 200 }, { A: 900 });

    results.setConnection(c("A", "B", 1000, 1015));
    results.setTransfer(t("B", "C", 60));

    expect(results.isReachable(c("C", "D", 1574, 1600, "2"))).toBe(false);
    expect(results.isReachable(c("C", "D", 1575, 1600, "3"))).toBe(true);
  });

  it("knows if a transfer is better than a transfer", () => {
    const connection1 = t("A", "B", 20);
    const connection2 = t("A", "B", 10);
    const results = new ScanResults(defaultInterchange, { A: 900 });

    results.setTransfer(connection1);

    expect(results.isTransferBetter(connection2)).toBe(true);
  });

  it("returns the connection index", () => {
    const connection1 = c("A", "B", 1000, 1015);
    const connection2 = t("B", "C", 10);
    const results = new ScanResults(defaultInterchange, { A: 900 });

    results.setConnection(connection1);
    results.setTransfer(connection2);

    const actual = results.getConnectionIndex();

    expect(actual.B).toEqual(connection1);
    expect(actual.C).toEqual(connection2);
  });

});

describe("ScanResultsFactory", () => {

  it("creates a ScanResults object", () => {
    const factory = new ScanResultsFactory({});

    expect(factory.create({ A: 900 })).toBeInstanceOf(ScanResults);
  });

});
