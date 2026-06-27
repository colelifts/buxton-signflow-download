import "./styles/main.css";
import { LEVELS, SKINS } from "./data/levels";
import { AudioManager } from "./game/AudioManager";
import { Game } from "./game/Game";
import { SaveSystem } from "./game/SaveSystem";
import type { LevelData, OverlayState, SaveData } from "./game/types";
import { LevelEditor } from "./editor/LevelEditor";

const $ = <T extends HTMLElement>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  return element;
};

const canvas = $("#gameCanvas") as HTMLCanvasElement;
const saveSystem = new SaveSystem();
const audio = new AudioManager(saveSystem.snapshot);
const game = new Game(canvas, saveSystem, audio);
const editor = new LevelEditor(saveSystem);

const screens = Array.from(document.querySelectorAll<HTMLElement>(".screen"));
const hud = $("#hud");
const levelCards = $("#levelCards");
const missionOverlay = $("#missionOverlay");
const overlayKicker = $("#overlayKicker");
const overlayTitle = $("#overlayTitle");
const overlayBody = $("#overlayBody");
const resumeButton = $("#resumeButton") as HTMLButtonElement;
const restartButton = $("#restartButton") as HTMLButtonElement;
const progressFill = $("#progressFill");
const progressText = $("#progressText");
const hudLevel = $("#hudLevel");
const hudRank = $("#hudRank");
const hudSeals = $("#hudSeals");
const hudAttempts = $("#hudAttempts");
const touchControls = $("#touchControls");
const touchLeft = $("#touchLeft");
const touchRight = $("#touchRight");
const touchJump = $("#touchJump");
const musicVolume = $("#musicVolume") as HTMLInputElement;
const sfxVolume = $("#sfxVolume") as HTMLInputElement;
const muteToggle = $("#muteToggle") as HTMLInputElement;
const primaryColor = $("#primaryColor") as HTMLInputElement;
const secondaryColor = $("#secondaryColor") as HTMLInputElement;
const trailType = $("#trailType") as HTMLSelectElement;
const deathEffect = $("#deathEffect") as HTMLSelectElement;
const glowIntensity = $("#glowIntensity") as HTMLInputElement;
const skinList = $("#skinList");
const archiveStats = $("#archiveStats");
const editorPalette = $("#editorPalette");
const editorBg = $("#editorBg") as HTMLInputElement;
const editorBpm = $("#editorBpm") as HTMLInputElement;
const editorJson = $("#editorJson") as HTMLTextAreaElement;

let currentScreen = "loadingScreen";

const showScreen = (id: string) => {
  currentScreen = id;
  screens.forEach((screen) => screen.classList.toggle("active", screen.id === id));
  missionOverlay.classList.add("hidden");
  hud.classList.add("hidden");
  touchControls.classList.add("hidden");

  if (id === "mainMenu") game.showMenu();
  if (id === "levelSelect") {
    game.showMenu();
    renderLevelCards();
  }
  if (id === "settingsScreen") {
    game.showMenu();
    renderSettings();
  }
  if (id === "customizeScreen") {
    game.showMenu();
    renderCustomization();
  }
  if (id === "archiveScreen") {
    game.showMenu();
    renderArchive();
  }
  if (id === "editorScreen") {
    game.enterEditor(editor);
    renderEditorControls();
  }
};

const hideScreensForPlay = () => {
  screens.forEach((screen) => screen.classList.remove("active"));
  currentScreen = "";
};

const startLevel = (level: LevelData, training = false) => {
  hideScreensForPlay();
  void audio.resume();
  game.startLevel(level, training);
};

const renderLevelCards = () => {
  const save = saveSystem.snapshot;
  levelCards.innerHTML = LEVELS.map((level) => {
    const best = Math.round((save.bestPercent[level.id] ?? 0) * 100);
    const seals = save.collectedSeals[level.id]?.length ?? 0;
    const accent = level.missionRank === "Special Grade" ? "#ff335f" : level.missionRank === "Rank A" ? "#f8c85a" : level.colorPalette.primary;
    const trainingButton = level.kind === "classic" ? `<button class="angled" data-training="${level.id}" type="button">Training</button>` : `<button class="angled" data-start="${level.id}" type="button">Enter</button>`;
    return `
      <article class="mission-card" style="--accent:${accent}">
        <span class="rank-pill">${level.missionRank}</span>
        <h3>${level.name}</h3>
        <div class="mission-meta">
          <span>${level.backgroundTheme}</span>
          <span>${level.bpm} BPM</span>
          <span>${best}% best</span>
          <span>${seals}/${level.coins.length} Seals</span>
        </div>
        <div class="mission-actions">
          <button class="angled primary" data-start="${level.id}" type="button">Start</button>
          ${trainingButton}
        </div>
      </article>
    `;
  }).join("");

  levelCards.querySelectorAll<HTMLButtonElement>("[data-start]").forEach((button) => {
    button.addEventListener("click", () => {
      const level = LEVELS.find((entry) => entry.id === button.dataset.start);
      if (level) startLevel(level, false);
    });
  });
  levelCards.querySelectorAll<HTMLButtonElement>("[data-training]").forEach((button) => {
    button.addEventListener("click", () => {
      const level = LEVELS.find((entry) => entry.id === button.dataset.training);
      if (level) startLevel(level, true);
    });
  });
};

