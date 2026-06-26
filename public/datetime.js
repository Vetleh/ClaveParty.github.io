// Pure timezone-aware formatting helpers. Imported by the browser (scheduler.js,
// app.js) and by the Worker (src/slack.js). No DOM, no Node, no Worker APIs.

export function localDateISO(now, timeZone) {
  // en-CA renders dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function localTimeHHMM(now, timeZone) {
  const s = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now);
  // Some ICU versions emit "24:00" for midnight; normalize to "00:00".
  return s.replace(/^24:/, '00:');
}
