# Buildery — VPS Deployment Guide

Production deployment runbook for a self-hosted VPS.

**Target stack**

| Component   | Choice                              |
| ----------- | ----------------------------------- |
| OS          | Ubuntu 22.04 / 24.04 LTS            |
| Runtime     | Node.js 20 LTS                      |
| Package mgr | pnpm 9                              |
| Database    | PostgreSQL 16                       |
| Process mgr | PM2                                 |
| Web server  | Nginx (reverse proxy)               |
| TLS         | Let's Encrypt via Certbot           |
| Uploads     | Local disk — `public/uploads/`      |

Throughout this guide, substitute your own values for these placeholders:

| Placeholder              | Example                       |
| ------------------------ | ----------------------------- |
| `buildery.example.com`   | your domain                   |
| `/var/www/buildery`      | the app directory             |
| `buildery` (Linux user)  | the unprivileged app user     |
| `DB_PASSWORD`            | a long random DB password     |

---

## 0. Before you start

- A VPS with a public IP and root (or sudo) access.
- A domain name you can point at the VPS.
- Locally generated secrets:
  ```bash
  openssl rand -base64 32   # NEXTAUTH_SECRET
  openssl rand -base64 24   # DB password
  openssl rand -hex 32      # JOBS_RUNNER_SECRET
  ```

> **Security note:** never paste server passwords into chats, issues, or
> commits. If a credential has been exposed, rotate it. Prefer SSH keys over
> password login (see the security checklist).

---

## 1. Update the server & create an app user

SSH in as root, then:

```bash
apt update && apt upgrade -y
apt install -y curl git ufw build-essential

# Run the app as an unprivileged user, not root.
adduser --system --group --shell /bin/bash --home /home/buildery buildery
```

Basic firewall — allow SSH + web only:

```bash
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable
```

---

## 2. Install Node.js 20 LTS

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
node -v        # v20.x
```

## 3. Install pnpm

```bash
corepack enable
corepack prepare pnpm@9 --activate
pnpm -v        # 9.x
```

## 4. Install PostgreSQL 16

```bash
apt install -y postgresql postgresql-contrib
systemctl enable --now postgresql
psql --version
```

## 5. Create the database and user

```bash
sudo -u postgres psql <<'SQL'
CREATE USER buildery WITH PASSWORD 'DB_PASSWORD';
CREATE DATABASE buildery OWNER buildery;
GRANT ALL PRIVILEGES ON DATABASE buildery TO buildery;
SQL
```

PostgreSQL listens on `localhost` only by default — keep it that way. The app
connects over `localhost:5432`, never exposed to the internet.

Test the connection:

```bash
psql 'postgresql://buildery:DB_PASSWORD@localhost:5432/buildery' -c '\conninfo'
```

---

## 6. Get the project onto the server

```bash
mkdir -p /var/www
cd /var/www
git clone <YOUR_REPO_URL> buildery
chown -R buildery:buildery /var/www/buildery
```

No git remote? Upload a local copy instead (exclude `node_modules` and
`.next`):

```bash
# from your machine
rsync -av --exclude node_modules --exclude .next --exclude .git \
  ./buildery/ root@SERVER_IP:/var/www/buildery/
```

From here on, work as the app user inside the app directory:

```bash
sudo -u buildery -i
cd /var/www/buildery
```

## 7. Configure environment variables

```bash
cp .env.example .env
nano .env
```

Set, at minimum:

```ini
DATABASE_URL="postgresql://buildery:DB_PASSWORD@localhost:5432/buildery?schema=public"
NEXTAUTH_SECRET="<openssl rand -base64 32>"
NEXTAUTH_URL="https://buildery.example.com"
NEXT_PUBLIC_APP_URL="https://buildery.example.com"
JOBS_RUNNER_SECRET="<openssl rand -hex 32>"
# Optional. Signs outgoing form webhooks (X-Buildery-Signature); falls back
# to NEXTAUTH_SECRET when unset.
WEBHOOK_SIGNING_SECRET=""
SHIPPING_WEBHOOK_SECRET="<openssl rand -hex 32>"
```

For live payments also fill the `MIDTRANS_*` keys and set
`MIDTRANS_NOTIFICATION_URL="https://buildery.example.com/api/payments/midtrans/webhook"`.

Integrations connected from the catalog (Settings → Integrations) each get
their own webhook URL, `https://<domain>/api/integrations/webhooks/<provider>/<key>`,
shown in the integration's panel. Set `INTEGRATION_SECRET_KEY` (see
`.env.example`) before connecting any, and keep it stable: it encrypts their
stored credentials.

