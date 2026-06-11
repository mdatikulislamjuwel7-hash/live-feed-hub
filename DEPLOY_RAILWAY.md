# Railway Deploy Guide

Railway can run this app as one service:

- Web dashboard
- Background source polling
- Telegram alerts and commands
- Custom offer postbacks

Railway free/credit limits may apply. For reliable history, add a Railway Volume.

## 1. Important Security

If you ever pasted a real Telegram bot token into chat/code, revoke it:

```text
@BotFather -> /mybots -> your bot -> API Token -> Revoke current token
```

Use Railway environment variables for the new token.

## 2. Push To GitHub

Commit/push the project to a private GitHub repo. Do not commit:

- `config/*.cookie`
- `.data/*`
- `.env`

## 3. Create Railway Project

1. Railway -> New Project
2. Deploy from GitHub Repo
3. Select this repository
4. Railway will use `railway.json` and `npm start`

## 4. Add Environment Variables

Minimum:

```env
NODE_ENV=production
DATA_DIR=/data
TELEGRAM_BOT_TOKEN=YOUR_NEW_BOT_TOKEN
TELEGRAM_CHAT_ID=YOUR_CHAT_ID
TELEGRAM_ALLOWED_CHAT_IDS=YOUR_CHAT_ID
TELEGRAM_BOT_COMMANDS=true
TELEGRAM_MIN_AMOUNT=40
TELEGRAM_BATCH_LIMIT=5
```

Cookies, if needed:

```env
APUCASH_COOKIE=laravel_session=...; XSRF-TOKEN=...
SPLITDROP_COOKIE=...
REVNO_COOKIE=...
```

## 5. Add Railway Volume

Add a Volume and mount it at:

```text
/data
```

Keep:

```env
DATA_DIR=/data
```

This stores:

- `/data/live-feed-state.json`
- `/data/custom-offers.json`

Without a volume, history can reset on redeploy.

## 6. Open The App

Railway gives you a public domain.

Dashboard:

```text
https://YOUR-APP.up.railway.app/
```

Admin:

```text
https://YOUR-APP.up.railway.app/admin.html
```

## 7. Telegram Commands

Send these to your bot:

```text
/start
/status
/sources
/feed
/feed apucash
/top
/top apucash
```

Alerts:

- New live events are sent automatically.
- `TELEGRAM_MIN_AMOUNT=40` means only 40+ amount rows alert.
- `TELEGRAM_SOURCES=apucash,paidcash` limits alerts to selected sources.

## 8. Custom Offer Postback

Go to:

```text
/admin.html
```

Create an offer, then copy:

- Click URL
- Postback URL

When the postback is hit, it creates a `Custom Offers` history row and updates Daily Top Offers.
