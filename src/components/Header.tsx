import { ClockStatus } from './ClockStatus';
import React, { useState } from 'react';
import {
  Wifi,
  WifiOff,
  RefreshCw,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  Laptop,
  CheckCircle2,
  Printer,
  LockOpen,
  Activity,
} from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { soundService } from '../services/soundService';
import { syncService } from '../services/syncService';
import type { RaceEvent, DeviceConfig } from '../types';

const roleLabels: Record<DeviceConfig['role'], string> = {
  ADMIN: 'Beheerder',
  RACE_DIRECTOR: 'Wedstrijdleider',
  REGISTRATION: 'Inschrijving',
  START_OPERATOR: 'Startpost',
  SHOOTING_OPERATOR: 'Schietpost',
  FINISH_OPERATOR: 'Finishpost',
  VIEWER: 'Live weergave',
};

interface HeaderProps {
  stationNavigation: React.ReactNode;
  event: RaceEvent | null;
  deviceConfig: DeviceConfig | null;
  pendingSyncCount: number;
  onOpenPreRaceCheck: () => void;
  onOpenSystemHealth: () => void;
  onOpenPrint: () => void;
  onUnlockDevice: () => void;
  isTestMode: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  stationNavigation,
  event,
  deviceConfig,
  pendingSyncCount,
  onOpenPreRaceCheck,
  onOpenSystemHealth,
  onOpenPrint,
  onUnlockDevice,
  isTestMode,
}) => {
  const { isOnline, isSimulatedOffline, toggleSimulatedOffline } = useOnlineStatus();
  const syncConfigured = syncService.getConfig().enabled;
  const [isSoundOn, setIsSoundOn] = useState(soundService.getSoundEnabled());
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncToast, setSyncToast] = useState<string | null>(null);

  const toggleSound = () => {
    const next = soundService.toggleSound();
    setIsSoundOn(next);
    if (next) soundService.playSuccess();
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const handleSyncNow = async () => {
    setIsSyncing(true);
    const res = await syncService.syncNow();
    setIsSyncing(false);
    if (res.error) {
      setSyncToast(`Sync fout: ${res.error}`);
    } else {
      setSyncToast(`${res.syncedCount} items gesynchroniseerd`);
    }
    setTimeout(() => setSyncToast(null), 3000);
  };


  return (
    <header className="relative text-slate-100">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-2 sm:gap-4">
        {stationNavigation}
        {/* Brand & Event Title */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-amber-500 to-amber-400 flex items-center justify-center shadow-lg shadow-amber-500/20 ring-1 ring-amber-400/40">
            <svg className="w-6 h-6 text-slate-950" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <circle cx="12" cy="12" r="10" />
              <circle cx="12" cy="12" r="6" />
              <circle cx="12" cy="12" r="2" fill="currentColor" />
              <path d="M12 2v4M12 18v4M2 12h4M18 12h4" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold tracking-tight text-white flex items-center gap-2">
                {event?.name || 'Biathlon Tijdregistratie'}
              </h1>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                  event?.status === 'LIVE'
                    ? 'bg-emerald-500 text-slate-950 animate-pulse'
                    : event?.status === 'READY'
                    ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                {event?.status || 'READY'}
              </span>
            </div>
            <p className="text-xs text-slate-400 flex items-center gap-2">
              <span>{event?.location || 'Locatie nog niet ingesteld'}</span>
              <span className="text-slate-600">•</span>
              <span className="font-mono text-slate-300">{event?.date || 'Datum nog niet ingesteld'}</span>
              {event?.organizer && (
                <>
                  <span className="hidden md:inline text-slate-600">•</span>
                  <span className="hidden md:inline text-slate-400">{event.organizer}</span>
                </>
              )}
            </p>
          </div>
        </div>

        {/* Status Indicators & Control Actions */}
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          {/* Network & Sync Badge (Req 30) */}
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border ${
              isOnline
                ? pendingSyncCount > 0
                  ? 'bg-amber-950/40 border-amber-500/40 text-amber-400'
                  : 'bg-emerald-950/40 border-emerald-500/40 text-emerald-400'
                : 'bg-amber-950/60 border-amber-600/50 text-amber-300'
            }`}
          >
            {isOnline ? (
              <>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                <span>
                  {pendingSyncCount > 0
                    ? `${pendingSyncCount} in wachtrij`
                    : syncConfigured
                    ? 'ONLINE & GESYNCHRONISEERD'
                    : 'ONLINE - LOKAAL'}
                </span>
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5 text-amber-400" />
                <span>OFFLINE ({pendingSyncCount} lokaal bewaard)</span>
              </>
            )}
          </div>

          <ClockStatus compact />

          {/* Sync Button */}
          <button
            onClick={handleSyncNow}
            disabled={isSyncing || !isOnline}
            title="Nu synchroniseren met cloud"
            className="p-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition disabled:opacity-40"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin text-amber-400' : ''}`} />
          </button>

          {/* Device & Operator Badge (Req 31) */}
          <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-800/80 border border-slate-700 text-xs text-slate-300 font-mono">
            <Laptop className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-amber-400 font-semibold">{deviceConfig?.id || 'FINISH-01'}</span>
            <span className="text-slate-500">|</span>
            <span>{deviceConfig ? roleLabels[deviceConfig.role] : 'Finishpost'}</span>
            {deviceConfig?.operatorName && (
              <>
                <span className="text-slate-500">|</span>
                <span>{deviceConfig.operatorName}</span>
              </>
            )}
          </div>

          {deviceConfig?.isLocked && (
            <button
              type="button"
              onClick={onUnlockDevice}
              title="Toestel ontgrendelen met beheerderscode"
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-950/60 border border-amber-600/50 text-amber-300 hover:bg-amber-900/60 transition text-xs font-semibold"
            >
              <LockOpen className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Ontgrendelen</span>
            </button>
          )}

          {/* Simulated Offline Toggle */}
          {isTestMode && !deviceConfig?.isLocked && (
            <button
              onClick={toggleSimulatedOffline}
              title={isSimulatedOffline ? 'Offline simulatie uitschakelen' : 'Offline netwerk simuleren'}
              className={`px-2 py-1 rounded text-xs font-medium border transition ${
                isSimulatedOffline
                  ? 'bg-amber-600 border-amber-500 text-slate-950 font-bold'
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {isSimulatedOffline ? 'Offline simulatie aan' : 'Offline simuleren'}
            </button>
          )}

          {/* Sound Toggle (Req 52) */}
          <button
            onClick={toggleSound}
            title={isSoundOn ? 'Geluid uitschakelen' : 'Geluid inschakelen'}
            className={`p-1.5 rounded-md border transition ${
              isSoundOn
                ? 'bg-slate-800 border-slate-700 text-amber-400 hover:bg-slate-700'
                : 'bg-slate-800/60 border-slate-800 text-slate-500 hover:bg-slate-800'
            }`}
          >
            {isSoundOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          {/* Fullscreen Toggle (Req 53) */}
          <button
            onClick={toggleFullscreen}
            title="Volledig scherm (Fullscreen event mode)"
            className="p-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition"
          >
            {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
          </button>

          {/* Pre-Race Check Button (Req 66) */}
          {!deviceConfig?.isLocked && (
            <button
              onClick={onOpenPreRaceCheck}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-950/60 border border-blue-600/40 text-blue-300 hover:bg-blue-900/60 transition text-xs font-semibold"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" />
              <span className="hidden lg:inline">Voorcontrole</span>
            </button>
          )}

          {!deviceConfig?.isLocked && (
            <button
              type="button"
              onClick={onOpenPrint}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white transition text-xs font-semibold"
              title="Startlijsten, startnummers en noodformulieren afdrukken"
            >
              <Printer className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">Afdrukken</span>
            </button>
          )}

        </div>
      </div>

      {syncToast && (
        <div className="bg-slate-800 border-t border-slate-700 text-slate-200 text-xs py-1 px-4 text-center">
          {syncToast}
        </div>
      )}

    </header>
  );
};