Shipping providers can push tracking updates to `POST /api/webhooks/shipping`
with `Authorization: Bearer <SHIPPING_WEBHOOK_SECRET>`. The JSON payload accepts
`workspaceSlug`, `orderNumber`, `status`, `carrier`, `trackingNumber`,
`trackingUrl`, and `note`.

Lock the file down — it holds secrets:

```bash
chmod 600 .env
```

## 8. Install dependencies

```bash
pnpm install --frozen-lockfile
```

## 9. Generate the Prisma client

```bash
pnpm exec prisma generate
```

## 10. Run database migrations

`migrate deploy` applies committed migrations only — it never resets data, so
it is safe to re-run.

```bash
pnpm exec prisma migrate deploy
```

## 11. Seed the database (optional)

The seed creates demo users and sample content. **Skip this for a real
production install**, or run it once on a fresh database to explore:

```bash
pnpm prisma:seed
```

## 12. Build Next.js

```bash
pnpm build
```

## 13. Run with PM2

```bash
# Install PM2 globally (as root, once)
sudo npm install -g pm2

# Start the app (as the buildery user, in the app dir)
cd /var/www/buildery
pm2 start ecosystem.config.js
pm2 save

# Make PM2 resurrect the app on reboot — run the printed command as root
pm2 startup
```

Verify it's up:

```bash
pm2 status
curl -I http://127.0.0.1:3011      # expect HTTP/1.1 200 or 307
```

The PM2 config starts both the Next.js app and `buildery-jobs`. Keep
`buildery-jobs` running: it flushes Meta CAPI batches, expires overdue
pending payments, sends abandoned checkout recovery reminders, and retries
failed email/Telegram order notifications. It also reconciles pending
Midtrans payments against Midtrans status API in case a webhook is delayed or
missed, and redelivers form notifications (email, webhook, Telegram) that
failed or were left behind by a restart.

### Job runner health check

`buildery-jobs` has no scheduler of its own — it repeatedly POSTs to
`/api/jobs/run` with `Authorization: Bearer $JOBS_RUNNER_SECRET`. If that
process dies, no sweep runs and nothing in the app will complain on its own.

Check it from the dashboard at **Analitik → Job Runner**
(`/dashboard/system/jobs`, owners and admins only). It reads the
`ScheduledJob` table directly and flags:

- **Stale** — a job locked in `RUNNING` past the 10-minute reclaim window, so
  the worker that claimed it died mid-run.
- **Terlambat** — a `PENDING` job well past its `runAt`, so nothing is ticking.
- **Gagal** — a sweep that exhausted its retries; `lastError` is shown.

"Job bermasalah" should read 0 and "Aktivitas terakhir" should be minutes
old. The runner's bearer token is never rendered — the page only reports
whether one is configured.

From the shell:

```bash
pm2 status buildery-jobs
pm2 logs buildery-jobs --lines 100

# Poke the runner by hand (expects HTTP 200 and a JSON summary)
curl -s -X POST http://127.0.0.1:3011/api/jobs/run \
  -H "Authorization: Bearer $JOBS_RUNNER_SECRET" | head -c 400
```

A 401 means the secret in `.env` and the one `buildery-jobs` sends have
drifted apart; a 503 means `JOBS_RUNNER_SECRET` is unset entirely.

The recurring sweeps re-queue themselves relative to when the last one
finished, so a runner that has been down simply catches up on its next tick —
there is no bootstrap step to re-run.

## 14. Nginx reverse proxy

```bash
sudo apt install -y nginx
sudo cp /var/www/buildery/deploy/nginx.conf /etc/nginx/sites-available/buildery
# edit the file — replace buildery.example.com with your domain
sudo nano /etc/nginx/sites-available/buildery
sudo ln -s /etc/nginx/sites-available/buildery /etc/nginx/sites-enabled/buildery
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

## 15. Point the domain at the VPS

In your DNS provider, create records pointing at the VPS public IP:

```
A     buildery.example.com      → SERVER_IP
A     www.buildery.example.com  → SERVER_IP
```

Wait for propagation (`dig buildery.example.com +short` should show your IP).

## 16. SSL with Certbot (Let's Encrypt)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d buildery.example.com -d www.buildery.example.com
```

