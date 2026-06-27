import "./styles/main.css";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Missing app root");
}

const version = "1.0.0";
const releaseBase = "https://github.com/colelifts/buxton-signflow-download/releases/latest";
const windowsDownload =
  "https://github.com/colelifts/buxton-signflow-download/releases/latest/download/Buxton-SignFlow-Setup-1.0.0.exe";
const macDownload = releaseBase;
const icon = "./icon.png";

const activityRows = [
  ["Quote_2024-0487.pdf", "Sent to jane.doe@costco.com", "2m ago", "Sent"],
  ["Lead_PDF_1162.pdf", "Viewed by john.smith@costco.com", "18m ago", "Viewed"],
  ["Signing package #5621", "All signatures completed", "1h ago", "Completed"],
  ["Contract_8821.pdf", "Sent to operations@costco.com", "2h ago", "Sent"],
  ["Quote_2024-0485.pdf", "Viewed by sarah.j@costco.com", "3h ago", "Viewed"],
];

app.innerHTML = `
  <div class="site-bg" aria-hidden="true"></div>
  <header class="topbar">
    <a class="brand reveal" href="#top" aria-label="Buxton SignFlow home">
      <span class="brand-icon"><img src="${icon}" alt="" /></span>
      <span class="brand-copy">
        <strong>Buxton SignFlow</strong>
        <small>Contract desktop app</small>
      </span>
    </a>

    <nav class="nav-actions reveal" aria-label="Download page navigation">
      <a href="#features">Features</a>
      <a href="#install">Install</a>
      <a class="nav-button" href="${releaseBase}">All downloads</a>
    </nav>
  </header>

  <main class="page-shell">
    <section class="hero" id="top">
      <div class="hero-copy">
        <p class="eyebrow reveal">Desktop contract workflow</p>
        <h1 class="reveal">Download Buxton SignFlow.</h1>
        <p class="lead reveal">
          A real desktop app for uploading Costco lead PDFs and quote PDFs, generating signing packages,
          sending secure links, and tracking signed contracts.
        </p>

        <div class="hero-actions reveal" id="install">
          <a class="download-button primary" href="${windowsDownload}">
            <span class="button-icon windows" aria-hidden="true">
              <i></i><i></i><i></i><i></i>
            </span>
            <span>
              Download for Windows
              <small>Installer .exe - v${version}</small>
            </span>
          </a>
          <a class="download-button secondary" href="${macDownload}">
            <span class="button-icon apple" aria-hidden="true"></span>
            <span>
              Download for Mac
              <small>Available from releases</small>
            </span>
          </a>
        </div>

        <div class="trust-note reveal">
          <span class="shield-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M12 3 5 6v5c0 4.6 2.8 8.7 7 10 4.2-1.3 7-5.4 7-10V6l-7-3Zm3.7 7.2-4.4 4.5-2.1-2.1 1.2-1.2.9.9 3.2-3.3 1.2 1.2Z"/></svg>
          </span>
          <p>If your browser blocks the download, choose "Keep" or download from the GitHub Releases page.</p>
        </div>
      </div>

      <div class="hero-visual reveal">
        <div class="orb-grid" aria-hidden="true"></div>
        <div class="desktop-window" aria-label="Buxton SignFlow desktop preview">
          <div class="window-bar">
            <span></span><span></span><span></span>
          </div>

          <aside class="mock-sidebar">
            <div class="mock-brand">
              <img src="${icon}" alt="" />
              <strong>SignFlow</strong>
            </div>
            <a class="active" href="#"><svg viewBox="0 0 24 24"><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1V10Z"/></svg>Dashboard</a>
            <a href="#"><svg viewBox="0 0 24 24"><path d="M7 3h7l4 4v14H7V3Zm7 1v4h4"/></svg>Contracts</a>
            <a href="#"><svg viewBox="0 0 24 24"><path d="M5 4h14v16H5V4Zm4 4h6M9 12h6M9 16h4"/></svg>Templates</a>
            <a href="#"><svg viewBox="0 0 24 24"><path d="M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8Zm0-5 1.2 2.4 2.6.4-1.9 1.8.5 2.6L12 9.9l-2.4 1.3.5-2.6-1.9-1.8 2.6-.4L12 3Z"/></svg>Settings</a>
            <div class="connection"><span></span><strong>Connected</strong><small>All systems operational</small></div>
          </aside>

          <section class="mock-main">
            <header>
              <div>
                <p>Contract dashboard</p>
                <h2>Contract dashboard</h2>
              </div>
              <button>+ New contract</button>
            </header>

            <div class="stat-grid">
              <article><strong>12</strong><span>In progress</span></article>
              <article><strong>8</strong><span>Awaiting signature</span></article>
              <article><strong>24</strong><span>Completed</span></article>
              <article><strong>3</strong><span>Expiring soon</span></article>
            </div>

            <div class="activity-card">
              <h3>Recent activity</h3>
              ${activityRows
                .map(
                  ([title, detail, time, status]) => `
                    <div class="activity-row">
                      <span class="doc-dot"></span>
                      <div><strong>${title}</strong><small>${detail}</small></div>
                      <time>${time}</time>
                      <em class="${status.toLowerCase()}">${status}</em>
                    </div>
                  `,
                )
                .join("")}
              <a href="#">View all activity -></a>
            </div>
          </section>
        </div>
      </div>
    </section>

    <section class="feature-grid" id="features">
      <article class="feature-card reveal">
        <span class="feature-icon rocket" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M13 3c3.9.4 6.6 3.1 7 7l-5.6 5.6-4.1-4.1L13 3ZM5 13l6 6-5 2-3-3 2-5Zm2.5-6.2 2.2 2.2-3.4 3.4-3.2-.7 4.4-4.9Zm9.7 9.7-4.9 4.4-.7-3.2 3.4-3.4 2.2 2.2Z"/></svg>
        </span>
        <div>
          <h2>Fast desktop startup</h2>
          <p>The app shell, icon, splash screen, and update tools are installed locally instead of acting like a browser tab.</p>
        </div>
      </article>

      <article class="feature-card reveal">
        <span class="feature-icon shield" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M12 3 5 6v5c0 4.6 2.8 8.7 7 10 4.2-1.3 7-5.4 7-10V6l-7-3Zm3.7 7.2-4.4 4.5-2.1-2.1 1.2-1.2.9.9 3.2-3.3 1.2 1.2Z"/></svg>
        </span>
        <div>
          <h2>Secure server workflow</h2>
          <p>PDF generation, email sending, and signing records stay on the backend so sensitive logic is not exposed.</p>
        </div>
      </article>

      <article class="feature-card reveal">
        <span class="feature-icon sync" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M17.7 6.3A8 8 0 0 0 4.3 10H2l3.4 3.4L8.8 10H6.3a6 6 0 0 1 10-2.3l1.4-1.4ZM21.7 14h-2.3a6 6 0 0 1-10 2.3l-1.4 1.4A8 8 0 0 0 21.7 14ZM15.2 14l3.4-3.4L22 14h-6.8Z"/></svg>
        </span>
        <div>
          <h2>Built for updates</h2>
          <p>Installers, changelog data, and GitHub Release checks are wired in for clean update distribution.</p>
        </div>
      </article>
    </section>

    <section class="install-panel reveal">
      <div class="install-copy">
        <p class="eyebrow">How to install</p>
        <h2>Send this page to your team.</h2>
        <p>
          Users download the installer, open it, and Buxton SignFlow installs with the proper app name,
          shortcuts, icon, version number, and desktop window behavior.
        </p>
      </div>

      <ol class="install-steps">
        <li><span>1</span>Click Download for Windows.</li>
        <li><span>2</span>Open the installer file.</li>
        <li><span>3</span>Launch Buxton SignFlow from the desktop or Start menu.</li>
      </ol>

      <div class="install-art" aria-hidden="true">
        <div class="sparkle one"></div>
        <div class="sparkle two"></div>
        <div class="cube"><img src="${icon}" alt="" /></div>
        <div class="box-base"></div>
      </div>
    </section>
  </main>
`;

const revealItems = document.querySelectorAll<HTMLElement>(".reveal");
const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.12 },
);

revealItems.forEach((item, index) => {
  item.style.setProperty("--delay", `${Math.min(index * 60, 420)}ms`);
  observer.observe(item);
});

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
