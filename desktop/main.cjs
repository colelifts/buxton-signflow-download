const { app, BrowserWindow, Menu, dialog, ipcMain, shell, session, clipboard, Notification } = require("electron");
const { autoUpdater } = require("electron-updater");
const fs = require("fs");
const https = require("https");
const os = require("os");
const path = require("path");

const APP_NAME = "Buxton SignFlow";
const SHORT_NAME = "SignFlow";
const DEFAULT_APP_URL = "https://costco-contract-generator.onrender.com";
const APP_URL = process.env.SIGNFLOW_APP_URL || process.env.COSTCO_CONTRACT_APP_URL || DEFAULT_APP_URL;
const RELEASE_OWNER = process.env.SIGNFLOW_RELEASE_OWNER || "colelifts";
const RELEASE_REPO = process.env.SIGNFLOW_RELEASE_REPO || "costco-contract-generator";
const RELEASE_API_URL = `https://api.github.com/repos/${RELEASE_OWNER}/${RELEASE_REPO}/releases/latest`;
const MIN_WINDOW = { width: 1100, height: 760 };

app.setName(APP_NAME);

let mainWindow = null;
let splashWindow = null;
let whatsNewWindow = null;
let latestRelease = null;
let lastError = null;

const isWindows = process.platform === "win32";
const userDataDir = app.getPath("userData");
const statePath = path.join(userDataDir, "window-state.json");
const prefsPath = path.join(userDataDir, "preferences.json");
const changelogPath = path.join(__dirname, "changelog.json");
const iconPath = path.join(__dirname, "assets", isWindows ? "icon.ico" : "icon.png");

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function loadWindowState() {
  const saved = readJson(statePath, {});
  return {
    width: Math.max(Number(saved.width) || 1280, MIN_WINDOW.width),
    height: Math.max(Number(saved.height) || 840, MIN_WINDOW.height),
    x: Number.isFinite(saved.x) ? saved.x : undefined,
    y: Number.isFinite(saved.y) ? saved.y : undefined,
  };
}

function saveWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const bounds = mainWindow.getBounds();
  writeJson(statePath, bounds);
}

function getChangelog() {
  const entries = readJson(changelogPath, []);
  return Array.isArray(entries) ? entries : [];
}

function getCurrentReleaseNotes() {
  return getChangelog().find((entry) => entry.version === app.getVersion()) || null;
}

function getPreferences() {
  return readJson(prefsPath, {});
}

function savePreferences(nextPrefs) {
  writeJson(prefsPath, { ...getPreferences(), ...nextPrefs });
}

function sendToRenderer(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function notify(title, body) {
  if (Notification.isSupported()) {
    new Notification({ title, body, icon: iconPath }).show();
  }
}

function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 460,
    height: 420,
    frame: false,
    resizable: false,
    show: false,
    transparent: false,
    backgroundColor: "#f7f8fb",
    icon: iconPath,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  splashWindow.loadFile(path.join(__dirname, "splash.html"));
  splashWindow.once("ready-to-show", () => splashWindow.show());
}

function isAppUrl(rawUrl) {
  try {
    const target = new URL(rawUrl);
    const appOrigin = new URL(APP_URL).origin;
    return target.origin === appOrigin;
  } catch {
    return false;
  }
}

function createMainWindow() {
  const bounds = loadWindowState();
  mainWindow = new BrowserWindow({
    ...bounds,
    minWidth: MIN_WINDOW.width,
    minHeight: MIN_WINDOW.height,
    title: APP_NAME,
    show: false,
    backgroundColor: "#f6f8fc",
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: true,
      devTools: !app.isPackaged,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!isAppUrl(url)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.on("resize", saveWindowState);
  mainWindow.on("move", saveWindowState);
  mainWindow.on("close", saveWindowState);

  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedUrl) => {
    lastError = `${errorCode}: ${errorDescription}`;
    if (validatedUrl && isAppUrl(validatedUrl)) {
      mainWindow.loadFile(path.join(__dirname, "offline.html"));
    }
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
      splashWindow = null;
    }
    maybeShowWhatsNew();
    void checkForUpdates({ silent: true });
  });

  mainWindow.loadURL(APP_URL);
}

