import { randomUUID } from 'node:crypto';
import { exportPersistentState, handleRequest, importPersistentState, setPersistenceCallback } from '../trip-service.mjs';

// Upstash's Vercel Marketplace integration provisions KV_REST_API_URL and
// KV_REST_API_TOKEN. Keep the generic UPSTASH names as fallbacks for manual
// deployments and local development.
const REST_URL = (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL)?.replace(/\/$/, '');
const REST_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const STATE_KEY = 'trickhopper:demo:state:v1';
const LOCK_KEY = 'trickhopper:demo:state-lock:v1';
const LOCK_TTL_MS = 90_000;
const LOCK_WAIT_MS = 8_000;
const RELEASE_LOCK = "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";

async function command(...args) {
  const response = await fetch(REST_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REST_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(5_000),
  });
  const result = await response.json();
  if (!response.ok || result.error) throw new Error('Shared trip storage request failed');
  return result.result;
}

const reply = (res, status, data) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(data));
};

export default async function handler(req, res) {
  if (!REST_URL || !REST_TOKEN) {
    return reply(res, 503, { ok: false, error: 'Shared trip storage is not configured. Trips are disabled.' });
  }

  const lockToken = randomUUID();
  const deadline = Date.now() + LOCK_WAIT_MS;
  let locked = false;
  try {
    while (!locked && Date.now() < deadline) {
      locked = (await command('SET', LOCK_KEY, lockToken, 'NX', 'PX', LOCK_TTL_MS)) === 'OK';
      if (!locked) await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (!locked) return reply(res, 503, { ok: false, error: 'Trip service is busy. Please retry shortly.' });

    const stored = await command('GET', STATE_KEY);
    if (stored) importPersistentState(JSON.parse(stored));
    setPersistenceCallback(async snapshot => {
      await command('SET', STATE_KEY, JSON.stringify(snapshot), 'EX', 60 * 60 * 12);
    });

    await handleRequest(req, res);
  } catch (error) {
    if (!res.headersSent) reply(res, 503, { ok: false, error: 'Trip service could not reach shared storage. Trips are disabled.' });
  } finally {
    setPersistenceCallback(null);
    if (locked) {
      try { await command('EVAL', RELEASE_LOCK, 1, LOCK_KEY, lockToken); } catch {}
    }
  }
}
