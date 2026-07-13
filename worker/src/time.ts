type DateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

function partsInZone(date: Date, timeZone: string): DateParts {
  const values = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    }).formatToParts(date).map((part) => [part.type, Number(part.value)])
  );
  return values as DateParts;
}

function localTimeToUtc(parts: DateParts, timeZone: string) {
  const target = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  const guess = new Date(target);
  const represented = partsInZone(guess, timeZone);
  const representedUtc = Date.UTC(represented.year, represented.month - 1, represented.day, represented.hour, represented.minute);
  let result = new Date(target - (representedUtc - target));

  const actual = partsInZone(result, timeZone);
  const actualUtc = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute);
  result = new Date(result.getTime() + (target - actualUtc));
  return result;
}

export function startOfDayInZone(timeZone: string, now = new Date()) {
  const local = partsInZone(now, timeZone);
  return localTimeToUtc({ ...local, hour: 0, minute: 0 }, timeZone);
}

export function nextDailySendAt(sendTime: string, timeZone: string, now = new Date(), forceTomorrow = false) {
  const [rawHour, rawMinute] = sendTime.split(":").map(Number);
  const hour = Number.isFinite(rawHour) ? rawHour : 10;
  const minute = Number.isFinite(rawMinute) ? rawMinute : 0;
  const local = partsInZone(now, timeZone);
  let candidate = localTimeToUtc({ ...local, hour, minute }, timeZone);

  if (forceTomorrow || candidate <= now) {
    const nextCalendarDay = new Date(Date.UTC(local.year, local.month - 1, local.day + 1));
    candidate = localTimeToUtc({
      year: nextCalendarDay.getUTCFullYear(),
      month: nextCalendarDay.getUTCMonth() + 1,
      day: nextCalendarDay.getUTCDate(),
      hour,
      minute
    }, timeZone);
  }

  return candidate;
}
