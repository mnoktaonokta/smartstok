/** iCalendar (.ics) üretimi — cihazda yerel takvime eklemek için */

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** UTC TIMESTAMP: 20260321T143000Z */
export function toIcsUtc(date: Date): string {
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

export function buildTaskIcs(input: {
  id: string;
  title: string;
  dueDate: Date;
  customerName?: string;
  durationMinutes?: number;
}): string {
  const start = input.dueDate;
  const end = new Date(
    start.getTime() + (input.durationMinutes ?? 60) * 60_000,
  );
  const stamp = toIcsUtc(new Date());
  const dtStart = toIcsUtc(start);
  const dtEnd = toIcsUtc(end);
  const uid = `${input.id}@smartstok`;
  const summary = escapeIcsText(input.title);
  const description = escapeIcsText(
    input.customerName
      ? `SmartStok hatırlatıcı · ${input.customerName}`
      : "SmartStok hatırlatıcı",
  );

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Smart Dental//SmartStok//TR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

export function downloadIcsFile(filename: string, content: string) {
  const blob = new Blob([content], {
    type: "text/calendar;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".ics") ? filename : `${filename}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
