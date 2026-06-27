# Restore the Current Render Version

The pre-migration app was backed up to:

```text
backup-current-render-version
```

Switch to it locally:

```bash
git fetch origin
git switch backup-current-render-version
npm install
npm run web:build
npm run dev
```

The Electron app on that branch still loads:

```text
https://costco-contract-generator.onrender.com
```

To deploy that exact download page again through the existing GitHub Pages
workflow, merge or restore the backup branch into `main`.

Only if you intentionally need to force `main` back to the backup:

```bash
git switch main
git reset --hard backup-current-render-version
git push origin main --force-with-lease
```

