---
"connection-scan-algorithm": patch
---

Return the journey the scan made. A journey could change trains at a station where another trip
happened to arrive first, with less than the station's interchange time, when the passenger had
really boarded that trip at an earlier call. The arrival times were right, the legs were not.

The scan now records the connection each trip is boarded from, and the connection index holds that
connection for each station rather than the last connection into it, so each entry is one leg. A trip
that can be boarded at more than one call is boarded where the passenger has taken the fewest legs to
reach, then at the latest call, so a passenger is not taken past a call of the trip only to ride back
through it. `ScanResults.setConnection` has to follow `isReachable` for the same connection, as the
scan does.
