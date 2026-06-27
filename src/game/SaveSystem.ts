import { LEVELS, SKINS } from "../data/levels";
import type { LevelData, SaveData } from "./types";

const STORAGE_KEY = "riftbound-save-v1";

const defaultSave = (): SaveData => ({
  completedLevels: [],
  bestPercent: {},
  attempts: {},
  collectedSeals: {},
  unlockedSkins: ["shadow-student"],
  selectedSkin: "shadow-student",
  primaryColor: "#a855f7",
  secondaryColor: "#2ce7ff",
  trailType: "ribbon",
  deathEffect: "shatter",
  glowIntensity: 1,
  musicVolume: 0.58,
  sfxVolume: 0.72,
  muted: false,
  editorLevels: {},
});

export class SaveSystem {
  private data: SaveData;
  private listeners = new Set<() => void>();

  constructor() {
    this.data = this.load();
    this.updateUnlocks();
  }

  get snapshot(): SaveData {
    return structuredClone(this.data);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setVolumes(musicVolume: number, sfxVolume: number, muted: boolean): void {
    this.data.musicVolume = musicVolume;
    this.data.sfxVolume = sfxVolume;
    this.data.muted = muted;
    this.persist();
  }

  setCustomization(update: Partial<Pick<SaveData, "selectedSkin" | "primaryColor" | "secondaryColor" | "trailType" | "deathEffect" | "glowIntensity">>): void {
    this.data = { ...this.data, ...update };
    this.persist();
  }

  recordAttempt(levelId: string): number {
    this.data.attempts[levelId] = (this.data.attempts[levelId] ?? 0) + 1;
    this.persist();
    return this.data.attempts[levelId];
  }

  recordBest(levelId: string, percent: number): void {
    const normalized = Math.max(0, Math.min(1, percent));
    this.data.bestPercent[levelId] = Math.max(this.data.bestPercent[levelId] ?? 0, normalized);
    this.updateUnlocks();
    this.persist();
  }

  collectSeal(levelId: string, sealId: string): boolean {
    const seals = new Set(this.data.collectedSeals[levelId] ?? []);
    const before = seals.size;
    seals.add(sealId);
    this.data.collectedSeals[levelId] = [...seals];
    if (seals.size !== before) {
      this.updateUnlocks();
      this.persist();
      return true;
    }
    return false;
  }

  hasSeal(levelId: string, sealId: string): boolean {
    return (this.data.collectedSeals[levelId] ?? []).includes(sealId);
  }

  completeLevel(levelId: string): string[] {
    if (!this.data.completedLevels.includes(levelId)) {
      this.data.completedLevels.push(levelId);
    }
    this.data.bestPercent[levelId] = 1;
    const unlocks = this.updateUnlocks();
    this.persist();
    return unlocks;
  }

  saveEditorLevel(level: LevelData): void {
    this.data.editorLevels[level.id] = level;
    this.persist();
  }

  getEditorLevel(id = "editor-contract"): LevelData | undefined {
    return this.data.editorLevels[id];
  }

  reset(): void {
    this.data = defaultSave();
    this.persist();
  }

  levelSealCount(levelId: string): number {
    return this.data.collectedSeals[levelId]?.length ?? 0;
  }

  totalSealCount(): number {
    return Object.values(this.data.collectedSeals).reduce((total, seals) => total + seals.length, 0);
  }

  cursedEnergy(): number {
    const sealEnergy = this.totalSealCount() * 6;
    const clearEnergy = this.data.completedLevels.length * 18;
    return Math.min(100, sealEnergy + clearEnergy);
  }

  isUnlocked(skinId: string): boolean {
    return this.data.unlockedSkins.includes(skinId);
  }

  private load(): SaveData {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultSave();
      const parsed = JSON.parse(raw) as Partial<SaveData>;
      return {
        ...defaultSave(),
        ...parsed,
        completedLevels: parsed.completedLevels ?? [],
        bestPercent: parsed.bestPercent ?? {},
        attempts: parsed.attempts ?? {},
        collectedSeals: parsed.collectedSeals ?? {},
        unlockedSkins: parsed.unlockedSkins?.length ? parsed.unlockedSkins : ["shadow-student"],
        editorLevels: parsed.editorLevels ?? {},
      };
    } catch {
      return defaultSave();
    }
  }

  private updateUnlocks(): string[] {
    const before = new Set(this.data.unlockedSkins);
    const completed = new Set(this.data.completedLevels);
    const totalSeals = this.totalSealCount();
    const hasRankABest = LEVELS.some((level) => level.missionRank === "Rank A" && (this.data.bestPercent[level.id] ?? 0) >= 0.7);

    const unlock = (skinId: string, condition: boolean) => {
      if (condition && !before.has(skinId)) {
        this.data.unlockedSkins.push(skinId);
      }
    };

    unlock("cursed-mask", totalSeals >= 3);
    unlock("spirit-blade-runner", completed.has("cursed-alley"));
    unlock("neon-exorcist", totalSeals >= 7);
    unlock("hollow-phantom", hasRankABest);
    unlock("red-aura-fighter", completed.has("broken-shrine"));
    unlock("blue-flame-runner", totalSeals >= 12);
    unlock("special-grade-form", completed.has("domain-collapse"));

    const knownSkins = new Set(SKINS.map((skin) => skin.id));
    this.data.unlockedSkins = this.data.unlockedSkins.filter((skin) => knownSkins.has(skin));
    if (!this.data.unlockedSkins.includes(this.data.selectedSkin)) {
      this.data.selectedSkin = this.data.unlockedSkins[0] ?? "shadow-student";
    }

    const after = new Set(this.data.unlockedSkins);
    return [...after].filter((skin) => !before.has(skin));
  }

  private persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch {
      // LocalStorage can be unavailable in hardened browsing modes; gameplay still works for the session.
    }
    this.listeners.forEach((listener) => listener());
  }
}
