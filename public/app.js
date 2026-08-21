import { pick, pickPerson } from './selection.js';
import { dueSpin, nextSpin, duePrefetch } from './scheduler.js';
import { wedgeAngles, rotationFor } from './wheel-geometry.js';

const TEST = new URLSearchParams(location.search).has('test');
const DEMO_ROSTER = [
  { id: 'demo1', name: 'Demo Alice' },
  { id: 'demo2', name: 'Demo Bob' },
  { id: 'demo3', name: 'Demo Cleo' },
];

const WHEEL_COLORS = ['#ffd23f', '#ff6b6b', '#4ecdc4', '#a06bff'];
const LABEL_HIDE_THRESHOLD = 12; // above this many people, show avatars only
const SPIN_SECONDS_DEFAULT = 5;
const SPIN_TURNS_DEFAULT = 5;
const PREFETCH_LEAD_MINUTES = 1; // prefetch the eligible pool this many minutes before a spin

const els = {
  state: document.getElementById('state'),
  nextDraw: document.getElementById('next-draw'),
  countdown: document.getElementById('countdown'),
  wheelDefs: document.getElementById('wheel-defs'),
  wheelRotor: document.getElementById('wheel-rotor'),
  resultActivity: document.getElementById('result-activity'),
  resultDesc: document.getElementById('result-desc'),
  resultName: document.getElementById('result-name'),
  accept: document.getElementById('accept'),
  skip: document.getElementById('skip'),
  message: document.getElementById('message'),
  sound: document.getElementById('sound'),
  testBtn: document.getElementById('test-btn'),
};

let config;
let round = null; // { activity, present, excluded:Set, current, spinKey, rotation }
let poolPrefetch = null; // { spinKey, pool } — eligible activities stashed for the upcoming spin

const setState = (name) => { els.state.dataset.state = name; };

function ranKeys() {
  try { return JSON.parse(localStorage.getItem('ranKeys') || '[]'); }
  catch { return []; }
}
function markRan(key) {
  if (!key) return;
  const keys = ranKeys();
  if (!keys.includes(key)) { keys.push(key); localStorage.setItem('ranKeys', JSON.stringify(keys)); }
}
function getLastActivity() {
  const id = localStorage.getItem('lastActivity');
  return id ? { id } : null;
}

async function fetchPresent() {
  try {
    const res = await fetch('/api/present');
    const data = await res.json();
    const present = data.present || [];
    if (present.length === 0 && TEST) return DEMO_ROSTER;
    return present;
  } catch {
    return TEST ? DEMO_ROSTER : [];
  }
}

// The activities eligible for a spin right now. The worker assembles the
// context (date/time, weather, …) and evaluates each activity's condition, so
// the screen just picks from what it returns. Returns [] if the worker can't be
// reached; startSpin then ends the round gracefully rather than picking nothing.
async function fetchActivities() {
  try {
    const res = await fetch('/api/activities');
    const data = await res.json();
    return Array.isArray(data.activities) ? data.activities : [];
  } catch {
    return [];
  }
}

function updateNextDraw() {
  const { time, today } = nextSpin(
    new Date(), config.spinTimes, ranKeys(), config.timezone, config.graceMinutes,
  );
  els.nextDraw.textContent = today ? `Neste trekning kl. ${time}` : `Neste trekning i morgen kl. ${time}`;
}

// ---- wheel rendering ------------------------------------------------------

