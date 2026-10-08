// Turns the Google Sheet into what the website shows.
// The sheet stays the source of truth: fixtures and scores come from the All Scores tab
// (which pulls each match from that week's dd-mm-yyyy tab), and who sets the questions comes from the Questions tab.

export const SHEET_ID = '16gh2DKYlLI0Q7hbNYD9ivbH8ndQ4GwkfVZ2AuaYDXrE';

// Public CSV of one tab. Works because the sheet is shared as "anyone with the link can view".
export const csvUrl = (sheetId, tab, range, base = 'https://docs.google.com') =>
  `${base}/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&headers=0&sheet=${encodeURIComponent(tab)}&range=${range}`;

export const TABS = {
  scores: { tab: 'All Scores', range: 'A3:M200' },   // A date, B home, C home score, H away, I away score
  questions: { tab: 'Questions', range: 'A1:D60' },  // A "Week 1", B team setting the questions, C date
};

export function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

// "1/10/2026", "01/10/2026" or "2026-10-01" -> "2026-10-01". UK day-first, as the sheet is.
export function isoDate(s) {
  s = String(s || '').trim();
  let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? m[0] : null;
}

// The week tabs are named dd-mm-yyyy.
export const tabName = iso => iso.split('-').reverse().join('-');

const num = s => {
  const n = Number(String(s ?? '').trim());
  return Number.isFinite(n) ? n : 0;
};

// A match counts once either team has a score, the same test the sheet uses.
export function buildLeague(scoresCsv, questionsCsv, today) {
  const setters = new Map();
  for (const r of parseCsv(questionsCsv)) {
    const date = isoDate(r[2]);
    const week = Number(String(r[0] || '').replace(/\D/g, ''));
    if (date && week) setters.set(date, { week, setter: (r[1] || '').trim(), kind: (r[3] || '').trim() });
  }

  const byDate = new Map();
  for (const r of parseCsv(scoresCsv)) {
    const date = isoDate(r[0]);
    const home = (r[1] || '').trim(), away = (r[7] || '').trim();
    if (!date || !home || !away) continue;
    const hs = num(r[2]), as = num(r[8]);
    const played = hs > 0 || as > 0;
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date).push({ home, away, homeScore: played ? hs : null, awayScore: played ? as : null, played });
  }

  const dates = [...byDate.keys()].sort();
  const weeks = dates.map((date, i) => {
    const q = setters.get(date) || {};
    return { week: q.week || i + 1, date, tab: tabName(date), setter: q.setter || '', matches: byDate.get(date) };
  });

  const teams = new Set();
  for (const w of weeks) for (const m of w.matches) { teams.add(m.home); teams.add(m.away); }
  for (const q of setters.values()) if (q.setter) teams.add(q.setter);

  const rows = new Map([...teams].map(t => [t, { team: t, played: 0, won: 0, drawn: 0, lost: 0, for: 0, against: 0, points: 0, form: [] }]));
  for (const w of weeks) for (const m of w.matches) {
    if (!m.played) continue;
    const h = rows.get(m.home), a = rows.get(m.away);
    h.played++; a.played++;
    h.for += m.homeScore; h.against += m.awayScore;
    a.for += m.awayScore; a.against += m.homeScore;
    if (m.homeScore > m.awayScore) { h.won++; a.lost++; h.points += 2; h.form.push('W'); a.form.push('L'); }
    else if (m.homeScore < m.awayScore) { a.won++; h.lost++; a.points += 2; a.form.push('W'); h.form.push('L'); }
    else { h.drawn++; a.drawn++; h.points++; a.points++; h.form.push('D'); a.form.push('D'); }
  }
  // Same order as the sheet's table: league points, then quiz points scored.
  const table = [...rows.values()]
    .map(r => ({ ...r, diff: r.for - r.against, form: r.form.slice(-5) }))
    .sort((x, y) => y.points - x.points || y.for - x.for || y.diff - x.diff || x.team.localeCompare(y.team));
  let pos = 0;
  table.forEach((r, i) => { if (i === 0 || r.points !== table[i - 1].points || r.for !== table[i - 1].for) pos = i + 1; r.pos = pos; });

  // Next game: the first week from today that still has a match to play (so on match night it's tonight's games,
  // filling in as scores arrive). Last results: the most recent week before that with a score in.
  const latestPlayed = [...weeks].reverse().find(w => w.matches.some(m => m.played));
  const nextWeek = weeks.find(w => w.date >= today && w.matches.some(m => !m.played))
    || weeks.find(w => w.date > (latestPlayed?.date || '') && w.matches.some(m => !m.played)) || null;
  const lastWeek = [...weeks].reverse().find(w => w !== nextWeek && w.date <= (nextWeek?.date || '9999') && w.matches.some(m => m.played)) || null;

  return {
    season: seasonName(dates),
    teams: [...teams].sort(),
    table,
    weeks,
    lastWeek: lastWeek?.week ?? null,
    nextWeek: nextWeek?.week ?? null,
  };
}

function seasonName(dates) {
  if (!dates.length) return '';
  const a = dates[0].slice(0, 4), b = dates[dates.length - 1].slice(0, 4);
  return a === b ? a : `${a}/${b.slice(2)}`;
}

// Scores a home team can send: whole numbers, and the two together can't beat the 60 questions asked.
export function checkScores(homeScore, awayScore) {
  const ok = n => Number.isInteger(n) && n >= 0 && n <= 60;
  if (!ok(homeScore) || !ok(awayScore)) return 'Scores must be whole numbers between 0 and 60.';
  if (homeScore + awayScore === 0) return 'Enter both scores.';
  if (homeScore + awayScore > 60) return 'The two scores add up to more than 60 questions.';
  return null;
}
