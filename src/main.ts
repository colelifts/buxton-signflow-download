import "./styles/main.css";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Missing app root");
}

const version = "1.0.0";
const releaseBase = "https://github.com/colelifts/costco-contract-generator/releases/latest";
const windowsDownload =
  "https://github.com/colelifts/costco-contract-generator/releases/latest/download/Buxton-SignFlow-Setup-1.0.0.exe";
const macDownload = releaseBase;

app.innerHTML = `
  <section class="page-shell">
    <nav class="topbar" aria-label="Download page navigation">
      <a class="brand" href="#top" aria-label="Buxton SignFlow home">
        <img src="/signflow-logo.png" alt="" />
        <span>
          <strong>Buxton SignFlow</strong>
          <small>Contract desktop app</small>
        </span>
      </a>
      <div class="nav-actions">
        <a href="#features">Features</a>
        <a href="#install">Install</a>
        <a class="nav-button" href="${releaseBase}">All downloads</a>
      </div>
    </nav>

    <section class="hero" id="top">
      <div class="hero-copy">
        <p class="eyebrow">Desktop contract workflow</p>
        <h1>Download Buxton SignFlow.</h1>
        <p class="lead">
          A real desktop app for uploading Costco lead PDFs and quote PDFs, generating signing packages,
          sending secure links, and tracking signed contracts.
        </p>
        <div class="hero-actions" id="install">
          <a class="download-button primary" href="${windowsDownload}">
            <span>Download for Windows</span>
            <small>Installer .exe · v${version}</small>
          </a>
          <a class="download-button secondary" href="${macDownload}">
            <span>Download for Mac</span>
            <small>Available from releases</small>
          </a>
        </div>
        <p class="note">
          If your browser blocks the download, choose "Keep" or download from the GitHub Releases page.
        </p>
      </div>

      <div class="app-card" aria-label="Buxton SignFlow desktop preview">
        <div class="window-bar">
          <span></span><span></span><span></span>
        </div>
        <div class="preview-sidebar">
          <img src="/signflow-logo.png" alt="" />
          <strong>SignFlow</strong>
          <span>Contracts</span>
        </div>
        <div class="preview-main">
          <div class="preview-header">
            <span>CONTRACT DASHBOARD</span>
            <button>New contract</button>
          </div>
          <div class="preview-title"></div>
          <div class="preview-subtitle"></div>
          <div class="preview-table">
            <div></div><div></div><div></div>
            <div></div><div></div><div></div>
            <div></div><div></div><div></div>
          </div>
        </div>
      </div>
    </section>

    <section class="feature-grid" id="features">
      <article>
        <span>01</span>
        <h2>Fast desktop startup</h2>
        <p>The app shell, icon, splash screen, and update tools are installed locally instead of acting like a browser tab.</p>
      </article>
      <article>
        <span>02</span>
        <h2>Secure server workflow</h2>
        <p>PDF generation, email sending, and signing records stay on the backend so sensitive logic is not exposed.</p>
      </article>
      <article>
        <span>03</span>
        <h2>Built for updates</h2>
        <p>Installers, changelog data, and GitHub Release checks are wired in for clean update distribution.</p>
      </article>
    </section>

    <section class="install-panel">
      <div>
        <p class="eyebrow">How to install</p>
        <h2>Send this page to your team.</h2>
        <p>
          Users download the installer, open it, and Buxton SignFlow installs with the proper app name,
          shortcuts, icon, version number, and desktop window behavior.
        </p>
      </div>
      <ol>
        <li>Click Download for Windows.</li>
        <li>Open the installer file.</li>
        <li>Launch Buxton SignFlow from the desktop or Start menu.</li>
      </ol>
    </section>
  </section>
`;

document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]').forEach((link) => {
  link.addEventListener("click", (event) => {
    const targetId = link.getAttribute("href");
    if (!targetId || targetId === "#") return;
    const target = document.querySelector(targetId);
    if (!target) return;
    event.preventDefault();
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  });
});