const renderSettings = () => {
  const save = saveSystem.snapshot;
  musicVolume.value = String(save.musicVolume);
  sfxVolume.value = String(save.sfxVolume);
  muteToggle.checked = save.muted;
};

const persistVolumes = () => {
  const music = Number(musicVolume.value);
  const sfx = Number(sfxVolume.value);
  const muted = muteToggle.checked;
  saveSystem.setVolumes(music, sfx, muted);
  audio.setVolumes(music, sfx, muted);
};

const renderCustomization = () => {
  const save = saveSystem.snapshot;
  primaryColor.value = save.primaryColor;
  secondaryColor.value = save.secondaryColor;
  trailType.value = save.trailType;
  deathEffect.value = save.deathEffect;
  glowIntensity.value = String(save.glowIntensity);

  skinList.innerHTML = SKINS.map((skin) => {
    const unlocked = save.unlockedSkins.includes(skin.id);
    const selected = save.selectedSkin === skin.id;
    return `
      <article class="skin-card ${unlocked ? "" : "locked"} ${selected ? "selected" : ""}">
        <strong>${skin.name}</strong>
        <span>${unlocked ? "Unlocked" : skin.requirement}</span>
        <button class="angled small" data-skin="${skin.id}" ${unlocked ? "" : "disabled"} type="button">${selected ? "Active" : "Bind"}</button>
      </article>
    `;
  }).join("");

  skinList.querySelectorAll<HTMLButtonElement>("[data-skin]").forEach((button) => {
    button.addEventListener("click", () => {
      const skin = SKINS.find((entry) => entry.id === button.dataset.skin);
      if (!skin || !saveSystem.isUnlocked(skin.id)) return;
      saveSystem.setCustomization({
        selectedSkin: skin.id,
        primaryColor: skin.primary,
        secondaryColor: skin.secondary,
        deathEffect: skin.death,
      });
      renderCustomization();
    });
  });
};

const persistCustomization = () => {
  saveSystem.setCustomization({
    primaryColor: primaryColor.value,
    secondaryColor: secondaryColor.value,
    trailType: trailType.value as SaveData["trailType"],
    deathEffect: deathEffect.value as SaveData["deathEffect"],
    glowIntensity: Number(glowIntensity.value),
  });
};

const renderArchive = () => {
  const save = saveSystem.snapshot;
  const attempts = Object.values(save.attempts).reduce((sum, value) => sum + value, 0);
  const seals = saveSystem.totalSealCount();
  const energy = saveSystem.cursedEnergy();
  const completed = save.completedLevels.length;
  const missionCards = LEVELS.map((level) => {
    const best = Math.round((save.bestPercent[level.id] ?? 0) * 100);
    const levelSeals = save.collectedSeals[level.id]?.length ?? 0;
    return `
      <article class="stat-card">
        <span>${level.missionRank}</span>
        <strong>${best}%</strong>
        <p>${level.name} | ${levelSeals}/${level.coins.length} Seals</p>
      </article>
    `;
  }).join("");
  archiveStats.innerHTML = `
    <article class="stat-card"><span>Cursed Energy Meter</span><strong>${energy}%</strong><p>Seals and clears stored in the archive.</p></article>
    <article class="stat-card"><span>Cleared Contracts</span><strong>${completed}</strong><p>${LEVELS.length} total missions available.</p></article>
    <article class="stat-card"><span>Total Attempts</span><strong>${attempts}</strong><p>Every restart is recorded.</p></article>
    <article class="stat-card"><span>Spirit Contracts</span><strong>${save.unlockedSkins.length}/${SKINS.length}</strong><p>${seals} Seals collected.</p></article>
    ${missionCards}
  `;
};

const renderEditorControls = () => {
  editorPalette.innerHTML = editor.tools.map((tool) => `
    <button type="button" title="${tool}" data-tool="${tool}" class="${editor.activeTool === tool ? "active" : ""}">${editor.labelFor(tool)}</button>
  `).join("");
  editorPalette.querySelectorAll<HTMLButtonElement>("[data-tool]").forEach((button) => {
    button.addEventListener("click", () => {
      editor.setTool(button.dataset.tool as typeof editor.activeTool);
      renderEditorControls();
    });
  });
  editorBg.value = editor.level.colorPalette.background;
  editorBpm.value = String(editor.level.bpm);
  editorJson.value = editor.exportJson();
};

