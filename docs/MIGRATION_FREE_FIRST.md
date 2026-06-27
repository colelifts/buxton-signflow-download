# Buxton SignFlow Free-First Migration

This branch prepares the Cloudflare/Supabase/R2 migration without destroying the
current working Render app.

## Branch Safety

- `main`: current stable download page and Electron app.
- `backup-current-render-version`: untouched backup created before migration work.
- `cloudflare-migration`: free-first architecture work.

The desktop app still defaults to the current Render backend:

```text
https://costco-contract-generator.onrender.com
```

No runtime cutover has been made in this first migration step.

## Current Repo Inventory

This repository currently contains:

- Vite public download page: `src/main.ts`, `src/styles/main.css`.
- Electron desktop shell: `desktop/main.cjs`, `desktop/preload.cjs`, desktop assets.
- GitHub Pages deploy workflow: `.github/workflows/download-page.yml`.
- GitHub desktop build workflow: `.github/workflows/desktop-release.yml`.
- Electron Builder config in `package.json`.

This repository does not currently contain the original Render Flask/Python
contract backend source. The current desktop app only points at that backend
through `SIGNFLOW_APP_URL`.

## What Moves Where

### Cloudflare Pages

Good fit:

- Public download page.
- Static app frontend if the contract app frontend is separated from the backend.
- Fast global delivery with no sleep.

Build command:

```bash
npm ci
npm run web:build
```

Output directory:

```text
dist
```

### Cloudflare Workers

Good fit:

- Auth/session helpers that call Supabase.
- Contract list/status/activity APIs.
- R2 upload/download metadata and signed URL helpers.
- Email send/test endpoints via Resend or SMTP bridge.
- Lightweight webhook handlers.

Not a good fit:

- Heavy PDF parsing.
- Complex PDF generation/editing.
- Native Python PDF libraries.

If the existing PDF pipeline relies on Python libraries, keep it on Render or move
it later to another always-on/free-friendly service only after testing. The Worker
scaffold in this branch intentionally avoids changing that logic.

### Cloudflare R2

Suggested bucket:

```text
buxton-signflow-files
```

Suggested object keys:

```text
contracts/{contract_id}/lead/original.pdf
contracts/{contract_id}/quote/original.pdf
contracts/{contract_id}/generated/contract.pdf
contracts/{contract_id}/signed/contract.pdf
contracts/{contract_id}/certificates/certificate.pdf
templates/active/costco-work-order.pdf
templates/backups/{timestamp}-costco-work-order.pdf
users/{user_id}/headshot.{ext}
```

### Supabase

Use Supabase for:

- Auth users.
- User profiles.
- Contracts.
- Contract status.
- Activity logs.
- File metadata.
- Sender/email settings.
- Template metadata.

Schema starter:

```text
supabase/schema.sql
```

### Resend or SMTP

Use Resend first if possible because it has a simple API and a free tier. SMTP can
remain the fallback for existing mail accounts.

## Environment Variables

See `.env.example` for the full list.

Minimum current desktop variables:

```text
SIGNFLOW_APP_URL
SIGNFLOW_RELEASE_OWNER
SIGNFLOW_RELEASE_REPO
```

Minimum future Cloudflare variables:

```text
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
R2_BUCKET
RESEND_API_KEY
RESEND_FROM_EMAIL
```

## Local Commands

Install current app dependencies:

```bash
npm install
```

Run the download page locally:

```bash
npm run web:dev
```

Run the Electron app locally:

```bash
npm run dev
```

Build the download page:

```bash
npm run web:build
```

Build Windows installer:

```bash
npm run dist:win
```

Run the Worker locally after installing Worker dependencies:

```bash
cd cloudflare/worker
npm install
npm run dev
```

## Cloudflare Deploy Outline

### Pages

1. Create a Cloudflare Pages project connected to this GitHub repo.
2. Use build command `npm run web:build`.
3. Use output directory `dist`.
4. Add custom domain later if wanted.

### Worker

1. Copy `cloudflare/worker/wrangler.toml.example` to `wrangler.toml`.
2. Fill in the account-specific names.
3. Add secrets:

```bash
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_ANON_KEY
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put RESEND_FROM_EMAIL
```

4. Deploy:

```bash
cd cloudflare/worker
npm run deploy
```

### R2

Create the bucket:

```bash
npx wrangler r2 bucket create buxton-signflow-files
```

Bind it in `wrangler.toml`:

```toml
[[r2_buckets]]
binding = "SIGNFLOW_FILES"
bucket_name = "buxton-signflow-files"
```

### Supabase

1. Create a Supabase project.
2. Open SQL Editor.
3. Run `supabase/schema.sql`.
4. Add app URL and local URLs to Auth redirect settings as needed.

### GitHub Releases

The current release workflow already builds Windows and macOS artifacts when a
tag like `v1.0.1` is pushed.

```bash
git tag v1.0.1
git push origin v1.0.1
```

## Rollback

To return to the current Render version:

```bash
git fetch origin
git switch backup-current-render-version
npm install
npm run web:build
npm run dev
```

To restore `main` from the backup branch if needed:

```bash
git switch main
git reset --hard backup-current-render-version
git push origin main --force-with-lease
```

Only use the force push command if you intentionally want to replace `main` with
the saved backup.

