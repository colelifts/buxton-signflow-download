import type { LevelData, LevelObject, ObjectType, PlayerForm } from "../game/types";
import { SaveSystem } from "../game/SaveSystem";

type Tool = ObjectType | "delete" | "move";

const GRID = 40;
const EDITOR_ID = "editor-contract";

const toolLabels: Record<Tool, string> = {
  block: "B",
  spike: "T",
  saw: "S",
  flame: "F",
  pad: "P",
  orb: "O",
  seal: "$",
  portal: "G",
  gate: "X",
  decor: "*",
  checkpoint: "C",
  boss: "I",
  laser: "L",
  delete: "Del",
  move: "Mv",
};

export class LevelEditor {
  readonly tools: Tool[] = ["block", "spike", "saw", "pad", "orb", "portal", "seal", "gate", "decor", "laser", "checkpoint", "move", "delete"];
  activeTool: Tool = "block";
  level: LevelData;
  cameraX = 0;
  private draggingId: string | null = null;
  private saveSystem: SaveSystem;

  constructor(saveSystem: SaveSystem) {
    this.saveSystem = saveSystem;
    this.level = saveSystem.getEditorLevel(EDITOR_ID) ?? this.createBlankLevel();
  }

  labelFor(tool: Tool): string {
    return toolLabels[tool];
  }

  setTool(tool: Tool): void {
    this.activeTool = tool;
  }

  setBackground(color: string): void {
    this.level.colorPalette.background = color;
  }

  setBpm(bpm: number): void {
    this.level.bpm = Math.max(70, Math.min(220, Math.round(bpm)));
  }

  pan(delta: number): void {
    this.cameraX = Math.max(0, Math.min(this.level.length - 960, this.cameraX + delta));
  }

  onPointerDown(x: number, y: number): void {
    const world = this.snapPoint(x + this.cameraX, y);

    if (this.activeTool === "delete") {
      const hit = this.findObject(world.x, world.y);
      if (hit) this.removeObject(hit.id);
      return;
    }

    if (this.activeTool === "move") {
      this.draggingId = this.findObject(world.x, world.y)?.id ?? null;
      return;
    }

    this.addObject(this.createObject(this.activeTool, world.x, world.y));
  }

  onPointerMove(x: number, y: number): void {
    if (!this.draggingId) return;
    const world = this.snapPoint(x + this.cameraX, y);
    const object = this.allObjects().find((entry) => entry.id === this.draggingId);
    if (object) {
      object.x = world.x;
      object.y = world.y;
    }
  }

  onPointerUp(): void {
    this.draggingId = null;
  }

  save(): void {
    this.saveSystem.saveEditorLevel(this.level);
  }

  load(): void {
    this.level = this.saveSystem.getEditorLevel(EDITOR_ID) ?? this.createBlankLevel();
  }

  exportJson(): string {
    this.sortObjects();
    return JSON.stringify(this.level, null, 2);
  }

  importJson(json: string): void {
    const parsed = JSON.parse(json) as LevelData;
    this.level = {
      ...this.createBlankLevel(),
      ...parsed,
      id: parsed.id || EDITOR_ID,
      name: parsed.name || "Custom Rift",
      kind: "classic",
      objects: parsed.objects ?? [],
      hazards: parsed.hazards ?? [],
      portals: parsed.portals ?? [],
      coins: parsed.coins ?? [],
      decorations: parsed.decorations ?? [],
      beatEvents: parsed.beatEvents ?? [],
      colorPalette: parsed.colorPalette ?? this.createBlankLevel().colorPalette,
    };
    this.sortObjects();
  }

