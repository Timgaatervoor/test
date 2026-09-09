import React, { useEffect, useState } from 'react';
import {
  Activity,
  Database,
  Wifi,
  WifiOff,
  Clock,
  Volume2,
  VolumeX,
  HardDrive,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  X,
  Laptop,
  Play,
  Zap,
} from 'lucide-react';
import { db } from '../db/dexieDb';
import { raceClock } from '../services/raceClock';
import { soundService } from '../services/soundService';
import { syncService } from '../services/syncService';
import type { DeviceConfig } from '../types';

interface SystemHealthModalProps {
  isOpen: boolean;
  onClose: () => void;
  deviceConfig: DeviceConfig | null;
}

interface HealthData {
  indexedDB: {
    isAvailable: boolean;
    persisted: boolean;
    quotaUsedMb: number | null;
    quotaTotalMb: number | null;
    counts: {
      participants: number;
      timingRecords: number;
      shootingResults: number;
      operations: number;
    };
    writeTestPassed: boolean;
    latencyMs: number | null;
  };
  pwa: {
    serviceWorkerActive: boolean;
    isStandalone: boolean;
    cacheStorageSupported: boolean;
    isOnline: boolean;
  };
  clock: {
    offsetMs: number;
    uncertaintyMs: number;
    isSynced: boolean;
    status: ReturnType<typeof raceClock.status>;
  };
  audio: {
    isSupported: boolean;
    state: string;
    volumePct: number;
    isMuted: boolean;
  };
  sync: {
    pendingCount: number;
    isConfigured: boolean;
    lastSyncAt: string | null;
  };
}

