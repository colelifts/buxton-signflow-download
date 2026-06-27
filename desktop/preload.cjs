const { contextBridge, ipcRenderer } = require("electron");

const listeners = new Map();

function on(channel, callback) {
  if (typeof callback !== "function") return () => {};
  const wrapped = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, wrapped);
  listeners.set(callback, { channel, wrapped });
  return () => ipcRenderer.removeListener(channel, wrapped);
}

contextBridge.exposeInMainWorld("signFlowDesktop", {
  getAppInfo: () => ipcRenderer.invoke("desktop:get-app-info"),
  getWhatsNew: () => ipcRenderer.invoke("desktop:get-whats-new"),
  checkForUpdates: () => ipcRenderer.invoke("desktop:check-for-updates"),
  pickPdfs: () => ipcRenderer.invoke("desktop:pick-pdfs"),
  getDiagnostics: () => ipcRenderer.invoke("desktop:get-diagnostics"),
  copyDiagnostics: () => ipcRenderer.invoke("desktop:copy-diagnostics"),
  openExternal: (url) => ipcRenderer.invoke("desktop:open-external", url),
  revealFile: (filePath) => ipcRenderer.invoke("desktop:reveal-file", filePath),
  clearCache: () => ipcRenderer.invoke("desktop:clear-cache"),
  restart: () => ipcRenderer.invoke("desktop:restart"),
  notify: (title, body) => ipcRenderer.invoke("desktop:notify", { title, body }),
  signOut: () => ipcRenderer.invoke("desktop:sign-out"),
  onUpdateStatus: (callback) => on("desktop:update-status", callback),
  onDownloadComplete: (callback) => on("desktop:download-complete", callback),
  onDownloadFailed: (callback) => on("desktop:download-failed", callback),
  removeListener: (callback) => {
    const entry = listeners.get(callback);
    if (entry) ipcRenderer.removeListener(entry.channel, entry.wrapped);
    listeners.delete(callback);
  },
});

window.addEventListener("DOMContentLoaded", () => {
  document.documentElement.classList.add("signflow-desktop");

  document.addEventListener("click", (event) => {
    const target = event.target.closest("[data-desktop-action]");
    if (!target) return;
    const action = target.getAttribute("data-desktop-action");
    if (action === "check-updates") ipcRenderer.invoke("desktop:check-for-updates");
    if (action === "copy-diagnostics") ipcRenderer.invoke("desktop:copy-diagnostics");
    if (action === "clear-cache") ipcRenderer.invoke("desktop:clear-cache");
    if (action === "restart") ipcRenderer.invoke("desktop:restart");
    if (action === "sign-out") ipcRenderer.invoke("desktop:sign-out");
  });

  window.addEventListener("online", () => {
    ipcRenderer.invoke("desktop:notify", {
      title: "Back online",
      body: "Buxton SignFlow is connected again.",
    });
  });

  window.addEventListener("offline", () => {
    ipcRenderer.invoke("desktop:notify", {
      title: "Offline",
      body: "Your connection dropped. Finish drafts after reconnecting.",
    });
  });
});
