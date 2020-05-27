import { MST } from "./TransferPatternConnectionScan";

/**
 * Access to the transfer_patterns table in a mysql compatible database
 */
export class TransferPatternRepository {

  constructor(
    private readonly db: any
  ) { }

  /**
   * Store every transfer pattern in the tree
   */
  public async storeTransferPatterns(patterns: MST): Promise<void> {
    const journeys: object[] = [];

    for (const destination of Object.keys(patterns)) {
      for (const journey of Object.values(patterns[destination])) {
        const stops = journey.legs.slice(1).map(l => l.origin);
        const pattern = journey.origin > journey.destination ? stops.reverse().join(",") : stops.join(",");
        const key = journey.origin > journey.destination
            ? journey.destination + journey.origin
            : journey.origin + journey.destination;

        journeys.push([key, pattern]);
      }
    }

    if (journeys.length > 0) {
      await this.retryQuery("INSERT IGNORE INTO transfer_patterns VALUES ?", [journeys]);
    }
  }

  private async retryQuery(sql: string, data: any[], numRetries: number = 3) {
    try {
      await this.db.query(sql, data);
    }
    catch (err) {
      if (numRetries > 0) {
        await this.retryQuery(sql, data, numRetries - 1);
      }
      else {
        console.error(err);
      }
    }

  }

  /**
   * Create the transfer pattern table if it does not already exist
   */
  public async initTables(): Promise<void> {
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS transfer_patterns (
        journey char(6) NOT NULL,
        pattern varchar(255) NOT NULL,
        PRIMARY KEY (journey,pattern)
      ) ENGINE=InnoDB DEFAULT CHARSET=latin1
     `
    );
  }
}