  render(ctx: CanvasRenderingContext2D, width: number, height: number, beatPulse: number): void {
    ctx.save();
    const bg = this.level.colorPalette.background;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);
    ctx.globalAlpha = 0.25 + beatPulse * 0.15;
    ctx.strokeStyle = "#2ce7ff";
    for (let x = -this.cameraX % GRID; x < width; x += GRID) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += GRID) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    ctx.fillStyle = "rgba(255,255,255,0.72)";
    ctx.font = "700 16px Inter, sans-serif";
    ctx.fillText(`Editor X ${Math.round(this.cameraX)} | ${this.activeTool}`, 24, 92);

    this.drawGround(ctx, width);
    this.allObjects().forEach((object) => this.drawObject(ctx, object));
    ctx.restore();
  }

  private createBlankLevel(): LevelData {
    return {
      id: EDITOR_ID,
      name: "Custom Rift",
      missionRank: "Rank C",
      music: "editor-synth",
      bpm: 144,
      backgroundTheme: "editor",
      kind: "classic",
      playerStart: { x: 120, y: 490 },
      speed: 350,
      length: 3200,
      objects: [{ id: "editor-gate", type: "gate", x: 3000, y: 400, w: 110, h: 160, trigger: "domainSurge" }],
      hazards: [],
      portals: [],
      coins: [],
      decorations: [],
      beatEvents: [],
      colorPalette: {
        primary: "#a855f7",
        secondary: "#2ce7ff",
        danger: "#ff335f",
        spirit: "#f8fbff",
        background: "#080817",
      },
    };
  }

  private createObject(type: ObjectType, x: number, y: number): LevelObject {
    const base = { id: `editor-${type}-${Date.now()}-${Math.floor(Math.random() * 999)}`, type, x, y };
    if (type === "block") return { ...base, w: 160, h: 42, variant: "concrete" };
    if (type === "spike") return { ...base, w: 42, h: 48 };
    if (type === "saw") return { ...base, r: 30 };
    if (type === "flame") return { ...base, w: 52, h: 64 };
    if (type === "pad") return { ...base, w: 58, h: 18, color: "#2ce7ff" };
    if (type === "orb") return { ...base, r: 24, color: "#a855f7" };
    if (type === "seal") return { ...base, r: 18 };
    if (type === "portal") return { ...base, w: 68, h: 140, targetForm: this.nextPortalForm(), trigger: "domainSurge" };
    if (type === "gate") return { ...base, w: 110, h: 160, trigger: "domainSurge" };
    if (type === "laser") return { ...base, w: 320, h: 30, beat: 0 };
    if (type === "checkpoint") return { ...base, w: 44, h: 70, trigger: "checkpoint" };
    if (type === "boss") return { ...base, w: 280, h: 260, variant: "shadow-oracle" };
    return { ...base, w: 110, h: 110, variant: "glyph-vx" };
  }

  private nextPortalForm(): PlayerForm {
    const forms: PlayerForm[] = ["runner", "glider", "gravity", "phantom", "wave", "power", "blink", "swing"];
    const count = this.level.portals.length;
    return forms[count % forms.length];
  }

  private addObject(object: LevelObject): void {
    if (["spike", "saw", "flame", "laser"].includes(object.type)) this.level.hazards.push(object);
    else if (object.type === "portal") this.level.portals.push(object);
    else if (object.type === "seal") this.level.coins.push(object);
    else if (["decor", "boss"].includes(object.type)) this.level.decorations.push(object);
    else this.level.objects.push(object);
    this.level.length = Math.max(this.level.length, object.x + 360);
    this.sortObjects();
  }

  private removeObject(id: string): void {
    this.level.objects = this.level.objects.filter((object) => object.id !== id);
    this.level.hazards = this.level.hazards.filter((object) => object.id !== id);
    this.level.portals = this.level.portals.filter((object) => object.id !== id);
    this.level.coins = this.level.coins.filter((object) => object.id !== id);
    this.level.decorations = this.level.decorations.filter((object) => object.id !== id);
  }

  private findObject(x: number, y: number): LevelObject | undefined {
    return [...this.allObjects()].reverse().find((object) => {
      const w = object.w ?? (object.r ?? 24) * 2;
      const h = object.h ?? (object.r ?? 24) * 2;
      return x >= object.x - w / 2 && x <= object.x + w && y >= object.y - h / 2 && y <= object.y + h;
    });
  }

  private allObjects(): LevelObject[] {
    return [...this.level.decorations, ...this.level.objects, ...this.level.hazards, ...this.level.portals, ...this.level.coins];
  }

  private sortObjects(): void {
    const sortByX = (a: LevelObject, b: LevelObject) => a.x - b.x;
    this.level.objects.sort(sortByX);
    this.level.hazards.sort(sortByX);
    this.level.portals.sort(sortByX);
    this.level.coins.sort(sortByX);
    this.level.decorations.sort(sortByX);
  }

  private snapPoint(x: number, y: number): { x: number; y: number } {
    return {
      x: Math.round(x / GRID) * GRID,
      y: Math.round(y / GRID) * GRID,
    };
  }

  private drawGround(ctx: CanvasRenderingContext2D, width: number): void {
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.fillRect(0, 560, width, 2);
    ctx.fillStyle = "rgba(255,51,95,0.18)";
    ctx.fillRect(0, 562, width, 54);
  }

  private drawObject(ctx: CanvasRenderingContext2D, object: LevelObject): void {
    const x = object.x - this.cameraX;
    const y = object.y;
    if (x < -240 || x > 1520) return;

    ctx.save();
    if (object.type === "block") {
      ctx.fillStyle = "#24263a";
      ctx.fillRect(x, y, object.w ?? 120, object.h ?? 42);
      ctx.strokeStyle = "#2ce7ff";
      ctx.strokeRect(x, y, object.w ?? 120, object.h ?? 42);
    } else if (object.type === "spike") {
      ctx.fillStyle = "#ff335f";
      ctx.beginPath();
      ctx.moveTo(x, y + (object.h ?? 48));
      ctx.lineTo(x + (object.w ?? 42) / 2, y);
      ctx.lineTo(x + (object.w ?? 42), y + (object.h ?? 48));
      ctx.closePath();
      ctx.fill();
    } else if (object.type === "saw") {
      ctx.strokeStyle = "#ff335f";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(x, y, object.r ?? 28, 0, Math.PI * 2);
      ctx.stroke();
    } else if (object.type === "seal") {
      ctx.fillStyle = "#f8c85a";
      ctx.beginPath();
      ctx.arc(x, y, object.r ?? 18, 0, Math.PI * 2);
      ctx.fill();
    } else if (object.type === "portal" || object.type === "gate") {
      ctx.strokeStyle = object.type === "gate" ? "#ff335f" : "#a855f7";
      ctx.lineWidth = 5;
      ctx.strokeRect(x, y, object.w ?? 70, object.h ?? 140);
    } else if (object.type === "orb" || object.type === "pad" || object.type === "checkpoint") {
      ctx.fillStyle = object.color ?? "#a855f7";
      ctx.fillRect(x - 14, y - 14, object.w ?? 48, object.h ?? 28);
    } else if (object.type === "laser") {
      ctx.fillStyle = "rgba(255,51,95,0.65)";
      ctx.fillRect(x, y, object.w ?? 220, object.h ?? 30);
    } else {
      ctx.fillStyle = "rgba(168,85,247,0.35)";
      ctx.fillRect(x, y, object.w ?? 90, object.h ?? 90);
    }
    ctx.restore();
  }
}