function createMenu() {
  const template = [
    {
      label: SHORT_NAME,
      submenu: [
        {
          label: `About ${APP_NAME}`,
          click: () => showAboutDialog(),
        },
        {
          label: "What's New",
          click: () => showWhatsNewWindow(true),
        },
        { type: "separator" },
        {
          label: "Check for Updates",
          click: () => checkForUpdates({ silent: false }),
        },
        { type: "separator" },
        {
          label: "Quit",
          accelerator: "CmdOrCtrl+Q",
          click: () => app.quit(),
        },
      ],
    },
    {
      label: "Contract",
      submenu: [
        {
          label: "New Contract",
          accelerator: "CmdOrCtrl+N",
          click: () => navigate("/create-contract"),
        },
        {
          label: "Dashboard",
          accelerator: "CmdOrCtrl+D",
          click: () => navigate("/history"),
        },
        { type: "separator" },
        {
          label: "Pick PDFs",
          accelerator: "CmdOrCtrl+O",
          click: () => showOpenPdfDialog(),
        },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools", visible: !app.isPackaged },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Help",
      submenu: [
        {
          label: "Copy Diagnostic Info",
          click: async () => clipboard.writeText(await getDiagnosticsText()),
        },
        {
          label: "Open Support Email",
          click: () => shell.openExternal("mailto:andrew@creativehomeremedies.com?subject=Buxton%20SignFlow%20Support"),
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function navigate(route) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const target = new URL(route, APP_URL).toString();
  mainWindow.loadURL(target);
}

async function showOpenPdfDialog() {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Choose PDF files",
    properties: ["openFile", "multiSelections"],
    filters: [{ name: "PDF files", extensions: ["pdf"] }],
  });
  return result.canceled ? [] : result.filePaths;
}

function setupDownloads() {
  session.defaultSession.on("will-download", (_event, item) => {
    const downloadsDir = path.join(app.getPath("downloads"), APP_NAME);
    fs.mkdirSync(downloadsDir, { recursive: true });
    const safeName = item.getFilename().replace(/[<>:"/\\|?*]/g, "-");
    const savePath = path.join(downloadsDir, safeName);
    item.setSavePath(savePath);

    item.once("done", (_event, state) => {
      if (state === "completed") {
        notify("Download complete", `${safeName} saved to Downloads.`);
        sendToRenderer("desktop:download-complete", { path: savePath, filename: safeName });
      } else {
        lastError = `Download ${state}: ${safeName}`;
        notify("Download failed", `${safeName} could not be saved.`);
        sendToRenderer("desktop:download-failed", { state, filename: safeName });
      }
    });
  });
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      {
        headers: {
          "User-Agent": `${APP_NAME}/${app.getVersion()}`,
          Accept: "application/vnd.github+json",
        },
      },
      (response) => {
        let body = "";
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => {
          if (response.statusCode < 200 || response.statusCode >= 300) {
            reject(new Error(`HTTP ${response.statusCode}: ${body.slice(0, 160)}`));
            return;
          }
          try {
            resolve(JSON.parse(body));
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    request.on("error", reject);
    request.setTimeout(10000, () => request.destroy(new Error("Update check timed out")));
  });
}

function normalizeVersion(version) {
  return String(version || "0.0.0").replace(/^v/i, "").split(".").map((part) => Number.parseInt(part, 10) || 0);
}

function compareVersions(a, b) {
  const left = normalizeVersion(a);
  const right = normalizeVersion(b);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const diff = (left[index] || 0) - (right[index] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

async function checkForUpdates({ silent }) {
  sendToRenderer("desktop:update-status", { status: "checking" });

  if (app.isPackaged) {
    try {
      const result = await autoUpdater.checkForUpdates();
      sendToRenderer("desktop:update-status", { status: "checked", result });
      return { mode: "auto", result };
    } catch (error) {
      lastError = error.message;
    }
  }

  try {
    const release = await fetchJson(RELEASE_API_URL);
    latestRelease = release;
    const latestVersion = normalizeVersion(release.tag_name || release.name).join(".");
    const hasUpdate = compareVersions(latestVersion, app.getVersion()) > 0;
    const payload = {
      mode: "manual",
      hasUpdate,
      currentVersion: app.getVersion(),
      latestVersion,
      summary: release.name || `Version ${latestVersion}`,
      notes: release.body || "",
      downloadUrl: release.html_url,
    };

    sendToRenderer("desktop:update-status", { status: hasUpdate ? "available" : "current", ...payload });
    if (hasUpdate && !silent) showUpdatePrompt(payload);
    if (!hasUpdate && !silent) {
      dialog.showMessageBox(mainWindow, {
        type: "info",
        title: "No update available",
        message: `${APP_NAME} is up to date.`,
        detail: `Current version: ${app.getVersion()}`,
      });
    }
    return payload;
  } catch (error) {
    lastError = error.message;
    sendToRenderer("desktop:update-status", { status: "error", message: error.message });
    if (!silent) {
      dialog.showErrorBox("Update check failed", "Could not check for updates right now. Please try again later.");
    }
    return { error: error.message };
  }
}

async function showUpdatePrompt(update) {
  const choice = await dialog.showMessageBox(mainWindow, {
    type: "info",
    title: "Update available",
    message: `${APP_NAME} ${update.latestVersion} is available.`,
    detail: `Current version: ${update.currentVersion}\n\n${update.summary}`,
    buttons: ["Update Now", "Later", "View What's New"],
    defaultId: 0,
    cancelId: 1,
  });

  if (choice.response === 0 && update.downloadUrl) {
    shell.openExternal(update.downloadUrl);
  }
  if (choice.response === 2) {
    showWhatsNewWindow(true);
  }
}

function setupAutoUpdaterEvents() {
  autoUpdater.autoDownload = false;
  autoUpdater.on("update-available", (info) => {
    sendToRenderer("desktop:update-status", { status: "available", info });
    showUpdatePrompt({
      currentVersion: app.getVersion(),
      latestVersion: info.version,
      summary: info.releaseName || "A new desktop update is ready.",
      downloadUrl: `https://github.com/${RELEASE_OWNER}/${RELEASE_REPO}/releases/latest`,
    });
  });
  autoUpdater.on("update-not-available", (info) => {
    sendToRenderer("desktop:update-status", { status: "current", info });
  });
  autoUpdater.on("error", (error) => {
    lastError = error.message;
    sendToRenderer("desktop:update-status", { status: "error", message: error.message });
  });
  autoUpdater.on("update-downloaded", (info) => {
    sendToRenderer("desktop:update-status", { status: "downloaded", info });
    dialog
      .showMessageBox(mainWindow, {
        type: "info",
        title: "Update ready",
        message: "The update has downloaded.",
        detail: "Restart Buxton SignFlow to finish installing the update.",
        buttons: ["Restart Now", "Later"],
        defaultId: 0,
      })
      .then((choice) => {
        if (choice.response === 0) autoUpdater.quitAndInstall();
      });
  });
}

function maybeShowWhatsNew() {
  const prefs = getPreferences();
  if (prefs.lastSeenVersion === app.getVersion()) return;
  showWhatsNewWindow(false);
  savePreferences({ lastSeenVersion: app.getVersion() });
}

function showWhatsNewWindow(manual) {
  if (whatsNewWindow && !whatsNewWindow.isDestroyed()) {
    whatsNewWindow.focus();
    return;
  }

  const parent = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined;
  whatsNewWindow = new BrowserWindow({
    width: 620,
    height: 620,
    minWidth: 500,
    minHeight: 480,
    parent,
    modal: !manual,
    title: `What's New in ${APP_NAME}`,
    icon: iconPath,
    backgroundColor: "#f6f8fc",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  whatsNewWindow.loadFile(path.join(__dirname, "whats-new.html"));
  whatsNewWindow.on("closed", () => {
    whatsNewWindow = null;
  });
}

function showAboutDialog() {
  const release = getCurrentReleaseNotes();
  dialog.showMessageBox(mainWindow, {
    type: "info",
    title: `About ${APP_NAME}`,
    message: APP_NAME,
    detail: [
      `Version ${app.getVersion()}`,
      "A desktop client for customer contract signing packages.",
      release ? `Latest note: ${release.highlights?.[0] || release.title || ""}` : "",
    ]
      .filter(Boolean)
      .join("\n\n"),
  });
}

async function getDiagnosticsText() {
  const diagnostics = {
    appName: APP_NAME,
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    osRelease: os.release(),
    appUrl: APP_URL,
    packaged: app.isPackaged,
    latestRelease: latestRelease ? latestRelease.tag_name : null,
    lastError,
    timestamp: new Date().toISOString(),
  };
  return JSON.stringify(diagnostics, null, 2);
}

ipcMain.handle("desktop:get-app-info", () => ({
  name: APP_NAME,
  shortName: SHORT_NAME,
  version: app.getVersion(),
  appUrl: APP_URL,
  packaged: app.isPackaged,
}));

ipcMain.handle("desktop:get-whats-new", () => ({
  currentVersion: app.getVersion(),
  current: getCurrentReleaseNotes(),
  history: getChangelog(),
}));

ipcMain.handle("desktop:check-for-updates", () => checkForUpdates({ silent: false }));
ipcMain.handle("desktop:pick-pdfs", () => showOpenPdfDialog());
ipcMain.handle("desktop:get-diagnostics", () => getDiagnosticsText());
ipcMain.handle("desktop:copy-diagnostics", async () => {
  const diagnostics = await getDiagnosticsText();
  clipboard.writeText(diagnostics);
  return diagnostics;
});
ipcMain.handle("desktop:open-external", (_event, url) => {
  shell.openExternal(url);
});
ipcMain.handle("desktop:reveal-file", (_event, filePath) => {
  if (filePath && fs.existsSync(filePath)) shell.showItemInFolder(filePath);
});
ipcMain.handle("desktop:clear-cache", async () => {
  await session.defaultSession.clearCache();
  return true;
});
ipcMain.handle("desktop:restart", () => {
  app.relaunch();
  app.exit(0);
});
ipcMain.handle("desktop:notify", (_event, { title, body }) => {
  notify(title || APP_NAME, body || "");
});
ipcMain.handle("desktop:sign-out", () => {
  navigate("/logout");
});

app.whenReady().then(() => {
  createMenu();
  setupDownloads();
  setupAutoUpdaterEvents();
  createSplashWindow();
  createMainWindow();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createSplashWindow();
    createMainWindow();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
