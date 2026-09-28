#!/usr/bin/env bash
# Buildery — deploy / update an existing install.
#
# Pulls the latest code (when the folder is a git clone), installs deps, runs
# migrations, rebuilds, and reloads PM2. Run it from the app directory on
# the VPS:
#
#   cd /var/www/buildery && bash scripts/deploy.sh
#
# First-time setup is in DEPLOYMENT.md — this script is for updates.
#
# ============================================================================
#  CATATAN SEBELUM DEPLOY — BACA DULU
# ============================================================================
#
#  A. DEPLOY DARI FILE ZIP (tanpa git)
#  -----------------------------------
#  Zip dari GitHub ("Download ZIP") TIDAK berisi file yang di-.gitignore:
#
#    .env                        -> secret & koneksi database
#    public/uploads/*            -> gambar yang di-upload pelanggan
#    storage/form-submissions/*  -> lampiran form yang dikirim pengunjung
#    node_modules/, .next/       -> dibuat ulang oleh skrip ini
#
#  Jadi:
#   1. JANGAN hapus folder aplikasi lama lalu ekstrak zip di tempatnya. Tiga
#      hal di atas ikut hilang dan tidak ada di zip. Backup dulu:
#        tar czf ~/buildery-files-$(date +%F).tgz .env public/uploads storage
#   2. Isi zip ada di dalam satu folder (mis. "buildery-main/"). Ekstrak ke
#      folder baru, lalu salin/rsync ISINYA — bukan foldernya:
#        unzip buildery-main.zip -d /tmp/rilis
#        rsync -a /tmp/rilis/buildery-main/ /var/www/buildery/ \
#          --exclude .env --exclude public/uploads --exclude storage
#      (rsync tanpa --delete: file lama yang sudah tidak ada di rilis baru
#      tetap tertinggal tapi tidak mengganggu; yang penting data tidak hilang.)
#   3. Zip bisa menghilangkan izin eksekusi. Jalankan skrip dengan
#      `bash scripts/deploy.sh`, atau: chmod +x scripts/*.sh
#   4. Tanpa folder .git, langkah `git pull` di bawah otomatis dilewati.
#   5. Pastikan pemilik file tetap user aplikasi (bukan root), mis.:
#        chown -R buildery:buildery /var/www/buildery
#
#  B. SERVER DENGAN FOLDER RILIS + SYMLINK `current`
#  ------------------------------------------------
#  ecosystem.config.js menyebut layout /var/www/buildery/current (symlink),
#  /var/www/buildery/shared/ dan /var/www/buildery/activate.sh. Kalau server
#  memakai layout itu:
#   - Ekstrak zip ke folder rilis BARU (mis. releases/2026-09-28-1500), jangan
#     ke folder `current` yang sedang melayani pengunjung.
#   - Sambungkan .env dan folder upload dari shared/ ke rilis baru (symlink),
#     sama seperti rilis sebelumnya — cek dengan: ls -la current/
#   - Jalankan install, migrate, dan build di folder rilis baru, lalu aktifkan
#     dengan activate.sh <folder_rilis>. Skrip ini (reload di tempat) JANGAN
#     dipakai untuk layout tersebut.
#
#  C. BUILD HARUS JALAN TERLEPAS DARI SESI SSH
#  -------------------------------------------
#  Pernah terjadi: build mati saat SSH terputus dan .next tanpa BUILD_ID ikut
#  aktif (lihat scripts/verify-release.sh). Jalankan dengan nohup atau tmux:
#    nohup bash scripts/deploy.sh > deploy-$(date +%F-%H%M).log 2>&1 &
#    tail -f deploy-*.log
#  Selama `next build` berjalan, folder .next sedang ditulis ulang; proses
#  yang sedang jalan bisa error sampai reload selesai. Deploy saat sepi.
#
#  D. KHUSUS RILIS INI (builder per-device + integrasi)
#  ----------------------------------------------------
#   - 4 migrasi database baru (affiliate_rates_recurring,
#     integration_connections, whatsapp_waha_woowa_kirimi, inbox_channels).
#     Backup otomatis jalan dulu; kalau backup GAGAL, skrip berhenti sebelum
#     migrasi. Perbaiki backup-nya, atau kalau sudah backup dengan cara lain,
#     ulangi dengan: SKIP_BACKUP=1 bash scripts/deploy.sh
#   - Isi INTEGRATION_SECRET_KEY di .env (lihat .env.example) SEBELUM
#     menyambungkan integrasi apa pun, dan jangan pernah menggantinya:
#     kunci ini mengenkripsi kredensial integrasi yang tersimpan.
#   - Perubahan builder (style & layout per device, sembunyikan block, dsb.)
#     tidak butuh migrasi; datanya disimpan di JSON block yang sudah ada.
#     Halaman lama tampil sama seperti sebelumnya.
#   - Setelah deploy: buka satu halaman publik di HP dan desktop, dan buka
#     builder → tab Style / Konten → mode Tablet/Mobile untuk memastikan.
#
#  E. SETELAH DEPLOY
#  -----------------
#    pm2 status                  # semua instance "online"
#    pm2 logs buildery --lines 100
#    curl -I https://<domain-anda>   # harus 200/307, bukan 502
#  Kalau gagal: backup database ada di /var/backups/buildery (lihat
#  scripts/restore-db.sh), dan backup file dari langkah A.1.
# ============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")"
cd "$APP_DIR"

