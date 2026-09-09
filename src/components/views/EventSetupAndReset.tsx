import React, { useState } from 'react';
import { Trash2, RefreshCw, AlertTriangle, ShieldAlert, Database, CheckCircle2 } from 'lucide-react';
import type { RaceEvent, Wave, Participant } from '../../types';
import {
  clearAllParticipants,
  clearAllWaves,
  resetTimingAndShooting,
  resetToBlankEvent,
  initializeSampleData,
} from '../../services/sampleDataService';
import { soundService } from '../../services/soundService';
import { SafeConfirmButton } from '../SafeConfirmButton';

interface EventSetupAndResetProps {
  event: RaceEvent | null;
  waves: Wave[];
  participants: Participant[];
  onRefresh: () => void;
}

export const EventSetupAndReset: React.FC<EventSetupAndResetProps> = ({
  event,
  waves,
  participants,
  onRefresh,
}) => {
  const [showBlankEventModal, setShowBlankEventModal] = useState(false);
  const [blankName, setBlankName] = useState('');
  const [blankDate, setBlankDate] = useState('');
  const [blankLocation, setBlankLocation] = useState('');
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'warning' } | null>(null);

  const showNotification = (text: string, type: 'success' | 'warning' = 'success') => {
    setStatusMessage({ text, type });
    setTimeout(() => setStatusMessage(null), 5000);
  };

  const handleResetTimingOnly = async () => {
    await resetTimingAndShooting();
    soundService.playSuccess();
    await onRefresh();
    showNotification('Alle tijdregistraties en schietresultaten zijn succesvol gereset.');
  };

  const handleClearParticipants = async () => {
    await clearAllParticipants();
    soundService.playWarning();
    await onRefresh();
    showNotification('Alle deelnemers zijn definitief gewist.', 'warning');
  };

  const handleClearWaves = async () => {
    await clearAllWaves();
    soundService.playWarning();
    await onRefresh();
    showNotification('Alle startgroepen zijn gewist.', 'warning');
  };

  const handleFactoryResetBlank = async (formEvent?: React.FormEvent) => {
    formEvent?.preventDefault?.();
    if (!blankName.trim()) {
      soundService.playWarning();
      return;
    }
    await resetToBlankEvent(blankName.trim(), blankDate, blankLocation.trim());
    soundService.playWarning();
    setShowBlankEventModal(false);
    await onRefresh();
    showNotification(`Het systeem is volledig gewist en klaargezet voor "${blankName}".`, 'warning');
  };

  const handleRestoreSampleData = async () => {
    await initializeSampleData(true);
    soundService.playSuccess();
    await onRefresh();
    showNotification('De voorbeeldgegevens zijn hersteld.');
  };

  return (
    <div className="space-y-6">
      {statusMessage && (
        <div
          role="status"
          className={`p-3.5 rounded-xl border flex items-center gap-2.5 text-xs font-semibold shadow-lg ${
            statusMessage.type === 'success'
              ? 'bg-emerald-950/70 border-emerald-500/50 text-emerald-200'
              : 'bg-amber-950/70 border-amber-500/50 text-amber-200'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}

      <div className="rounded-2xl border border-red-500/30 bg-slate-900 p-6 shadow-xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div>
            <span className="text-xs font-mono uppercase tracking-widest text-red-400 font-bold flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4" /> Gevarenzone
            </span>
            <h3 className="text-xl font-black text-white mt-0.5">Evenement wissen of opnieuw beginnen</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Beheer deelnemers en startgroepen in hun eigen schermen. Gevaarlijke acties vereisen 3 seconden hold-to-confirm ter bescherming.
            </p>
          </div>
          <span className="text-xs font-mono text-slate-400 bg-slate-950 px-3 py-1 rounded-lg border border-slate-800">
            {participants.length} deelnemers • {waves.length} startgroepen
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-slate-950/60 border border-slate-800 p-4 rounded-xl flex flex-col justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-amber-400 font-bold text-xs">
                <RefreshCw className="w-4 h-4" /> Wedstrijdtijden resetten
              </div>
              <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                Wist start-, schiet- en finishtijden. Deelnemers en startgroepen blijven behouden.
              </p>
            </div>
            <SafeConfirmButton
              mode="hold"
              holdDurationSeconds={3}
              variant="warning"
              onConfirm={handleResetTimingOnly}
              className="w-full"
            >
              Houd vast: Tijden resetten
            </SafeConfirmButton>
          </div>

          <div className="bg-slate-950/60 border border-slate-800 p-4 rounded-xl flex flex-col justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-red-400 font-bold text-xs">
                <Trash2 className="w-4 h-4" /> Deelnemers wissen
              </div>
              <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                Maakt de deelnemerslijst volledig leeg. Gebruik het scherm Deelnemers om nieuwe gegevens te importeren.
              </p>
            </div>
            <SafeConfirmButton
              mode="hold"
              holdDurationSeconds={3}
              variant="danger"
              onConfirm={handleClearParticipants}
              className="w-full"
            >
              Houd vast: Wis {participants.length} deelnemers
            </SafeConfirmButton>
          </div>

          <div className="bg-slate-950/60 border border-slate-800 p-4 rounded-xl flex flex-col justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-red-400 font-bold text-xs">
                <Trash2 className="w-4 h-4" /> Startgroepen wissen
              </div>
              <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                Wist alle startgroepen. Deelnemers blijven bewaard maar worden losgekoppeld.
              </p>
            </div>
            <SafeConfirmButton
              mode="hold"
              holdDurationSeconds={3}
              variant="danger"
              onConfirm={handleClearWaves}
              className="w-full"
            >
              Houd vast: Wis {waves.length} startgroepen
            </SafeConfirmButton>
          </div>

          <div className="bg-slate-950/60 border border-slate-800 p-4 rounded-xl flex flex-col justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs">
                <Database className="w-4 h-4" /> Nieuw evenement
              </div>
              <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                Wist alle wedstrijdgegevens en logs. Maakt een blanco evenement met een nieuw ID; online synchronisatie wordt uitgezet.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowBlankEventModal(true)}
              className="w-full py-2 px-3 rounded-lg bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-500/40 text-xs font-bold transition"
            >
              Blanco evenement starten
            </button>
          </div>
        </div>

        {event?.isTestMode && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-950/20 p-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5" />
              <div>
                <strong className="text-xs text-amber-300">Alleen in testmodus</strong>
                <p className="text-[11px] text-slate-400">Vervang de huidige gegevens door de volledige demonstratieset.</p>
              </div>
            </div>
            <SafeConfirmButton
              mode="hold"
              holdDurationSeconds={3}
              variant="warning"
              onConfirm={handleRestoreSampleData}
            >
              Houd vast: Voorbeeld herstellen
            </SafeConfirmButton>
          </div>
        )}
      </div>

      {showBlankEventModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="bg-slate-900 border-2 border-red-500/60 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Database className="w-4 h-4 text-emerald-400" /> Fabrieksreset & Nieuw blanco evenement
              </h3>
            </div>
            <p className="text-slate-300 leading-relaxed">
              Alle deelnemers, startgroepen, tijden en logs worden definitief gewist. Het nieuwe evenement krijgt een eigen ID en online synchronisatie wordt uitgezet.
            </p>
            <form onSubmit={(e) => e.preventDefault()} className="space-y-3">
              <div>
                <label className="text-slate-300 font-semibold block mb-1">Wedstrijdnaam:</label>
                <input
                  type="text"
                  required
                  value={blankName}
                  onChange={(event) => setBlankName(event.target.value)}
                  placeholder="Bijv. Biathlon Cup 2026"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-bold text-sm focus:outline-none focus:border-amber-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-slate-300 font-semibold block mb-1">Datum:</label>
                  <input
                    type="date"
                    required
                    value={blankDate}
                    onChange={(event) => setBlankDate(event.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="text-slate-300 font-semibold block mb-1">Locatie:</label>
                  <input
                    type="text"
                    required
                    value={blankLocation}
                    onChange={(event) => setBlankLocation(event.target.value)}
                    placeholder="Bijv. De Haan"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="pt-2 border-t border-slate-800">
                <p className="text-red-400 font-semibold mb-2">
                  Houd de knop hieronder 3 seconden ingedrukt en typ vervolgens <span className="font-mono font-black">BEVESTIG</span> om deze database-lediging te voltooien.
                </p>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowBlankEventModal(false)}
                    className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-semibold hover:bg-slate-700 transition"
                  >
                    Annuleren
                  </button>
                  <SafeConfirmButton
                    mode="hold"
                    holdDurationSeconds={3}
                    requireTypeConfirm={true}
                    typeConfirmKeyword="BEVESTIG"
                    typeConfirmTitle="Bevestig volledige fabrieksreset"
                    typeConfirmDescription="Weet u 100% zeker dat u alle gegevens wilt wissen en opnieuw wilt beginnen?"
                    variant="danger"
                    disabled={!blankName.trim()}
                    onConfirm={handleFactoryResetBlank}
                  >
                    Houd vast (3s) voor reset
                  </SafeConfirmButton>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

