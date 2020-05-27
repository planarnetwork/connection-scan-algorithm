import {
  isTransfer,
  Journey,
  JourneyFactory,
  ScanResults,
  ScanResultsFactory,
  StopID,
  Time,
  TimetableConnection,
  TransfersByOrigin
} from "..";
import { setNested } from "ts-array-utils";

export class TransferPatternConnectionScan {

  constructor(
    private readonly connections: TimetableConnection[],
    private readonly transfers: TransfersByOrigin,
    private readonly resultsFactory: ScanResultsFactory,
    private readonly journeyFactory: JourneyFactory
  ) { }

  /**
   * Return a earliest arrival tree
   */
  public getShortestPathTree(origin: StopID): MST {
    const bestJourneys = {};
    let workingTimetable = this.connections;
    let nextDepartureTime = 0;

    while (workingTimetable.length > 0) {
      const arrivals = { [origin]: nextDepartureTime };
      const results = this.resultsFactory.create(arrivals);

      workingTimetable = this.scan(workingTimetable, results, origin, nextDepartureTime);
      nextDepartureTime = Number.MAX_SAFE_INTEGER;

      for (const destination in arrivals) {
        const [journey] = this.journeyFactory.getJourneys(results.getConnectionIndex(), [destination]);

        if (journey && journey.legs.some(l => !isTransfer(l))) {
          setNested(journey, bestJourneys, destination, "" + arrivals[destination]);
          nextDepartureTime = Math.min(nextDepartureTime, journey.departureTime + 1);
        }
      }
    }

    return bestJourneys;
  }

  private scan(
    connections: TimetableConnection[],
    results: ScanResults,
    origin: StopID,
    departure: Time
  ): TimetableConnection[] {

    const newTimetable = [] as TimetableConnection[];
    this.scanTransfers(results, origin);

    for (const c of connections) {

      // maybe just store an index?
      if (c.departureTime > departure) {
        newTimetable.push(c);
      }

      if (results.isReachable(c) && results.isBetter(c)) {
        const newStopReached = results.setConnection(c);

        if (newStopReached) {
          this.scanTransfers(results, c.destination);
        }
      }
    }

    return newTimetable;
  }

  private scanTransfers(results: ScanResults, origin: StopID): void {
    for (const transfer of this.transfers[origin]) {
      if (results.isTransferBetter(transfer)) {
        const newStopReached = results.setTransfer(transfer);

        if (newStopReached) {
          this.scanTransfers(results, transfer.destination);
        }
      }
    }
  }

}

export type MST = Record<StopID, Record<string, Journey>>;
