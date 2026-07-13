# 2026 MLB Trade Deadline War Room

A deployable public dashboard for confirmed trades, source-graded rumors, team market tiers and betting implications.

## What updates automatically

- MLB standings are requested from the public MLB Stats API.
- The official MLB transactions page is checked for descriptions containing “traded.”
- The workflow runs at minutes 7 and 37 of each UTC hour.
- Changes are committed to `data/site-data.json`, which triggers a GitHub Pages deployment.

Scheduled GitHub Actions can run later than the exact cron minute. Do not describe the site as a real-time wire service.

## What stays editorial

Rumors should **not** be auto-published from social media or news search.

Mike edits:

- `data/manual-rumors.json`
- `data/manual-overrides.json` for confirmed manual trades or simple notes

Addison controls:

- `styles.css`
- branding, domain and GitHub Pages deployment
- team tier/need/betting-note overrides

## Deploy in about 10 steps

1. Create a new GitHub repository.
2. Upload all contents of this folder, including `.github`.
3. Name the default branch `main`.
4. Open **Settings → Pages**.
5. Under **Build and deployment**, select **GitHub Actions**.
6. Open **Actions** and run “Refresh MLB deadline data” manually once.
7. Open “Deploy site to GitHub Pages.”
8. GitHub displays the public URL after deployment.
9. Add that URL to Discord and the website navigation.
10. For a custom domain, enter it under **Settings → Pages → Custom domain**.

## Mike’s rumor format

```json
{
  "player": "Player Name",
  "team": "DET",
  "role": "SP",
  "status": "Potentially available",
  "confidence": "High",
  "context": "What a credible reporter actually said.",
  "betting_relevance": "Specific F5, bullpen, lineup or prop implication.",
  "source": "https://source-url"
}
```

Confidence rules:

- **High:** official team/MLB source or multiple top national reporters.
- **Medium:** one established national reporter or directly sourced beat writer.
- **Low:** credible speculation, fit discussion or weakly sourced report.
- Never publish screenshots without the original source link.
- Never change “rumor” to “confirmed” until an official club or MLB transaction source posts it.

## Optional Discord alerts

The starter does not send Discord messages automatically. The next addition should compare the old and new `site-data.json`; when a new confirmed trade appears, post a webhook alert. Store the webhook as a GitHub Actions secret named `DISCORD_WEBHOOK_URL`, never in the repository.

## Local preview

Run:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

## Important limitations

- MLB can change webpage markup or an undocumented/public endpoint.
- Automated transaction detection identifies candidate trade text; betting impact still needs editorial review.
- Standings do not alone determine whether a club buys or sells.
- Rumors require human approval to protect credibility.
