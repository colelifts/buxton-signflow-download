import { SKINS } from "../data/levels";
import type { HudState, LevelData, LevelObject, OverlayState, PlayerForm, SaveData, SkinDefinition } from "./types";
import { AudioManager } from "./AudioManager";
import { SaveSystem } from "./SaveSystem";
import type { LevelEditor } from "../editor/LevelEditor";

type GameState = "menu" | "playing" | "paused" | "dead" | "complete" | "editor";
type Rect = { x: number; y: number; w: number; h: number };
type ParticleKind = "spark" | "smoke" | "shard" | "ribbon" | "slash" | "sigil";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  kind: ParticleKind;
  spin?: number;
  text?: string;
}

interface PlayerState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  form: PlayerForm;
  gravity: 1 | -1;
  grounded: boolean;
  alive: boolean;
  rotation: number;
  charge: number;
  blinkCooldown: number;
}

const VW = 1280;
const VH = 720;
const FLOOR_Y = 560;
const CEILING_Y = 92;
const PLAYER_SIZE = 46;

const formNames: Record<PlayerForm, string> = {
  runner: "Runner Form",
  glider: "Spirit Glider",
  gravity: "Gravity Seal",
  phantom: "Phantom Hop",
  wave: "Slash Wave",
  power: "Power Jump",
  blink: "Blink Step",
  swing: "Cursed Swing",
};

export class Game {
  onHudUpdate?: (state: HudState) => void;
  onOverlayChange?: (state: OverlayState) => void;
  onStateChange?: (state: GameState, level?: LevelData) => void;
  onTouchModeChange?: (visible: boolean) => void;

  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private save: SaveSystem;
  private audio: AudioManager;
  private state: GameState = "menu";
  private editor: LevelEditor | null = null;
  private currentLevel: LevelData | null = null;
  private trainingMode = false;
  private player: PlayerState = this.createPlayer(120, FLOOR_Y - PLAYER_SIZE);
  private checkpoint: Partial<PlayerState> & { x: number; y: number } = { x: 120, y: FLOOR_Y - PLAYER_SIZE };
  private particles: Particle[] = [];
  private collectedInRun = new Set<string>();
  private usedObjects = new Set<string>();
  private passedCheckpoints = new Set<string>();
  private keys = new Set<string>();
  private inputHeld = false;
  private justPressed = false;
  private justReleased = false;
  private jumpBufferTimer = 0;
  private coyoteTimer = 0;
  private touchLeft = false;
  private touchRight = false;
  private lastTime = performance.now();
  private pixelRatio = 1;
  private canvasWidth = VW;
  private canvasHeight = VH;
  private scale = 1;
  private offsetX = 0;
  private offsetY = 0;
  private cameraX = 0;
  private shake = 0;
  private flash = 0;
  private beatPulse = 0;
  private surge = 0;
  private currentBeat = 0;
  private deathTimer = 0;
  private trailTimer = 0;
  private completionHandled = false;

