import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildLeague, checkScores, isoDate, parseCsv } from '../lib/league.js';

const scores = readFileSync(new URL('./fixtures/all-scores.csv', import.meta.url), 'utf8');
const questions = readFileSync(new URL('./fixtures/questions.csv', import.meta.url), 'utf8');
const league = buildLeague(scores, questions, '2026-10-08');

test('reads every week with its question setters', () => {
  assert.equal(league.weeks.length, 27);
  assert.deepEqual(league.weeks[0], {
    week: 1, date: '2026-10-01', tab: '01-10-2026', setter: 'REMS',
    matches: [
      { home: 'Sportsman', away: 'Lodgers', homeScore: 30, awayScore: 25, played: true },
      { home: 'Kinder Lodge', away: 'Shepherds', homeScore: 32, awayScore: 14, played: true },
      { home: 'Hare & Hounds', away: 'Papermill', homeScore: 21, awayScore: 30, played: true },
      { home: 'Old Hall', away: 'Malt Disley', homeScore: 19, awayScore: 29, played: true },
    ],
  });
  assert.equal(league.weeks[14].tab, '21-01-2027');
  assert.equal(league.weeks[1].matches[0].played, false);
  assert.equal(league.teams.length, 9);
});

test('table matches the sheet after week 1', () => {
  assert.deepEqual(league.table.map(r => [r.pos, r.team, r.played, r.points, r.for, r.against]), [
    [1, 'Kinder Lodge', 1, 2, 32, 14],
    [2, 'Papermill', 1, 2, 30, 21],
    [2, 'Sportsman', 1, 2, 30, 25],
    [4, 'Malt Disley', 1, 2, 29, 19],
    [5, 'Lodgers', 1, 0, 25, 30],
    [6, 'Hare & Hounds', 1, 0, 21, 30],
    [7, 'Old Hall', 1, 0, 19, 29],
    [8, 'Shepherds', 1, 0, 14, 32],
    [9, 'REMS', 0, 0, 0, 0],
  ]);
});

test('last and next game', () => {
  assert.equal(league.lastWeek, 1);
  assert.equal(league.nextWeek, 2);
  assert.equal(buildLeague(scores, questions, '2026-10-09').nextWeek, 3);
});

test('draws give a point each', () => {
  const s = scores.replace('"08/10/2026","REMS","0"', '"08/10/2026","REMS","27"').replace('"Kinder Lodge","0"', '"Kinder Lodge","27"');
  const l = buildLeague(s, questions, '2026-10-08');
  const rems = l.table.find(r => r.team === 'REMS');
  assert.equal(rems.drawn, 1); assert.equal(rems.points, 1);
  assert.equal(l.nextWeek, 2, 'week 2 is still on tonight');
  assert.equal(l.lastWeek, 1);
  assert.equal(buildLeague(s, questions, '2026-10-09').lastWeek, 2);
});

test('helpers', () => {
  assert.equal(isoDate('1/10/2026'), '2026-10-01');
  assert.deepEqual(parseCsv('"a ""b""",c\n1,"2,3"'), [['a "b"', 'c'], ['1', '2,3']]);
  assert.equal(checkScores(30, 25), null);
  assert.ok(checkScores(40, 25));
  assert.ok(checkScores(0, 0));
  assert.ok(checkScores(2.5, 3));
});
