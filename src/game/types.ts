export type MissionRank = "Rank D" | "Rank C" | "Rank B" | "Rank A" | "Special Grade";

export type PlayerForm =
  | "runner"
  | "glider"
  | "gravity"
  | "phantom"
  | "wave"
  | "power"
  | "blink"
  | "swing";

export type LevelKind = "classic" | "platformer";

export type ObjectType =
  | "block"
  | "spike"
  | "saw"
  | "flame"
  | "pad"
  | "orb"
  | "seal"
  | "portal"
  | "gate"
  | "laser"
  | "boss"
  | "decor"
  | "checkpoint";

export interface Vec2 {
  x: number;
  y: number;
}

export interface LevelObject {
  id: string;
  type: ObjectType;
  x: number;
  y: number;
  w?: number;
  h?: number;
  r?: number;
  rotation?: number;
  targetForm?: PlayerForm;
  gravity?: 1 | -1;
  variant?: string;
  beat?: number;
  text?: string;
  color?: string;
  trigger?: "domainSurge" | "drop" | "checkpoint";
}

export interface BeatEvent {
  beat: number;
  type: "pulse" | "shake" | "flash" | "surge" | "boss";
  strength?: number;
}

export interface ColorPalette {
  primary: string;
  secondary: string;
  danger: string;
  spirit: string;
  background: string;
}

export interface LevelData {
  id: string;
  name: string;
  missionRank: MissionRank;
  music: string;
  bpm: number;
  backgroundTheme: string;
  kind: LevelKind;
  playerStart: Vec2;
  speed: number;
  length: number;
  objects: LevelObject[];
  hazards: LevelObject[];
  portals: LevelObject[];
  coins: LevelObject[];
  decorations: LevelObject[];
  beatEvents: BeatEvent[];
  colorPalette: ColorPalette;
}

export interface SkinDefinition {
  id: string;
  name: string;
  requirement: string;
  primary: string;
  secondary: string;
  death: "shatter" | "smoke" | "flare";
}

export interface SaveData {
  completedLevels: string[];
  bestPercent: Record<string, number>;
  attempts: Record<string, number>;
  collectedSeals: Record<string, string[]>;
  unlockedSkins: string[];
  selectedSkin: string;
  primaryColor: string;
  secondaryColor: string;
  trailType: "ribbon" | "embers" | "slash" | "sigils";
  deathEffect: "shatter" | "smoke" | "flare";
  glowIntensity: number;
  musicVolume: number;
  sfxVolume: number;
  muted: boolean;
  editorLevels: Record<string, LevelData>;
}

export interface HudState {
  levelName: string;
  missionRank: MissionRank;
  progress: number;
  seals: number;
  totalSeals: number;
  attempt: number;
  trainingMode: boolean;
}

export interface OverlayState {
  visible: boolean;
  kicker: string;
  title: string;
  body: string;
  mode: "pause" | "dead" | "complete";
}
