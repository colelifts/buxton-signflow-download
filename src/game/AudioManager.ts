import type { LevelData, SaveData } from "./types";

type BeatListener = (beat: number, downbeat: boolean) => void;
type SfxName = "jump" | "orb" | "portal" | "seal" | "death" | "complete" | "click" | "checkpoint";

export class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private music: GainNode | null = null;
  private sfx: GainNode | null = null;
  private timer: number | null = null;
  private beat = 0;
  private bpm = 132;
  private mode = "menu";
  private listeners = new Set<BeatListener>();
  private musicVolume = 0.58;
  private sfxVolume = 0.72;
  private muted = false;

  constructor(save: SaveData) {
    this.musicVolume = save.musicVolume;
    this.sfxVolume = save.sfxVolume;
    this.muted = save.muted;
  }

  onBeat(listener: BeatListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async resume(): Promise<void> {
    this.ensureContext();
    if (this.ctx?.state === "suspended") {
      await this.ctx.resume();
    }
  }

  setVolumes(musicVolume: number, sfxVolume: number, muted: boolean): void {
    this.musicVolume = musicVolume;
    this.sfxVolume = sfxVolume;
    this.muted = muted;
    this.applyVolumes();
  }

  playMenu(): void {
    this.startLoop(92, "menu");
  }

  playLevel(level: LevelData): void {
    this.startLoop(level.bpm, level.music);
  }

  stopMusic(): void {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
  }

  playSfx(name: SfxName): void {
    const ctx = this.ensureContext();
    if (!this.sfx || this.muted) return;
    const now = ctx.currentTime;

    if (name === "jump") {
      this.tone(460, 0.045, "square", 0.12, this.sfx, now);
      this.tone(780, 0.055, "sine", 0.08, this.sfx, now + 0.018);
      return;
    }

    if (name === "orb") {
      this.tone(640, 0.08, "triangle", 0.14, this.sfx, now);
      this.tone(1180, 0.1, "sine", 0.09, this.sfx, now + 0.03);
      return;
    }

    if (name === "portal") {
      this.tone(160, 0.12, "sawtooth", 0.13, this.sfx, now);
      this.tone(940, 0.16, "triangle", 0.11, this.sfx, now + 0.025);
      return;
    }

    if (name === "seal") {
      this.tone(980, 0.08, "sine", 0.11, this.sfx, now);
      this.tone(1480, 0.09, "sine", 0.09, this.sfx, now + 0.04);
      return;
    }

    if (name === "death") {
      this.tone(120, 0.24, "sawtooth", 0.2, this.sfx, now);
      this.noise(0.22, 0.24, this.sfx, now);
      return;
    }

    if (name === "complete") {
      [523, 659, 784, 1046].forEach((freq, index) => this.tone(freq, 0.16, "triangle", 0.12, this.sfx!, now + index * 0.08));
      return;
    }

    if (name === "checkpoint") {
      this.tone(420, 0.1, "triangle", 0.11, this.sfx, now);
      this.tone(840, 0.12, "sine", 0.08, this.sfx, now + 0.05);
      return;
    }

    this.tone(360, 0.04, "square", 0.08, this.sfx, now);
  }

  private startLoop(bpm: number, mode: string): void {
    this.ensureContext();
    this.stopMusic();
    this.bpm = bpm;
    this.mode = mode;
    this.beat = 0;
    const interval = Math.max(90, (60_000 / bpm) / 2);
    this.timer = window.setInterval(() => this.tick(), interval);
    this.tick();
  }

  private tick(): void {
    const downbeat = this.beat % 8 === 0;
    this.listeners.forEach((listener) => listener(this.beat, downbeat));
    this.playBeat(this.beat, downbeat);
    this.beat += 1;
  }

  private playBeat(beat: number, downbeat: boolean): void {
    const ctx = this.ensureContext();
    if (!this.music || this.muted) return;
    const now = ctx.currentTime;
    const mode = this.mode;
    const isMenu = mode === "menu";
    const isBoss = mode.includes("domain-collapse");
    const isShrine = mode.includes("broken-shrine");
    const isAlley = mode.includes("cursed-alley");

    if (beat % 4 === 0) this.kick(now, isBoss ? 62 : 74);
    if (beat % 4 === 2) this.snare(now, isShrine || isBoss ? 0.13 : 0.09);
    if (beat % 2 === 1) this.hat(now, isAlley || isBoss ? 0.07 : 0.045);

    const bassNotes = isMenu ? [55, 65, 82, 73] : isBoss ? [49, 49, 58, 65] : isShrine ? [55, 62, 73, 82] : [65, 73, 82, 98];
    if (beat % 2 === 0) {
      const note = bassNotes[Math.floor(beat / 2) % bassNotes.length];
      this.tone(note, isBoss ? 0.22 : 0.16, "sawtooth", isMenu ? 0.035 : 0.075, this.music, now);
    }

    if (downbeat) {
      const lead = isBoss ? 392 : isShrine ? 330 : isAlley ? 440 : 523;
      this.tone(lead, 0.08, "square", isMenu ? 0.035 : 0.055, this.music, now + 0.02);
      this.tone(lead * 1.5, 0.08, "triangle", isMenu ? 0.02 : 0.04, this.music, now + 0.06);
    }

    if (!isMenu && beat % 16 === 12) {
      this.riser(now, isBoss ? 1.35 : 1);
    }
  }

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.music = this.ctx.createGain();
      this.sfx = this.ctx.createGain();
      this.music.connect(this.master);
      this.sfx.connect(this.master);
      this.master.connect(this.ctx.destination);
      this.applyVolumes();
    }
    return this.ctx;
  }

  private applyVolumes(): void {
    if (!this.master || !this.music || !this.sfx) return;
    this.master.gain.value = this.muted ? 0 : 1;
    this.music.gain.value = this.musicVolume;
    this.sfx.gain.value = this.sfxVolume;
  }

  private tone(freq: number, duration: number, type: OscillatorType, volume: number, destination: AudioNode, when: number): void {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, when);
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), when + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    osc.connect(gain);
    gain.connect(destination);
    osc.start(when);
    osc.stop(when + duration + 0.02);
  }

  private kick(when: number, base: number): void {
    if (!this.ctx || !this.music) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(base * 2.1, when);
    osc.frequency.exponentialRampToValueAtTime(base, when + 0.09);
    gain.gain.setValueAtTime(0.18, when);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.18);
    osc.connect(gain);
    gain.connect(this.music);
    osc.start(when);
    osc.stop(when + 0.2);
  }

  private snare(when: number, volume: number): void {
    if (!this.music) return;
    this.noise(volume, 0.09, this.music, when);
    this.tone(190, 0.065, "triangle", volume * 0.55, this.music, when);
  }

  private hat(when: number, volume: number): void {
    if (!this.music) return;
    this.noise(volume, 0.035, this.music, when);
  }

  private riser(when: number, strength: number): void {
    if (!this.ctx || !this.music) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(220, when);
    osc.frequency.exponentialRampToValueAtTime(880 * strength, when + 0.45);
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(0.06 * strength, when + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.48);
    osc.connect(gain);
    gain.connect(this.music);
    osc.start(when);
    osc.stop(when + 0.5);
  }

  private noise(volume: number, duration: number, destination: AudioNode, when: number): void {
    if (!this.ctx) return;
    const sampleRate = this.ctx.sampleRate;
    const buffer = this.ctx.createBuffer(1, Math.floor(sampleRate * duration), sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    }
    const source = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    source.buffer = buffer;
    gain.gain.setValueAtTime(volume, when);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    source.connect(gain);
    gain.connect(destination);
    source.start(when);
  }
}
