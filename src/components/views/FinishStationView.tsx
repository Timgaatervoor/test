import { raceClock } from '../../services/raceClock';
import React, { useState, useEffect, useRef } from 'react';
import {
  Flag,
  Delete,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  UserPlus,
  HelpCircle,
  Volume2,
} from 'lucide-react';
import type { Category, Wave, Participant, TimingRecord, RaceEvent } from '../../types';
import { db } from '../../db/dexieDb';
import { operationService } from '../../services/operationService';
import { soundService } from '../../services/soundService';
import { formatLocalTime } from '../../services/timingEngine';

interface FinishStationViewProps {
  categories: Category[];
  waves: Wave[];
  event: RaceEvent | null;
  participants: Participant[];
  timingRecords: TimingRecord[];
  onRefresh: () => void;
}

export const FinishStationView: React.FC<FinishStationViewProps> = ({
  categories,
  waves,
  event,
  participants,
  timingRecords,
  onRefresh,
}) => {
  const [bibString, setBibString] = useState('');
  const [quickFinish, setQuickFinish] = useState(true);
  const [confirmModalBib, setConfirmModalBib] = useState<number | null>(null);
  const [capturedTime, setCapturedTime] = useState<{ iso: string; monotonic: number } | null>(null);
  const [feedback, setFeedback] = useState<{ text: string; type: 'success' | 'warn' | 'conflict' } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [undoingRecord, setUndoingRecord] = useState<TimingRecord | null>(null);
  const [undoReason, setUndoReason] = useState('');
  const [undoError, setUndoError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus hidden/direct input so keyboard works everywhere
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (confirmModalBib !== null) {
        if (e.key === 'Enter') {
          e.preventDefault();
          executeFinish(confirmModalBib, false, capturedTime || undefined);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          setConfirmModalBib(null);
          setCapturedTime(null);
        }
        return;
      }

      // Don't intercept if user is typing in a modal or another input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.key >= '0' && e.key <= '9') {
        setBibString((prev) => prev + e.key);
      } else if (e.key === 'Backspace') {
        setBibString((prev) => prev.slice(0, -1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleFinishTrigger();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [bibString, confirmModalBib, capturedTime]);

  const parsedBib = parseInt(bibString, 10);
  const matchedParticipant = !isNaN(parsedBib)
    ? participants.find((p) => p.bibNumber === parsedBib)
    : undefined;

  // Already finished check (Duplicate Warning)
  const alreadyFinished = !isNaN(parsedBib)
    ? timingRecords.some((r) => r.bibNumber === parsedBib && r.type === 'FINISH' && !r.isReversed)
    : false;

  const handleNumpadPress = (digit: string) => {
    setBibString((prev) => prev + digit);
  };

  const handleBackspace = () => {
    setBibString((prev) => prev.slice(0, -1));
  };

  const handleClear = () => {
    setBibString('');
  };

  const executeFinish = async (
    bib: number,
    isUnknown = false,
    explicitTime?: { iso: string; monotonic: number }
  ) => {
    setIsSubmitting(true);
    const nowIso = explicitTime?.iso || raceClock.nowISO();
    const monotonicNow = explicitTime?.monotonic !== undefined ? explicitTime.monotonic : performance.now();

    try {
      const p = participants.find((item) => item.bibNumber === bib);

      const { record, conflict } = await operationService.recordFinish(
        event?.id || 'event-de-haan-2026',
        bib,
        p,
        nowIso,
        monotonicNow
      );

      if (conflict) {
        soundService.playWarning();
        setFeedback({
          text: `⚠ CONFLICT gedetecteerd voor Bib #${bib}! Eerdere finish bestond al. Opgeslagen in Problemen/Conflicten.`,
          type: 'conflict',
        });
      } else {
        soundService.playSuccess();
        setFeedback({
          text: `Finish geregistreerd voor Bib #${bib} om ${formatLocalTime(record.timestamp, true)}`,
          type: 'success',
        });
      }

      setBibString('');
      setConfirmModalBib(null);
      setCapturedTime(null);
      onRefresh();
      setTimeout(() => setFeedback(null), 4000);
    } catch (err: any) {
      soundService.playError();
      setFeedback({ text: `Fout: ${err?.message}`, type: 'warn' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFinishTrigger = () => {
    if (isNaN(parsedBib) || parsedBib <= 0) {
      soundService.playWarning();
      setFeedback({ text: 'Voer eerst een startnummer in', type: 'warn' });
      return;
    }

    // Freeze timestamp T1 immediately on trigger (Requirement 17)
    const tIso = raceClock.nowISO();
    const tMono = performance.now();

    if (!quickFinish) {
      setCapturedTime({ iso: tIso, monotonic: tMono });
      setConfirmModalBib(parsedBib);
    } else {
      executeFinish(parsedBib, false, { iso: tIso, monotonic: tMono });
    }
  };

  // Emergency Unknown Bib Finish (Req 43)
  const handleEmergencyUnknownFinish = async () => {
    // Generate emergency temporary bib (e.g. 9000+)
    const highestBib = Math.max(
      9000,
      ...timingRecords.map((r) => r.bibNumber || 0)
    );
    const emergencyBib = highestBib + 1;

    setIsSubmitting(true);
    const nowIso = raceClock.nowISO();

    const { record } = await operationService.recordFinish(
      event?.id || 'event-de-haan-2026',
      emergencyBib,
      undefined,
      nowIso,
      performance.now()
    );

    soundService.playSuccess();
    setFeedback({
      text: `NOODTIJD geregistreerd voor Onbekende Loper (Tijdelijke Bib #${emergencyBib}) om ${formatLocalTime(
        record.timestamp,
        true
      )}. Kan later gekoppeld worden!`,
      type: 'warn',
    });
    onRefresh();
    setTimeout(() => setFeedback(null), 6000);
    setIsSubmitting(false);
  };

  // Undo finish with mandatory reason (Req 44)
  const handleOpenUndoFinish = (record: TimingRecord) => {
    setUndoingRecord(record);
    setUndoReason('');
    setUndoError(null);
  };

  const handleConfirmUndoFinish = async () => {
    if (!undoingRecord) return;
    if (!undoReason.trim()) {
      soundService.playWarning();
      setUndoError('Reden van annuleren finish is verplicht (Req 44)');
      return;
    }

    await operationService.undoTimingRecord(undoingRecord.id, undoReason.trim());
    const p = participants.find((item) => item.bibNumber === undoingRecord.bibNumber);

    await operationService.logAudit(
      'FINISH_CANCELLED',
      `Finish voor bib #${undoingRecord.bibNumber} geannuleerd. Reden: ${undoReason.trim()}`,
      p?.id,
      undoingRecord.bibNumber,
      undoReason.trim()
    );

    soundService.playWarning();
    setUndoingRecord(null);
    setUndoReason('');
    setUndoError(null);
    onRefresh();
  };

  // Recent 10 Finishes
  const recentFinishes = [...timingRecords]
    .filter((r) => r.type === 'FINISH' && !r.isReversed)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 10);

  return (
    <div className="space-y-6">
      {/* Top Banner with Quick-Finish Toggle */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="text-xs font-mono uppercase tracking-widest text-amber-400 font-bold flex items-center gap-1.5">
            <Flag className="w-4 h-4" /> Finishpost • Tijdopname
          </span>
          <h2 className="text-2xl font-black text-white tracking-tight mt-0.5">
            Finish Registratie
          </h2>
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-slate-300 font-semibold bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-700">
            <input
              type="checkbox"
              checked={quickFinish}
              onChange={(e) => setQuickFinish(e.target.checked)}
              className="w-4 h-4 rounded text-amber-500 focus:ring-0 cursor-pointer"
            />
            <span>Snelle Finish (1-klik registratie)</span>
          </label>

          <button
            onClick={handleEmergencyUnknownFinish}
            disabled={isSubmitting}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-950/60 hover:bg-red-900/80 text-red-300 border border-red-600/50 text-xs font-bold transition shadow"
            title="Sla direct een finishtijd op voor een loper zonder zichtbaar nummer"
          >
            <HelpCircle className="w-4 h-4 text-red-400" />
            <span>Noodtijd Onbekende Loper</span>
          </button>
        </div>
      </div>

      {/* Main Grid: Numpad & Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Giant Touch Numpad (Req 41, 50) */}
        <div className="lg:col-span-6 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl flex flex-col justify-between">
          <div>
            {/* Bib Display Screen */}
            <div className="bg-slate-950 border-2 border-slate-800 rounded-2xl p-4 mb-4 text-center relative overflow-hidden shadow-inner">
              <div className="text-xs font-mono text-slate-400 uppercase tracking-wider mb-1 flex items-center justify-between">
                <span>Startnummer Invoer</span>
                <span className="text-slate-500 text-[10px]">Tik op scherm of typ op toetsenbord</span>
              </div>

              <div className="text-5xl sm:text-6xl font-black font-mono tracking-wider text-amber-400 min-h-[60px] flex items-center justify-center">
                {bibString ? `#${bibString}` : <span className="text-slate-700">#---</span>}
              </div>

              {/* Matched Runner Info & Duplicate Warning */}
              {matchedParticipant && (
                <div className="mt-2 pt-2 border-t border-slate-850 flex items-center justify-between text-xs">
                  <span className="font-bold text-white truncate">
                    {matchedParticipant.firstName} {matchedParticipant.lastName}
                  </span>
                  <span className="text-slate-400 font-mono">
                    {categories.find(c => c.id === matchedParticipant.categoryId)?.name || 'Cat'} • {waves.find(w => w.id === matchedParticipant.waveId)?.name || 'Wave'}
                  </span>
                </div>
              )}

              {alreadyFinished && (
                <div className="mt-2 p-1.5 bg-amber-500/20 border border-amber-500/40 rounded text-[11px] text-amber-300 font-bold flex items-center justify-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>LET OP: Deze loper heeft al een eerdere finish geregistreerd!</span>
                </div>
              )}
            </div>

            {/* Giant Touch Numpad Grid */}
            <div className="grid grid-cols-3 gap-3 sm:gap-4 select-none">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                <button
                  key={`finish-numpad-${digit}`}
                  onClick={() => handleNumpadPress(digit)}
                  className="py-5 sm:py-6 rounded-2xl bg-slate-800 hover:bg-slate-750 active:scale-95 text-3xl font-mono font-black text-white border border-slate-700 shadow-md transition"
                >
                  {digit}
                </button>
              ))}

              <button
                onClick={handleClear}
                className="py-5 sm:py-6 rounded-2xl bg-slate-850 hover:bg-slate-800 text-xs font-bold text-slate-400 uppercase tracking-wider border border-slate-700 active:scale-95 transition"
              >
                WISSEN
              </button>

              <button
                onClick={() => handleNumpadPress('0')}
                className="py-5 sm:py-6 rounded-2xl bg-slate-800 hover:bg-slate-750 active:scale-95 text-3xl font-mono font-black text-white border border-slate-700 shadow-md transition"
              >
                0
              </button>

              <button
                onClick={handleBackspace}
                className="py-5 sm:py-6 rounded-2xl bg-slate-850 hover:bg-slate-800 active:scale-95 text-slate-300 border border-slate-700 flex items-center justify-center transition"
                title="Wissen"
              >
                <Delete className="w-7 h-7" />
              </button>
            </div>
          </div>

          {/* Giant Finish Trigger Button */}
          <div className="mt-5">
            <button
              onClick={handleFinishTrigger}
              disabled={isSubmitting || !bibString}
              className="w-full py-5 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-black text-xl sm:text-2xl shadow-2xl shadow-amber-500/25 active:scale-98 transition disabled:opacity-40 uppercase tracking-wider flex items-center justify-center gap-3"
            >
              <Flag className="w-7 h-7 stroke-[2.5]" />
              <span>FINISH NU VASTLEGGEN</span>
            </button>
          </div>

          {feedback && (
            <div
              className={`mt-4 p-3 rounded-lg text-xs font-semibold flex items-center gap-2 ${
                feedback.type === 'success'
                  ? 'bg-emerald-950/60 border border-emerald-500/40 text-emerald-300'
                  : feedback.type === 'conflict'
                  ? 'bg-red-950/60 border border-red-500/40 text-red-300'
                  : 'bg-amber-950/60 border border-amber-500/40 text-amber-300'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{feedback.text}</span>
            </div>
          )}
        </div>

        {/* Right: Live Finish Ticker / Feed */}
        <div className="lg:col-span-6 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Flag className="w-4 h-4 text-amber-400" /> Recente Finishes Feed
            </h3>
            <span className="text-xs text-slate-400 font-mono">Laatste 10 doorkomsten</span>
          </div>

          {recentFinishes.length === 0 ? (
            <p className="text-xs text-slate-500 italic p-8 text-center">
              Nog geen finishes geregistreerd
            </p>
          ) : (
            <div className="space-y-2.5 max-h-[580px] overflow-y-auto pr-1">
              {recentFinishes.map((rec) => {
                const p = participants.find((item) => item.bibNumber === rec.bibNumber);

                return (
                  <div
                    key={rec.id}
                    className="p-3.5 rounded-xl bg-slate-850 border border-slate-750 flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-3.5">
                      <div className="w-11 h-11 rounded-xl bg-amber-500 text-slate-950 font-mono font-black text-lg flex items-center justify-center shadow">
                        #{rec.bibNumber}
                      </div>
                      <div>
                        <span className="font-bold text-white text-sm block">
                          {p ? `${p.firstName} ${p.lastName}` : `Deelnemer #${rec.bibNumber}`}
                        </span>
                        <span className="text-slate-400 text-xs font-mono">
                          {categories.find(c => c.id === p?.categoryId)?.name || 'Cat'} • {rec.deviceId} ({rec.operatorId})
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <span className="font-mono font-black text-emerald-400 text-sm block">
                          {formatLocalTime(rec.timestamp, true)}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {new Date(rec.timestamp).toLocaleDateString('nl-BE')}
                        </span>
                      </div>

                      <button
                        onClick={() => handleOpenUndoFinish(rec)}
                        className="p-2 rounded-lg bg-slate-750 hover:bg-red-950/60 text-slate-400 hover:text-red-300 border border-slate-700 hover:border-red-600/40 transition"
                        title="Finish ongedaan maken met verplichte reden"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Confirmation Modal if quickFinish is off (Requirement 17) */}
      {confirmModalBib !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-sm w-full text-center space-y-4 shadow-2xl">
            <h3 className="text-lg font-bold text-white">Bevestig Finishtijd</h3>
            <div className="text-4xl font-mono font-black text-amber-400">
              Bib #{confirmModalBib}
            </div>
            {matchedParticipant && (
              <div className="p-2.5 rounded-xl bg-slate-850 border border-slate-750 text-xs">
                <span className="font-bold text-white block text-sm">
                  {matchedParticipant.firstName} {matchedParticipant.lastName}
                </span>
                <span className="text-slate-400 font-medium">
                  {categories.find(c => c.id === matchedParticipant.categoryId)?.name || 'Cat'} • Wave {waves.find(w => w.id === matchedParticipant.waveId)?.name || '1'}
                </span>
              </div>
            )}

            {capturedTime && (
              <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-xs">
                <span className="text-emerald-400 font-mono font-black text-base block">
                  {formatLocalTime(capturedTime.iso, true)}
                </span>
                <span className="text-[10px] text-emerald-300 font-semibold mt-0.5 block">
                  ✓ T1 bevroren bij invoer. Bevestigen veroorzaakt géén vertraging in wedstrijdtijd (Req 17).
                </span>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => {
                  setConfirmModalBib(null);
                  setCapturedTime(null);
                }}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition"
              >
                Annuleren (ESC)
              </button>
              <button
                onClick={() => executeFinish(confirmModalBib, false, capturedTime || undefined)}
                className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs uppercase tracking-wider shadow transition"
              >
                Bevestigen (ENTER)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Undo Finish Record Modal */}
      {undoingRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-750 rounded-2xl p-6 max-w-sm w-full space-y-4 text-white shadow-2xl">
            <h3 className="text-base font-bold text-amber-400">Finishtijd Annuleren (Undo)</h3>
            <p className="text-xs text-slate-300">
              U staat op het punt de finishregistratie voor <strong className="text-white font-mono">Bib #{undoingRecord.bibNumber}</strong> te annuleren.
            </p>

            {undoError && (
              <div className="p-2.5 rounded-lg bg-red-950/60 border border-red-800/60 text-red-300 text-xs font-semibold">
                {undoError}
              </div>
            )}

            <div>
              <label className="text-xs text-slate-300 block mb-1">
                Verplichte reden van annulering:
              </label>
              <input
                type="text"
                autoFocus
                value={undoReason}
                onChange={(e) => setUndoReason(e.target.value)}
                placeholder="bv. Verkeerd startnummer ingetikt"
                className="w-full bg-slate-850 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setUndoingRecord(null);
                  setUndoError(null);
                }}
                className="flex-1 py-2 rounded-xl bg-slate-800 text-slate-400 text-xs font-bold"
              >
                Annuleren
              </button>
              <button
                type="button"
                onClick={handleConfirmUndoFinish}
                className="flex-1 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold"
              >
                Bevestig Annulering
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
