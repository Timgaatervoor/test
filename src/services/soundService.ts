class SoundService {
  private audioCtx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private isEnabled = true;
  private volume = 0.8; // 0.0 to 1.0

  constructor() {
    if (typeof window !== 'undefined') {
      const savedEnabled = localStorage.getItem('biathlon_sound_enabled');
      if (savedEnabled !== null) {
        this.isEnabled = savedEnabled === 'true';
      }
      const savedVolume = localStorage.getItem('biathlon_sound_volume');
      if (savedVolume !== null) {
        const v = parseFloat(savedVolume);
        if (!isNaN(v) && v >= 0 && v <= 1) {
          this.volume = v;
        }
      }
    }
  }

  public toggleSound(enabled?: boolean): boolean {
    this.isEnabled = enabled !== undefined ? enabled : !this.isEnabled;
    if (typeof window !== 'undefined') {
      localStorage.setItem('biathlon_sound_enabled', String(this.isEnabled));
    }
    return this.isEnabled;
  }

  public getSoundEnabled(): boolean {
    return this.isEnabled;
  }

  public isMuted(): boolean {
    return !this.isEnabled;
  }

  public setMuted(muted: boolean): void {
    this.toggleSound(!muted);
  }

  public async resume(): Promise<void> {
    if (typeof window === 'undefined') return;
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioContextClass) {
        this.audioCtx = new AudioContextClass();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      try {
        await this.audioCtx.resume();
      } catch {
        // ignore
      }
    }
  }

  public setVolume(volume: number): void {
    const clamped = Math.max(0, Math.min(1, volume));
    this.volume = clamped;
    if (typeof window !== 'undefined') {
      localStorage.setItem('biathlon_sound_volume', String(clamped));
    }
    if (this.masterGain && this.audioCtx) {
      this.masterGain.gain.setValueAtTime(this.volume, this.audioCtx.currentTime);
    }
  }

  public getVolume(): number {
    return this.volume;
  }

  public isAudioSupported(): boolean {
    if (typeof window === 'undefined') return false;
    return !!(window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
  }

  public getAudioState(): string {
    if (!this.isAudioSupported()) return 'niet ondersteund';
    return this.audioCtx ? this.audioCtx.state : 'gereed';
  }

  private getContext(): { ctx: AudioContext; destination: AudioNode } | null {
    if (!this.isEnabled || this.volume <= 0) return null;
    if (typeof window === 'undefined') return null;

    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioContextClass) {
        this.audioCtx = new AudioContextClass();
      }
    }
    if (!this.audioCtx) return null;

    if (!this.masterGain) {
      this.masterGain = this.audioCtx.createGain();
      this.masterGain.gain.setValueAtTime(this.volume, this.audioCtx.currentTime);
      this.masterGain.connect(this.audioCtx.destination);
    } else {
      this.masterGain.gain.setValueAtTime(this.volume, this.audioCtx.currentTime);
    }

    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
    return { ctx: this.audioCtx, destination: this.masterGain };
  }

  /**
   * Subtiele tactiele feedbackklik bij invoer op het numpad (15ms impulse)
   */
  public playKeyClick(): void {
    const conn = this.getContext();
    if (!conn) return;
    try {
      const { ctx, destination } = conn;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1400, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.02);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.02);
      osc.connect(gain);
      gain.connect(destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.022);
    } catch {
      // ignore
    }
  }

  /**
   * Start countdown pips (3-2-1)
   */
  public playCountdownPip(): void {
    const conn = this.getContext();
    if (!conn) return;
    try {
      const { ctx, destination } = conn;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
      osc.connect(gain);
      gain.connect(destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.11);
    } catch {
      // ignore
    }
  }

  /**
   * Heldere GO-fanfare bij 0
   */
  public playGoFanfare(): void {
    const conn = this.getContext();
    if (!conn) return;
    try {
      const { ctx, destination } = conn;
      const now = ctx.currentTime;
      // Arpeggio fanfare: C5 (523), E5 (659), G5 (784), C6 (1046)
      const notes = [
        { freq: 523.25, time: 0, dur: 0.1 },
        { freq: 659.25, time: 0.1, dur: 0.1 },
        { freq: 783.99, time: 0.2, dur: 0.12 },
        { freq: 1046.5, time: 0.32, dur: 0.4 },
      ];
      notes.forEach(({ freq, time, dur }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + time);
        gain.gain.setValueAtTime(0.25, now + time);
        gain.gain.exponentialRampToValueAtTime(0.001, now + time + dur);
        osc.connect(gain);
        gain.connect(destination);
        osc.start(now + time);
        osc.stop(now + time + dur + 0.02);
      });
    } catch {
      // ignore
    }
  }

  /**
   * 4-tonig feestelijk finish-akkoord (C5, E5, G5, C6) bij doorkomst op de finish
   */
  public playFinishChord(): void {
    const conn = this.getContext();
    if (!conn) return;
    try {
      const { ctx, destination } = conn;
      const now = ctx.currentTime;
      const chord = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
      chord.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = idx === 3 ? 'sine' : 'triangle';
        osc.frequency.setValueAtTime(freq, now);
        // Slight shimmer
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
        osc.connect(gain);
        gain.connect(destination);
        osc.start(now);
        osc.stop(now + 0.92);
      });
    } catch {
      // ignore
    }
  }

  /**
   * Schietstand: heldere metalen ping voor Raak
   */
  public playHit(): void {
    const conn = this.getContext();
    if (!conn) return;
    try {
      const { ctx, destination } = conn;
      const now = ctx.currentTime;
      // Dual high frequencies with fast metal decay
      [2400, 3680].forEach((freq) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.connect(gain);
        gain.connect(destination);
        osc.start(now);
        osc.stop(now + 0.26);
      });
    } catch {
      // ignore
    }
  }

  /**
   * Schietstand: doffe lage toon voor Mis
   */
  public playMiss(): void {
    const conn = this.getContext();
    if (!conn) return;
    try {
      const { ctx, destination } = conn;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.linearRampToValueAtTime(70, now + 0.2);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc.connect(gain);
      gain.connect(destination);
      osc.start(now);
      osc.stop(now + 0.23);
    } catch {
      // ignore
    }
  }

  /**
   * Succes-melodie voor voltooide acties
   */
  public playSuccess(): void {
    const conn = this.getContext();
    if (!conn) return;
    try {
      const { ctx, destination } = conn;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
      osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.12); // A6
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.18);
      osc.connect(gain);
      gain.connect(destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.19);
    } catch {
      // ignore
    }
  }

  /**
   * Waarschuwingstoon bij conflicten of waarschuwingen
   */
  public playWarning(): void {
    const conn = this.getContext();
    if (!conn) return;
    try {
      const { ctx, destination } = conn;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.setValueAtTime(330, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.28);
      osc.connect(gain);
      gain.connect(destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } catch {
      // ignore
    }
  }

  /**
   * Lage buzz bij straffen of fouten
   */
  public playError(): void {
    const conn = this.getContext();
    if (!conn) return;
    try {
      const { ctx, destination } = conn;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(180, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(110, ctx.currentTime + 0.25);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.connect(gain);
      gain.connect(destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.32);
    } catch {
      // ignore
    }
  }

  public playPenaltyBuzz(): void {
    this.playError();
  }
}

export const soundService = new SoundService();
