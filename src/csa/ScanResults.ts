/** A station reached by nothing: an origin, or one not reached at all */
export const NOT_ARRIVED = -1;

/**
 * What a scan found, by station index.
 */
export interface ScanResults {
  /** The earliest arrival at each station, NOT_REACHED where it was not reached */
  earliestArrivals: Int32Array;
  /**
   * How each station was reached: the index of the connection arriving there, a footpath as
   * `transferArrival` records it, or NOT_ARRIVED
   */
  arrivedBy: Int32Array;
}