Certbot edits the Nginx config to add the HTTPS block and certificate paths,
then reloads Nginx. Choose "redirect HTTP to HTTPS" when prompted.

### Auto-renew

Certbot installs a systemd timer automatically. Confirm and dry-run it:

```bash
systemctl list-timers | grep certbot
sudo certbot renew --dry-run
```

## 17. Upload folder permissions

Product / blog / course images are written to
`public/uploads/<workspaceId>/`. The directory must be writable by the user
that runs the Node process.

```bash
cd /var/www/buildery
sudo APP_USER=buildery ./scripts/setup-uploads.sh
```

This creates `public/uploads`, sets ownership to `buildery`, and applies
`755` on directories / `644` on files.

> Uploads live inside the repo's `public/` folder so Next.js serves them at
> `/uploads/*`. They survive `pnpm build`, but **not** a fresh clone into a
> new directory — back them up with the database (see below), or move them to
> a stable path like `/var/www/buildery-uploads` and symlink.

## 18. Daily database backup (cron)

The backup script writes a compressed `pg_dump` and keeps the last 14.

```bash
# test it once
/var/www/buildery/scripts/backup-db.sh

# schedule it — edit the buildery user's crontab
crontab -u buildery -e
```

Add:

```cron
0 3 * * * /var/www/buildery/scripts/backup-db.sh >> /var/log/buildery-backup.log 2>&1
```

Backups land in `/var/backups/buildery/`. Create it writable by the app user
if needed:

```bash
sudo mkdir -p /var/backups/buildery
sudo chown buildery:buildery /var/backups/buildery
```

**Restore** from a backup (destructive — stop the app first):

```bash
pm2 stop buildery
/var/www/buildery/scripts/restore-db.sh /var/backups/buildery/buildery-<STAMP>.dump
pm2 start buildery
```

> Copy backups off the server periodically (`scp`, `rclone`, object storage).
> A backup on the same disk doesn't survive a disk failure.

---

## 19. Logging

**Application logs (PM2):**

```bash
pm2 logs buildery            # live tail
pm2 logs buildery --lines 200
```

Files: `/var/www/buildery/logs/buildery-out.log` and `buildery-error.log`.

Rotate them so they don't fill the disk:

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 14
pm2 set pm2-logrotate:compress true
```

**Nginx logs:** `/var/log/nginx/access.log`, `/var/log/nginx/error.log`
(rotated by the system `logrotate` already).

**PostgreSQL logs:** `/var/log/postgresql/`.

---

## 20. Updating / redeploying

After the first deploy, updates are one command:

```bash
cd /var/www/buildery
./scripts/deploy.sh
```

`deploy.sh` does: back up DB → `git pull` → `pnpm install` →
`prisma migrate deploy` → `prisma generate` → `pnpm build` → `pm2 reload`.

Manual equivalent:

```bash
cd /var/www/buildery
./scripts/backup-db.sh
git pull --ff-only
pnpm install --frozen-lockfile
pnpm exec prisma migrate deploy
pnpm exec prisma generate
pnpm build
pm2 reload ecosystem.config.js --update-env
pm2 save
```

## 21. Command reference

```bash
# Process
pm2 status                       # process list
pm2 restart buildery             # hard restart
pm2 reload buildery              # reload (graceful)
pm2 stop buildery                # stop
pm2 logs buildery                # tail logs

# Services
sudo systemctl reload nginx
sudo systemctl restart postgresql
sudo nginx -t                    # validate Nginx config

