import { localDateISO } from '../public/datetime.js';

const SLACK_API = 'https://slack.com/api';

function checkinKey(now, timeZone) {
  return `checkin:${localDateISO(now, timeZone)}`;
}

// Posts the daily check-in message at most once per local day. Returns {channel, ts}.
export async function postCheckin(env, now) {
  const key = checkinKey(now, env.TIMEZONE);
  const existing = await env.KV.get(key, 'json');
  if (existing) return existing;

  const res = await fetch(`${SLACK_API}/chat.postMessage`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.SLACK_BOT_TOKEN}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({ channel: env.SLACK_CHANNEL, text: env.CHECKIN_MESSAGE }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`Slack chat.postMessage failed: ${data.error}`);

  const record = { channel: data.channel, ts: data.ts };
  // ~36h TTL: long enough for the whole day, auto-cleans old keys.
  await env.KV.put(key, JSON.stringify(record), { expirationTtl: 60 * 60 * 36 });
  return record;
}

async function resolveUser(env, id) {
  const cacheKey = `user:${id}`;
  const cached = await env.KV.get(cacheKey, 'json');
  if (cached) return cached;

  const res = await fetch(`${SLACK_API}/users.info?user=${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${env.SLACK_BOT_TOKEN}` },
  });
  const data = await res.json();
  if (!data.ok) return { id, name: id, avatar: null };

  const p = data.user.profile || {};
  const user = { id, name: p.display_name || p.real_name || id, avatar: p.image_72 || null };
  await env.KV.put(cacheKey, JSON.stringify(user), { expirationTtl: 60 * 60 * 24 * 7 });
  return user;
}

// Returns the list of present people (those who reacted with the check-in emoji).
export async function getPresent(env, now) {
  const record = await postCheckin(env, now); // also the lazy fallback if cron missed
  const url = `${SLACK_API}/reactions.get?channel=${record.channel}&timestamp=${record.ts}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${env.SLACK_BOT_TOKEN}` } });
  const data = await res.json();
  if (!data.ok) throw new Error(`Slack reactions.get failed: ${data.error}`);

  const reactions = (data.message && data.message.reactions) || [];
  const match = reactions.find((r) => r.name === env.CHECKIN_EMOJI);
  const ids = match ? match.users : [];

  const users = [];
  for (const id of ids) users.push(await resolveUser(env, id));
  return users;
}
