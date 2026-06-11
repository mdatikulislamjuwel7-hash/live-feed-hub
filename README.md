# Live Feed Hub

এক ওয়েবসাইটে অনেক রিওয়ার্ড সাইটের **লাইভ earn টিকার** একসাথে দেখুন।

## চালানো

```bash
cd "c:\Users\MD Atikul Islam\Documents\busnees"
npm install
npm start
```

ব্রাউজার: **http://localhost:3847**

Admin panel: **http://localhost:3847/admin.html**

## History / persistence

- প্রতি source/site সর্বোচ্চ **400 history rows** রাখা হয়।
- History `.data/live-feed-state.json` ফাইলে save হয়, তাই restart-এর পরও data থাকে।
- Source/API যদি actual completion timestamp দেয়, app সেটাই দেখায়।
- Source timestamp না দিলে app first-seen time save করে, কারণ public feed থেকে real completion time পাওয়া যায় না।

## Custom offers + postback

`/admin.html` থেকে custom offer add/update/delete করা যায়।

প্রতি custom offer-এর জন্য admin panel থেকে:

- Click URL copy করা যায়
- Postback URL copy করা যায়
- Postback hit হলে `Custom Offers` source হিসেবে History + Daily Top Offers-এ conversion যোগ হয়

Example postback:

```text
http://localhost:3847/api/postback/custom?offer_id=OFFER_ID&click_id={click_id}&user_id={user_id}&amount={amount}&txid={txid}&secret=SECRET
```

## Free 24/7 server

True 24/7 background polling-এর জন্য free serverless না, **Oracle Cloud Always Free VPS** ব্যবহার করুন।

Deploy guide: [`DEPLOY_ORACLE_FREE.md`](./DEPLOY_ORACLE_FREE.md)

Railway deploy guide: [`DEPLOY_RAILWAY.md`](./DEPLOY_RAILWAY.md)

Railway-তে history persist রাখতে Volume mount করে `DATA_DIR=/data` set করুন।

## Telegram bot

Environment variables:

```env
TELEGRAM_BOT_TOKEN=YOUR_NEW_TOKEN
TELEGRAM_CHAT_ID=YOUR_CHAT_ID
TELEGRAM_ALLOWED_CHAT_IDS=YOUR_CHAT_ID
TELEGRAM_MIN_AMOUNT=40
```

Commands:

```text
/status
/sources
/feed
/feed apucash
/top
/top apucash
```

## এখন যেসব সাইট যুক্ত

| সাইট | পদ্ধতি |
|------|--------|
| **ApuCash** | Headless browser (Livewire poll ~18s) + HTML fallback |
| **CashInStyle** | পাবলিক API `activity-ticker.json` |
| **PaidCash** | Socket.io (`servers.faucetify.io`) — offer name + country when public |
| **Gamers Universe** | [live.html](https://gamersunivers.com/page/live.html) — Live Completions (cookie) অথবা পাবলিক payouts |

### Gamers Universe — Live Completions (Offery, offer নাম)

স্ক্রিনশটের মতো **Tillamook / LifePoints** দেখতে লগইন কুকি দরকার:

1. ব্রাউজারে [login](https://gamersunivers.com/page/login.html) করুন  
2. [live.html](https://gamersunivers.com/page/live.html) খুলুন (Live Completions)  
3. DevTools → Application → Cookies → `PHPSESSID` ইত্যাদি কপি করুন  
4. `config/gamersuniverse.cookie.example` কপি করে `config/gamersuniverse.cookie` এ পেস্ট করুন  
5. `npm start` রিস্টার্ট করুন  

কুকি ছাড়া শুধু পাবলিক **Recent Payouts** (৫টি) দেখাবে — Offery offer completions নয়।

## নতুন সাইট যোগ করা

`config/sources.json` এ এন্ট্রি যোগ করুন:

**JSON API** (যদি `https://example.com/api/activity-ticker.json` কাজ করে):

```json
{
  "id": "mysite",
  "name": "My Site",
  "enabled": true,
  "type": "ticker-api",
  "url": "https://example.com/api/activity-ticker.json",
  "color": "#f59e0b",
  "pollSeconds": 25
}
```

**ApuCash-এর মতো HTML ticker**:

```json
{
  "id": "othersite",
  "name": "Other Site",
  "enabled": true,
  "type": "html-livewire",
  "url": "https://othersite.com",
  "color": "#ec4899",
  "pollSeconds": 20
}
```

সার্ভার রিস্টার্ট করুন।

## নোট

- তৃতীয় পক্ষের পাবলিক ডেটা; তালিকাভুক্ত সাইটের সাথে অফিসিয়াল সংযুক্তি নেই।
- কিছু সাইট API দেয় না — শুধু HTML scrape (`html-livewire`)।
- ApuCash **Puppeteer** দিয়ে বারবার চেক করে (~৪৫ সেকেন্ডে একবার, প্রতি বার ~২০ সেকেন্ড লাগে)।
- Monlix/Adsprem-এর **গেমের নাম** ApuCash পাবলিক ফিডে দেয় না — শুধু offerwall + coin; Daily Tasks-এ task নাম ম্যাপ করা হয়।
