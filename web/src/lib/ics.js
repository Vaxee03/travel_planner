function pad(n) {
  return String(n).padStart(2, "0");
}

function escapeText(s) {
  return String(s || "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

function toIcsDate(dateStr) {
  return dateStr.replaceAll("-", "");
}

function toIcsDateTime(dateStr, timeStr) {
  const [hh, mm] = (timeStr || "00:00").split(":");
  return `${toIcsDate(dateStr)}T${pad(hh)}${pad(mm)}00`;
}

function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

/** RFC 5545 §3.1: content lines longer than 75 octets must be folded (CRLF
 * + one space). Korean text is 3 bytes a character in UTF-8, so a long
 * 일정 title easily passes that, and some calendar apps then cut it off.
 * Splits on character boundaries so a character is never broken. */
function foldLine(line) {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const parts = [];
  let cur = "";
  let curBytes = 0;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    // continuation lines start with a space, which counts toward the 75
    const limit = parts.length === 0 ? 75 : 74;
    if (curBytes + b > limit) { parts.push(cur); cur = ""; curBytes = 0; }
    cur += ch;
    curBytes += b;
  }
  parts.push(cur);
  return parts.join("\r\n ");
}

/** Builds an RFC5545 .ics calendar from a trip's days/items. Timed items
 * ("time" kind) become 1-hour events; untimed items ("label" kind, e.g.
 * "이동") become all-day events since there's no clock time to anchor them. */
export function buildTripIcs(trip) {
  const now = new Date();
  const dtstamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Trip Planner//KO", "CALSCALE:GREGORIAN"];

  (trip.days || []).forEach((day, dayIdx) => {
    (day.items || []).forEach((item, itemIdx) => {
      lines.push("BEGIN:VEVENT");
      lines.push(`UID:${trip.id}-${dayIdx}-${itemIdx}@tripplanner.kr`);
      lines.push(`DTSTAMP:${dtstamp}`);
      if (item.kind === "time" && item.time) {
        const start = new Date(`${day.date}T${item.time}:00`);
        const end = new Date(start.getTime() + 60 * 60 * 1000);
        lines.push(`DTSTART:${toIcsDateTime(day.date, item.time)}`);
        lines.push(`DTEND:${toIcsDateTime(`${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`, `${pad(end.getHours())}:${pad(end.getMinutes())}`)}`);
      } else {
        lines.push(`DTSTART;VALUE=DATE:${toIcsDate(day.date)}`);
        lines.push(`DTEND;VALUE=DATE:${addDays(day.date, 1)}`);
      }
      lines.push(`SUMMARY:${escapeText(item.text)}`);
      if (item.location?.address) lines.push(`LOCATION:${escapeText(item.location.address)}`);
      lines.push("END:VEVENT");
    });
  });

  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n");
}

export function downloadTripIcs(trip) {
  const ics = buildTripIcs(trip);
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${trip.title || "여행"}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
