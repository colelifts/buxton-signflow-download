# Buxton SignFlow Download Site

This repository owns the public download page and the Electron desktop
installers for Buxton SignFlow.

## Live Links

- Download page: https://colelifts.github.io/buxton-signflow-download/
- GitHub release: https://github.com/colelifts/buxton-signflow-download/releases/tag/v1.0.0
- Cloudflare app loaded by desktop builds: https://main.buxton-signflow-app.pages.dev

## What This Repo Does

- Builds the branded public download page with Vite.
- Publishes that page to GitHub Pages.
- Builds the Windows installer and macOS DMG with Electron Builder.
- Publishes installer files to GitHub Releases.

The heavy contract PDF engine does not live here. It remains in the main
contract app during the Cloudflare migration.

## Local Commands

```powershell
npm.cmd install
npm.cmd run web:build
npm.cmd run dist:win
```

macOS installers should be built on macOS or with the GitHub workflow.

## Publish Desktop Installers

```powershell
gh workflow run "Desktop Release Builds" --repo colelifts/buxton-signflow-download --ref main -f tag=v1.0.0
```

The workflow updates:

- `Buxton-SignFlow-Setup-1.0.0.exe`
- `Buxton.SignFlow-1.0.0.dmg`
- `latest.yml`
- `latest-mac.yml`

## Safety

The desktop app defaults to the Cloudflare Pages frontend. The current Render
contract app is still kept online as the safe Python PDF engine and fallback.
