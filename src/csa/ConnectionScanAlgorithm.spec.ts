import * as chai from "chai";
import { ConnectionScanAlgorithm } from "./ConnectionScanAlgorithm";
import { c, defaultInterchange, t } from "./ScanResults.spec";
import { ScanResultsFactory } from "./ScanResultsFactory";
import { JourneyFactory, TimetableConnection } from "..";

describe("ConnectionScanAlgorithm", () => {
  const scanResultsFactory = new ScanResultsFactory(defaultInterchange);
  const journeyResultsFactory = new JourneyFactory();
  const noTransfers = { "A": [], "B": [], "C": [], "D": [] };

  it("plan a basic journey", () => {
    const timetable = [
      c("A", "B", 1000, 1015),
      c("B", "C", 1020, 1045),
      c("C", "D", 1100, 1115),
    ];

    setStopTimes(timetable);

    const scanner = new ConnectionScanAlgorithm(timetable, noTransfers, scanResultsFactory);
    const results = scanner.scan({ "A": 900 }, ["D"], 20190101, 0);
    const [journey] = journeyResultsFactory.getJourneys(results, ["D"]);

    chai.expect(journey.origin).to.equal("A");
    chai.expect(journey.destination).to.equal("D");
    chai.expect(journey.legs.length).to.equal(1);
    chai.expect(journey.departureTime).to.equal(1000);
    chai.expect(journey.arrivalTime).to.equal(1115);
  });

  it("returns no results when there is no connection", () => {
    const timetable = [
      c("A", "B", 1000, 1015),
      c("C", "D", 1100, 1115),
    ];

    setStopTimes(timetable);

    const scanner = new ConnectionScanAlgorithm(timetable, noTransfers, scanResultsFactory);
    const results = scanner.scan({ "A": 900 }, ["D"], 20190101, 0);
    const journeys = journeyResultsFactory.getJourneys(results, ["D"]);

    chai.expect(journeys.length).to.equal(0);
  });

  it("returns no results when there is a missed connection", () => {
    const timetable = [
      c("A", "B", 1000, 1015),
      c("B", "C", 1000, 1030),
      c("C", "D", 1100, 1115),
    ];

    setStopTimes(timetable);

    const scanner = new ConnectionScanAlgorithm(timetable, noTransfers, scanResultsFactory);
    const results = scanner.scan({ "A": 900 }, ["D"], 20190101, 0);
    const journeys = journeyResultsFactory.getJourneys(results, ["D"]);

    chai.expect(journeys.length).to.equal(0);
  });

  it("plan a journey that starts with a transfer", () => {
    const timetable = [
      c("B", "C", 1020, 1045),
      c("C", "D", 1100, 1115),
    ];

    setStopTimes(timetable);

    const transfers = {
      ...noTransfers,
      "A": [
        { origin: "A", destination: "B", duration: 10, startTime: 0, endTime: Number.MAX_SAFE_INTEGER },
      ]
    };

    const scanner = new ConnectionScanAlgorithm(timetable, transfers, scanResultsFactory);
    const results = scanner.scan({ "A": 900 }, ["D"], 20190101, 0);
    const [journey] = journeyResultsFactory.getJourneys(results, ["D"]);

    chai.expect(journey.origin).to.equal("A");
    chai.expect(journey.destination).to.equal("D");
    chai.expect(journey.legs.length).to.equal(2);
    chai.expect(journey.departureTime).to.equal(1010);
    chai.expect(journey.arrivalTime).to.equal(1115);
  });

  it("plan a journey that ends with a transfer", () => {
    const timetable = [
      c("A", "B", 1000, 1015),
      c("B", "C", 1020, 1045),
    ];

    setStopTimes(timetable);

    const transfers = {
      ...noTransfers,
      "C": [
        { origin: "C", destination: "D", duration: 10, startTime: 0, endTime: Number.MAX_SAFE_INTEGER },
      ]
    };

    const scanner = new ConnectionScanAlgorithm(timetable, transfers, scanResultsFactory);
    const results = scanner.scan({ "A": 900 }, ["D"], 20190101, 0);
    const [journey] = journeyResultsFactory.getJourneys(results, ["D"]);

    chai.expect(journey.origin).to.equal("A");
    chai.expect(journey.destination).to.equal("D");
    chai.expect(journey.legs.length).to.equal(2);
    chai.expect(journey.departureTime).to.equal(1000);
    chai.expect(journey.arrivalTime).to.equal(1055);
  });

});

export function setStopTimes(connections: TimetableConnection[]) {
  const stopTimes = connections
    .map(connection => ({
      stop: connection.origin,
      pickUp: true,
      dropOff: true,
      departureTime: connection.departureTime,
      arrivalTime: connection.departureTime
    }));

  stopTimes.push({
    stop: connections[connections.length - 1].destination,
    pickUp: true,
    dropOff: true,
    departureTime: connections[connections.length - 1].arrivalTime,
    arrivalTime: connections[connections.length - 1].arrivalTime
  });

  for (const connection of connections) {
    connection.trip.stopTimes = stopTimes;
  }
}
