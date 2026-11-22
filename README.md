# Edgewise — trading journal with an AI coach

A glass-UI trading journal for prop-firm and independent traders: trade log, calendar, prop account drawdown tracking, payouts, 5-day plans, analytics, daily journal, playbook and a Claude-powered coach.

## Two ways it runs

| | GitHub Pages (current) | Cloudflare Pages (SaaS) |
|---|---|---|
| Hosting | static `public/` folder | `public/` + `functions/` + D1 |
| Data | saved in your browser (localStorage) | user accounts, synced to D1 |
| AI coach | off | on (key stored as a server secret) |

The app detects which one it's on: with no `/api` backend it runs in **local mode**.

On GitHub Pages, every push to `main` redeploys through `.github/workflows/pages.yml`.

For the full SaaS deploy on Cloudflare (accounts, sync, Claude), see [SETUP.txt](SETUP.txt).

> Never commit your Anthropic API key. On Cloudflare it's set with `npx wrangler pages secret put ANTHROPIC_API_KEY`.

## Pages

- `index.html`: landing page
- `app.html`: the journal
- `data/firms.json`: prop firm rules catalog (sizes, targets, drawdown, daily limits, prices), checked Nov 2026. Edit this file to update rules without touching code.
