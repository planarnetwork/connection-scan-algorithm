import type { DateNumber, DayOfWeek, ServiceCalendar, Trip } from "@gb-transit/gtfs-loader";

/**
 * Which trips run on a date.
 *
 * A scan asks about every connection it reads, and there are far fewer calendars than trips, so each
 * distinct calendar is asked once for the date and the answer is kept until a scan asks about
 * another.
 */
export class TripCalendar {
  /** Index into services of each trip's calendar */
  private readonly tripService: Int32Array;
  private readonly services: ServiceCalendar[] = [];
  private readonly running: Uint8Array;
  private date: DateNumber = -1;

  constructor(trips: Trip[]) {
    const serviceIndex = new Map<ServiceCalendar, number>();

    this.tripService = new Int32Array(trips.length);
    this.running = new Uint8Array(trips.length);

    for (let t = 0; t < trips.length; t++) {
      let index = serviceIndex.get(trips[t].service);

      if (index === undefined) {
        index = this.services.length;
        this.services.push(trips[t].service);
        serviceIndex.set(trips[t].service, index);
      }

      this.tripService[t] = index;
    }
  }

  /**
   * For each trip, 1 if it runs on the date and 0 if not
   */
  public runningOn(date: DateNumber, dow: DayOfWeek): Uint8Array {
    if (this.date !== date) {
      const services = this.services.map(service => service.runsOn(date, dow) ? 1 : 0);

      for (let t = 0; t < this.tripService.length; t++) {
        this.running[t] = services[this.tripService[t]];
      }

      this.date = date;
    }

    return this.running;
  }

}