function firstName(name) {
  return String(name || '').trim().split(/\s+/)[0] || '?';
}
function initialsOf(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
function escapeXml(s) {
  return String(s).replace(/[<>&"']/g, (c) => (
    { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
// wheel angle (deg, clockwise from top) -> point on a circle of radius r about (50,50)
function polar(angleDeg, r) {
  const a = (angleDeg * Math.PI) / 180;
  return { x: 50 + r * Math.sin(a), y: 50 - r * Math.cos(a) };
}

function renderWheel(present) {
  const n = present.length;
  const R = 48;                              // wheel radius in the 100x100 viewBox
  const angles = wedgeAngles(n);
  const avatarR = Math.min(9, 75 / n);       // shrink avatars as the wheel fills
  const rAvatar = 30;                        // avatar centre distance from middle
  const rName = 16;                          // name distance from middle
  const showNames = n <= LABEL_HIDE_THRESHOLD;
  const nameFont = Math.max(2.4, 6 - n * 0.18);

  const defs = [];
  const wedges = [];

  present.forEach((p, i) => {
    const color = WHEEL_COLORS[i % WHEEL_COLORS.length];
    const { start, end, mid } = angles[i];

    let shape;
    if (n === 1) {
      shape = `<circle cx="50" cy="50" r="${R}" fill="${color}" />`;
    } else {
      const a = polar(start, R);
      const b = polar(end, R);
      const largeArc = end - start > 180 ? 1 : 0;
      shape = `<path d="M50 50 L ${a.x.toFixed(3)} ${a.y.toFixed(3)} `
        + `A ${R} ${R} 0 ${largeArc} 1 ${b.x.toFixed(3)} ${b.y.toFixed(3)} Z" fill="${color}" />`;
    }

    const clipId = `wedge-clip-${i}`;
    defs.push(`<clipPath id="${clipId}"><circle cx="50" cy="${50 - rAvatar}" r="${avatarR.toFixed(3)}" /></clipPath>`);

    const avatarImg = p.avatar
      ? `<image class="wedge-avatar" href="${escapeXml(p.avatar)}" `
        + `x="${(50 - avatarR).toFixed(3)}" y="${(50 - rAvatar - avatarR).toFixed(3)}" `
        + `width="${(avatarR * 2).toFixed(3)}" height="${(avatarR * 2).toFixed(3)}" `
        + `clip-path="url(#${clipId})" preserveAspectRatio="xMidYMid slice" />`
      : '';
    const nameText = showNames
      ? `<text class="wedge-name" x="50" y="${50 - rName}" text-anchor="middle" `
        + `dominant-baseline="middle" font-size="${nameFont.toFixed(2)}">${escapeXml(firstName(p.name))}</text>`
      : '';

    wedges.push(
      `<g class="wedge" data-id="${escapeXml(p.id)}">`
        + shape
        + `<g transform="rotate(${mid.toFixed(3)} 50 50)">`
          + `<circle cx="50" cy="${50 - rAvatar}" r="${avatarR.toFixed(3)}" fill="rgba(0,0,0,0.18)" />`
          + `<text class="wedge-initials" x="50" y="${50 - rAvatar}" text-anchor="middle" `
            + `dominant-baseline="middle" font-size="${(avatarR * 0.9).toFixed(2)}">${escapeXml(initialsOf(p.name))}</text>`
          + avatarImg
          + nameText
        + `</g>`
      + `</g>`,
    );
  });

  els.wheelDefs.innerHTML = defs.join('');
  els.wheelRotor.innerHTML = wedges.join('');

  // reset orientation instantly (no animation) at the start of each round
  els.wheelRotor.style.transition = 'none';
  els.wheelRotor.style.transform = 'rotate(0deg)';
  round.rotation = 0;

  // a broken avatar image reveals the initials drawn underneath it
  els.wheelRotor.querySelectorAll('image.wedge-avatar').forEach((img) => {
    img.addEventListener('error', () => { img.style.display = 'none'; }, { once: true });
  });
}

function spinTo(winner) {
  const n = round.present.length;
  const idx = round.present.findIndex((p) => p.id === winner.id);
  const turns = config.spinTurns || SPIN_TURNS_DEFAULT;
  const secs = config.spinSeconds || SPIN_SECONDS_DEFAULT;
  const target = rotationFor(idx, n, round.rotation, turns);
  round.rotation = target;

  const rotor = els.wheelRotor;
  return new Promise((resolve) => {
    const done = (e) => {
      if (e.target !== rotor) return; // ignore any bubbling child transitions
      rotor.removeEventListener('transitionend', done);
      resolve();
    };
    rotor.addEventListener('transitionend', done);
    rotor.getBoundingClientRect(); // flush the reset transform before transitioning
    rotor.style.transition = `transform ${secs}s cubic-bezier(0.16, 1, 0.16, 1)`;
    rotor.style.transform = `rotate(${target}deg)`;
  });
}

function showResult(person, activity) {
  els.resultActivity.textContent = activity.kategori;
  els.resultDesc.textContent = activity.tekst || '';
  els.resultName.textContent = person.name;
  setState('result');
}

function endRound(messageText, spinKey) {
  els.message.textContent = messageText;
  setState('nobody');
  markRan(spinKey);
  round = null;
}

async function startSpin(spinKey) {
  // Claim the round synchronously so a later tick can't start a second spin
  // while we await below.
  setState('announcing');
  let remaining = config.countdownSeconds;
  els.countdown.textContent = remaining;

  // Settle the activity pool BEFORE the audible countdown. The worker always
  // returns a non-empty pool, so an empty one means we couldn't reach it —
  // transient, so drop back to idle WITHOUT marking this spin as run and let a
  // later tick retry inside the grace window. Doing this first means an outage
  // costs no announcement and never spends the day's spin on a network blip.
  // (A stashed pool matches only this spinKey; a TEST spin has none and refetches.)
  let pool = (poolPrefetch && poolPrefetch.spinKey === spinKey) ? poolPrefetch.pool : null;
  if (!pool || pool.length === 0) pool = await fetchActivities();
  if (pool.length === 0) {
    round = null;
    setState('idle');
    return;
  }

  els.sound.loop = true;
  els.sound.currentTime = 0;
  els.sound.play().catch(() => {}); // autoplay may be blocked; ignore
  await new Promise((resolve) => {
    const iv = setInterval(() => {
      remaining -= 1;
      els.countdown.textContent = remaining;
      if (remaining <= 0) { clearInterval(iv); resolve(); }
    }, 1000);
  });
  els.sound.loop = false;
  els.sound.pause();

  const present = await fetchPresent();
  if (present.length === 0) {
    endRound('Ingen har sjekket inn ennå — vi sees neste gang!', spinKey);
    return;
  }

  const { person, activity } = pick(present, pool, getLastActivity(), []);
  round = { activity, present, excluded: new Set(), current: person, spinKey, rotation: 0 };
  setState('spinning');
  renderWheel(present);
  await spinTo(person);
  showResult(person, activity);
}

els.skip.addEventListener('click', async () => {
  if (!round || !round.current) return;
  round.excluded.add(round.current.id);
  const wedge = els.wheelRotor.querySelector(`[data-id="${round.current.id}"]`);
  if (wedge) wedge.classList.add('dimmed');

  const next = pickPerson(round.present, [...round.excluded]);
  if (!next) {
    endRound('Alle er opptatt akkurat nå 😅 — vi tar det neste gang!', round.spinKey);
    return;
  }
  round.current = next;
  setState('spinning');
  await spinTo(next);
  showResult(next, round.activity);
});

els.accept.addEventListener('click', () => {
  if (round) {
    localStorage.setItem('lastActivity', round.activity.id);
    markRan(round.spinKey);
    round = null;
  }
  updateNextDraw();
  setState('idle');
});

function tick() {
  const now = new Date();
  updateNextDraw();

  // Prefetch the eligible pool ~1 min before a spin so the spin uses a ready
  // list. Guarded by spinKey so it fires once, not on every tick in that minute.
  const prefetchLead = config.weatherLeadMinutes || PREFETCH_LEAD_MINUTES;
  const prefetchKey = duePrefetch(now, config.spinTimes, config.timezone, prefetchLead);
  if (prefetchKey && (!poolPrefetch || poolPrefetch.spinKey !== prefetchKey)) {
    poolPrefetch = { spinKey: prefetchKey, pool: [] }; // empty until the fetch resolves
    fetchActivities().then((pool) => {
      if (poolPrefetch && poolPrefetch.spinKey === prefetchKey) poolPrefetch.pool = pool;
    });
  }

  if (els.state.dataset.state !== 'idle') return; // a spin is in progress
  const key = dueSpin(now, config.spinTimes, ranKeys(), config.timezone, config.graceMinutes);
  if (key) startSpin(key);
}

async function main() {
  config = await (await fetch('/config.json')).json();
  els.sound.src = config.soundFile;
  setState('idle');
  updateNextDraw();
  setInterval(tick, (config.pollSeconds || 20) * 1000);

  if (TEST) {
    els.testBtn.hidden = false;
    els.testBtn.addEventListener('click', () => { if (els.state.dataset.state === 'idle') startSpin(null); });
    window.addEventListener('keydown', (e) => { if (e.key === 's' && els.state.dataset.state === 'idle') startSpin(null); });
  }
}

main();