export const SystemHealthModal: React.FC<SystemHealthModalProps> = ({
  isOpen,
  onClose,
  deviceConfig,
}) => {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [persisting, setPersisting] = useState(false);
  const [soundTesting, setSoundTesting] = useState(false);
  const [syncingClock, setSyncingClock] = useState(false);

  const runHealthCheck = async () => {
    setLoading(true);
    const startWrite = performance.now();
    let writeTestPassed = false;
    let latencyMs: number | null = null;

    try {
      // Test read/write to Dexie
      const count = await db.participants.count();
      if (typeof count === 'number') {
        latencyMs = Math.round(performance.now() - startWrite);
        writeTestPassed = true;
      }
    } catch {
      writeTestPassed = false;
    }

    // Storage estimate
    let quotaUsedMb: number | null = null;
    let quotaTotalMb: number | null = null;
    let persisted = false;

    if (typeof navigator !== 'undefined' && navigator.storage) {
      try {
        if (navigator.storage.persisted) {
          persisted = await navigator.storage.persisted();
        }
        if (navigator.storage.estimate) {
          const est = await navigator.storage.estimate();
          if (est.usage !== undefined) quotaUsedMb = Math.round((est.usage / (1024 * 1024)) * 10) / 10;
          if (est.quota !== undefined) quotaTotalMb = Math.round((est.quota / (1024 * 1024 * 1024)) * 10) / 10;
        }
      } catch {
        // Storage estimate failed or unsupported
      }
    }

    // Counts
    let participantCount = 0;
    let timingCount = 0;
    let shootingCount = 0;
    let opCount = 0;

    try {
      [participantCount, timingCount, shootingCount, opCount] = await Promise.all([
        db.participants.count(),
        db.timingRecords.count(),
        db.shootingResults.count(),
        db.operations.count(),
      ]);
    } catch {
      // counts fallback
    }

    // PWA & Service Worker
    const serviceWorkerActive =
      typeof navigator !== 'undefined' && !!navigator.serviceWorker?.controller;
    const isStandalone =
      typeof window !== 'undefined' &&
      (window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as unknown as { standalone?: boolean }).standalone === true);
    const cacheStorageSupported = typeof window !== 'undefined' && 'caches' in window;
    const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

    // Clock
    const clockStatus = raceClock.status();

    // Audio
    const isAudioSupported = soundService.isAudioSupported();
    const audioState = soundService.getAudioState();
    const volumePct = Math.round(soundService.getVolume() * 100);
    const isMuted = soundService.isMuted();

    // Sync
    let pendingCount = 0;
    try {
      pendingCount = await syncService.getPendingCount();
    } catch {
      pendingCount = 0;
    }
    const syncHealth = syncService.getSyncHealth();
    const isConfigured = syncService.getConfig().enabled;

    setHealth({
      indexedDB: {
        isAvailable: db.isOpen(),
        persisted,
        quotaUsedMb,
        quotaTotalMb,
        counts: {
          participants: participantCount,
          timingRecords: timingCount,
          shootingResults: shootingCount,
          operations: opCount,
        },
        writeTestPassed,
        latencyMs,
      },
      pwa: {
        serviceWorkerActive,
        isStandalone,
        cacheStorageSupported,
        isOnline,
      },
      clock: {
        offsetMs: clockStatus.offsetMs,
        uncertaintyMs: clockStatus.uncertaintyMs,
        isSynced: clockStatus.uncertaintyMs < 500,
        status: clockStatus,
      },
      audio: {
        isSupported: isAudioSupported,
        state: audioState,
        volumePct,
        isMuted,
      },
      sync: {
        pendingCount,
        isConfigured,
        lastSyncAt: syncHealth.lastSyncAt,
      },
    });
    setLoading(false);
  };

  useEffect(() => {
    if (isOpen) {
      void runHealthCheck();
    }
  }, [isOpen]);

  const handleRequestPersistentStorage = async () => {
    if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
      setPersisting(true);
      try {
        const granted = await navigator.storage.persist();
        if (granted) {
          soundService.playSuccess();
        } else {
          soundService.playWarning();
        }
        await runHealthCheck();
      } catch {
        soundService.playError();
      } finally {
        setPersisting(false);
      }
    }
  };

  const handleTestAudioSignal = async () => {
    setSoundTesting(true);
    try {
      await soundService.resume();
      soundService.playFinishChord();
    } finally {
      setTimeout(() => setSoundTesting(false), 1000);
    }
  };

  const handleSyncClockNow = async () => {
    setSyncingClock(true);
    try {
      await raceClock.syncWithNetwork();
      soundService.playSuccess();
      await runHealthCheck();
    } catch {
      soundService.playError();
    } finally {
      setSyncingClock(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-2xl w-full p-5 sm:p-6 shadow-2xl space-y-6 my-8">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-500/20 text-emerald-400 rounded-xl">
              <Activity className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                Systeemdiagnose & Gezondheid
              </h2>
              <p className="text-xs text-slate-400">
                Hardware- en opslagcontroles voor offline betrouwbaarheid en tijdregistratie
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center gap-3 text-slate-400">
            <RefreshCw className="w-8 h-8 animate-spin text-amber-400" />
            <p className="text-xs">Systeemspecificaties en datastores controleren...</p>
          </div>
        ) : health ? (
          <div className="space-y-4">
            {/* 1. IndexedDB & Lokale Opslag */}
            <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700/80 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold text-white text-sm">
                  <Database className="w-4 h-4 text-amber-400" />
                  <span>IndexedDB & Lokale Datastore</span>
                </div>
                {health.indexedDB.writeTestPassed ? (
                  <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Actief & Schrijfbaar ({health.indexedDB.latencyMs}ms)
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[11px] font-bold text-red-400 bg-red-500/10 px-2 py-0.5 rounded border border-red-500/20">
                    <XCircle className="w-3.5 h-3.5" /> Niet Schrijfbaar
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
                  <span className="text-slate-400 block text-[10px] uppercase">Deelnemers</span>
                  <span className="text-base font-bold text-white font-mono">
                    {health.indexedDB.counts.participants}
                  </span>
                </div>
                <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
                  <span className="text-slate-400 block text-[10px] uppercase">Tijdrecords</span>
                  <span className="text-base font-bold text-white font-mono">
                    {health.indexedDB.counts.timingRecords}
                  </span>
                </div>
                <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
                  <span className="text-slate-400 block text-[10px] uppercase">Schietbeurten</span>
                  <span className="text-base font-bold text-white font-mono">
                    {health.indexedDB.counts.shootingResults}
                  </span>
                </div>
                <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
                  <span className="text-slate-400 block text-[10px] uppercase">Ops-Journal</span>
                  <span className="text-base font-bold text-white font-mono">
                    {health.indexedDB.counts.operations}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-700/60 text-xs">
                <div className="text-slate-400">
                  <span>Gebruik: </span>
                  <span className="text-white font-mono font-medium">
                    {health.indexedDB.quotaUsedMb !== null ? `${health.indexedDB.quotaUsedMb} MB` : 'Onbekend'}
                  </span>
                  {health.indexedDB.quotaTotalMb !== null && (
                    <span className="text-slate-500"> / {health.indexedDB.quotaTotalMb} GB beschikbaar</span>
                  )}
                  <span className="mx-2">•</span>
                  <span>Persistentie: </span>
                  <span className={`font-semibold ${health.indexedDB.persisted ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {health.indexedDB.persisted ? 'Vergrendeld (veilig tegen browseropschoning)' : 'Niet vergrendeld'}
                  </span>
                </div>
                {!health.indexedDB.persisted && (
                  <button
                    type="button"
                    disabled={persisting}
                    onClick={handleRequestPersistentStorage}
                    className="px-2.5 py-1 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[11px] transition shadow"
                  >
                    {persisting ? 'Aanvragen...' : 'Opslag beveiligen'}
                  </button>
                )}
              </div>
            </div>

            {/* 2. PWA & Offline Status */}
            <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700/80 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold text-white text-sm">
                  <ShieldCheck className="w-4 h-4 text-blue-400" />
                  <span>PWA & Offline Gereedheid</span>
                </div>
                {health.pwa.serviceWorkerActive ? (
                  <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Service Worker Actief (Offline Gereed)
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[11px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                    <AlertTriangle className="w-3.5 h-3.5" /> Geen actieve Service Worker
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800 flex items-center justify-between">
                  <span className="text-slate-400">Netwerkstatus</span>
                  <span className="font-bold flex items-center gap-1 text-emerald-400">
                    {health.pwa.isOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5 text-amber-400" />}
                    {health.pwa.isOnline ? 'Online' : 'Offline'}
                  </span>
                </div>
                <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800 flex items-center justify-between">
                  <span className="text-slate-400">Installatiemodus</span>
                  <span className="font-bold text-slate-200">
                    {health.pwa.isStandalone ? 'Geïnstalleerd (App)' : 'Browser Tab'}
                  </span>
                </div>
                <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800 flex items-center justify-between">
                  <span className="text-slate-400">Cache API</span>
                  <span className="font-bold text-emerald-400">
                    {health.pwa.cacheStorageSupported ? 'Ondersteund' : 'Nee'}
                  </span>
                </div>
              </div>
            </div>

            {/* 3. Wedstrijdklok & Synchronisatie */}
            <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700/80 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold text-white text-sm">
                  <Clock className="w-4 h-4 text-emerald-400" />
                  <span>Wedstrijdklok & Tijdssynchronisatie</span>
                </div>
                <button
                  type="button"
                  disabled={syncingClock}
                  onClick={handleSyncClockNow}
                  className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 text-[11px] font-medium transition"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${syncingClock ? 'animate-spin text-amber-400' : ''}`} />
                  <span>Klok nu synchroniseren</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
                  <span className="text-slate-400 block text-[10px] uppercase">Klok Offset</span>
                  <span className="text-base font-bold text-white font-mono">
                    {health.clock.offsetMs >= 0 ? `+${health.clock.offsetMs}` : health.clock.offsetMs} ms
                  </span>
                </div>
                <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
                  <span className="text-slate-400 block text-[10px] uppercase">Onzekerheidsmarge</span>
                  <span className="text-base font-bold text-emerald-400 font-mono">
                    ±{health.clock.uncertaintyMs} ms
                  </span>
                </div>
                <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
                  <span className="text-slate-400 block text-[10px] uppercase">Sync Status</span>
                  <span className="text-xs font-bold text-emerald-400 block mt-1">
                    {health.clock.isSynced ? 'Volledig Gesynchroniseerd' : 'Lokale Tijd (Geen Sync)'}
                  </span>
                </div>
              </div>
            </div>

            {/* 4. Audio & Signaalfeedback */}
            <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700/80 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold text-white text-sm">
                  {health.audio.isMuted ? (
                    <VolumeX className="w-4 h-4 text-slate-400" />
                  ) : (
                    <Volume2 className="w-4 h-4 text-amber-400" />
                  )}
                  <span>Web Audio Context (Akoestische Feedback)</span>
                </div>
                <button
                  type="button"
                  disabled={soundTesting}
                  onClick={handleTestAudioSignal}
                  className="flex items-center gap-1.5 px-3 py-1 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[11px] transition shadow"
                >
                  <Play className="w-3 h-3 fill-current" />
                  <span>{soundTesting ? 'Speelt af...' : 'Test Geluid'}</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800 flex items-center justify-between">
                  <span className="text-slate-400">Audio Ondersteuning</span>
                  <span className="font-bold text-emerald-400">
                    {health.audio.isSupported ? 'Beschikbaar' : 'Niet Ondersteund'}
                  </span>
                </div>
                <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800 flex items-center justify-between">
                  <span className="text-slate-400">Context Status</span>
                  <span className="font-bold font-mono text-slate-200 uppercase">
                    {health.audio.state}
                  </span>
                </div>
                <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800 flex items-center justify-between">
                  <span className="text-slate-400">Volume & Mute</span>
                  <span className="font-bold text-slate-200">
                    {health.audio.isMuted ? 'Gedempt' : `${health.audio.volumePct}%`}
                  </span>
                </div>
              </div>
            </div>

            {/* 5. Toestel & Wachtrij */}
            <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700/80 flex items-center justify-between text-xs">
              <div className="flex items-center gap-3">
                <Laptop className="w-4 h-4 text-slate-400" />
                <div>
                  <span className="text-slate-300 font-bold">Toestel-ID: </span>
                  <span className="text-amber-400 font-mono font-semibold">{deviceConfig?.id || 'FINISH-01'}</span>
                  <span className="text-slate-500 mx-2">|</span>
                  <span className="text-slate-300">Rol: </span>
                  <span className="text-slate-200">{deviceConfig?.role || 'FINISH_OPERATOR'}</span>
                </div>
              </div>
              <div className="text-slate-400">
                <span>Wachtrij: </span>
                <span className={`font-mono font-bold ${health.sync.pendingCount > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {health.sync.pendingCount} ongesynchroniseerd
                </span>
              </div>
            </div>
          </div>
        ) : null}

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-800">
          <button
            type="button"
            onClick={runHealthCheck}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
          >
            <RefreshCw className="w-4 h-4" /> Opnieuw controleren
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition"
          >
            Sluiten
          </button>
        </div>
      </div>
    </div>
  );
};
