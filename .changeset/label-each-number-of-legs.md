---
"connection-scan-algorithm": minor
---

Return each destination's earliest arrival in the fewest legs. The scan kept one label per station,
its earliest arrival, so an arrival a few minutes later in fewer legs was thrown away even when it
made the same onward train, and every journey on from it took the extra legs. A station now keeps a
label for each number of legs, up to `maxLegs` (8 unless `ScanResultsFactory` is given another, the
last holding that many or more and keeping how many), and a trip is boarded from the fewest legs that
are in time for it. With `maxLegs` of 1 the journeys are 3.0.1's.
Over the GB rail benchmark queries the arrivals are unchanged and 172 of 5,643 journeys take fewer
legs. `JourneyFactory` no longer rewrites the legs of a journey after the scan.

Footpaths out of a station are all taken before any is walked on from, and the labels are allocated
once per `ScanResultsFactory` rather than per scan, so point to point scans are about 25% faster.

`ConnectionIndex` is now the labels: `levels` per station, with `boardingTimes` and `connections`
at `station * levels + legs`. It is reused by the next scan from the same `ScanResultsFactory`.
`ScanResults.setConnection` returns the legs a station was reached sooner in, or 0.
`isTransferBetter`, `setTransfer` and `isReachedByTransfer` take the legs of the station the footpath
is walked from.
