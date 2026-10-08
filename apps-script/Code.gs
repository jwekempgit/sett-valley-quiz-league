/**
 * Sett Valley Quiz League: lets the website write match scores into this spreadsheet.
 *
 * Paste this whole file into Extensions → Apps Script (replacing what's there), then follow
 * "Switching on score sending" in the README. Each team gets its own code; the code for
 * "League" can send or correct any match.
 *
 * What it writes: on the week's tab (named dd-mm-yyyy), in the row for the match, the home
 * score in column B, the away score in column C and who went first ("Home"/"Away") in column H.
 * Every score sent is also listed on a "Website Results" tab.
 */

const ADMIN = 'League';
const LOG_TAB = 'Website Results';
const CODE_LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Quiz League')
    .addItem('Show team codes', 'showCodes')
    .addItem('Make a new code for one team…', 'renewCode')
    .addToUi();
}

// Called by the website.
function doPost(e) {
  try {
    const req = JSON.parse(e.postData.contents);
    if (tooManyTries_()) return reply_({ ok: false, error: 'Too many wrong codes. Please wait ten minutes and try again.' });

    const who = whoIs_(req.code);
    if (!who) { countFailure_(); return reply_({ ok: false, error: 'That team code isn’t right.' }); }
    if (who !== ADMIN && who !== req.home) return reply_({ ok: false, error: 'Only ' + req.home + ' (the home team) can send this score.' });

    const homeScore = Number(req.homeScore), awayScore = Number(req.awayScore);
    if (!(isWhole_(homeScore) && isWhole_(awayScore))) return reply_({ ok: false, error: 'Scores must be whole numbers.' });
    if (req.wentFirst !== 'Home' && req.wentFirst !== 'Away') return reply_({ ok: false, error: 'Say which team went first.' });

    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheet = ss.getSheetByName(String(req.tab));
      if (!sheet) return reply_({ ok: false, error: 'There’s no tab called ' + req.tab + '.' });

      const rows = sheet.getRange(1, 1, 10, 4).getValues();
      const i = rows.findIndex(r => String(r[0]).trim() === req.home && String(r[3]).trim() === req.away);
      if (i < 0) return reply_({ ok: false, error: req.home + ' v ' + req.away + ' isn’t on the ' + req.tab + ' tab.' });

      const before = sheet.getRange(i + 1, 2, 1, 2).getValues()[0];
      sheet.getRange(i + 1, 2, 1, 2).setValues([[homeScore, awayScore]]);
      sheet.getRange(i + 1, 8).setValue(req.wentFirst);
      SpreadsheetApp.flush();

      log_(ss, [new Date(), req.tab, req.home, homeScore, awayScore, req.away, req.wentFirst, who, before[0] + ' v ' + before[1]]);
    } finally {
      lock.releaseLock();
    }
    return reply_({ ok: true, by: who });
  } catch (err) {
    return reply_({ ok: false, error: 'The sheet hit a problem: ' + err.message });
  }
}

function doGet() {
  return reply_({ ok: true, message: 'Sett Valley Quiz League score sending is on.' });
}

function showCodes() {
  const codes = codes_();
  const lines = Object.keys(codes).sort((a, b) => a === ADMIN ? 1 : b === ADMIN ? -1 : a.localeCompare(b))
    .map(t => t + ':  ' + codes[t]);
  SpreadsheetApp.getUi().alert('Team codes', lines.join('\n') + '\n\nGive each home team its own code. The League code can send or correct any score.', SpreadsheetApp.getUi().ButtonSet.OK);
}

function renewCode() {
  const ui = SpreadsheetApp.getUi();
  const res = ui.prompt('New code', 'Type the team name exactly as it appears in the fixtures (or League):', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  const team = res.getResponseText().trim();
  const codes = codes_();
  if (!(team in codes)) { ui.alert('No team called "' + team + '".'); return; }
  codes[team] = newCode_(codes);
  PropertiesService.getScriptProperties().setProperty('codes', JSON.stringify(codes));
  ui.alert(team + '’s new code is ' + codes[team] + '. The old one no longer works.');
}

// Codes live in the script's own settings, not in the spreadsheet, so people who can see the sheet can't see them.
// Any team missing a code (including a new team added to the Questions tab) gets one here.
function codes_() {
  const props = PropertiesService.getScriptProperties();
  const codes = JSON.parse(props.getProperty('codes') || '{}');
  let changed = false;
  for (const team of teams_().concat([ADMIN])) {
    if (!codes[team]) { codes[team] = newCode_(codes); changed = true; }
  }
  if (changed) props.setProperty('codes', JSON.stringify(codes));
  return codes;
}

function teams_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Questions');
  const names = sheet.getRange(1, 2, sheet.getLastRow(), 1).getValues().map(r => String(r[0]).trim()).filter(String);
  return Array.from(new Set(names));
}

function whoIs_(code) {
  const given = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (given.length < 6) return null;
  const codes = codes_();
  return Object.keys(codes).find(t => codes[t] === given) || null;
}

function newCode_(existing) {
  const taken = new Set(Object.values(existing));
  for (;;) {
    const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid());
    let code = '';
    for (let i = 0; i < 6; i++) code += CODE_LETTERS[(bytes[i] + 256) % CODE_LETTERS.length];
    if (!taken.has(code)) return code;
  }
}

function tooManyTries_() {
  return Number(CacheService.getScriptCache().get('fails') || 0) >= 20;
}

function countFailure_() {
  const cache = CacheService.getScriptCache();
  cache.put('fails', String(Number(cache.get('fails') || 0) + 1), 600);
}

function log_(ss, row) {
  let sheet = ss.getSheetByName(LOG_TAB);
  if (!sheet) {
    sheet = ss.insertSheet(LOG_TAB);
    sheet.appendRow(['Sent', 'Week tab', 'Home', 'Home score', 'Away score', 'Away', 'Went first', 'Sent by', 'Score before']);
    sheet.setFrozenRows(1);
  }
  sheet.appendRow(row);
}

function isWhole_(n) {
  return Number.isInteger(n) && n >= 0 && n <= 60;
}

function reply_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
