// GET /api/status: shows which score-sending settings this deployment can see (never their values).
export function onRequestGet({ env }) {
  const body = {
    APPS_SCRIPT_URL: env.APPS_SCRIPT_URL ? (String(env.APPS_SCRIPT_URL).trim().endsWith('/exec') ? 'set' : 'set, but it should end in /exec') : 'missing',
    LEAGUE_CODE: env.LEAGUE_CODE ? 'set' : 'missing',
  };
  return new Response(JSON.stringify(body, null, 2), { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}
