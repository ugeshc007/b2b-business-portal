export const appTimeZone = "Asia/Dubai";

export function appDate(value: Date | string | number = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: appTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

export function appDateTime(value: Date | string | number = new Date()) {
  return new Intl.DateTimeFormat("en-AE", {
    timeZone: appTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

export function appMonth(value: Date | string | number = new Date()) {
  return appDate(value).slice(0, 7);
}

export function appDateFromParts(year: number, monthIndex: number, day: number) {
  return appDate(Date.UTC(year, monthIndex, day, 0, 0, 0));
}

export function appMonthStart(value: Date | string | number = new Date()) {
  const date = new Date(value);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: appTimeZone,
    year: "numeric",
    month: "numeric",
  }).formatToParts(date);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  return appDateFromParts(year, month - 1, 1);
}

export function appMonthEnd(value: Date | string | number = new Date()) {
  const date = new Date(value);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: appTimeZone,
    year: "numeric",
    month: "numeric",
  }).formatToParts(date);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  return appDateFromParts(year, month, 0);
}
