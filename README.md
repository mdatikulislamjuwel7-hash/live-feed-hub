# Live Feed Hub

Reward activity dashboard for public/live earning feeds. It runs locally with an Express server and can also be deployed to Netlify or Vercel using serverless functions.

## Local Run

```bash
npm install
npm start
```

Open:

```text
http://127.0.0.1:3847/
```

## Persistence

Local server data is saved in:

```text
.data/live-feed-state.json
```

That file is ignored by git. Restarting the local server now loads old stored events before polling again.

On Netlify, the same state is saved to Netlify Blobs from inside the serverless function. Netlify Blobs is meant for unstructured function data and supports `getStore`, `get`, and `setJSON`; updates can take up to about 60 seconds to propagate globally.

## Telegram Bot Alerts

The local server can send new live rows to a Telegram chat.

1. Open Telegram and message `@BotFather`.
2. Create a bot with `/newbot`.
3. Copy the bot token.
4. Send any message to your bot.
5. Get your chat id by opening this URL in a browser:

```text
https://api.telegram.org/botYOUR_TOKEN/getUpdates
```

6. Start the server with environment variables:

PowerShell:

```powershell
$env:TELEGRAM_BOT_TOKEN="YOUR_TOKEN"
$env:TELEGRAM_CHAT_ID="YOUR_CHAT_ID"
$env:TELEGRAM_BATCH_LIMIT="5"
npm start
```

If those variables are not set, the app runs normally without Telegram messages.

## Netlify Deploy

This repo includes:

```text
netlify.toml
netlify/functions/api.js
```

Deploy steps:

1. Push this folder to a GitHub repository.
2. In Netlify, create a new site from that repository.
3. Use the default settings from `netlify.toml`.
4. Add optional environment variables:
   - `REVNO_COOKIE` for Revno authenticated dashboard data.
   - `REFRESH_MIN_SECONDS` to control minimum refresh interval. Default is `45`.
5. Deploy.

Netlify routes:

```text
/api/feed
/api/sources
/api/top-offers
/api/stream
```

The Netlify version fetches and stores data when visitors hit the API. It skips browser-only adapters such as ApuCash browser rendering and PaidCash browser fallback so the free function stays lightweight.

## Vercel Deploy

This repo also includes:

```text
vercel.json
api/index.js
```

Deploy steps:

1. Push this folder to GitHub.
2. In Vercel, import the GitHub repository.
3. Framework preset: `Other`.
4. Build command: leave empty or use Vercel default.
5. Output directory: `public`.
6. Add optional environment variables:
   - `BLOB_READ_WRITE_TOKEN` if using Vercel Blob persistence.
   - `LIVE_FEED_STATE_BLOB_URL` after the first blob save, so future cold starts can read the same JSON file.
   - `REVNO_COOKIE` for Revno authenticated dashboard data.
   - `REFRESH_MIN_SECONDS` to control minimum refresh interval. Default is `45`.
7. Deploy.

Vercel routes:

```text
/api/feed
/api/sources
/api/top-offers
/api/stream
```

The Vercel version works like the Netlify version: it refreshes data when visitors hit the API and stores history in Vercel Blob when `BLOB_READ_WRITE_TOKEN` is configured. It skips browser-only adapters so the free function remains deployable.

## Current Sources

- ApuCash: local browser/Livewire adapter.
- CashInStyle: public ticker API.
- PaidCash: local socket/browser adapter.
- Gamers Universe: public/live page, payout rows disabled.
- GoldTasker: public API.
- CashlyEarn Public: public homepage cards.
- LootyCash: public API.
- EarnLab: public API.
- LootGain: public GraphQL.
- ZxEarn: public homepage parser.
- EarnGift: public `Live.php` table.
- HuntSkin: public `Liveoffersfinal/Live.php` table.
- PaidByte: public live leads API.
- Revno: authenticated dashboard parser when cookie is valid.

## Notes

- Use only public endpoints or cookies/sessions from accounts you own or are allowed to use.
- Do not commit cookie files. `.gitignore` excludes local cookies and `.data`.
- Netlify free functions are not long-running servers, so live updates happen by request refresh rather than permanent background polling.