echo "==> Buildery deploy  ($(date -u))"

# 0. Pre-flight: stop before anything irreversible if the folder is missing
#    what a zip upload typically leaves behind.
if [ ! -f .env ]; then
  echo "ERROR: .env tidak ditemukan di $APP_DIR."
  echo "       Zip tidak berisi .env — salin .env dari instalasi lama dulu."
  exit 1
fi
if ! grep -qE '^DATABASE_URL=.+' .env; then
  echo "ERROR: DATABASE_URL kosong di .env."
  exit 1
fi
if ! grep -qE '^INTEGRATION_SECRET_KEY=.+' .env; then
  echo "WARN: INTEGRATION_SECRET_KEY belum diisi di .env."
  echo "      Isi sebelum menyambungkan integrasi (lihat .env.example)."
fi
if [ ! -L public/uploads ] && [ -z "$(find public/uploads -mindepth 1 ! -name .gitkeep -print -quit 2>/dev/null)" ]; then
  echo "WARN: public/uploads kosong. Kalau situs ini sudah punya gambar upload,"
  echo "      folder itu belum disalin dari instalasi lama (zip tidak memuatnya)."
  if [ -t 0 ]; then
    read -r -p "      Lanjutkan deploy? [y/N] " answer
    [ "${answer:-}" = "y" ] || { echo "Dibatalkan."; exit 1; }
  fi
fi

# 1. Safety: back up the database before touching anything.
#    Migrations follow, so a failed backup stops the deploy. Set
#    SKIP_BACKUP=1 only when you have just taken a backup some other way.
if [ "${SKIP_BACKUP:-0}" = "1" ]; then
  echo "WARN: SKIP_BACKUP=1 — database backup dilewati"
elif [ -f "$SCRIPT_DIR/backup-db.sh" ]; then
  echo "==> Backing up database first"
  if ! bash "$SCRIPT_DIR/backup-db.sh"; then
    echo "ERROR: backup database gagal — deploy dihentikan sebelum migrasi."
    echo "       Perbaiki backup, atau jalankan ulang dengan SKIP_BACKUP=1"
    echo "       kalau sudah punya backup terbaru dari cara lain."
    exit 1
  fi
fi

# 2. Pull latest code (skipped when deploying from an uploaded zip).
if [ -d .git ]; then
  echo "==> git pull"
  git pull --ff-only
else
  echo "==> no .git folder (zip deploy) — skipping git pull"
fi

# 3. Install dependencies (frozen lockfile = reproducible).
echo "==> pnpm install"
pnpm install --frozen-lockfile --prod=false

# 4. Apply database migrations (safe, additive — never resets).
echo "==> prisma migrate deploy"
pnpm exec prisma migrate deploy
pnpm exec prisma generate

# 5. Production build.
echo "==> next build"
pnpm build

# A build that died half-way leaves .next without BUILD_ID; never reload
# onto it.
if [ ! -f .next/BUILD_ID ]; then
  echo "ERROR: .next/BUILD_ID tidak ada — build tidak lengkap. PM2 tidak di-reload."
  exit 1
fi

# 6. Reload the PM2 process (zero-downtime if in cluster mode).
echo "==> pm2 reload"
pm2 reload ecosystem.config.js --update-env || pm2 start ecosystem.config.js
pm2 save

echo "==> Done. Check:  pm2 status  &&  pm2 logs buildery"
