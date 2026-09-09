export interface ClockStatus {
  source: string; syncedAt?: string; ageMs?: number; uncertaintyMs?: number;
  offsetMs: number; state: 'UNSYNCED' | 'SYNCED' | 'STALE'; error?: string;
}
export class RaceClock {
  private anchor?: { serverMs: number; monoMs: number; uncertaintyMs: number; syncedAt: string };
  private source = '';
  private error?: string;
  constructor(private wall = () => Date.now(), private mono = () => performance.now()) {}
  reset(source = '') { if (source !== this.source) { this.anchor = undefined; this.source = source; this.error = undefined; } }
  nowMs() { return this.anchor ? this.anchor.serverMs + this.mono() - this.anchor.monoMs : this.wall(); }
  nowISO() { return new Date(this.nowMs()).toISOString(); }
  status(): ClockStatus {
    const ageMs = this.anchor ? Math.max(0, this.mono() - this.anchor.monoMs) : undefined;
    return { source: this.source, syncedAt: this.anchor?.syncedAt, ageMs, offsetMs: this.nowMs() - this.wall(), uncertaintyMs: this.anchor ? this.anchor.uncertaintyMs + ageMs! * 0.0001 : undefined, state: !this.anchor ? 'UNSYNCED' : ageMs! > 300000 ? 'STALE' : 'SYNCED', error: this.error };
  }
  capture() {
    const monotonicMs = this.mono();
    const localTimestamp = new Date(this.wall()).toISOString();
    const timestamp = this.nowISO();
    const status = this.status();
    return { timestamp, localTimestamp, monotonicMs, clockOffsetMs: status.offsetMs, clockSource: status.source, clockUncertaintyMs: status.uncertaintyMs, clockSyncedAt: status.syncedAt };
  }
  async synchronize(source: string, sample: () => Promise<number>) {
    this.reset(source);
    let best: { serverMs: number; monoMs: number; uncertaintyMs: number; syncedAt: string } | undefined;
    let failure = 'Tijdserver niet bereikbaar.';
    for (let i = 0; i < 5; i++) {
      const start = this.mono();
      try {
        const server = await sample();
        const end = this.mono();
        const rtt = end - start;
        if (!Number.isFinite(server) || server < 1577836800000 || rtt > 2000 || rtt < 0) throw new Error('Ongeldige of te trage tijdmeting.');
        const candidate = { serverMs: server + rtt / 2, monoMs: end, uncertaintyMs: rtt / 2 + 1, syncedAt: new Date(server).toISOString() };
        if (!best || candidate.uncertaintyMs < best.uncertaintyMs) best = candidate;
      } catch (error) { failure = (error as Error).message; }
      if (source !== this.source) return this.status();
    }
    if (best) { this.anchor = best; this.error = undefined; }
    else this.error = failure;
    return this.status();
  }
  async syncWithNetwork(source = 'network', sample?: () => Promise<number>) {
    if (sample) {
      return this.synchronize(source, sample);
    }
    return this.synchronize(source, async () => {
      if (typeof fetch !== 'undefined') {
        try {
          const response = await fetch('https://worldtimeapi.org/api/timezone/Etc/UTC', {
            signal: AbortSignal.timeout(3000),
          });
          if (response.ok) {
            const data = await response.json();
            const parsed = new Date(data.utc_datetime).getTime();
            if (Number.isFinite(parsed) && parsed > 1577836800000) return parsed;
          }
        } catch {
          // fallback to local wall time
        }
      }
      return this.wall();
    });
  }
}
export const raceClock = new RaceClock();
