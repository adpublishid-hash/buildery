// PM2 process configuration for My Landing (Next.js production server).
//
// ── Zero-downtime deploys ────────────────────────────────────────────────
// Production runs in CLUSTER mode (2 instances) so `pm2 reload` does a rolling
// restart — one worker keeps serving while the other reloads, no downtime.
//
// On the VPS the canonical, running copy of this file lives at:
//   /var/www/buildery/shared/ecosystem.config.js
// and its `script`/`cwd` point at the `/var/www/buildery/current` symlink
// (literal) so swapping the symlink + reloading rolls onto the new release.
//
// Deploy flow (zero-downtime):
//   1) build a new release dir, then
//   2) /var/www/buildery/activate.sh <release_dir>
//      → swaps `current` symlink + `pm2 reload buildery` + `pm2 save`
//
// First-time setup on a box:
//   pnpm build
//   pm2 start ecosystem.config.js
//   pm2 save        # persist across reboots
//   pm2 startup     # generate the boot script (run once)
//
// Logs:  pm2 logs buildery   |  files under ./logs
// ─────────────────────────────────────────────────────────────────────────

module.exports = {
  apps: [
    {
      name: "buildery",
      // Run the Next.js production server directly via its bin.
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3011",
      cwd: __dirname,

      // Cluster mode enables zero-downtime `pm2 reload`. 2 instances is a
      // good fit for a 4-core box; bump on a larger machine with more traffic.
      instances: 2,
      exec_mode: "cluster",

      autorestart: true,
      watch: false,
      max_memory_restart: "512M",

      env: {
        NODE_ENV: "production",
        PORT: 3011,
        TRUST_PROXY: "true",
      },

      // Logs (rotate with the pm2-logrotate module — see DEPLOYMENT.md).
      error_file: "logs/buildery-error.log",
      out_file: "logs/buildery-out.log",
      merge_logs: true,
      time: true,
    },
    {
      name: "buildery-jobs",
      script: "scripts/job-runner.mjs",
      cwd: __dirname,

      instances: 1,
      exec_mode: "fork",

      autorestart: true,
      watch: false,
      max_memory_restart: "192M",

      env: {
        NODE_ENV: "production",
        PORT: 3011,
      },

      error_file: "logs/buildery-jobs-error.log",
      out_file: "logs/buildery-jobs-out.log",
      merge_logs: true,
      time: true,
    },
  ],
};
