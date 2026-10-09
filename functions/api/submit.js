import { checkScores } from '../../lib/league.js';
import { loadLeague, londonToday } from './league.js';

// POST /api/submit: anyone from either team sends the final score; no code needed (the league agreed the
// other team will spot and correct a wrong one). The site checks the match and the numbers, then hands it to
// the Apps Script in the Google Sheet with the League code (a Cloudflare secret), and the script writes the
// score into that week's tab. The script still wants a code, so only this site can write to the sheet.
export async function onRequestPost({ request, env }) {
  const missing = ['APPS_SCRIPT_URL', 'LEAGUE_CODE'].filter(k => !env[k]);
  if (missing.length) return json({ error: `Score sending isn’t switched on yet (the site can’t see ${missing.join(' or ')}). Please send your score to the league as usual.` }, 503);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Bad request.' }, 400); }
  const homeScore = Number(body.homeScore), awayScore = Number(body.awayScore);
  const wentFirst = body.wentFirst === 'Home' || body.wentFirst === 'Away' ? body.wentFirst : null;

  const bad = checkScores(homeScore, awayScore);
  if (bad) return json({ error: bad }, 400);
  if (!wentFirst) return json({ error: 'Say which team went first.' }, 400);

  const league = await loadLeague(env);
  const week = league.weeks.find(w => w.week === Number(body.week));
  const match = week?.matches.find(m => m.home === body.home && m.away === body.away);
  if (!match) return json({ error: 'That match isn’t in the fixtures.' }, 400);
  if (week.date > londonToday()) return json({ error: 'That match hasn’t been played yet.' }, 400);

  let result;
  try {
    const res = await fetch(String(env.APPS_SCRIPT_URL).trim(), {
      method: 'POST',
      headers: { 'content-type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ tab: week.tab, home: match.home, away: match.away, homeScore, awayScore, wentFirst, code: String(env.LEAGUE_CODE).trim() }),
      redirect: 'follow',
    });
    result = await res.json();
  } catch {
    return json({ error: 'Couldn’t reach the league sheet. Please try again in a minute.' }, 502);
  }
  if (!result.ok) return json({ error: result.error || 'The sheet didn’t accept the score.' }, 400);

  await caches.default.delete(new Request(`${new URL(request.url).origin}/api/league`));
  return json({ ok: true, week: week.week, home: match.home, away: match.away, homeScore, awayScore, by: result.by });
}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
