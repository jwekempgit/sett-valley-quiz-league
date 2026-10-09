# Sett Valley Quiz League

The league website: latest table, fixtures and results for every week with the team setting the questions, the next game and the last results, plus a page where either team sends the final score at the end of the night. No code is needed: it's a friendly league, and the other team will spot and correct a wrong score.

It runs on Cloudflare Pages. The Google Sheet stays in charge: the site reads it live (cached for a minute), and scores sent from the site are written straight into that week's tab.

## What's where

| Path | What it is |
|---|---|
| `public/index.html` | The whole website. |
| `functions/api/league.js` | `GET /api/league`: reads the All Scores and Questions tabs and works out the table, weeks, next game and last results. |
| `functions/api/submit.js` | `POST /api/submit`: checks a score and passes it to the Apps Script in the sheet. |
| `lib/league.js` | How the sheet is read and the table is worked out (2 for a win, 1 for a draw; level teams split by quiz points scored, as in the sheet). |
| `apps-script/Code.gs` | The small script that lives in the Google Sheet and writes scores into the week tabs. |
| `test/` | Checks against a copy of the sheet after week 1. Run with `npm test`. |

### What the site reads from the sheet

- **All Scores**, rows 3 onwards: date (A), home team (B), home score (C), away team (H), away score (I). A match counts as played once either score is above 0, the same rule the sheet uses.
- **Questions**: week (A), team setting the questions (B), date (C).

The sheet must stay shared as **Anyone with the link can view**, which is how the site reads it.

### What the site writes

When someone sends a score, the Apps Script finds that week's tab (named like `08-10-2026`), finds the row for the match, and fills in the home score (B), the away score (C) and who went first (H, `Home` or `Away`). All Scores and the table then update on their own. Every score sent is also listed on a **Website Results** tab, with who sent it and what the score was before.

## One-time setup

### 1. Put the site on Cloudflare

1. In the Cloudflare dashboard go to **Workers & Pages → Create → Pages → Connect to Git** and choose this repository.
2. Build command: `npm ci`. Output directory: `public`. Save and deploy.

The site is then live at `sett-valley-quiz-league.pages.dev`, showing the table, fixtures and results. Every push to `main` redeploys it.

### 2. Switching on score sending

1. Open the league Google Sheet and go to **Extensions → Apps Script**.
2. Delete whatever is in the editor, paste in the whole of `apps-script/Code.gs`, and press **Save**.
3. Press **Deploy → New deployment**. Click the cog next to "Select type" and choose **Web app**. Set **Execute as: Me** and **Who has access: Anyone**, then **Deploy**. Google asks you to authorise it; allow it (if it says the app isn't verified, choose **Advanced → Go to … (unsafe)**; it's your own script).
4. Copy the **Web app URL** it shows (it ends in `/exec`).
5. Reload the Google Sheet. A **Quiz League** menu appears. Choose **Quiz League → Show team codes** and note the **League** code.
6. In Cloudflare, open the Pages project, go to **Settings → Variables and Secrets**, and add two secrets: `APPS_SCRIPT_URL` with the web app URL, and `LEAGUE_CODE` with the League code. Then redeploy so the site picks it up: on the **Deployments** tab, open the ⋯ menu on the latest Production deployment and choose **Retry deployment** (any push to `main` does the same).
"Anyone" only means the website can reach the script. The script only accepts a score sent with a valid code, and the website sends the League code itself, so people sending scores never see or type a code, but nobody can write to the sheet except through the site.

If you ever change `Code.gs`, use **Deploy → Manage deployments → Edit (pencil) → Version: New version → Deploy** so the URL stays the same.

### The League code

- **Quiz League → Show team codes** shows it. The per-team codes are left over from an earlier version and aren't used by the site.
- The codes are kept in the script's own settings, not in the sheet, so anyone who can view the sheet can't see them.
- If you ever make a new League code (**Quiz League → Make a new code for one team…**, then type `League`), update `LEAGUE_CODE` in Cloudflare and redeploy.

## Moving to settvalleyquizleague.com

When the Pages site looks right: in the Pages project open **Custom domains → Set up a custom domain**, add `www.settvalleyquizleague.com` (and `settvalleyquizleague.com`), and follow the DNS steps Cloudflare shows.

## Running it on your own computer

```
npm install
npm run dev
```

Then open http://localhost:8788. To try score sending locally, put `APPS_SCRIPT_URL=…` in a `.dev.vars` file.
