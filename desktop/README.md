# Buxton SignFlow Desktop

Buxton SignFlow is a downloadable Electron desktop client for the existing contract web app.

The desktop app keeps contract logic on the secure server and adds the native app layer:

- branded app window and installer
- Windows and macOS packaging
- safe preload bridge
- native download handling
- desktop notifications
- update-check scaffolding
- diagnostics and offline fallback

## Local Development

```bash
npm install
npm run dev
```

By default, the desktop app loads:

```text
https://costco-contract-generator.onrender.com
```

To load another environment:

```bash
$env:SIGNFLOW_APP_URL="http://127.0.0.1:5000"
npm run dev
```

## Build Commands

```bash
npm run build
npm run dist
npm run dist:win
npm run dist:mac
```

Windows installers are written to `dist-desktop/`.

macOS builds should be produced on macOS or through the GitHub Actions workflow.

## Update Hosting

The app is configured for GitHub Releases through `electron-builder`.

Set the release repo in `package.json > build.publish` or override at runtime:

```bash
$env:SIGNFLOW_RELEASE_OWNER="your-github-user"
$env:SIGNFLOW_RELEASE_REPO="your-release-repo"
```

When a signed release is available, packaged apps can use `electron-updater`. Development builds fall back to checking the latest GitHub Release and opening the release page.

## Security Notes

- `contextIsolation` is enabled.
- `nodeIntegration` is disabled.
- External windows open in the default browser.
- Sensitive contract work remains on the backend.
- Diagnostic output does not include passwords, tokens, or cookies.
