// Known-people roster — edit this file to teach the screen who's who, then push
// (a commit auto-deploys). This is the ONLY thing you maintain by hand for network
// presence. It is imported by the Worker; it is NOT served to the browser, so
// hostnames/MACs stay private.
//
// How matching works (see src/presence.js):
//   - `match.hostnames`: list of mDNS/Bonjour hostname patterns, case-insensitive,
//     "*" is a wildcard. Hostnames are STABLE across Wi-Fi MAC randomization, so
//     this is the reliable signal. The ".local"/".localdomain" suffix is ignored.
//   - `match.macs` (optional): exact MAC(s) for devices that DON'T randomize —
//     printers, TVs, access points, wired desktops. Useless for modern phones.
//   - `slackId` (optional): the person's Slack user id (U…). If set, their network
//     presence and their Slack ✅ collapse into one entry instead of two.
//
// A note on phones: an iPhone often advertises the generic hostname "iPhone",
// which collides across everyone — don't map that. Android/Samsung phones usually
// embed the owner's name ("Kai-sin-S25-Ultra") and are safe to match.

export const people = [
  {
    id: 'lars',
    name: 'Lars Holter',
    slackId: 'U07G31QQ8KY',
    match: { hostnames: ['Lars-sin-MacBook-Pro*'], macs: [] },
  },
  {
    id: 'karine',
    name: 'Karine',
    slackId: 'U0PMKFVHA', // TODO: fill in Slack user id (U…) to link with her ✅ check-in
    match: { hostnames: ['Karine-sin-MBP*'], macs: [] }, // observed in scan
  },
  {
    id: 'vetle',
    name: 'Vetle',
    slackId: 'U03LPQAHEU9',
    match: { hostnames: ['Vetles-MacBook*', 'Vetles-MBP*'], macs: [] }, // observed in scan
  },
  {
    id: 'per-kristian',
    name: 'Per-Kristian',
    slackId: 'U0HLG9KBN',
    // GUESS: "PERHEL-LAPTOP" / "PERHEL-OFFICE" appeared in the scan and look like
    // Per's machines — confirm and adjust/remove if that's someone else.
    match: { hostnames: ['PERHEL-*'], macs: [] },
  },
  {
    id: 'ingrid-marie',
    name: 'Ingrid Marie',
    slackId: 'U03M0SZ0JRE',
    // TODO: no obvious device in the scan yet. Run `./lanscan.sh`, find her
    // laptop/phone hostname, and add it here (e.g. 'Ingrid-sin-MBP*').
    match: { hostnames: [], macs: [] },
  },
  {
    id: 'marte',
    name: 'Marte Hanto Kolstad',
    slackId: 'U0BA4T8G0EB',
    // TODO: add Marte's device hostname once identified (see lanscan output).
    // NB: 'Karines-MacBook-Pro' looks like Karine's default macOS name — double-check
    // this is really Marte's machine and not a mis-paste, or it'll attribute Karine.
    match: { hostnames: ['Karines-MacBook-Pro'], macs: [] },
  },

  // --- Mapped from the 2026-06-26 office scan (owner-named hostnames) ---
  // slackId left blank: fill in to merge each person's Wi-Fi + ✅ presence.
  {
    id: 'eirik',
    name: 'Eirik',
    slackId: 'U6BDBPZHD',
    match: { hostnames: ['Eiriks-MBP*'], macs: [] },
  },
  {
    id: 'terje',
    name: 'Terje',
    slackId: 'U44M8RWMC',
    match: { hostnames: ['Terje-sin-Air*'], macs: [] },
  },
  {
    id: 'olivia',
    name: 'Olivia',
    slackId: 'U04CR1C6BRQ',
    match: { hostnames: ['Olivia*'], macs: [] },
  },
  {
    id: 'hakon-lia',
    name: 'Håkon Lia',
    slackId: 'U025A7JKDH7',
    match: { hostnames: ['hakonlia*'], macs: [] },
  },
  {
    id: 'markus-v',
    name: 'Markus Vesetrud',
    slackId: 'U05CY13KH7G',
    // phone (A55) + laptop (ZBook) — both clearly Markus.
    match: { hostnames: ['Markus-Risa-s-A55*', 'Markus-ZBook-Ubuntu-25*'], macs: [] },
  },
  {
    id: 'andreas',
    name: 'Andreas',
    slackId: 'U0FT6MU1E',
    match: { hostnames: ['AndreasLenovoX1*'], macs: [] },
  },
  {
    id: 'inga',
    name: 'Inga',
    slackId: 'U0AJ1CR1XNG',
    match: { hostnames: ['Inga-sin-MBP*'], macs: [] },
  },
  {
    id: 'kai',
    name: 'Kai',
    slackId: 'UA6KK2QR5',
    match: { hostnames: ['Kai-sin-S25-Ultra*'], macs: [] },
  },
  {
    id: 'yngve',
    name: 'Yngve',
    slackId: 'U1WU1462J',
    match: { hostnames: ['Yngve-s-S24*'], macs: [] },
  },
  {
    id: 'kim',
    name: 'Kim',
    slackId: 'U0JN0EH7A',
    match: { hostnames: ['Kim-s-S23-Ultra*'], macs: [] },
  },
  {
    id: 'sofie',
    name: 'Sofie',
    slackId: 'U0BA4RSE4FR',
    match: { hostnames: ['SofiesiMBPClave*'], macs: [] },
  },
  {
    id: 'pia',
    name: 'Pia',
    slackId: 'U3XFV0GEL',
    match: { hostnames: ['Pia-sin-MBP*'], macs: [] },
  },
];

// ---------------------------------------------------------------------------
// Deliberately NOT mapped (from the 2026-06-26 scan) and why. These surface in
// /api/network-presence's "unmatched" list — add an entry above if you can pin
// one to a person.
//
// Generic device names (collide across people — unsafe to map):
//   iPhone, MacBookPro, MacBook-Air, Mac, Watch, Samsung, Pixel-10-Pro, Pixel-8
//
// Unknown / unattributed (no name embedded — identify the owner first):
//   DESKTOP-VOR56G7, DESKTOP-NHO0Q56  (Windows desktops)
//   SKE-QGWM762G4X, InputsLap         (unclear)
//   Clave-sin-MBP                     ("Clave's MBP" — shared/company machine?)
//   garmin-Forerunner965-…            (a watch; map to its owner if you know it)
//
// Infrastructure (not people, leave unmapped):
//   setup.ui.com, NanoHD1/2/3, USW-48-PoE  (UniFi gateway/APs/switch)
//   EPSON4976E7 (printer), TapSched-* (Logitech room scheduler)
//   siemens-dishwasher-*, office-iot       (appliances / IoT)
// ---------------------------------------------------------------------------
