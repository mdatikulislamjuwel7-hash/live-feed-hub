# Project Memory

Live Feed Hub is a Node/Express app in this folder. It aggregates public reward-site activity into a live ticker and history feed at http://127.0.0.1:3847/.

## Latest UI State

- Dashboard redesigned as a dark reward activity console with sticky topbar, live ticker, source sidebar, summary metrics, top offers, and paginated history.
- `public/app.js` was cleaned to remove mojibake display characters and now renders source count pills, cleaner pagination, and safer ASCII fallback text.
- `public/styles.css` is the current polished responsive design file. Cache-busted assets use `?v=6` in `public/index.html`.

## Persistence / Netlify State

- Local server data persists to `.data/live-feed-state.json` and is loaded on server start.
- Local history now keeps up to 5000 events and exposes up to 30 pages of history, so old data remains visible after the PC/server is restarted.
- Local startup does one extra fast refresh for non-browser sources after 7 seconds to bring first live rows in quicker.
- Telegram bot alerts are optional. Set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` before `npm start`; new live rows will be sent in batches. Without those vars, Telegram stays disabled and the app works normally.
- Netlify deploy support was added with `netlify.toml` and `netlify/functions/api.js`.
- Netlify Functions use `@netlify/blobs` through `src/persistence.js` so feed history survives function restarts and repeat visits.
- Vercel deploy support was added with `vercel.json` and `api/index.js`.
- Vercel Functions use `@vercel/blob` through `src/persistence.js` when `BLOB_READ_WRITE_TOKEN` is configured. Set `LIVE_FEED_STATE_BLOB_URL` after first save so cold starts can read the same persisted JSON.
- Netlify skips browser-only adapters (`html-livewire`, `paidcash-browser`) to keep free functions lightweight. Public/API/table sources remain supported.
- Netlify/Vercel skip browser-only adapters (`html-livewire`, `paidcash-browser`) to keep free functions lightweight. Public/API/table sources remain supported.
- Set `REVNO_COOKIE` in deployment environment variables if Revno authenticated data should work online.

## Current Working Sources

- ApuCash: HTML/Livewire/headless browser adapter.
- CashInStyle: public `activity-ticker.json`.
- PaidCash: Faucetify socket plus browser fallback, with offer name and country when public.
- Gamers Universe: public live page, with optional authorized cookie support for richer completions.
- GoldTasker: public `https://goldtasker.com/api/live-offers`.
- CashlyEarn Public: visible public homepage activity cards only.
- LootyCash: public `https://lootycash.com/api/offers/completed`.
- EarnLab: public `https://api.earnlab.com/activities`.
- LootGain: public GraphQL `getLiveRewards`.
- ZxEarn: public homepage HTML tooltip parsing.
- EarnGift: public `Live.php` table. Uses insecure TLS only because the site certificate is expired.
- HuntSkin: public `Liveoffersfinal/Live.php` table.
- Revno: authenticated dashboard parser using locally stored user-provided cookies. It reads history rows when present, latest dashboard withdrawals, and visible offerwall partner boost cards.

## Pending / Needs Authorized Account Data

- Cointo, EarnG, GainCash, Lunairo, JJReward, HogoCash, JumpTask.
- Tapnoon: public page found, but no usable public live endpoint identified yet.
- Splitdrop and RewardXP: public requests currently blocked by CloudFront/Cloudflare 403, so use only an authorized API/session if the user provides one.
- Use only public endpoints or cookies/sessions from accounts the user owns or is allowed to use.
- Do not bypass private accounts, hidden data, protected APIs, or access controls.

## Files Added For New Sources

- `src/adapters/json-feed.js`
- `src/adapters/graphql-feed.js`
- `src/adapters/zxearn-html.js`
- `src/adapters/cashlyearn-public.js`
- `src/adapters/live-table.js`
- `src/adapters/auth-history-table.js`
- `src/adapters/revno-dashboard.js`
- `src/persistence.js`
- `src/telegram.js`
- `src/netlify-fetch-source.js`
- `src/netlify-runtime.js`
- `netlify/functions/api.js`
- `netlify.toml`
- `api/index.js`
- `vercel.json`
- `config/site-cookie-notes.example`

## Run Commands

```bash
npm install
npm start
```

Open http://127.0.0.1:3847/.