# Database
pnpm exec prisma migrate deploy  # apply migrations
pnpm exec prisma studio          # DB browser (dev/diagnostics)
./scripts/backup-db.sh           # manual backup
./scripts/restore-db.sh <file>   # restore
```

---

## 22. Production checklist

Before going live:

- [ ] `.env` filled in; `NEXTAUTH_URL` & `NEXT_PUBLIC_APP_URL` are the HTTPS domain
- [ ] `NEXTAUTH_SECRET` is a fresh 32-byte random value (not the example)
- [ ] `.env` is `chmod 600` and owned by the app user
- [ ] PostgreSQL user has a strong password; DB bound to `localhost` only
- [ ] `prisma migrate deploy` ran cleanly; demo seed **not** run on real data
- [ ] `pnpm build` succeeded; `pm2 status` shows `buildery` online
- [ ] `pm2 save` + `pm2 startup` done (survives reboot)
- [ ] Nginx proxies the domain; `nginx -t` passes
- [ ] HTTPS works; HTTP redirects to HTTPS; `certbot renew --dry-run` passes
- [ ] `public/uploads` exists and is writable by the app user
- [ ] Daily backup cron installed; a manual backup + test restore verified
- [ ] Backups copied off-server somewhere
- [ ] `pm2-logrotate` configured
- [ ] Midtrans: live keys set, `MIDTRANS_IS_PRODUCTION=true`, notification URL
      registered in the Midtrans dashboard and reachable over HTTPS

### Release checklist

Run through this on every deploy, in order. The first three run on your
machine (or CI) before anything reaches the server:

- [ ] `pnpm test` — unit suite green
- [ ] `pnpm test:e2e` — checkout-to-refund suite green (needs a running app
      and a database; contacts no external service)
- [ ] `pnpm build` — production build succeeds

Then on the server:

- [ ] **Back up the database before migrating** — `scripts/backup-db.sh`, and
      confirm the dump is non-empty
- [ ] `DATABASE_URL` points at the intended database (staging vs production —
      check the host and database name, not just that it is set)
- [ ] `pnpm exec prisma migrate deploy` applied cleanly; `prisma migrate
      status` reports up to date
- [ ] `JOBS_RUNNER_SECRET` is set, and `pm2 status` shows `buildery-jobs`
      online
- [ ] Midtrans webhook points at `https://<domain>/api/payments/midtrans/webhook`
- [ ] Each catalog integration in use shows "Connected and verified", and its
      webhook URL (payments, Telegram, Messenger, Instagram) is registered in
      the provider's dashboard over HTTPS
- [ ] Meta Pixel ID and access token saved per workspace (Settings →
      Integrations) for every store that uses CAPI
- [ ] `/dashboard/system/jobs` shows 0 problem jobs a few minutes after the
      deploy
- [ ] `/dashboard/payments/audit` has no new provider failures

### VPS security checklist

- [ ] SSH: key-based auth only — set `PasswordAuthentication no` and
      `PermitRootLogin prohibit-password` in `/etc/ssh/sshd_config`, then
      `systemctl restart ssh`
- [ ] A non-root sudo user exists; you no longer log in as root day-to-day
- [ ] UFW enabled — only OpenSSH + `Nginx Full` open; PostgreSQL (5432)
      **not** exposed
- [ ] `fail2ban` installed (`apt install fail2ban`) to throttle SSH brute force
- [ ] Unattended security updates on (`apt install unattended-upgrades`)
- [ ] The app runs as the unprivileged `buildery` user, never root
- [ ] Server passwords / API keys rotated if they were ever shared
- [ ] Database backups are encrypted or stored in a private location
- [ ] `NEXTAUTH_SECRET` and `MIDTRANS_SERVER_KEY` exist only in `.env` on the
      server — never in the repo, logs, or screenshots

---

## 23. Troubleshooting

| Symptom                              | Check                                                        |
| ------------------------------------ | ------------------------------------------------------------ |
| 502 Bad Gateway                      | `pm2 status` — is the app running? `pm2 logs buildery`       |
| App won't start                      | `.env` present & valid? `DATABASE_URL` reachable?            |
| `prisma migrate` errors              | DB user owns the database; `psql` connects with that URL     |
| Login redirect loop / session issues | `NEXTAUTH_URL` must equal the public HTTPS URL, no slash     |
| Uploaded images 404                  | `public/uploads` ownership — re-run `setup-uploads.sh`       |
| Certbot fails                        | DNS A record resolves to the VPS? Port 80 open in UFW?       |
| Midtrans webhook not updating orders | Notification URL in Midtrans = your HTTPS `/api/.../webhook` |
| Out of memory / restarts             | `pm2 logs`; raise `max_memory_restart` in `ecosystem.config.js` |
