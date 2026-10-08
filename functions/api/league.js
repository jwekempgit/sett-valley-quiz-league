import { SHEET_ID, TABS, csvUrl, buildLeague } from '../../lib/league.js';

// GET /api/league: table, weeks, last and next game, read live from the Google Sheet.
// Cached for a minute at Cloudflare so a busy night doesn't hammer Google; ?fresh=1 skips the cache (used straight after a score is sent).
export async function onRequestGet({ request, env, waitUntil }) {
  const url = new URL(request.url);
  const cacheKey = new Request(`${url.origin}/api/league`, { method: 'GET' });
  const cache = caches.default;
  if (!url.searchParams.has('fresh')) {
    const hit = await cache.match(cacheKey);
    if (hit) return hit;
  }

  try {
    const data = await loadLeague(env);
    const res = new Response(JSON.stringify(data), {
      headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=60' },
    });
    waitUntil(cache.put(cacheKey, res.clone()));
    return res;
  } catch (err) {
    return new Response(JSON.stringify({ error: `Couldn't read the league sheet: ${err.message}` }), {
      status: 502, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  }
}

export async function loadLeague(env) {
  const id = env.SHEET_ID || SHEET_ID;
  const [scores, questions] = await Promise.all([fetchTab(id, TABS.scores, env), fetchTab(id, TABS.questions, env)]);
  return { ...buildLeague(scores, questions, londonToday()), updated: new Date().toISOString() };
}

// SHEET_BASE_URL is only for testing against a stand-in for Google.
async function fetchTab(id, { tab, range }, env) {
  const res = await fetch(csvUrl(id, tab, range, env.SHEET_BASE_URL), { cf: { cacheTtl: 0 } });
  const text = await res.text();
  // A sheet that isn't shared publicly comes back as a Google sign-in page rather than CSV.
  if (!res.ok || text.trimStart().startsWith('<')) throw new Error(`the ${tab} tab isn't readable (is the sheet shared as "anyone with the link"?)`);
  return text;
}

export function londonToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());
}