  constructor(canvas: HTMLCanvasElement, save: SaveSystem, audio: AudioManager) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas rendering context is unavailable.");
    this.canvas = canvas;
    this.ctx = ctx;
    this.save = save;
    this.audio = audio;
    this.resize();
    this.bindEvents();
    this.audio.onBeat((beat, downbeat) => this.onBeat(beat, downbeat));
    this.audio.playMenu();
    requestAnimationFrame((time) => this.loop(time));
  }

  showMenu(): void {
    this.currentLevel = null;
    this.state = "menu";
    this.trainingMode = false;
    this.audio.playMenu();
    this.onTouchModeChange?.(false);
    this.hideOverlay();
    this.emitState();
  }

  enterEditor(editor: LevelEditor): void {
    this.editor = editor;
    this.currentLevel = null;
    this.state = "editor";
    this.audio.playMenu();
    this.onTouchModeChange?.(false);
    this.hideOverlay();
    this.emitState();
  }

  startLevel(level: LevelData, trainingMode = false): void {
    this.currentLevel = structuredClone(level);
    this.trainingMode = trainingMode;
    this.state = "playing";
    this.completionHandled = false;
    this.audio.playLevel(level);
    this.resetRun(false);
    this.hideOverlay();
    this.onTouchModeChange?.(level.kind === "platformer");
    this.emitState();
  }

  startCustomLevel(level: LevelData): void {
    this.startLevel(level, false);
  }

  pause(): void {
    if (this.state !== "playing") return;
    this.state = "paused";
    this.showOverlay({
      visible: true,
      kicker: this.trainingMode ? "Training Mode" : "Mission Paused",
      title: "Technique Held",
      body: "The rift is frozen at the current beat.",
      mode: "pause",
    });
    this.emitState();
  }

  resume(): void {
    if (this.state !== "paused") return;
    this.state = "playing";
    this.hideOverlay();
    this.emitState();
  }

  restart(): void {
    if (!this.currentLevel) return;
    this.state = "playing";
    this.resetRun(false);
    this.hideOverlay();
    this.emitState();
  }

  setTouchDirection(left: boolean, right: boolean): void {
    this.touchLeft = left;
    this.touchRight = right;
  }

  pressAction(): void {
    void this.audio.resume();
    if (this.state === "paused") {
      this.resume();
      return;
    }
    if (this.state === "complete") return;
    if (this.state === "dead") {
      this.resetRun(this.trainingMode);
      return;
    }
    if (this.state !== "playing") return;
    this.justPressed = !this.inputHeld;
    this.jumpBufferTimer = 0.16;
    this.inputHeld = true;
    this.handleInstantAction();
  }

  releaseAction(): void {
    if (!this.inputHeld) return;
    this.inputHeld = false;
    this.justReleased = true;
  }

  private bindEvents(): void {
    window.addEventListener("resize", () => this.resize());
    window.addEventListener("keydown", (event) => {
      if (["Space", "ArrowUp", "KeyW"].includes(event.code)) {
        event.preventDefault();
        if (!event.repeat) this.pressAction();
      }
      if (["ArrowLeft", "ArrowRight", "KeyA", "KeyD"].includes(event.code)) {
        this.keys.add(event.code);
      }
      if (event.code === "Escape") {
        if (this.state === "playing") this.pause();
        else if (this.state === "paused") this.resume();
      }
      if (event.code === "KeyR" && (this.state === "playing" || this.state === "paused" || this.state === "dead")) {
        this.restart();
      }
      if (this.state === "editor") {
        if (event.code === "ArrowLeft") this.editor?.pan(-120);
        if (event.code === "ArrowRight") this.editor?.pan(120);
      }
    });
    window.addEventListener("keyup", (event) => {
      if (["Space", "ArrowUp", "KeyW"].includes(event.code)) this.releaseAction();
      this.keys.delete(event.code);
    });
    this.canvas.addEventListener("pointerdown", (event) => {
      const point = this.pointerToWorld(event);
      if (this.state === "editor") {
        this.editor?.onPointerDown(point.x, point.y);
      } else {
        this.pressAction();
      }
    });
    this.canvas.addEventListener("pointermove", (event) => {
      if (this.state !== "editor") return;
      const point = this.pointerToWorld(event);
      this.editor?.onPointerMove(point.x, point.y);
    });
    window.addEventListener("pointerup", () => {
      if (this.state === "editor") this.editor?.onPointerUp();
      this.releaseAction();
    });
    this.canvas.addEventListener(
      "wheel",
      (event) => {
        if (this.state !== "editor") return;
        event.preventDefault();
        this.editor?.pan(event.deltaY || event.deltaX);
      },
      { passive: false },
    );
  }

  private resize(): void {
    this.pixelRatio = Math.min(2, window.devicePixelRatio || 1);
    this.canvasWidth = window.innerWidth;
    this.canvasHeight = window.innerHeight;
    this.canvas.width = Math.floor(this.canvasWidth * this.pixelRatio);
    this.canvas.height = Math.floor(this.canvasHeight * this.pixelRatio);
    this.scale = Math.min(this.canvasWidth / VW, this.canvasHeight / VH);
    this.offsetX = (this.canvasWidth - VW * this.scale) / 2;
    this.offsetY = (this.canvasHeight - VH * this.scale) / 2;
  }

  private loop(time: number): void {
    const dt = Math.min(0.033, (time - this.lastTime) / 1000 || 0.016);
    this.lastTime = time;
    this.update(dt);
    this.render();
    requestAnimationFrame((nextTime) => this.loop(nextTime));
  }

  private update(dt: number): void {
    this.beatPulse = Math.max(0, this.beatPulse - dt * 3.6);
    this.surge = Math.max(0, this.surge - dt * 1.55);
    this.shake = Math.max(0, this.shake - dt * 34);
    this.flash = Math.max(0, this.flash - dt * 3.8);
    this.updateParticles(dt);

    if (this.state === "dead") {
      this.deathTimer -= dt;
      if (this.deathTimer <= 0) this.resetRun(this.trainingMode);
      this.justPressed = false;
      this.justReleased = false;
      return;
    }

    if (this.state !== "playing" || !this.currentLevel) {
      this.justPressed = false;
      this.justReleased = false;
      return;
    }

    this.jumpBufferTimer = Math.max(0, this.jumpBufferTimer - dt);
    if (this.currentLevel.kind === "platformer") this.updatePlatformer(dt);
    else this.updateClassic(dt);

    this.updateCamera();
    this.spawnAmbientPlayerEffects(dt);
    this.checkInteractions();
    this.emitHud();
    this.justPressed = false;
    this.justReleased = false;
  }

  private resetRun(fromCheckpoint: boolean): void {
    if (!this.currentLevel) return;
    const attempt = this.save.recordAttempt(this.currentLevel.id);
    const startX = fromCheckpoint ? this.checkpoint.x : this.currentLevel.playerStart.x;
    const startY = fromCheckpoint ? this.checkpoint.y : this.currentLevel.playerStart.y;
    this.player = this.createPlayer(startX, startY);
    if (fromCheckpoint) {
      this.player.form = this.checkpoint.form ?? "runner";
      this.player.gravity = this.checkpoint.gravity ?? 1;
    }
    this.checkpoint = { x: this.currentLevel.playerStart.x, y: this.currentLevel.playerStart.y, form: "runner", gravity: 1 };
    if (fromCheckpoint && this.trainingMode) {
      this.checkpoint = { x: startX, y: startY, form: this.player.form, gravity: this.player.gravity };
    }
    this.usedObjects.clear();
    this.passedCheckpoints.clear();
    this.collectedInRun = new Set(this.save.snapshot.collectedSeals[this.currentLevel.id] ?? []);
    this.jumpBufferTimer = 0;
    this.coyoteTimer = 0;
    this.deathTimer = 0;
    this.flash = 0;
    this.surge = 0;
    this.state = "playing";
    this.audio.playSfx("click");
    this.emitHud(attempt);
  }

  private createPlayer(x: number, y: number): PlayerState {
    return {
      x,
      y,
      vx: 0,
      vy: 0,
      w: PLAYER_SIZE,
      h: PLAYER_SIZE,
      form: "runner",
      gravity: 1,
      grounded: false,
      alive: true,
      rotation: 0,
      charge: 0,
      blinkCooldown: 0,
    };
  }

  private updateClassic(dt: number): void {
    if (!this.currentLevel) return;
    const player = this.player;
    const prev = { x: player.x, y: player.y, grounded: player.grounded };
    player.x += this.currentLevel.speed * dt;
    this.coyoteTimer = prev.grounded ? 0.12 : Math.max(0, this.coyoteTimer - dt);
    player.grounded = false;
    player.blinkCooldown = Math.max(0, player.blinkCooldown - dt);

    if (player.form === "runner") {
      this.applyRunnerPhysics(dt, prev);
    } else if (player.form === "power") {
      this.applyPowerPhysics(dt, prev);
    } else if (player.form === "glider") {
      player.vy += (this.inputHeld ? -980 : 940) * dt;
      player.vy = clamp(player.vy, -520, 520);
      player.y += player.vy * dt;
      this.clampFlightBounds(false);
    } else if (player.form === "gravity") {
      if (this.justPressed) {
        player.gravity = player.gravity === 1 ? -1 : 1;
        player.vy = 0;
        this.audio.playSfx("jump");
        this.spawnSlash(player.x + player.w / 2, player.y + player.h / 2, "#f8c85a");
      }
      player.vy += 1500 * player.gravity * dt;
      player.y += player.vy * dt;
      this.resolveGravitySurfaces(prev);
    } else if (player.form === "phantom") {
      if (this.justPressed) {
        player.vy = -620;
        this.audio.playSfx("jump");
        this.spawnSlash(player.x + player.w / 2, player.y + player.h / 2, "#a855f7");
      }
      player.vy += 1120 * dt;
      player.y += player.vy * dt;
      this.resolveFloorAndBlocks(prev);
    } else if (player.form === "wave") {
      player.vy = this.inputHeld ? -470 : 470;
      player.y += player.vy * dt;
      player.rotation = this.inputHeld ? -0.75 : 0.75;
      this.clampFlightBounds(true);
    } else if (player.form === "blink") {
      if (this.justPressed && player.blinkCooldown <= 0) {
        const topY = CEILING_Y;
        const bottomY = FLOOR_Y - player.h;
        player.y = Math.abs(player.y - bottomY) < 60 ? topY : bottomY;
        player.vy = 0;
        player.gravity = player.y === topY ? -1 : 1;
        player.blinkCooldown = 0.16;
        this.audio.playSfx("portal");
        this.spawnAfterImage(player.x, player.y);
      }
      player.y += (player.y < FLOOR_Y / 2 ? -90 : 90) * dt;
      this.resolveGravitySurfaces(prev);
    } else if (player.form === "swing") {
      player.vy += (this.inputHeld ? -1180 : 1180) * dt;
      player.vy = clamp(player.vy, -560, 560);
      player.y += player.vy * dt;
      player.rotation += (this.inputHeld ? -2.2 : 2.2) * dt;
      this.clampFlightBounds(false);
    }

    if (!prev.grounded && player.grounded) {
      this.spawnSmoke(player.x + player.w / 2, player.y + player.h, "#a855f7");
    }

    player.rotation += player.form === "runner" || player.form === "power" || player.form === "gravity" ? this.currentLevel.speed * dt * 0.012 * player.gravity : 0;
  }

  private applyRunnerPhysics(dt: number, prev: { x: number; y: number }): void {
    const player = this.player;
    if (this.jumpBufferTimer > 0 && (player.grounded || this.coyoteTimer > 0)) {
      player.vy = -720;
      player.grounded = false;
      this.jumpBufferTimer = 0;
      this.coyoteTimer = 0;
      this.audio.playSfx("jump");
      this.spawnSlash(player.x + player.w / 2, player.y + player.h, "#2ce7ff");
    }
    player.vy += 1580 * dt;
    player.y += player.vy * dt;
    this.resolveFloorAndBlocks(prev);
  }

  private applyPowerPhysics(dt: number, prev: { x: number; y: number }): void {
    const player = this.player;
    if (this.inputHeld && player.grounded) {
      player.charge = Math.min(1, player.charge + dt * 1.8);
      this.spawnParticle(player.x + 22, player.y + 42, 0, -40, 0.18, 4 + player.charge * 5, "#f8c85a", "spark");
    }
    if (this.justReleased && player.grounded) {
      player.vy = -480 - player.charge * 390;
      player.charge = 0;
      player.grounded = false;
      this.audio.playSfx("jump");
      this.spawnSlash(player.x + player.w / 2, player.y + player.h, "#f8c85a");
    }
    if (!this.inputHeld && player.grounded) player.charge = 0;
    player.vy += 1600 * dt;
    player.y += player.vy * dt;
    this.resolveFloorAndBlocks(prev);
  }

  private updatePlatformer(dt: number): void {
    if (!this.currentLevel) return;
    const player = this.player;
    const prev = { x: player.x, y: player.y };
    this.coyoteTimer = player.grounded ? 0.12 : Math.max(0, this.coyoteTimer - dt);
    const left = this.keys.has("ArrowLeft") || this.keys.has("KeyA") || this.touchLeft;
    const right = this.keys.has("ArrowRight") || this.keys.has("KeyD") || this.touchRight;
    const target = (right ? 1 : 0) - (left ? 1 : 0);
    player.vx += target * 2400 * dt;
    if (!target) player.vx *= Math.pow(0.001, dt);
    player.vx = clamp(player.vx, -360, 360);
    if (this.jumpBufferTimer > 0 && (player.grounded || this.coyoteTimer > 0)) {
      player.vy = -720;
      player.grounded = false;
      this.jumpBufferTimer = 0;
      this.coyoteTimer = 0;
      this.audio.playSfx("jump");
      this.spawnSlash(player.x + player.w / 2, player.y + player.h, "#42ffb5");
    }
    player.vy += 1720 * dt;
    player.x += player.vx * dt;
    this.resolvePlatformerBlocks(prev, "x");
    const afterX = { x: player.x, y: player.y };
    player.y += player.vy * dt;
    player.grounded = false;
    this.resolvePlatformerBlocks(afterX, "y");
    if (player.y > VH + 140) this.killPlayer("Consumed by the Curse.");
    player.x = clamp(player.x, 20, this.currentLevel.length - 30);
    player.rotation += player.vx * dt * 0.015;
  }

  private handleInstantAction(): void {
    if (!this.currentLevel || this.state !== "playing") return;
    const player = this.player;
    const orb = this.currentLevel.objects
      .filter((object) => object.type === "orb")
      .concat(this.currentLevel.hazards.filter((object) => object.type === "orb"))
      .find((object) => !this.usedObjects.has(object.id) && this.distanceToObject(object) < 78);
    if (orb) {
      this.usedObjects.add(orb.id);
      player.vy = player.gravity === -1 ? 620 : -720;
      player.grounded = false;
      this.audio.playSfx("orb");
      this.spawnSlash(orb.x, orb.y, orb.color ?? "#a855f7");
      this.shake = Math.max(this.shake, 4);
    }
  }

  private checkInteractions(): void {
    if (!this.currentLevel || this.state !== "playing") return;
    const playerRect = this.hitbox();
    const level = this.currentLevel;

    for (const object of level.objects) {
      if (object.type === "pad" && !this.usedObjects.has(object.id) && this.intersectsObject(playerRect, object)) {
        this.usedObjects.add(object.id);
        this.player.vy = this.player.gravity === -1 ? 820 : -820;
        this.player.grounded = false;
        this.audio.playSfx("orb");
        this.spawnSlash(object.x + 24, object.y, object.color ?? "#2ce7ff");
      }
      if (object.type === "checkpoint" && this.trainingMode && !this.passedCheckpoints.has(object.id) && this.intersectsObject(playerRect, object)) {
        this.passedCheckpoints.add(object.id);
        this.checkpoint = { x: this.player.x, y: this.player.y, form: this.player.form, gravity: this.player.gravity };
        this.audio.playSfx("checkpoint");
        this.spawnSmoke(object.x, object.y, "#42ffb5");
      }
      if (object.type === "gate" && this.intersectsObject(playerRect, object)) {
        this.completeLevel();
      }
    }

    for (const portal of level.portals) {
      if (!this.usedObjects.has(portal.id) && this.intersectsObject(playerRect, portal)) {
        this.usedObjects.add(portal.id);
        this.changeForm(portal.targetForm ?? "runner", portal.trigger);
      }
    }

    for (const coin of level.coins) {
      if (!this.collectedInRun.has(coin.id) && this.intersectsObject(playerRect, coin)) {
        this.collectedInRun.add(coin.id);
        this.save.collectSeal(level.id, coin.id);
        this.audio.playSfx("seal");
        this.spawnSealBurst(coin.x, coin.y);
      }
    }

    for (const hazard of level.hazards) {
      if (hazard.type === "laser" && !this.isLaserActive(hazard)) continue;
      if (this.intersectsObject(playerRect, hazard)) {
        this.killPlayer(Math.random() > 0.5 ? "Technique Failed." : "Consumed by the Curse.");
        return;
      }
      if (this.distanceToObject(hazard) < 115 && Math.random() < 0.08) {
        this.spawnParticle(this.player.x + 24, this.player.y + 24, -120 - Math.random() * 90, (Math.random() - 0.5) * 120, 0.22, 3, "#ff335f", "spark");
      }
    }

    if (this.player.x >= level.length - 130 && !this.completionHandled) this.completeLevel();
    const progress = this.player.x / level.length;
    const best = this.save.snapshot.bestPercent[level.id] ?? 0;
    if (progress > best + 0.005) this.save.recordBest(level.id, progress);
  }

  private changeForm(form: PlayerForm, trigger?: "domainSurge" | "drop" | "checkpoint"): void {
    this.player.form = form;
    this.player.vy = 0;
    this.player.charge = 0;
    this.surge = trigger ? 1 : 0.55;
    this.flash = Math.max(this.flash, trigger === "drop" ? 0.7 : 0.38);
    this.shake = Math.max(this.shake, trigger === "drop" ? 12 : 7);
    this.audio.playSfx("portal");
    this.spawnSmoke(this.player.x + this.player.w / 2, this.player.y + this.player.h / 2, "#a855f7");
  }

  private killPlayer(message: string): void {
    if (this.state !== "playing" || !this.currentLevel) return;
    this.state = "dead";
    this.player.alive = false;
    this.deathTimer = this.trainingMode ? 0.55 : 0.74;
    this.flash = 1;
    this.shake = 16;
    this.audio.playSfx("death");
    this.save.recordBest(this.currentLevel.id, this.player.x / this.currentLevel.length);
    this.spawnDeath();
    this.showOverlay({
      visible: true,
      kicker: this.trainingMode ? "Checkpoint Rebinding" : "Mission Failed",
      title: message,
      body: this.trainingMode ? "Training Mode will restore your last seal." : "The contract restarts on the next pulse.",
      mode: "dead",
    });
    this.emitState();
  }

  private completeLevel(): void {
    if (!this.currentLevel || this.completionHandled) return;
    this.completionHandled = true;
    this.state = "complete";
    this.audio.stopMusic();
    this.audio.playSfx("complete");
    const unlockIds = this.save.completeLevel(this.currentLevel.id);
    const unlockNames = unlockIds
      .map((skinId) => SKINS.find((skin) => skin.id === skinId)?.name)
      .filter(Boolean)
      .join(", ");
    this.flash = 0.7;
    this.surge = 1;
    this.spawnSealBurst(this.player.x + 40, this.player.y + 20);
    this.showOverlay({
      visible: true,
      kicker: "Mission Complete",
      title: "Curse Cleared.",
      body: `${this.currentLevel.name} sealed at 100%. ${unlockNames ? `Spirit Contract unlocked: ${unlockNames}.` : "Cursed Energy archived."}`,
      mode: "complete",
    });
    this.emitHud();
    this.emitState();
  }

  private resolveFloorAndBlocks(prev: { x: number; y: number }): void {
    const player = this.player;
    if (player.y + player.h >= FLOOR_Y) {
      player.y = FLOOR_Y - player.h;
      player.vy = 0;
      player.grounded = true;
    }
    if (player.y <= CEILING_Y) {
      player.y = CEILING_Y;
      player.vy = Math.max(0, player.vy);
    }
    this.resolveClassicBlocks(prev);
  }

  private resolveGravitySurfaces(prev: { x: number; y: number }): void {
    const player = this.player;
    if (player.gravity === 1 && player.y + player.h >= FLOOR_Y) {
      player.y = FLOOR_Y - player.h;
      player.vy = 0;
      player.grounded = true;
    }
    if (player.gravity === -1 && player.y <= CEILING_Y) {
      player.y = CEILING_Y;
      player.vy = 0;
      player.grounded = true;
    }
    this.resolveClassicBlocks(prev);
  }

  private resolveClassicBlocks(prev: { x: number; y: number }): void {
    if (!this.currentLevel) return;
    const player = this.player;
    const rect = this.hitbox();
    for (const block of this.currentLevel.objects.filter((object) => object.type === "block")) {
      const blockRect = this.objectRect(block);
      if (!rectsOverlap(rect, blockRect)) continue;
      const prevBottom = prev.y + player.h - 8;
      const prevTop = prev.y + 8;
      if (player.gravity === 1 && prevBottom <= blockRect.y + 8 && player.vy >= 0) {
        player.y = blockRect.y - player.h;
        player.vy = 0;
        player.grounded = true;
      } else if (player.gravity === -1 && prevTop >= blockRect.y + blockRect.h - 8 && player.vy <= 0) {
        player.y = blockRect.y + blockRect.h;
        player.vy = 0;
        player.grounded = true;
      } else {
        this.killPlayer("Technique Failed.");
      }
    }
  }

  private resolvePlatformerBlocks(prev: { x: number; y: number }, axis: "x" | "y"): void {
    if (!this.currentLevel) return;
    const player = this.player;
    for (const block of this.currentLevel.objects.filter((object) => object.type === "block")) {
      const rect = this.hitbox();
      const blockRect = this.objectRect(block);
      if (!rectsOverlap(rect, blockRect)) continue;

      if (axis === "x") {
        if (prev.x + player.w <= blockRect.x) player.x = blockRect.x - player.w - 8;
        else if (prev.x >= blockRect.x + blockRect.w) player.x = blockRect.x + blockRect.w - 8;
        player.vx = 0;
      } else {
        if (prev.y + player.h <= blockRect.y + 12 && player.vy >= 0) {
          player.y = blockRect.y - player.h;
          player.vy = 0;
          player.grounded = true;
        } else if (prev.y >= blockRect.y + blockRect.h - 12 && player.vy <= 0) {
          player.y = blockRect.y + blockRect.h;
          player.vy = 0;
        }
      }
    }
  }

  private clampFlightBounds(deadly: boolean): void {
    const player = this.player;
    if (player.y < CEILING_Y) {
      if (deadly) this.killPlayer("Technique Failed.");
      player.y = CEILING_Y;
      player.vy = Math.max(0, player.vy);
    }
    if (player.y + player.h > FLOOR_Y) {
      if (deadly) this.killPlayer("Consumed by the Curse.");
      player.y = FLOOR_Y - player.h;
      player.vy = Math.min(0, player.vy);
    }
  }

  private updateCamera(): void {
    if (!this.currentLevel) return;
    const target = this.currentLevel.kind === "platformer" ? this.player.x - 430 : this.player.x - 190;
    this.cameraX += (clamp(target, 0, Math.max(0, this.currentLevel.length - 1030)) - this.cameraX) * 0.16;
  }

  private onBeat(beat: number, downbeat: boolean): void {
    this.currentBeat = beat;
    this.beatPulse = 1;
    if (downbeat) this.shake = Math.max(this.shake, this.state === "playing" ? 3.2 : 1.4);
    const event = this.currentLevel?.beatEvents.find((entry) => entry.beat === beat);
    if (!event) return;
    if (event.type === "shake" || event.type === "boss") this.shake = Math.max(this.shake, 8 * (event.strength ?? 1));
    if (event.type === "flash" || event.type === "surge") this.flash = Math.max(this.flash, 0.35 * (event.strength ?? 1));
    if (event.type === "surge" || event.type === "boss") this.surge = Math.max(this.surge, 0.8 * (event.strength ?? 1));
  }

  private render(): void {
    const ctx = this.ctx;
    ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
    ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
    ctx.fillStyle = "#05050b";
    ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);
    ctx.setTransform(
      this.pixelRatio * this.scale,
      0,
      0,
      this.pixelRatio * this.scale,
      this.pixelRatio * this.offsetX,
      this.pixelRatio * this.offsetY,
    );

    const shakeX = (Math.random() - 0.5) * this.shake;
    const shakeY = (Math.random() - 0.5) * this.shake;
    ctx.save();
    ctx.translate(shakeX, shakeY);
    if (this.state === "editor" && this.editor) {
      this.editor.render(ctx, VW, VH, this.beatPulse);
    } else if (this.currentLevel) {
      this.drawLevelScene(ctx, this.currentLevel);
    } else {
      this.drawMenuScene(ctx);
    }
    ctx.restore();
    this.drawEffectsOverlay(ctx);
  }

  private drawMenuScene(ctx: CanvasRenderingContext2D): void {
    const t = performance.now() / 1000;
    const gradient = ctx.createLinearGradient(0, 0, VW, VH);
    gradient.addColorStop(0, "#05050b");
    gradient.addColorStop(0.55, "#0a0717");
    gradient.addColorStop(1, "#080c16");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, VW, VH);
    this.drawMoon(ctx, 980, 130, 90, 0.5 + this.beatPulse * 0.18);
    this.drawRooftops(ctx, t, 0);
    for (let i = 0; i < 36; i += 1) {
      const x = (i * 173 + t * 24) % (VW + 240) - 120;
      const y = 80 + ((i * 47) % 520);
      const alpha = 0.12 + ((i % 5) / 20) + this.beatPulse * 0.09;
      ctx.fillStyle = i % 3 === 0 ? `rgba(44,231,255,${alpha})` : `rgba(168,85,247,${alpha})`;
      ctx.fillRect(x, y, 2 + (i % 4), 18 + (i % 6) * 7);
    }
    this.drawDomainRing(ctx, 870, 380, 260, t, 0.2 + this.beatPulse * 0.18);
  }

  private drawLevelScene(ctx: CanvasRenderingContext2D, level: LevelData): void {
    this.drawLevelBackground(ctx, level);
    ctx.save();
    ctx.translate(-this.cameraX, 0);
    this.drawGround(ctx, level);
    const sorted = [...level.decorations, ...level.objects, ...level.hazards, ...level.portals, ...level.coins].sort((a, b) => a.x - b.x);
    for (const object of sorted) this.drawObject(ctx, object, level);
    if (this.player.alive || this.state !== "dead") this.drawPlayer(ctx);
    ctx.restore();
    this.drawParticles(ctx);
    this.drawVignette(ctx, level);
  }

  private drawLevelBackground(ctx: CanvasRenderingContext2D, level: LevelData): void {
    const palette = level.colorPalette;
    const t = performance.now() / 1000;
    const gradient = ctx.createLinearGradient(0, 0, 0, VH);
    gradient.addColorStop(0, palette.background);
    gradient.addColorStop(0.55, "#080711");
    gradient.addColorStop(1, "#120611");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, VW, VH);

    if (["rooftop", "shrine", "domain"].includes(level.backgroundTheme)) {
      this.drawMoon(ctx, 1040 - this.cameraX * 0.02, 118, level.backgroundTheme === "domain" ? 120 : 78, 0.42 + this.beatPulse * 0.14);
    }

    if (level.backgroundTheme === "domain") {
      this.drawDomainRing(ctx, 640, 360, 350 + this.surge * 90, t, 0.24 + this.surge * 0.2);
      this.drawDomainRing(ctx, 640, 360, 190 + this.beatPulse * 50, -t * 1.4, 0.18);
    }

    if (level.backgroundTheme === "alley") {
      for (let i = 0; i < 9; i += 1) {
        const x = ((i * 250 - this.cameraX * 0.18) % 1500) - 120;
        ctx.fillStyle = i % 2 ? "rgba(255,51,95,0.16)" : "rgba(44,231,255,0.13)";
        ctx.fillRect(x, 150 + (i % 3) * 42, 88, 26);
      }
    }

    this.drawRooftops(ctx, t, this.cameraX);
    this.drawSpeedLines(ctx, level.colorPalette.secondary, 0.08 + this.beatPulse * 0.12);

    if (this.surge > 0) {
      ctx.save();
      ctx.globalAlpha = this.surge * 0.22;
      ctx.strokeStyle = palette.primary;
      ctx.lineWidth = 18;
      ctx.strokeRect(35 + this.surge * 20, 35 + this.surge * 10, VW - 70 - this.surge * 40, VH - 70 - this.surge * 20);
      ctx.restore();
    }
  }

  private drawGround(ctx: CanvasRenderingContext2D, level: LevelData): void {
    if (level.kind === "classic") {
      ctx.fillStyle = "#171827";
      ctx.fillRect(this.cameraX - 200, FLOOR_Y, level.length + 700, 180);
      ctx.fillStyle = "rgba(44,231,255,0.2)";
      ctx.fillRect(this.cameraX - 200, FLOOR_Y, level.length + 700, 3);
      for (let x = Math.floor((this.cameraX - 240) / 120) * 120; x < this.cameraX + VW + 240; x += 120) {
        ctx.strokeStyle = "rgba(255,255,255,0.08)";
        ctx.beginPath();
        ctx.moveTo(x, FLOOR_Y + 18);
        ctx.lineTo(x + 42, FLOOR_Y + 66);
        ctx.lineTo(x + 110, FLOOR_Y + 30);
        ctx.stroke();
      }
    }
  }

  private drawObject(ctx: CanvasRenderingContext2D, object: LevelObject, level: LevelData): void {
    const x = object.x;
    if (x + (object.w ?? object.r ?? 120) < this.cameraX - 260 || x > this.cameraX + VW + 260) return;
    if (object.type === "block") this.drawBlock(ctx, object);
    else if (object.type === "spike") this.drawSpike(ctx, object);
    else if (object.type === "saw") this.drawSaw(ctx, object, level);
    else if (object.type === "flame") this.drawFlame(ctx, object);
    else if (object.type === "pad") this.drawPad(ctx, object);
    else if (object.type === "orb") this.drawOrb(ctx, object);
    else if (object.type === "seal") {
      if (!this.collectedInRun.has(object.id)) this.drawSeal(ctx, object);
    } else if (object.type === "portal") this.drawPortal(ctx, object, level);
    else if (object.type === "gate") this.drawGate(ctx, object);
    else if (object.type === "laser") this.drawLaser(ctx, object);
    else if (object.type === "boss") this.drawBoss(ctx, object, level);
    else if (object.type === "checkpoint") this.drawCheckpoint(ctx, object);
    else this.drawDecoration(ctx, object, level);
  }

  private drawBlock(ctx: CanvasRenderingContext2D, object: LevelObject): void {
    const w = object.w ?? 120;
    const h = object.h ?? 42;
    ctx.save();
    ctx.fillStyle = "#242638";
    ctx.fillRect(object.x, object.y, w, h);
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.fillRect(object.x, object.y, w, 8);
    ctx.strokeStyle = "rgba(44,231,255,0.42)";
    ctx.lineWidth = 2;
    ctx.strokeRect(object.x + 1, object.y + 1, w - 2, h - 2);
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    for (let i = 20; i < w; i += 42) {
      ctx.beginPath();
      ctx.moveTo(object.x + i, object.y + 5);
      ctx.lineTo(object.x + i + 18, object.y + h - 7);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawSpike(ctx: CanvasRenderingContext2D, object: LevelObject): void {
    const w = object.w ?? 42;
    const h = object.h ?? 48;
    ctx.save();
    ctx.shadowColor = "#ff335f";
    ctx.shadowBlur = 12 + this.beatPulse * 8;
    ctx.fillStyle = "#0b0610";
    ctx.strokeStyle = "#ff335f";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(object.x, object.y + h);
    ctx.lineTo(object.x + w * 0.5, object.y);
    ctx.lineTo(object.x + w, object.y + h);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  private drawSaw(ctx: CanvasRenderingContext2D, object: LevelObject, level: LevelData): void {
    const r = object.r ?? 30;
    ctx.save();
    ctx.translate(object.x, object.y);
    ctx.rotate(performance.now() / 260);
    ctx.shadowColor = level.colorPalette.danger;
    ctx.shadowBlur = 14;
    ctx.strokeStyle = level.colorPalette.danger;
    ctx.fillStyle = "rgba(5,5,11,0.9)";
    ctx.lineWidth = 4;
    for (let i = 0; i < 12; i += 1) {
      ctx.rotate((Math.PI * 2) / 12);
      ctx.beginPath();
      ctx.moveTo(r * 0.8, 0);
      ctx.lineTo(r * 1.22, 9);
      ctx.lineTo(r * 1.05, -9);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.82, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = level.colorPalette.secondary;
    ctx.beginPath();
    ctx.moveTo(-r * 0.42, 0);
    ctx.lineTo(r * 0.42, 0);
    ctx.moveTo(0, -r * 0.42);
    ctx.lineTo(0, r * 0.42);
    ctx.stroke();
    ctx.restore();
  }

  private drawFlame(ctx: CanvasRenderingContext2D, object: LevelObject): void {
    const w = object.w ?? 52;
    const h = object.h ?? 64;
    const pulse = 1 + this.beatPulse * 0.22;
    ctx.save();
    ctx.translate(object.x + w / 2, object.y + h);
    ctx.scale(pulse, pulse);
    ctx.shadowColor = "#ff335f";
    ctx.shadowBlur = 18;
    ctx.fillStyle = "#ff335f";
    ctx.beginPath();
    ctx.moveTo(-w * 0.42, 0);
    ctx.bezierCurveTo(-w * 0.5, -h * 0.4, -w * 0.12, -h * 0.52, 0, -h);
    ctx.bezierCurveTo(w * 0.18, -h * 0.55, w * 0.54, -h * 0.42, w * 0.4, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#f8c85a";
    ctx.globalAlpha = 0.82;
    ctx.beginPath();
    ctx.moveTo(-w * 0.14, 0);
    ctx.bezierCurveTo(-w * 0.2, -h * 0.22, 0, -h * 0.34, w * 0.08, -h * 0.58);
    ctx.bezierCurveTo(w * 0.2, -h * 0.24, w * 0.2, -h * 0.18, w * 0.12, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private drawPad(ctx: CanvasRenderingContext2D, object: LevelObject): void {
    ctx.save();
    ctx.shadowColor = object.color ?? "#2ce7ff";
    ctx.shadowBlur = 16;
    ctx.strokeStyle = object.color ?? "#2ce7ff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(object.x + 28, object.y + 10, 32, 12 + this.beatPulse * 4, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "rgba(44,231,255,0.16)";
    ctx.fillRect(object.x, object.y + 8, object.w ?? 58, object.h ?? 18);
    ctx.restore();
  }

  private drawOrb(ctx: CanvasRenderingContext2D, object: LevelObject): void {
    const r = object.r ?? 24;
    const pulse = 1 + this.beatPulse * 0.16;
    ctx.save();
    ctx.translate(object.x, object.y);
    ctx.scale(pulse, pulse);
    ctx.shadowColor = object.color ?? "#a855f7";
    ctx.shadowBlur = 18;
    ctx.strokeStyle = object.color ?? "#a855f7";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.rotate(performance.now() / 700);
    ctx.beginPath();
    ctx.moveTo(-r * 0.62, 0);
    ctx.lineTo(0, -r * 0.62);
    ctx.lineTo(r * 0.62, 0);
    ctx.lineTo(0, r * 0.62);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  private drawSeal(ctx: CanvasRenderingContext2D, object: LevelObject): void {
    const r = object.r ?? 18;
    ctx.save();
    ctx.translate(object.x, object.y + Math.sin(performance.now() / 260 + object.x) * 4);
    ctx.rotate(performance.now() / 900);
    ctx.shadowColor = "#f8c85a";
    ctx.shadowBlur = 16;
    ctx.fillStyle = "#f8c85a";
    ctx.beginPath();
    for (let i = 0; i < 6; i += 1) {
      const angle = (Math.PI * 2 * i) / 6;
      const px = Math.cos(angle) * r;
      const py = Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#281408";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-r * 0.45, 0);
    ctx.lineTo(r * 0.45, 0);
    ctx.moveTo(0, -r * 0.45);
    ctx.lineTo(0, r * 0.45);
    ctx.stroke();
    ctx.restore();
  }

  private drawPortal(ctx: CanvasRenderingContext2D, object: LevelObject, level: LevelData): void {
    const w = object.w ?? 68;
    const h = object.h ?? 140;
    const pulse = this.beatPulse * 8;
    ctx.save();
    ctx.translate(object.x + w / 2, object.y + h / 2);
    ctx.shadowColor = level.colorPalette.primary;
    ctx.shadowBlur = 20;
    ctx.strokeStyle = level.colorPalette.primary;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.ellipse(0, 0, w / 2 + pulse, h / 2, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = level.colorPalette.secondary;
    ctx.lineWidth = 2;
    ctx.rotate(performance.now() / 880);
    ctx.strokeRect(-w * 0.34, -w * 0.34, w * 0.68, w * 0.68);
    ctx.rotate(-performance.now() / 440);
    ctx.font = "800 12px Inter, sans-serif";
    ctx.fillStyle = "#f8fbff";
    ctx.textAlign = "center";
    ctx.fillText((object.targetForm ?? "runner").slice(0, 3).toUpperCase(), 0, 4);
    ctx.restore();
  }

  private drawGate(ctx: CanvasRenderingContext2D, object: LevelObject): void {
    const w = object.w ?? 110;
    const h = object.h ?? 160;
    ctx.save();
    ctx.shadowColor = "#ff335f";
    ctx.shadowBlur = 18 + this.beatPulse * 18;
    ctx.strokeStyle = "#ff335f";
    ctx.lineWidth = 8;
    ctx.strokeRect(object.x, object.y, w, h);
    ctx.strokeStyle = "#f8c85a";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(object.x - 20, object.y + 28);
    ctx.lineTo(object.x + w + 20, object.y + 28);
    ctx.stroke();
    this.drawDomainRing(ctx, object.x + w / 2, object.y + h / 2, 52 + this.beatPulse * 18, performance.now() / 1000, 0.42);
    ctx.restore();
  }

  private drawLaser(ctx: CanvasRenderingContext2D, object: LevelObject): void {
    const active = this.isLaserActive(object);
    ctx.save();
    ctx.globalAlpha = active ? 0.78 + this.beatPulse * 0.18 : 0.18;
    ctx.shadowColor = "#ff335f";
    ctx.shadowBlur = active ? 22 : 5;
    ctx.fillStyle = active ? "#ff335f" : "rgba(255,51,95,0.38)";
    ctx.fillRect(object.x, object.y, object.w ?? 240, object.h ?? 30);
    ctx.fillStyle = "#f8fbff";
    ctx.globalAlpha = active ? 0.58 : 0.12;
    ctx.fillRect(object.x, object.y + (object.h ?? 30) / 2 - 2, object.w ?? 240, 4);
    ctx.restore();
  }

  private drawBoss(ctx: CanvasRenderingContext2D, object: LevelObject, level: LevelData): void {
    const t = performance.now() / 1000;
    const w = object.w ?? 300;
    const h = object.h ?? 260;
    ctx.save();
    ctx.translate(object.x + w / 2, object.y + h / 2 + Math.sin(t * 2) * 8);
    ctx.globalAlpha = 0.42 + this.beatPulse * 0.14;
    ctx.shadowColor = level.colorPalette.danger;
    ctx.shadowBlur = 28;
    ctx.fillStyle = "#06040a";
    ctx.beginPath();
    ctx.moveTo(0, -h * 0.48);
    ctx.bezierCurveTo(w * 0.5, -h * 0.3, w * 0.34, h * 0.34, 0, h * 0.44);
    ctx.bezierCurveTo(-w * 0.34, h * 0.34, -w * 0.5, -h * 0.3, 0, -h * 0.48);
    ctx.fill();
    ctx.strokeStyle = level.colorPalette.danger;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-52, -22);
    ctx.lineTo(-18, -16);
    ctx.moveTo(52, -22);
    ctx.lineTo(18, -16);
    ctx.stroke();
    ctx.restore();
  }

  private drawCheckpoint(ctx: CanvasRenderingContext2D, object: LevelObject): void {
    ctx.save();
    ctx.globalAlpha = this.trainingMode ? 0.9 : 0.32;
    ctx.strokeStyle = "#42ffb5";
    ctx.shadowColor = "#42ffb5";
    ctx.shadowBlur = 12;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(object.x, object.y + 60);
    ctx.lineTo(object.x, object.y);
    ctx.lineTo(object.x + 38, object.y + 12);
    ctx.lineTo(object.x, object.y + 24);
    ctx.stroke();
    ctx.restore();
  }

  private drawDecoration(ctx: CanvasRenderingContext2D, object: LevelObject, level: LevelData): void {
    const variant = object.variant ?? "glyph";
    ctx.save();
    if (variant === "moon") this.drawMoon(ctx, object.x, object.y, 74, 0.35);
    else if (variant.includes("gate") || variant === "broken-torii") {
      ctx.strokeStyle = "rgba(255,51,95,0.36)";
      ctx.lineWidth = 8;
      ctx.strokeRect(object.x, object.y, object.w ?? 120, object.h ?? 120);
      ctx.beginPath();
      ctx.moveTo(object.x - 16, object.y + 20);
      ctx.lineTo(object.x + (object.w ?? 120) + 16, object.y + 20);
      ctx.stroke();
    } else if (variant === "screen-crack") {
      ctx.strokeStyle = "rgba(248,251,255,0.23)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(object.x, object.y);
      ctx.lineTo(object.x + 44, object.y + 48);
      ctx.lineTo(object.x + 26, object.y + 120);
      ctx.moveTo(object.x + 44, object.y + 48);
      ctx.lineTo(object.x + 100, object.y + 34);
      ctx.stroke();
    } else if (variant === "domain-ring") {
      this.drawDomainRing(ctx, object.x, object.y, object.w ?? 260, performance.now() / 1000, 0.2);
    } else if (variant.includes("shadow")) {
      ctx.fillStyle = "rgba(0,0,0,0.42)";
      ctx.beginPath();
      ctx.ellipse(object.x, object.y + 50, 60, 82, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = level.colorPalette.danger;
      ctx.fillRect(object.x - 24, object.y + 24, 16, 4);
      ctx.fillRect(object.x + 10, object.y + 24, 16, 4);
    } else {
      ctx.globalAlpha = 0.24 + this.beatPulse * 0.16;
      ctx.strokeStyle = variant.includes("n07") ? level.colorPalette.secondary : level.colorPalette.primary;
      ctx.lineWidth = 3;
      ctx.strokeRect(object.x, object.y, object.w ?? 90, object.h ?? 90);
      ctx.font = "900 24px Inter, sans-serif";
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fillText(variant.includes("n07") ? "N-07" : "VX", object.x + 18, object.y + 52);
    }
    ctx.restore();
  }

  private drawPlayer(ctx: CanvasRenderingContext2D): void {
    const save = this.save.snapshot;
    const skin = SKINS.find((entry) => entry.id === save.selectedSkin) ?? SKINS[0];
    const cx = this.player.x + this.player.w / 2;
    const cy = this.player.y + this.player.h / 2;
    const primary = save.primaryColor || skin.primary;
    const secondary = save.secondaryColor || skin.secondary;
    const glow = save.glowIntensity;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(this.player.rotation);
    ctx.shadowColor = primary;
    ctx.shadowBlur = 20 * glow;
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = primary;
    ctx.beginPath();
    ctx.ellipse(0, 0, 42 + this.beatPulse * 6, 32 + this.beatPulse * 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    if (this.player.form === "glider") this.drawGliderPlayer(ctx, primary, secondary);
    else if (this.player.form === "gravity") this.drawSealPlayer(ctx, primary, secondary);
    else if (this.player.form === "phantom") this.drawPhantomPlayer(ctx, primary, secondary);
    else if (this.player.form === "wave") this.drawWavePlayer(ctx, primary, secondary);
    else if (this.player.form === "blink") this.drawBlinkPlayer(ctx, primary, secondary);
    else if (this.player.form === "swing") this.drawSwingPlayer(ctx, primary, secondary);
    else this.drawMaskPlayer(ctx, primary, secondary, skin);

    if (this.player.form === "power" && this.player.charge > 0) {
      ctx.strokeStyle = "#f8c85a";
      ctx.lineWidth = 4;
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.arc(0, 0, 30 + this.player.charge * 18, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawMaskPlayer(ctx: CanvasRenderingContext2D, primary: string, secondary: string, skin: SkinDefinition): void {
    ctx.fillStyle = "#f8fbff";
    ctx.strokeStyle = primary;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, -28);
    ctx.lineTo(26, -8);
    ctx.lineTo(18, 24);
    ctx.lineTo(0, 30);
    ctx.lineTo(-18, 24);
    ctx.lineTo(-26, -8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = secondary;
    ctx.fillRect(-17, -8, 12, 5);
    ctx.fillRect(5, -8, 12, 5);
    ctx.strokeStyle = "#111";
    ctx.beginPath();
    ctx.moveTo(-7, 8);
    ctx.lineTo(0, 15);
    ctx.lineTo(7, 8);
    ctx.stroke();
    if (skin.id.includes("red") || skin.id.includes("special")) {
      ctx.strokeStyle = "#ff335f";
      ctx.beginPath();
      ctx.moveTo(-24, 5);
      ctx.lineTo(24, -16);
      ctx.stroke();
    }
  }

  private drawGliderPlayer(ctx: CanvasRenderingContext2D, primary: string, secondary: string): void {
    ctx.fillStyle = primary;
    ctx.strokeStyle = secondary;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-34, 10);
    ctx.lineTo(0, -24);
    ctx.lineTo(34, 10);
    ctx.lineTo(8, 20);
    ctx.lineTo(0, 6);
    ctx.lineTo(-8, 20);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  private drawSealPlayer(ctx: CanvasRenderingContext2D, primary: string, secondary: string): void {
    ctx.strokeStyle = primary;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, 28, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = secondary;
    ctx.beginPath();
    ctx.moveTo(-20, 0);
    ctx.lineTo(20, 0);
    ctx.moveTo(0, -20);
    ctx.lineTo(0, 20);
    ctx.stroke();
  }

  private drawPhantomPlayer(ctx: CanvasRenderingContext2D, primary: string, secondary: string): void {
    ctx.fillStyle = "rgba(248,251,255,0.86)";
    ctx.strokeStyle = primary;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(0, 0, 26, 32, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = secondary;
    ctx.fillRect(-15, -6, 10, 5);
    ctx.fillRect(5, -6, 10, 5);
  }

  private drawWavePlayer(ctx: CanvasRenderingContext2D, primary: string, secondary: string): void {
    ctx.fillStyle = primary;
    ctx.strokeStyle = secondary;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-28, 0);
    ctx.lineTo(24, -22);
    ctx.lineTo(10, 0);
    ctx.lineTo(24, 22);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  private drawBlinkPlayer(ctx: CanvasRenderingContext2D, primary: string, secondary: string): void {
    ctx.strokeStyle = primary;
    ctx.lineWidth = 4;
    ctx.strokeRect(-24, -24, 48, 48);
    ctx.strokeStyle = secondary;
    ctx.beginPath();
    ctx.moveTo(-18, 18);
    ctx.lineTo(18, -18);
    ctx.moveTo(-18, -18);
    ctx.lineTo(18, 18);
    ctx.stroke();
  }

  private drawSwingPlayer(ctx: CanvasRenderingContext2D, primary: string, secondary: string): void {
    ctx.strokeStyle = secondary;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(0, 0, 28, Math.PI * 0.18, Math.PI * 1.82);
    ctx.stroke();
    ctx.fillStyle = primary;
    ctx.beginPath();
    ctx.arc(0, 0, 17, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawParticles(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.translate(-this.cameraX, 0);
    for (const particle of this.particles) {
      const alpha = clamp(particle.life / particle.maxLife, 0, 1);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = particle.color;
      ctx.strokeStyle = particle.color;
      ctx.shadowColor = particle.color;
      ctx.shadowBlur = particle.kind === "smoke" ? 10 : 14;
      if (particle.kind === "slash") {
        ctx.lineWidth = particle.size;
        ctx.beginPath();
        ctx.moveTo(particle.x, particle.y);
        ctx.lineTo(particle.x - particle.vx * 0.08, particle.y - particle.vy * 0.08);
        ctx.stroke();
      } else if (particle.kind === "sigil") {
        ctx.font = `900 ${particle.size * 4}px Inter, sans-serif`;
        ctx.fillText(particle.text ?? "VX", particle.x, particle.y);
      } else {
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size * (particle.kind === "smoke" ? 1.8 - alpha : 1), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  private drawEffectsOverlay(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    if (this.flash > 0) {
      ctx.globalAlpha = this.flash * 0.34;
      ctx.fillStyle = "#f8fbff";
      ctx.fillRect(0, 0, VW, VH);
    }
    if (this.surge > 0) {
      ctx.globalAlpha = this.surge * 0.26;
      ctx.strokeStyle = "#a855f7";
      ctx.lineWidth = 3;
      for (let i = 0; i < 5; i += 1) {
        const inset = 24 + i * 28 + this.surge * 20;
        ctx.strokeRect(inset, inset * 0.72, VW - inset * 2, VH - inset * 1.44);
      }
    }
    ctx.restore();
  }

  private drawVignette(ctx: CanvasRenderingContext2D, level: LevelData): void {
    const gradient = ctx.createRadialGradient(VW / 2, VH / 2, 120, VW / 2, VH / 2, 720);
    gradient.addColorStop(0, "rgba(0,0,0,0)");
    gradient.addColorStop(1, level.backgroundTheme === "domain" ? "rgba(255,51,95,0.18)" : "rgba(0,0,0,0.48)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, VW, VH);
  }

  private drawMoon(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, alpha: number): void {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.shadowColor = "#dbeafe";
    ctx.shadowBlur = 24;
    ctx.fillStyle = "#dbeafe";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(x + r * 0.32, y - r * 0.14, r * 0.85, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawRooftops(ctx: CanvasRenderingContext2D, t: number, cameraX: number): void {
    ctx.save();
    for (let layer = 0; layer < 3; layer += 1) {
      const y = 500 - layer * 48;
      const speed = 0.05 + layer * 0.035;
      ctx.fillStyle = `rgba(${12 + layer * 10},${14 + layer * 12},${28 + layer * 18},${0.78 - layer * 0.12})`;
      for (let i = -2; i < 13; i += 1) {
        const x = ((i * 180 - cameraX * speed + Math.sin(t + i) * 4) % 1800) - 160;
        const h = 80 + ((i + layer) % 4) * 34;
        ctx.fillRect(x, y - h, 150, h);
        ctx.fillStyle = layer === 2 ? "rgba(44,231,255,0.12)" : ctx.fillStyle;
        if (layer === 2 && i % 2 === 0) ctx.fillRect(x + 24, y - h + 22, 38, 8);
      }
    }
    ctx.restore();
  }

  private drawSpeedLines(ctx: CanvasRenderingContext2D, color: string, alpha: number): void {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    for (let i = 0; i < 18; i += 1) {
      const y = 90 + ((i * 41 + performance.now() / 16) % 430);
      const x = (i * 137 + this.cameraX * 0.9) % 1400;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 90 + (i % 4) * 40, y - 14);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawDomainRing(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rotation: number, alpha: number): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = "#a855f7";
    ctx.lineWidth = 3;
    for (let i = 0; i < 4; i += 1) {
      ctx.beginPath();
      ctx.arc(0, 0, r * (0.35 + i * 0.18), (i * Math.PI) / 7, Math.PI * 1.65 + i);
      ctx.stroke();
    }
    ctx.strokeStyle = "#2ce7ff";
    for (let i = 0; i < 10; i += 1) {
      ctx.rotate((Math.PI * 2) / 10);
      ctx.strokeRect(r * 0.34, -8, 34, 16);
    }
    ctx.restore();
  }

  private spawnAmbientPlayerEffects(dt: number): void {
    const save = this.save.snapshot;
    this.trailTimer -= dt;
    if (this.trailTimer > 0 || !this.player.alive) return;
    this.trailTimer = 0.018;
    const cx = this.player.x + this.player.w / 2 - 24;
    const cy = this.player.y + this.player.h / 2;
    const color = save.trailType === "embers" ? "#ff335f" : save.secondaryColor;
    const kind: ParticleKind = save.trailType === "slash" ? "slash" : save.trailType === "sigils" ? "sigil" : "ribbon";
    this.spawnParticle(cx, cy, -180 - Math.random() * 80, (Math.random() - 0.5) * 45, 0.38, save.trailType === "sigils" ? 4 : 5, color, kind);
  }

  private updateParticles(dt: number): void {
    for (const particle of this.particles) {
      particle.life -= dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += particle.kind === "smoke" ? -18 * dt : 90 * dt;
    }
    this.particles = this.particles.filter((particle) => particle.life > 0).slice(-260);
  }

  private spawnParticle(x: number, y: number, vx: number, vy: number, life: number, size: number, color: string, kind: ParticleKind): void {
    this.particles.push({
      x,
      y,
      vx,
      vy,
      life,
      maxLife: life,
      size,
      color,
      kind,
      text: Math.random() > 0.5 ? "VX" : "N7",
    });
  }

  private spawnSlash(x: number, y: number, color: string): void {
    for (let i = 0; i < 12; i += 1) {
      this.spawnParticle(x, y, -120 - Math.random() * 180, -180 + Math.random() * 260, 0.28, 3 + Math.random() * 4, color, "slash");
    }
  }

  private spawnSmoke(x: number, y: number, color: string): void {
    for (let i = 0; i < 18; i += 1) {
      this.spawnParticle(x + (Math.random() - 0.5) * 24, y, -60 + Math.random() * 120, -80 - Math.random() * 70, 0.45, 5 + Math.random() * 5, color, "smoke");
    }
  }

  private spawnSealBurst(x: number, y: number): void {
    for (let i = 0; i < 24; i += 1) {
      const angle = (Math.PI * 2 * i) / 24;
      this.spawnParticle(x, y, Math.cos(angle) * (140 + Math.random() * 160), Math.sin(angle) * (140 + Math.random() * 160), 0.52, 4, i % 2 ? "#f8c85a" : "#2ce7ff", "spark");
    }
  }

  private spawnAfterImage(x: number, y: number): void {
    for (let i = 0; i < 20; i += 1) {
      this.spawnParticle(x + 20, y + 20, -240 + Math.random() * 80, -120 + Math.random() * 240, 0.22, 5, "#a855f7", "sigil");
    }
  }

  private spawnDeath(): void {
    const save = this.save.snapshot;
    const skin = SKINS.find((entry) => entry.id === save.selectedSkin) ?? SKINS[0];
    const mode = save.deathEffect || skin.death;
    const x = this.player.x + this.player.w / 2;
    const y = this.player.y + this.player.h / 2;
    for (let i = 0; i < 42; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 100 + Math.random() * 360;
      const kind: ParticleKind = mode === "smoke" ? "smoke" : mode === "flare" ? "spark" : "shard";
      this.spawnParticle(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, 0.72, 3 + Math.random() * 6, i % 2 ? save.primaryColor : "#ff335f", kind);
    }
  }

  private hitbox(): Rect {
    return {
      x: this.player.x + 9,
      y: this.player.y + 9,
      w: this.player.w - 18,
      h: this.player.h - 18,
    };
  }

  private objectRect(object: LevelObject): Rect {
    if (object.r) return { x: object.x - object.r, y: object.y - object.r, w: object.r * 2, h: object.r * 2 };
    return {
      x: object.x,
      y: object.y,
      w: object.w ?? 40,
      h: object.h ?? 40,
    };
  }

  private intersectsObject(rect: Rect, object: LevelObject): boolean {
    if (object.type === "saw" || object.type === "orb" || object.type === "seal") {
      const r = object.r ?? 24;
      const cx = clamp(object.x, rect.x, rect.x + rect.w);
      const cy = clamp(object.y, rect.y, rect.y + rect.h);
      return distance(cx, cy, object.x, object.y) < r + 2;
    }
    if (object.type === "spike") {
      const spikeRect = this.objectRect(object);
      return rectsOverlap(rect, {
        x: spikeRect.x + spikeRect.w * 0.18,
        y: spikeRect.y + spikeRect.h * 0.22,
        w: spikeRect.w * 0.64,
        h: spikeRect.h * 0.74,
      });
    }
    return rectsOverlap(rect, this.objectRect(object));
  }

  private distanceToObject(object: LevelObject): number {
    const cx = this.player.x + this.player.w / 2;
    const cy = this.player.y + this.player.h / 2;
    const ox = object.r ? object.x : object.x + (object.w ?? 40) / 2;
    const oy = object.r ? object.y : object.y + (object.h ?? 40) / 2;
    return distance(cx, cy, ox, oy);
  }

  private isLaserActive(object: LevelObject): boolean {
    const beat = object.beat ?? 0;
    const cycle = mod(this.currentBeat - beat, 32);
    return cycle < 12;
  }

  private pointerToWorld(event: PointerEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const cssX = event.clientX - rect.left;
    const cssY = event.clientY - rect.top;
    return {
      x: clamp((cssX - this.offsetX) / this.scale, 0, VW),
      y: clamp((cssY - this.offsetY) / this.scale, 0, VH),
    };
  }

  private emitHud(attempt?: number): void {
    if (!this.currentLevel) return;
    const snapshot = this.save.snapshot;
    const progress = clamp(this.player.x / this.currentLevel.length, 0, 1);
    this.onHudUpdate?.({
      levelName: `${this.currentLevel.name}${this.trainingMode ? " Training" : ""}`,
      missionRank: this.currentLevel.missionRank,
      progress,
      seals: snapshot.collectedSeals[this.currentLevel.id]?.length ?? 0,
      totalSeals: this.currentLevel.coins.length,
      attempt: attempt ?? snapshot.attempts[this.currentLevel.id] ?? 1,
      trainingMode: this.trainingMode,
    });
  }

  private emitState(): void {
    this.onStateChange?.(this.state, this.currentLevel ?? undefined);
  }

  private showOverlay(state: OverlayState): void {
    this.onOverlayChange?.(state);
  }

  private hideOverlay(): void {
    this.onOverlayChange?.({
      visible: false,
      kicker: "",
      title: "",
      body: "",
      mode: "pause",
    });
  }
}

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
const distance = (ax: number, ay: number, bx: number, by: number): number => Math.hypot(ax - bx, ay - by);
const mod = (value: number, divisor: number): number => ((value % divisor) + divisor) % divisor;

const rectsOverlap = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.w &&
  a.x + a.w > b.x &&
  a.y < b.y + b.h &&
  a.y + a.h > b.y;
