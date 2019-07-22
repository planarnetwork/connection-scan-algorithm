import * as chai from "chai";
import { ScanResults } from "./ScanResults";
import { StopID, Time, TripID } from "../gtfs/Gtfs";
import { TimetableConnection } from "../journey/Connection";
import { Service } from "../gtfs/Service";
import { Transfer } from "../journey/Journey";
import { allDays } from "../gtfs/Service.spec";

describe("ScanResults", () => {

  it("knows if a connection is reachable", () => {
    const connection = c("A", "B", 1000, 1015);
    const results = new ScanResults({ "A": 900 }, defaultInterchange);
    const actual = results.isReachable(connection);
    const expected = true;

    chai.expect(actual).to.deep.equal(expected);
  });

  it("knows if a connection is not reachable", () => {
    const connection = c("A", "B", 1000, 1015);
    const results = new ScanResults({ "A": 1200 }, defaultInterchange);
    const actual = results.isReachable(connection);
    const expected = false;

    chai.expect(actual).to.deep.equal(expected);
  });

  it("knows if a connection is not reachable because of interchange", () => {
    const connection1 = c("A", "B", 1000, 1015);
    const connection2 = c("B", "C", 1030, 1100);
    const results = new ScanResults({ "A": 900 }, { "B": 100 });

    results.setConnection(connection1);

    const actual = results.isReachable(connection2);
    const expected = false;

    chai.expect(actual).to.deep.equal(expected);
  });

  it("knows if a connection is better", () => {
    const connection1 = c("A", "B", 1000, 1015);
    const connection2 = c("A", "B", 1000, 1010);
    const results = new ScanResults({ "A": 900 }, defaultInterchange);

    results.setConnection(connection1);

    const actual = results.isBetter(connection2);
    const expected = true;

    chai.expect(actual).to.deep.equal(expected);
  });

  it("knows if a connection is not better", () => {
    const connection1 = c("A", "B", 1000, 1015);
    const connection2 = c("A", "B", 1000, 1030);
    const results = new ScanResults({ "A": 900 }, defaultInterchange);

    results.setConnection(connection1);

    const actual = results.isBetter(connection2);
    const expected = false;

    chai.expect(actual).to.deep.equal(expected);
  });

  it("knows if a transfer is better", () => {
    const connection1 = c("A", "B", 1000, 1015);
    const connection2 = t("A", "B", 10);
    const results = new ScanResults({ "A": 900 }, defaultInterchange);

    results.setConnection(connection1);

    const actual = results.isTransferBetter(connection2);
    const expected = true;

    chai.expect(actual).to.deep.equal(expected);
  });

  it("knows if a transfer is not better", () => {
    const connection1 = c("A", "B", 1000, 1015);
    const connection2 = t("A", "B", 1000);
    const results = new ScanResults({ "A": 900 }, defaultInterchange);

    results.setConnection(connection1);

    const actual = results.isTransferBetter(connection2);
    const expected = false;

    chai.expect(actual).to.deep.equal(expected);
  });

  it("knows if a transfer is better than a transfer", () => {
    const connection1 = t("A", "B", 20);
    const connection2 = t("A", "B", 10);
    const results = new ScanResults({ "A": 900 }, defaultInterchange);

    results.setTransfer(connection1);

    const actual = results.isTransferBetter(connection2);
    const expected = true;

    chai.expect(actual).to.deep.equal(expected);
  });

  it("returns the connection index", () => {
    const connection1 = c("A", "B", 1000, 1015);
    const connection2 = t("B", "C", 10);
    const results = new ScanResults({ "A": 900 }, defaultInterchange);

    results.setConnection(connection1);
    results.setTransfer(connection2);

    const actual = results.getConnectionIndex();

    chai.expect(actual["B"]).to.deep.equal(connection1);
    chai.expect(actual["C"]).to.deep.equal(connection2);
  });

});

export function c(
  origin: StopID,
  destination: StopID,
  departureTime: Time,
  arrivalTime: Time,
  tripId: TripID = "LN1111"
): TimetableConnection {
  return {
    origin,
    destination,
    departureTime,
    arrivalTime,
    trip: {
      tripId,
      serviceId: "1",
      stopTimes: [],
      service: new Service(20190101, 20991231, allDays, {})
    }
  };
}

export function t(origin: TripID, destination: TripID, duration: Time): Transfer {
  return { origin, destination, duration, startTime: 0, endTime: 2359 };
}

export const defaultInterchange = {
  "A": 0,
  "B": 0
};