document.addEventListener("click", (event) => {
  const target = event.target as HTMLElement;
  const button = target.closest<HTMLButtonElement>("button");
  if (button) {
    void audio.resume();
    audio.playSfx("click");
  }
});

document.querySelectorAll<HTMLElement>("[data-action]").forEach((element) => {
  element.addEventListener("click", () => {
    const action = element.dataset.action;
    if (action === "menu") showScreen("mainMenu");
    if (action === "levelSelect") showScreen("levelSelect");
    if (action === "settings") showScreen("settingsScreen");
    if (action === "customize") showScreen("customizeScreen");
    if (action === "archive") showScreen("archiveScreen");
    if (action === "editor") showScreen("editorScreen");
    if (action === "quickTraining") startLevel(LEVELS[0], true);
  });
});

$("#pauseButton").addEventListener("click", () => game.pause());
resumeButton.addEventListener("click", () => game.resume());
restartButton.addEventListener("click", () => game.restart());
musicVolume.addEventListener("input", persistVolumes);
sfxVolume.addEventListener("input", persistVolumes);
muteToggle.addEventListener("change", persistVolumes);
primaryColor.addEventListener("input", persistCustomization);
secondaryColor.addEventListener("input", persistCustomization);
trailType.addEventListener("change", persistCustomization);
deathEffect.addEventListener("change", persistCustomization);
glowIntensity.addEventListener("input", persistCustomization);
$("#resetSave").addEventListener("click", () => {
  saveSystem.reset();
  renderSettings();
  renderArchive();
  renderCustomization();
});

editorBg.addEventListener("input", () => editor.setBackground(editorBg.value));
editorBpm.addEventListener("input", () => editor.setBpm(Number(editorBpm.value)));
$("#editorSave").addEventListener("click", () => {
  editor.setBackground(editorBg.value);
  editor.setBpm(Number(editorBpm.value));
  editor.save();
  editorJson.value = editor.exportJson();
});
$("#editorLoad").addEventListener("click", () => {
  editor.load();
  renderEditorControls();
});
$("#editorExport").addEventListener("click", () => {
  editorJson.value = editor.exportJson();
  editorJson.select();
});
$("#editorImport").addEventListener("click", () => {
  try {
    editor.importJson(editorJson.value);
    renderEditorControls();
  } catch (error) {
    editorJson.value = `Import failed: ${(error as Error).message}`;
  }
});
$("#editorTest").addEventListener("click", () => {
  try {
    editor.importJson(editorJson.value);
  } catch {
    editor.setBackground(editorBg.value);
    editor.setBpm(Number(editorBpm.value));
  }
  hideScreensForPlay();
  game.startCustomLevel(editor.level);
});

const bindTouchHold = (element: HTMLElement, down: () => void, up: () => void) => {
  element.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    down();
  });
  window.addEventListener("pointerup", up);
  element.addEventListener("pointercancel", up);
};

bindTouchHold(touchLeft, () => game.setTouchDirection(true, false), () => game.setTouchDirection(false, false));
bindTouchHold(touchRight, () => game.setTouchDirection(false, true), () => game.setTouchDirection(false, false));
bindTouchHold(touchJump, () => game.pressAction(), () => game.releaseAction());

game.onHudUpdate = (state) => {
  hudLevel.textContent = state.levelName;
  hudRank.textContent = state.missionRank;
  progressFill.style.width = `${Math.round(state.progress * 100)}%`;
  progressText.textContent = `${Math.round(state.progress * 100)}%`;
  hudSeals.textContent = `${state.seals}/${state.totalSeals} Seals`;
  hudAttempts.textContent = `Attempt ${state.attempt}`;
};

game.onOverlayChange = (state: OverlayState) => {
  missionOverlay.classList.toggle("hidden", !state.visible);
  overlayKicker.textContent = state.kicker;
  overlayTitle.textContent = state.title;
  overlayBody.textContent = state.body;
  resumeButton.classList.toggle("hidden", state.mode !== "pause");
};

game.onStateChange = (state, level) => {
  const playingState = ["playing", "paused", "dead", "complete"].includes(state);
  hud.classList.toggle("hidden", !playingState || !level);
  if (playingState) screens.forEach((screen) => screen.classList.remove("active"));
  if (state === "menu" && currentScreen === "") showScreen("mainMenu");
};

game.onTouchModeChange = (visible) => {
  touchControls.classList.toggle("hidden", !visible);
};

saveSystem.subscribe(() => {
  if (currentScreen === "archiveScreen") renderArchive();
  if (currentScreen === "customizeScreen") renderCustomization();
  if (currentScreen === "levelSelect") renderLevelCards();
});

setTimeout(() => showScreen("mainMenu"), 850);
