import { DevicePairingPanel } from './components/DevicePairingPanel';
import React, { useState } from 'react';
import { useEventData } from './hooks/useEventData';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { Header } from './components/Header';
import { Navigation, getLockedTabForRole, type ActiveTab } from './components/Navigation';

// Views
import { EventDashboardView } from './components/views/EventDashboardView';
import { StartStationView } from './components/views/StartStationView';
import { ShootingStationView } from './components/views/ShootingStationView';
import { FinishStationView } from './components/views/FinishStationView';
import { LiveLeaderboardView } from './components/views/LiveLeaderboardView';
import { ParticipantsView } from './components/views/ParticipantsView';
import { WavesView } from './components/views/WavesView';
import { AttentionView } from './components/views/AttentionView';
import { SettingsView } from './components/views/SettingsView';

// Modals
import { PreRaceCheckModal } from './components/PreRaceCheckModal';
import { PrintModal } from './components/PrintModal';
import { ConflictResolverModal } from './components/ConflictResolverModal';
import { ParticipantDetailModal } from './components/ParticipantDetailModal';
import { SystemHealthModal } from './components/SystemHealthModal';

import type { RaceConflict, Participant, RaceResult } from './types';
import { AlertTriangle, Lock, Unlock, KeyRound } from 'lucide-react';
import { db } from './db/dexieDb';
import { soundService } from './services/soundService';
import { SafeConfirmButton } from './components/SafeConfirmButton';

const validTabs = new Set<ActiveTab>([
  'event', 'participants', 'waves', 'start', 'shooting', 'finish',
  'live', 'results', 'attention', 'settings',
]);

