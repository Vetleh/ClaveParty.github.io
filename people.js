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
    match: { hostnames: ['Karines-MacBook-Pro'], macs: [] },
  },
];

// ---------------------------------------------------------------------------
// Other named devices seen on the office LAN (2026-06-26 scan) — uncomment /
// copy into the roster above as you confirm who owns them:
//
//   Eiriks-MBP            -> Eirik
//   Inga-sin-MBP          -> Inga
//   SofiesiMBPClave       -> Sofie
//   AndreasLenovoX1       -> Andreas
//   Markus-Risa-s-A55     -> Markus (phone) / Markus-ZBook-Ubuntu-25 (laptop)
//   Kai-sin-S25-Ultra     -> Kai (phone)
//   Yngve-s-S24           -> Yngve (phone)
//   Kim-s-S23-Ultra       -> Kim (phone)
//   Terje-sin-Air         -> Terje
//   hakonlia              -> Håkon Lia
//   Olivia                -> Olivia
//   DESKTOP-VOR56G7, DESKTOP-NHO0Q56, PERHEL-LAPTOP/OFFICE  -> Windows desktops
//
// Infrastructure (not people): NanoHD1/2/3, USW-48-PoE (UniFi), EPSON4976E7
// (printer), TapSched-* (Logitech room scheduler), siemens-dishwasher-*, Samsung
// TVs. Leave these unmapped; they'll show up under /api/network-presence's
// "unmatched" list, which is handy for spotting devices to add.
// ---------------------------------------------------------------------------
