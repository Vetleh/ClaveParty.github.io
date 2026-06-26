import { pick, pickPerson } from './selection.js';
import { dueSpin } from './scheduler.js';

const TEST = new URLSearchParams(location.search).has('test');
const DEMO_ROSTER = [
  { id: 'demo1', name: 'Demo Alice' },
  { id: 'demo2', name: 'Demo Bob' },
  { id: 'demo3', name: 'Demo Cleo' },
];

const els = {
  state: document.getElementById('state'),
  clock: document.getElementById('clock'),
  countdown: document.getElementById('countdown'),
  wheel: document.getElementById('wheel'),
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
let activities;
let round = null; // { activity, present, excluded:Set, current, spinKey }

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
  const t = localStorage.getItem('lastActivity');
  return t ? { title: t } : null;
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

function updateClock() {
  els.clock.textContent = new Intl.DateTimeFormat('en-GB', {
    timeZone: config.timezone, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date());
}

function animateWheel(present, winner) {
  setState('spinning');
  return new Promise((resolve) => {
    const names = present.map((p) => p.name);
    let i = 0;
    let ticks = 0;
    const total = 24 + Math.max(0, present.indexOf(winner));
    const iv = setInterval(() => {
      els.wheel.textContent = names[i % names.length];
      i += 1; ticks += 1;
      if (ticks >= total) {
        clearInterval(iv);
        els.wheel.textContent = winner.name;
        resolve();
      }
    }, 90);
  });
}

function showResult(person, activity) {
  els.resultActivity.textContent = activity.title;
  els.resultDesc.textContent = activity.description || '';
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
  setState('announcing');
  els.sound.currentTime = 0;
  els.sound.play().catch(() => {}); // autoplay may be blocked; ignore
  let remaining = config.countdownSeconds;
  els.countdown.textContent = remaining;
  await new Promise((resolve) => {
    const iv = setInterval(() => {
      remaining -= 1;
      els.countdown.textContent = remaining;
      if (remaining <= 0) { clearInterval(iv); resolve(); }
    }, 1000);
  });

  const present = await fetchPresent();
  if (present.length === 0) {
    endRound("No one's checked in yet — see you next time!", spinKey);
    return;
  }

  const { person, activity } = pick(present, activities, getLastActivity(), []);
  round = { activity, present, excluded: new Set(), current: person, spinKey };
  await animateWheel(present, person);
  showResult(person, activity);
}

els.skip.addEventListener('click', async () => {
  if (!round || !round.current) return;
  round.excluded.add(round.current.id);
  const next = pickPerson(round.present, [...round.excluded]);
  if (!next) {
    endRound("Everyone's busy right now 😅 — catch you at the next one!", round.spinKey);
    return;
  }
  round.current = next;
  await animateWheel(round.present, next);
  showResult(next, round.activity);
});

els.accept.addEventListener('click', () => {
  if (round) {
    localStorage.setItem('lastActivity', round.activity.title);
    markRan(round.spinKey);
    round = null;
  }
  setState('idle');
});

function tick() {
  updateClock();
  if (els.state.dataset.state !== 'idle') return; // a spin is in progress
  const key = dueSpin(new Date(), config.spinTimes, ranKeys(), config.timezone, config.graceMinutes);
  if (key) startSpin(key);
}

async function main() {
  config = await (await fetch('/config.json')).json();
  activities = (await (await fetch('/activities.json')).json()).activities;
  els.sound.src = config.soundFile;
  setState('idle');
  updateClock();
  setInterval(tick, (config.pollSeconds || 20) * 1000);

  if (TEST) {
    els.testBtn.hidden = false;
    els.testBtn.addEventListener('click', () => { if (els.state.dataset.state === 'idle') startSpin(null); });
    window.addEventListener('keydown', (e) => { if (e.key === 's' && els.state.dataset.state === 'idle') startSpin(null); });
  }
}

main();