const getInitialTab = (): ActiveTab => {
  if (typeof window === 'undefined') return 'event';
  const hashTab = window.location.hash.replace(/^#/, '') as ActiveTab;
  return validTabs.has(hashTab) ? hashTab : 'event';
};

export default function App() {
  const {
    event,
    participants,
    categories,
    waves,
    raceProfiles,
    timingRecords,
    shootingResults,
    results,
    conflicts,
    auditLogs,
    deviceConfig,
    pendingSyncCount,
    refresh,
    loading,
  } = useEventData();

  const { isSimulatedOffline, toggleSimulatedOffline } = useOnlineStatus();
  const [currentTab, setCurrentTab] = useState<ActiveTab>(getInitialTab);
  const [joinLink, setJoinLink] = useState(() => location.hash.startsWith('#join=') ? location.href : '');
  const [isLeaderboardKiosk, setIsLeaderboardKiosk] = useState(false);

  // Modals state
  const [showPreRaceModal, setShowPreRaceModal] = useState(false);
  const [showSystemHealthModal, setShowSystemHealthModal] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [activeConflict, setActiveConflict] = useState<RaceConflict | null>(null);
  const [selectedParticipant, setSelectedParticipant] = useState<Participant | null>(null);

  const unresolvedConflictsCount = conflicts.filter((c) => !c.resolvedAt).length;
  const activeTimingRecords = timingRecords.filter((record) => !record.isReversed);
  const unknownBibCount = activeTimingRecords.filter((record) => record.isUnknownBib).length;
  const startedBibs = new Set(
    activeTimingRecords.filter((record) => record.type === 'START').map((record) => record.bibNumber)
  );
  const finishedBibs = new Set(
    activeTimingRecords.filter((record) => record.type === 'FINISH').map((record) => record.bibNumber)
  );
  const shootingBibs = new Set(shootingResults.map((result) => result.bibNumber));
  const missingStartCount = [...finishedBibs].filter((bib) => !startedBibs.has(bib)).length;
  const missingShootingCount = [...finishedBibs].filter((bib) => !shootingBibs.has(bib)).length;
  const attentionCount = unknownBibCount + missingStartCount + missingShootingCount;
  const lockedTab = deviceConfig?.isLocked ? getLockedTabForRole(deviceConfig.role) : null;
  const displayedTab = lockedTab || currentTab;

  React.useEffect(() => {
    if (deviceConfig?.isLocked) {
      setCurrentTab(getLockedTabForRole(deviceConfig.role));
    }
  }, [deviceConfig?.isLocked, deviceConfig?.role]);

  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      if (window.location.hash.startsWith('#join=')) return;
      const nextHash = `#${currentTab}`;
      if (window.location.hash !== nextHash) {
        window.history.pushState(null, '', nextHash);
      }
    }
  }, [currentTab]);

  React.useEffect(() => {
    const restoreTabFromHistory = () => {
      if (window.location.hash.startsWith('#join=')) { setJoinLink(window.location.href); return; }
      const hashTab = window.location.hash.replace(/^#/, '') as ActiveTab;
      if (validTabs.has(hashTab)) setCurrentTab(hashTab);
    };
    window.addEventListener('popstate', restoreTabFromHistory);
    window.addEventListener('hashchange', restoreTabFromHistory);
    return () => {
      window.removeEventListener('popstate', restoreTabFromHistory);
      window.removeEventListener('hashchange', restoreTabFromHistory);
    };
  }, []);

  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [unlockPinInput, setUnlockPinInput] = useState('');
  const [unlockError, setUnlockError] = useState<string | null>(null);

  const handleOpenUnlockModal = () => {
    if (!deviceConfig?.isLocked) return;
    setUnlockPinInput('');
    setUnlockError(null);
    setShowUnlockModal(true);
  };

  const handleConfirmUnlockWithPin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!deviceConfig?.isLocked) return;
    if (deviceConfig.pin && unlockPinInput !== deviceConfig.pin) {
      soundService.playError();
      setUnlockError('Onjuiste beheerderscode. Het toestel blijft vergrendeld.');
      return;
    }

    soundService.playSuccess();
    await db.devices.update(deviceConfig.id, { isLocked: false });
    await refresh();
    setShowUnlockModal(false);
    setCurrentTab('event');
  };

  const handleConfirmUnlockNoPin = async () => {
    if (!deviceConfig?.isLocked) return;
    soundService.playSuccess();
    await db.devices.update(deviceConfig.id, { isLocked: false });
    await refresh();
    setShowUnlockModal(false);
    setCurrentTab('event');
  };

  const handleSelectParticipantFromResult = (result: RaceResult) => {
    const p = participants.find((item) => item.id === result.participantId);
    if (p) setSelectedParticipant(p);
  };

  if (loading && !event) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-400 space-y-3">
        <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm font-semibold tracking-wider font-mono">
          Biathlon Tijdregistratie laden...
        </span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-amber-500 selection:text-slate-950">
      {joinLink && <div className="fixed inset-0 z-[100] bg-slate-950/95 overflow-auto p-6"><div className="max-w-2xl mx-auto"><DevicePairingPanel initialLink={joinLink} onJoined={() => { setJoinLink(''); location.reload(); }} /><button className="p-3" onClick={() => { setJoinLink(''); history.replaceState(null, '', location.pathname); }}>Sluiten</button></div></div>}
      {/* Test Mode / Simulated Offline Banner */}
      {!isLeaderboardKiosk && (event?.isTestMode || isSimulatedOffline) && (
        <div className="bg-amber-500 text-slate-950 px-4 py-1.5 text-xs font-black uppercase tracking-wider flex items-center justify-between shadow-md">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 stroke-[2.5]" />
            <span>
              {isSimulatedOffline
                ? 'GEFORCEERDE OFFLINE MODUS ACTIEF: Apparaat opereert 100% autonoom op lokale IndexedDB'
                : `TESTMODUS: ${event?.name || 'Biathlon Tijdregistratie'} Testset actief`}
            </span>
          </div>
          {isSimulatedOffline && (
            <button
              onClick={toggleSimulatedOffline}
              className="bg-slate-950 text-amber-400 px-2 py-0.5 rounded text-[10px] font-bold hover:bg-slate-900 transition"
            >
              Hervat Netwerk
            </button>
          )}
        </div>
      )}

      {!isLeaderboardKiosk && <div className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur border-b border-slate-800">
        <Header
          stationNavigation={<Navigation variant="stations" activeTab={displayedTab} onSelectTab={setCurrentTab} conflictCount={unresolvedConflictsCount} attentionCount={attentionCount} deviceConfig={deviceConfig} />}
          event={event}
          deviceConfig={deviceConfig}
          pendingSyncCount={pendingSyncCount}
          onOpenPreRaceCheck={() => setShowPreRaceModal(true)}
          onOpenSystemHealth={() => setShowSystemHealthModal(true)}
          onOpenPrint={() => setShowPrintModal(true)}
          onUnlockDevice={handleOpenUnlockModal}
          isTestMode={event?.isTestMode ?? false}
        />
        <Navigation
          activeTab={displayedTab}
          onSelectTab={setCurrentTab}
          conflictCount={unresolvedConflictsCount}
          attentionCount={attentionCount}
          deviceConfig={deviceConfig}
        />
      </div>}

      {/* Main Content View */}
      <main className={isLeaderboardKiosk
        ? 'flex-1 w-full'
        : 'flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 pb-16'}>
        {displayedTab === 'event' && (
          <EventDashboardView
            event={event}
            participants={participants}
            waves={waves}
            timingRecords={timingRecords}
            shootingResults={shootingResults}
            results={results}
            conflicts={conflicts}
            onNavigate={setCurrentTab}
            onOpenPreRaceCheck={() => setShowPreRaceModal(true)}
          />
        )}

        {displayedTab === 'start' && (
          <StartStationView
            categories={categories}
            waves={waves}
            participants={participants}
            timingRecords={timingRecords}
            onRefresh={refresh}
          />
        )}

        {displayedTab === 'shooting' && (
          <ShootingStationView
            categories={categories}
            event={event}
            participants={participants}
            shootingResults={shootingResults}
            raceProfiles={raceProfiles}
            onRefresh={refresh}
          />
        )}

        {displayedTab === 'finish' && (
          <FinishStationView
            categories={categories}
            waves={waves}
            event={event}
            participants={participants}
            timingRecords={timingRecords}
            onRefresh={refresh}
          />
        )}

        {(displayedTab === 'live' || displayedTab === 'results') && (
          <LiveLeaderboardView
            key={event?.id}
            results={results}
            categories={categories}
            waves={waves}
            event={event}
            mode={displayedTab === 'results' ? 'results' : 'live'}
            onSelectParticipant={handleSelectParticipantFromResult}
            onKioskModeChange={setIsLeaderboardKiosk}
          />
        )}

        {displayedTab === 'participants' && (
          <ParticipantsView
            participants={participants}
            categories={categories}
            waves={waves}
            profiles={raceProfiles}
            onRefresh={refresh}
            onSelectParticipant={setSelectedParticipant}
          />
        )}

        {displayedTab === 'waves' && (
          <WavesView
            waves={waves}
            categories={categories}
            participants={participants}
            onRefresh={refresh}
          />
        )}

        {displayedTab === 'attention' && (
          <AttentionView
            conflicts={conflicts}
            participants={participants}
            timingRecords={timingRecords}
            shootingResults={shootingResults}
            auditLogs={auditLogs}
            onOpenConflict={setActiveConflict}
            onSelectParticipant={setSelectedParticipant}
          />
        )}

        {displayedTab === 'settings' && (
          <SettingsView
            event={event}
            deviceConfig={deviceConfig}
            profiles={raceProfiles}
            categories={categories}
            waves={waves}
            participants={participants}
            onRefresh={refresh}
          />
        )}
      </main>

      {/* Global Modals */}
      <PreRaceCheckModal
        isOpen={showPreRaceModal}
        onClose={() => setShowPreRaceModal(false)}
        event={event}
        participants={participants}
        waves={waves}
        categories={categories}
        profiles={raceProfiles}
        conflicts={conflicts}
        pendingSyncCount={pendingSyncCount}
        onGoLiveSuccess={refresh}
      />

      <PrintModal
        profiles={raceProfiles}
        isOpen={showPrintModal}
        onClose={() => setShowPrintModal(false)}
        participants={participants}
        categories={categories}
        waves={waves}
        event={event}
      />

      <SystemHealthModal
        isOpen={showSystemHealthModal}
        onClose={() => setShowSystemHealthModal(false)}
        deviceConfig={deviceConfig}
      />

      <ConflictResolverModal
        isOpen={!!activeConflict}
        conflict={activeConflict}
        onClose={() => setActiveConflict(null)}
        onResolved={refresh}
      />

      <ParticipantDetailModal
        isOpen={!!selectedParticipant}
        participant={selectedParticipant}
        result={selectedParticipant ? results.find((r) => r.participantId === selectedParticipant.id) || null : null}
        auditLogs={auditLogs}
        timingRecords={timingRecords}
        shootingResults={shootingResults}
        categories={categories}
        waves={waves}
        profiles={raceProfiles}
        onClose={() => setSelectedParticipant(null)}
        onUpdated={refresh}
      />

      {/* Unlock Device Modal */}
      {showUnlockModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-750 rounded-2xl p-6 max-w-sm w-full space-y-4 text-white shadow-2xl">
            <div className="flex items-center gap-3 border-b border-slate-800 pb-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Toestel Ontgrendelen</h3>
                <p className="text-xs text-slate-400">Toestel staat in beveiligde kiosk-/stationmodus</p>
              </div>
            </div>

            {unlockError && (
              <div className="p-3 rounded-xl bg-red-950/60 border border-red-800/60 text-red-300 text-xs font-semibold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
                <span>{unlockError}</span>
              </div>
            )}

            {deviceConfig?.pin ? (
              <form onSubmit={handleConfirmUnlockWithPin} className="space-y-4">
                <div>
                  <label className="text-xs text-slate-300 block mb-1.5 flex items-center gap-1.5 font-medium">
                    <KeyRound className="w-3.5 h-3.5 text-amber-400" /> Voer beheerders-PIN in:
                  </label>
                  <input
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoFocus
                    value={unlockPinInput}
                    onChange={(e) => {
                      setUnlockPinInput(e.target.value);
                      setUnlockError(null);
                    }}
                    placeholder="••••"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-center text-xl tracking-widest font-mono text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div className="flex gap-2.5 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setShowUnlockModal(false);
                      setUnlockPinInput('');
                      setUnlockError(null);
                    }}
                    className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-bold transition"
                  >
                    Annuleren
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black flex items-center justify-center gap-1.5 transition"
                  >
                    <Unlock className="w-4 h-4" /> Ontgrendelen
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-4">
                <p className="text-xs text-slate-300">
                  Er is geen PIN geconfigureerd voor dit toestel. Houd de knop hieronder ingedrukt om te ontgrendelen en alle beheermenu&apos;s weer zichtbaar te maken.
                </p>

                <div className="flex gap-2.5 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowUnlockModal(false)}
                    className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-bold transition"
                  >
                    Annuleren
                  </button>
                  <SafeConfirmButton
                    mode="hold"
                    holdDurationSeconds={2}
                    variant="warning"
                    onConfirm={handleConfirmUnlockNoPin}
                    className="flex-1 py-2.5 text-xs font-bold"
                  >
                    <Unlock className="w-4 h-4" />
                    <span>Houd vast: Ontgrendel</span>
                  </SafeConfirmButton>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
