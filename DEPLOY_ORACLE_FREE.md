# Oracle Cloud Always Free Deploy

This app needs a VPS for true 24/7 polling. Serverless hosts can sleep or stop background polling.

## What This Setup Gives You

- The live feed keeps polling even when nobody opens the dashboard.
- `.data/live-feed-state.json` persists history on disk.
- Each source keeps up to 400 history rows.
- PM2 restarts the app after crashes and VM reboots.

## 1. Create Free VM

Use Oracle Cloud Always Free:

- Image: Ubuntu 22.04 or 24.04
- Shape: Ampere A1 Free or AMD Micro Free
- Open port: `80` and optionally `443`

## 2. Install Runtime

```bash
sudo apt update
sudo apt install -y curl git nginx
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
```

## 3. Upload / Clone App

```bash
git clone YOUR_REPO_URL live-feed-hub
cd live-feed-hub
npm install
```

Copy private cookies/config files to the VPS:

```bash
mkdir -p config .data
# copy your local config/apucash.cookie, splitdrop.cookie, etc. if needed
```

## 4. Run 24/7 With PM2

```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

After `pm2 startup`, run the exact command PM2 prints.

Useful commands:

```bash
pm2 status
pm2 logs live-feed-hub
pm2 restart live-feed-hub
```

## 5. Nginx Reverse Proxy

Create `/etc/nginx/sites-available/live-feed-hub`:

```nginx
server {
  listen 80;
  server_name YOUR_DOMAIN_OR_SERVER_IP;

  location / {
    proxy_pass http://127.0.0.1:3847;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
  }
}
```

Enable it:

```bash
sudo ln -s /etc/nginx/sites-available/live-feed-hub /etc/nginx/sites-enabled/live-feed-hub
sudo nginx -t
sudo systemctl reload nginx
```

Open:

```text
http://YOUR_DOMAIN_OR_SERVER_IP
```

## 6. HTTPS Optional

If you have a domain:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d YOUR_DOMAIN
```

## Notes

- Do not commit real cookie files. Keep them only on your machine/VPS.
- If a site does not provide an actual completion timestamp, the app stores the first-seen time.
- Admin panel: `/admin.html`
- Custom postbacks: `/api/postback/custom`
