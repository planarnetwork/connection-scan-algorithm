import type { StopID } from "@gb-transit/gtfs-loader";

/**
 * A station as the scan works in it: a number, so that its state can be held in arrays rather than
 * objects keyed by code. A query's codes are exchanged for these on the way in, and results name
 * them again on the way out.
 */
export type StopIdx = number;

/** A station the feed has not heard of, so nothing runs to or from it */
export const UNKNOWN_STOP = -1;

/**
 * The stations a feed names, numbered in the order they are met.
 */
export class StopTable {

  private readonly codes: StopID[] = [];
  private readonly indexes = new Map<StopID, StopIdx>();

  /**
   * The index of a station, numbering it if it has not been seen before
   */
  public intern(code: StopID): StopIdx {
    const index = this.indexes.get(code);

    if (index !== undefined) {
      return index;
    }

    this.indexes.set(code, this.codes.length);
    this.codes.push(code);

    return this.codes.length - 1;
  }

  /**
   * The index of a station, or UNKNOWN_STOP where the feed does not name it
   */
  public indexOf(code: StopID): StopIdx {
    return this.indexes.get(code) ?? UNKNOWN_STOP;
  }

  /**
   * The code of a station, for naming it in a result
   */
  public nameOf(index: StopIdx): StopID {
    return this.codes[index];
  }

  public get size(): number {
    return this.codes.length;
  }

}
