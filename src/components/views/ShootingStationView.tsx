import { effectiveShooting, shootingPenalty } from '../../services/shootingRules';
import React, { useEffect, useState } from 'react';
import { Crosshair, CheckCircle2, AlertCircle, RotateCcw, Edit2, ShieldAlert, Maximize2, Minimize2 } from 'lucide-react';
import type { Category, Participant, ShootingResult, RaceEvent, RaceProfile } from '../../types';
import { db } from '../../db/dexieDb';
import { operationService } from '../../services/operationService';
import { soundService } from '../../services/soundService';
import { formatLocalTime } from '../../services/timingEngine';

interface ShootingStationViewProps {
  categories: Category[];
  event: RaceEvent | null;
  participants: Participant[];
  shootingResults: ShootingResult[];
  raceProfiles: RaceProfile[];
  onRefresh: () => void;
}

export const ShootingStationView: React.FC<ShootingStationViewProps> = ({
  categories,
  event,
  participants,
  shootingResults,
  raceProfiles,
  onRefresh,
}) => {
  const [stationName, setStationName] = useState('Stand 1');
  const [simpleMode, setSimpleMode] = useState(() => localStorage.getItem('shooting_simple_mode') === 'true');
  const [bibInput, setBibInput] = useState('');
  const [roundNumber, setRoundNumber] = useState<number>(1);
  const [targets, setTargets] = useState<boolean[]>(() => Array(5).fill(true)); // true = hit, false = miss
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; type: 'success' | 'warn' } | null>(null);
  const [finishNotice, setFinishNotice] = useState<string | null>(null);

  useEffect(() => {
    const loadDeviceIdentity = async () => {
      const device = await db.devices.toCollection().first();
      if (device) {
        operationService.setDeviceAndOperator(device.id, device.operatorName || 'Operator');
      }
    };
    loadDeviceIdentity();
  }, []);

  useEffect(() => {
    if (!simpleMode) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [simpleMode]);

  const toggleSimpleMode = () => {
    setSimpleMode((current) => {
      const next = !current;
      localStorage.setItem('shooting_simple_mode', String(next));
      if (next) {
        document.documentElement.requestFullscreen?.().catch(() => {});
      } else if (document.fullscreenElement) {
        document.exitFullscreen?.().catch(() => {});
      }
      return next;
    });
  };

  // Correction state
  const [editingResult, setEditingResult] = useState<ShootingResult | null>(null);
  const [editHits, setEditHits] = useState(5);
  const [editReason, setEditReason] = useState('');
  const [editError, setEditError] = useState<string | null>(null);

  // Duplicate conflict state (Req 21)
  const [duplicateConflict, setDuplicateConflict] = useState<{
    existing: ShootingResult;
    newHits: number;
    newMisses: number;
    reason: string;
  } | null>(null);

  const penaltyPerMiss = event?.penaltySecondsPerMiss || 20;

  // Matched participant
  const parsedBib = parseInt(bibInput.trim(), 10);
  const matchedParticipant = !isNaN(parsedBib)
    ? participants.find((p) => p.bibNumber === parsedBib)
    : undefined;

  const activeProfile = raceProfiles.find((profile) => profile.id === matchedParticipant?.raceProfileId);
  const shootingLegs = activeProfile?.legs.filter((leg) => leg.type === 'SHOOT') || [];
  const shootingRounds = shootingLegs.length > 0
    ? shootingLegs
    : [{ id: 'fallback-shoot-1', type: 'SHOOT' as const, name: 'Schietproef 1' }, { id: 'fallback-shoot-2', type: 'SHOOT' as const, name: 'Schietproef 2' }];
  const completedRounds = matchedParticipant
    ? effectiveShooting(shootingResults).effective
        .filter((result) => result.participantId === matchedParticipant.id && !result.isCorrected)
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    : [];
  const completedRoundMap = new Map<number, ShootingResult>();
  completedRounds.forEach((result) => completedRoundMap.set(result.round, result));
  const completedRoundResults = [...completedRoundMap.values()].sort((a, b) => a.round - b.round);
  const selectedShootingLeg = shootingRounds[roundNumber - 1];
  const targetCount = Math.max(1, Number(selectedShootingLeg?.shotCount) || 5);
  const hits = targets.filter(Boolean).length;
  const misses = Math.max(0, targetCount - hits);
  const totalPenaltySec = shootingPenalty(activeProfile, roundNumber, misses, penaltyPerMiss).seconds;
  const allShootingDone = matchedParticipant !== undefined
    && shootingRounds.length > 0
    && shootingRounds.every((_, index) => completedRoundMap.has(index + 1));

  useEffect(() => {
    setTargets(Array(targetCount).fill(true));
  }, [matchedParticipant?.id, roundNumber, selectedShootingLeg?.id, targetCount]);

  useEffect(() => {
    if (!matchedParticipant || shootingRounds.length === 0) return;
    const nextRound = shootingRounds.findIndex((_, index) => !completedRoundMap.has(index + 1));
    setRoundNumber(nextRound >= 0 ? nextRound + 1 : shootingRounds.length);
  }, [matchedParticipant?.id]);

  useEffect(() => {
    if (bibInput) setFinishNotice(null);
  }, [bibInput]);

  const selectRound = (round: number) => {
    setRoundNumber(round);
    const nextTargetCount = Math.max(1, Number(shootingRounds[round - 1]?.shotCount) || 5);
    setTargets(Array(nextTargetCount).fill(true));
  };

  // Toggle individual target circle
  const toggleTarget = (index: number) => {
    const next = [...targets];
    next[index] = !next[index];
    setTargets(next);
    if (next[index]) {
      soundService.playSuccess();
    } else {
      soundService.playWarning();
    }
  };

  // Quick preset buttons for the configured number of targets.
  const setPreset = (hitCount: number) => {
    const next = Array(targetCount).fill(false).map((_, i) => i < hitCount);
    setTargets(next);
    if (hitCount === 5) soundService.playSuccess();
    else soundService.playWarning();
  };

  const handleRecordShooting = async (e?: React.FormEvent, forceExtra = false) => {
    e?.preventDefault?.();
    if (isNaN(parsedBib) || parsedBib <= 0) {
      setFeedback({ text: 'Voer een geldig startnummer in', type: 'warn' });
      soundService.playWarning();
      return;
    }

    // Check duplicate round (Req 21)
    if (!forceExtra) {
      const existing = shootingResults.find(
        (r) => (matchedParticipant ? r.participantId === matchedParticipant.id : r.bibNumber === parsedBib)
          && r.round === roundNumber
          && !r.isCorrected
      );
      if (existing) {
        soundService.playWarning();
        setDuplicateConflict({
          existing,
          newHits: hits,
          newMisses: misses,
          reason: '',
        });
        return;
      }
    }

    setIsSubmitting(true);
    try {
      await operationService.recordShooting(
        event?.id || 'event-de-haan-2026',
        matchedParticipant || {
          id: `unknown-${parsedBib}`,
          firstName: 'Onbekend',
          lastName: `#${parsedBib}`,
          categoryId: '',
          raceProfileId: '',
          bibNumber: parsedBib,
          status: 'STARTED',
          createdAt: '',
          updatedAt: '',
        },
        roundNumber,
        stationName,
        targetCount,
        hits,
        misses,
        targets
      );

      soundService.playSuccess();
      setFeedback({
        text: `Schietronde ${roundNumber} opgeslagen voor Bib #${parsedBib}: ${hits}/${targetCount} treffers (+${totalPenaltySec}s straf)`,
        type: 'success',
      });

      // Reset form for next runner
      setBibInput('');
      setTargets(Array(targetCount).fill(true));
      setDuplicateConflict(null);
      const completedRoundNumbersAfterSave = new Set(completedRoundMap.keys());
      completedRoundNumbersAfterSave.add(roundNumber);
      const completedAfterSave = Boolean(matchedParticipant)
        && shootingRounds.every((_, index) => completedRoundNumbersAfterSave.has(index + 1));
      setFinishNotice(completedAfterSave && matchedParticipant
        ? `Deelnemer #${parsedBib} – ${matchedParticipant.firstName} ${matchedParticipant.lastName} moet naar de FINISH!`
        : null);
      onRefresh();
      setTimeout(() => setFeedback(null), 3500);
    } catch (err: any) {
      setFeedback({ text: `Fout bij opslaan: ${err?.message}`, type: 'warn' });
      soundService.playError();
    } finally {
      setIsSubmitting(false);
    }
  };

  // Resolve duplicate via Correction (Req 21)
  const handleResolveConflictCorrection = async () => {
    if (!duplicateConflict) return;
    if (!duplicateConflict.reason.trim()) {
      soundService.playWarning();
      setFeedback({ text: 'Een reden van correctie is verplicht (Req 21 & 44)', type: 'warn' });
      return;
    }

    setIsSubmitting(true);
    try {
      const p = participants.find((item) => item.bibNumber === duplicateConflict.existing.bibNumber) || {
        id: duplicateConflict.existing.participantId,
        firstName: 'Deelnemer',
        lastName: `#${duplicateConflict.existing.bibNumber}`,
        categoryId: '',
        raceProfileId: '',
        bibNumber: duplicateConflict.existing.bibNumber,
        status: 'STARTED',
        createdAt: '',
        updatedAt: '',
      };

      // Record corrected shooting
      await operationService.recordShooting(
        event?.id || 'event-de-haan-2026',
        p,
        duplicateConflict.existing.round,
        stationName,
        targetCount,
        duplicateConflict.newHits,
        duplicateConflict.newMisses,
        undefined,
        true,
        duplicateConflict.reason
      );

      soundService.playSuccess();
      setFeedback({
        text: `Ronde ${duplicateConflict.existing.round} gecorrigeerd voor Bib #${duplicateConflict.existing.bibNumber} (${duplicateConflict.newHits}/${targetCount}).`,
        type: 'success',
      });

      setBibInput('');
      setTargets(Array(targetCount).fill(true));
      setDuplicateConflict(null);
      onRefresh();
      setTimeout(() => setFeedback(null), 3500);
    } catch (err: any) {
      setFeedback({ text: `Fout bij correctie: ${err?.message}`, type: 'warn' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Save correction
  const handleSaveCorrection = async () => {
    if (!editingResult) return;
    if (!editReason.trim()) {
      soundService.playWarning();
      setEditError('Een reden van correctie is verplicht (Req 44)');
      return;
    }

    const newMisses = editingResult.shots - editHits;
    const p = participants.find((item) => item.id === editingResult.participantId);

    if (p) {
      await operationService.recordShooting(
        event?.id || 'event-de-haan-2026',
        p,
        editingResult.round,
        editingResult.station,
        editingResult.shots,
        editHits,
        newMisses,
        undefined,
        true,
        editReason
      );
    }

    soundService.playSuccess();
    setEditingResult(null);
    setEditReason('');
    setEditError(null);
    onRefresh();
  };

  // Recent shooting feed
  const recentShooting = [...shootingResults]
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 10);

  return (
    <div className="space-y-6">
      {/* Station Selector Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="text-xs font-mono uppercase tracking-widest text-blue-400 font-bold flex items-center gap-1.5">
            <Crosshair className="w-4 h-4" /> Schietstand Post
          </span>
          <h2 className="text-2xl font-black text-white tracking-tight mt-0.5">
            Schietproef Registratie
          </h2>
        </div>

        <div className="flex items-center gap-3">
          <label className="text-xs text-slate-400 font-semibold">Schietstand Nummer:</label>
          <select
            value={stationName}
            onChange={(e) => setStationName(e.target.value)}
            className="bg-slate-850 border border-slate-700 rounded-xl px-4 py-2 text-sm text-white font-bold focus:outline-none focus:border-blue-500"
          >
            {Array.from({ length: 12 }).map((_, i) => (
              <option key={`shooting-stand-opt-${i + 1}`} value={`Stand ${i + 1}`}>
                Stand {i + 1}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={toggleSimpleMode}
            title={simpleMode ? 'Terug naar gewone schietstand' : 'Open volledige juryweergave'}
            aria-label={simpleMode ? 'Terug naar gewone modus' : 'Open volledige modus'}
            className="w-11 h-11 rounded-xl bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-700 flex items-center justify-center transition"
          >
            {simpleMode ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {simpleMode && (
        <div className="fixed inset-0 z-50 w-screen h-[100dvh] overflow-hidden bg-slate-950 p-3 sm:p-5">
          <div className="mx-auto flex h-full w-full max-w-xl flex-col gap-2 sm:gap-3 overflow-y-auto pr-1">
          <div className="flex items-center justify-between">
            <div>
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">Jury-invoer</span>
            <h3 className="text-xl sm:text-2xl font-black text-white mt-1">Snelle schietproef</h3>
            <p className="text-xs text-slate-400 mt-1">Kies het nummer, het resultaat en bevestig.</p>
            </div>
            <button
              type="button"
              onClick={toggleSimpleMode}
              title="Terug naar gewone modus"
              aria-label="Terug naar gewone modus"
              className="w-11 h-11 shrink-0 rounded-xl bg-slate-800 text-slate-200 border border-slate-700 flex items-center justify-center"
            >
              <Minimize2 className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-3">
            <div className="w-full min-h-20 rounded-2xl bg-slate-900 border-2 border-emerald-500/60 flex items-center justify-center text-5xl font-mono font-black text-white tracking-widest">
              {bibInput || '—'}
            </div>
            {matchedParticipant && (
              <p className="text-center text-sm text-emerald-400 font-bold">
                {matchedParticipant.firstName} {matchedParticipant.lastName}
              </p>
            )}

            <div className="grid grid-cols-3 gap-2 max-w-xs mx-auto">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((number) => (
                <button
                  key={number}
                  type="button"
                  onClick={() => setBibInput((current) => `${current}${number}`.slice(0, 4))}
                  className="min-h-11 sm:min-h-14 rounded-xl bg-slate-800 border border-slate-700 text-2xl font-black text-white active:scale-95 hover:bg-slate-700"
                >
                  {number}
                </button>
              ))}
              <button type="button" onClick={() => setBibInput('')} className="min-h-11 sm:min-h-14 rounded-xl bg-red-950/60 border border-red-800 text-red-300 font-bold active:scale-95">Wis</button>
              <button type="button" onClick={() => setBibInput((current) => `${current}0`.slice(0, 4))} className="min-h-11 sm:min-h-14 rounded-xl bg-slate-800 border border-slate-700 text-2xl font-black text-white active:scale-95 hover:bg-slate-700">0</button>
              <button type="button" onClick={() => setBibInput((current) => current.slice(0, -1))} className="min-h-11 sm:min-h-14 rounded-xl bg-slate-800 border border-slate-700 text-xl font-black text-amber-300 active:scale-95">⌫</button>
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-xs text-slate-300 font-bold flex flex-wrap items-center justify-between gap-2">
              <span>Profiel: <span className="text-emerald-400">{activeProfile?.name || 'Standaard schietproeven'}</span></span>
              <span>{targetCount} doelen in proef {roundNumber}</span>
            </div>
            <div className="text-xs text-slate-300 font-bold">
              Alle schietproeven ({shootingRounds.length})
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-1">
                {shootingRounds.map((leg, index) => {
                  const round = index + 1;
                  const previousResult = completedRoundMap.get(round);
                  return (
                    <button key={leg.id} type="button" onClick={() => selectRound(round)} className={`py-2 rounded-xl font-bold border text-left px-2 ${roundNumber === round ? 'bg-blue-600 text-white border-blue-400' : previousResult ? 'bg-emerald-950/70 text-emerald-300 border-emerald-700' : 'bg-slate-800 text-slate-300 border-slate-700'}`}>
                      <span className="block">{previousResult ? '✓ ' : ''}Proef {round}</span>
                      <span className="block text-[10px] font-normal truncate">{leg.name}</span>
                      {previousResult && (
                        <span className="block text-[10px] mt-1">{previousResult.hits}/{previousResult.shots} raak • {previousResult.misses} mis</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {matchedParticipant && (
            <div className={`rounded-xl border p-3 text-center text-sm font-black ${allShootingDone ? 'bg-emerald-950/70 border-emerald-400 text-emerald-300' : 'bg-slate-900 border-slate-700 text-slate-300'}`}>
              {allShootingDone ? 'Alle schietproeven gedaan — deze deelnemer moet naar de FINISH!' : `${completedRoundMap.size}/${shootingRounds.length} schietproeven afgewerkt`}
            </div>
          )}

          <div className="grid grid-cols-5 gap-2 sm:gap-3">
            {targets.map((isHit, index) => (
              <button
                key={index}
                type="button"
                onClick={() => toggleTarget(index)}
                aria-label={`Doel ${index + 1}: ${isHit ? 'raak' : 'gemist'}`}
                className={`aspect-square rounded-full text-xs sm:text-sm font-black border-4 active:scale-95 transition ${isHit ? 'bg-emerald-500 text-slate-950 border-emerald-300' : 'bg-red-600 text-white border-red-300'}`}
              >
                <span className="block text-lg">{index + 1}</span>
                <span className="block text-[9px] uppercase">{isHit ? 'Raak' : 'Gemist'}</span>
              </button>
            ))}
          </div>

          <p className="text-center text-sm font-bold text-slate-300">
            {hits}/{targetCount} raak, {misses} gemist
          </p>

          <button
            type="button"
            onClick={() => handleRecordShooting()}
            disabled={isSubmitting || !bibInput.trim()}
            className="w-full min-h-16 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-lg active:scale-95 transition disabled:opacity-40"
          >
            BEVESTIG EN SLA OP
          </button>

          {feedback && (
            <div className={`p-3 rounded-xl text-sm font-bold text-center ${feedback.type === 'success' ? 'bg-emerald-950/60 text-emerald-300' : 'bg-amber-950/60 text-amber-300'}`}>
              {feedback.text}
            </div>
          )}
          {finishNotice && (
            <div className="rounded-xl border-2 border-emerald-400 bg-emerald-500 p-4 text-center text-lg font-black text-slate-950">
              {finishNotice}
            </div>
          )}
          </div>
        </div>
      )}

      {/* Main Touch Input Form */}
      <div className={`grid grid-cols-1 lg:grid-cols-12 gap-6 ${simpleMode ? 'hidden' : ''}`}>
        {/* Left: Interactive Target Board */}
        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
          <form onSubmit={handleRecordShooting} className="space-y-6">
            {/* Bib Input & Round Selector */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-slate-400 font-semibold block mb-1">
                  Startnummer (Bib):
                </label>
                <input
                  type="number"
                  value={bibInput}
                  onChange={(e) => setBibInput(e.target.value)}
                  placeholder="Voer startnummer in..."
                  autoFocus
                  className="w-full bg-slate-850 border border-slate-700 rounded-xl px-4 py-3 text-2xl font-mono font-bold text-white focus:outline-none focus:border-blue-500"
                />
                {matchedParticipant ? (
                  <span className="text-xs text-emerald-400 font-semibold mt-1 block">
                    ✓ {matchedParticipant.firstName} {matchedParticipant.lastName} (
                    {categories.find(c => c.id === matchedParticipant.categoryId)?.name || 'Cat'})
                  </span>
                ) : bibInput ? (
                  <span className="text-xs text-amber-400 font-semibold mt-1 block">
                    ⚠ Onbekend startnummer (wordt als noodrecord gelogd)
                  </span>
                ) : null}
              </div>

              <div>
                <label className="text-xs text-slate-400 font-semibold block mb-1">
                  Schietproeven uit profiel {activeProfile ? `“${activeProfile.name}”` : ''}:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {shootingRounds.map((leg, index) => {
                    const round = index + 1;
                    const previousResult = completedRoundMap.get(round);
                    const stance = leg.stance === 'prone' ? 'Liggend' : leg.stance === 'standing' ? 'Staand' : leg.stance === 'free' ? 'Vrij' : '';
                    return (
                      <button
                        key={leg.id}
                        type="button"
                        onClick={() => selectRound(round)}
                        className={`py-3 px-3 rounded-xl font-bold text-xs border transition text-left ${
                          roundNumber === round
                            ? 'bg-blue-600 text-white border-blue-500 shadow-md'
                            : previousResult
                            ? 'bg-emerald-950/70 text-emerald-300 border-emerald-700'
                            : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-750'
                        }`}
                      >
                        <span className="block uppercase tracking-wider">
                          {previousResult ? '✓ ' : ''}Proef {round}{stance ? ` — ${stance}` : ''}
                        </span>
                        <span className="block mt-1 text-[10px] font-normal truncate">{leg.name}</span>
                        {previousResult && (
                          <span className="block mt-1 text-[10px] font-bold">
                            Vorig resultaat: {previousResult.hits}/{previousResult.shots} raak, {previousResult.misses} mis
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {matchedParticipant && completedRoundResults.length > 0 && (
              <div className="rounded-xl border border-emerald-800/70 bg-emerald-950/20 p-3">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-300">Vorige schietresultaten</span>
                  <span className="text-[11px] text-slate-400">{completedRoundMap.size}/{shootingRounds.length} afgewerkt</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {completedRoundResults.map((result) => (
                    <div key={`participant-round-${result.id}`} className="rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-xs flex items-center justify-between gap-3">
                      <div>
                        <span className="font-bold text-white block">Proef {result.round}: {shootingRounds[result.round - 1]?.name || `Schietproef ${result.round}`}</span>
                        <span className="text-[10px] text-slate-500">{formatLocalTime(result.timestamp, true)} • {result.station}</span>
                      </div>
                      <span className="font-mono font-black text-emerald-400 whitespace-nowrap">{result.hits}/{result.shots} raak</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {matchedParticipant && allShootingDone && (
              <div className="rounded-xl border-2 border-emerald-400 bg-emerald-500 p-4 text-center text-base font-black text-slate-950">
                Alle schietproeven zijn afgewerkt — deze deelnemer moet naar de FINISH!
              </div>
            )}

            {/* 5 Big Touch Target Circles (Biathlon Stijl) */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Tik op doelschijf om te wisselen (Treffer / Misser)
                </span>
                <span className="text-xs font-mono font-bold text-amber-400">
                  {hits}/{targetCount} Treffers • {misses} Misser{misses !== 1 ? 's' : ''} (+{totalPenaltySec}s)
                </span>
              </div>

              <div className="grid grid-cols-5 gap-2 sm:gap-4 p-4 bg-slate-950 rounded-2xl border border-slate-800">
                {targets.map((isHit, idx) => (
                  <button
                    key={`target-circle-${idx}`}
                    type="button"
                    onClick={() => toggleTarget(idx)}
                    className={`aspect-square rounded-full flex flex-col items-center justify-center border-4 shadow-xl active:scale-95 transition-all select-none ${
                      isHit
                        ? 'bg-white border-emerald-500 text-slate-950 shadow-emerald-500/20'
                        : 'bg-slate-900 border-slate-700 text-red-400'
                    }`}
                  >
                    <span className="text-xl sm:text-2xl font-black">{idx + 1}</span>
                    <span
                      className={`text-[10px] font-bold uppercase ${
                        isHit ? 'text-emerald-700' : 'text-red-400'
                      }`}
                    >
                      {isHit ? 'RAAK' : 'MIS'}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Quick Hit Preset Buttons */}
            <div>
              <span className="text-xs font-semibold text-slate-400 block mb-2">
                Of kies direct aantal treffers (1-touch):
              </span>
              <div className="grid grid-cols-6 gap-2">
                {[5, 4, 3, 2, 1, 0].map((h) => (
                  <button
                    key={`preset-hits-${h}`}
                    type="button"
                    onClick={() => setPreset(h)}
                    className={`py-2.5 rounded-lg text-xs font-bold transition border ${
                      hits === h
                        ? 'bg-amber-500 text-slate-950 border-amber-400 shadow'
                        : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-750'
                    }`}
                  >
                    {h}/5
                  </button>
                ))}
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting || !bibInput.trim()}
              className="w-full py-4 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-black text-base shadow-xl shadow-blue-500/25 active:scale-98 transition disabled:opacity-40 uppercase tracking-wider"
            >
              SCHIETBEURT OPSLAAN ({hits}/{targetCount} TREFFERS)
            </button>
          </form>

          {feedback && (
            <div
              className={`p-3 rounded-lg text-xs font-semibold flex items-center gap-2 ${
                feedback.type === 'success'
                  ? 'bg-emerald-950/60 border border-emerald-500/40 text-emerald-300'
                  : 'bg-amber-950/60 border border-amber-500/40 text-amber-300'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{feedback.text}</span>
            </div>
          )}
          {finishNotice && (
            <div className="rounded-xl border-2 border-emerald-400 bg-emerald-500 p-4 text-center text-base font-black text-slate-950">
              {finishNotice}
            </div>
          )}
        </div>

        {/* Right: Recent Shooting Feed with Edit Mode */}
        <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Crosshair className="w-4 h-4 text-blue-400" /> Recente Schietresultaten
          </h3>

          {/* Edit Modal / Inline form if active */}
          {editingResult && (
            <div className="p-4 bg-blue-950/30 border border-blue-500/40 rounded-xl space-y-3 text-xs">
              <span className="font-bold text-white block">
                Correctie voor Bib #{editingResult.bibNumber} (Ronde {editingResult.round})
              </span>
              {editError && (
                <div className="p-2 rounded bg-red-950/60 border border-red-800/60 text-red-300 font-semibold">
                  {editError}
                </div>
              )}
              <div>
                <label className="text-slate-300 block mb-1">Gewijzigde Treffers (0-{editingResult.shots}):</label>
                <div className="flex gap-2">
                  {Array.from({ length: editingResult.shots + 1 }, (_, index) => editingResult.shots - index).map((h) => (
                    <button
                      key={`edit-preset-hits-${h}`}
                      type="button"
                      onClick={() => setEditHits(h)}
                      className={`px-2.5 py-1 rounded text-xs font-bold border ${
                        editHits === h
                          ? 'bg-blue-600 text-white border-blue-500'
                          : 'bg-slate-800 text-slate-300 border-slate-700'
                      }`}
                    >
                      {h}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-slate-300 block mb-1">
                  Reden van correctie <span className="text-red-400">*</span>:
                </label>
                <input
                  type="text"
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                  placeholder="bv. Schijf 3 alsnog geteld na inspectie"
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-white"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setEditingResult(null)}
                  className="px-3 py-1 rounded bg-slate-800 text-slate-400"
                >
                  Annuleren
                </button>
                <button
                  onClick={handleSaveCorrection}
                  className="px-3 py-1 rounded bg-blue-600 font-bold text-white"
                >
                  Correctie Opslaan
                </button>
              </div>
            </div>
          )}

          {recentShooting.length === 0 ? (
            <p className="text-xs text-slate-500 italic p-6 text-center">
              Nog geen schietbeurten gelogd
            </p>
          ) : (
            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
              {recentShooting.map((res) => {
                const p = participants.find((item) => item.id === res.participantId);

                return (
                  <div
                    key={res.id}
                    className="p-3 rounded-lg bg-slate-800/60 border border-slate-700/60 flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-8 h-8 rounded-lg bg-blue-500/20 border border-blue-500/40 font-mono font-bold text-blue-400 flex items-center justify-center">
                        #{res.bibNumber}
                      </span>
                      <div>
                        <span className="font-bold text-white block">
                          {p ? `${p.firstName} ${p.lastName}` : `Bib #${res.bibNumber}`}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          Ronde {res.round} ({res.station}) • {formatLocalTime(res.timestamp, true)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <span className="font-mono font-bold text-emerald-400 block">
                          {res.hits}/{res.shots} Treffers
                        </span>
                        <span className="text-[10px] text-red-400 font-semibold">
                          +{res.misses * penaltyPerMiss}s straf
                        </span>
                      </div>
                      <button
                        onClick={() => {
                          setEditingResult(res);
                          setEditHits(res.hits);
                        }}
                        className="p-1.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-300 transition"
                        title="Corrigeer schietresultaat"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* DUPLICATE SCHIETREGISTRATIE MODAL (Requirement 21) */}
      {duplicateConflict && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border-2 border-amber-500/70 rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-5 text-white">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-black text-white">
                  ⚠ RONDE {duplicateConflict.existing.round} IS REEDS GEREGISTREERD
                </h3>
                <span className="text-xs text-amber-300 font-semibold">
                  Deelnemer Bib #{duplicateConflict.existing.bibNumber} heeft al een registratie voor deze ronde.
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs bg-slate-950 p-4 rounded-xl border border-slate-800">
              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-700/60">
                <span className="text-slate-400 font-bold block mb-1 uppercase tracking-wider text-[10px]">
                  Bestaande Registratie:
                </span>
                <p className="font-mono font-bold text-white text-sm">
                  {duplicateConflict.existing.hits} hits, {duplicateConflict.existing.misses} missers
                </p>
                <p className="text-[11px] text-slate-400 mt-1">
                  Tijd: {formatLocalTime(duplicateConflict.existing.timestamp, true)}
                </p>
                <p className="text-[11px] text-slate-400">
                  Stand: {duplicateConflict.existing.station}
                </p>
              </div>

              <div className="p-2.5 rounded-lg bg-blue-950/40 border border-blue-500/40">
                <span className="text-blue-300 font-bold block mb-1 uppercase tracking-wider text-[10px]">
                  Nieuwe Registratie:
                </span>
                <p className="font-mono font-bold text-emerald-400 text-sm">
                  {duplicateConflict.newHits} hits, {duplicateConflict.newMisses} missers
                </p>
                <p className="text-[11px] text-slate-300 mt-1">
                  Stand: {stationName}
                </p>
                <p className="text-[11px] text-slate-300">
                  Straf: +{duplicateConflict.newMisses * penaltyPerMiss}s
                </p>
              </div>
            </div>

            {/* Optional Correction Reason input */}
            <div>
              <label className="text-xs text-slate-300 font-semibold block mb-1">
                Reden bij correctie (verplicht voor CORRIGEREN):
              </label>
              <input
                type="text"
                value={duplicateConflict.reason}
                onChange={(e) =>
                  setDuplicateConflict({ ...duplicateConflict, reason: e.target.value })
                }
                placeholder="bv. Schietkaart herbekeken, doelschijf 2 geteld"
                className="w-full bg-slate-850 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
              />
            </div>

            {/* 3 Explicit Buttons from Requirement 21 */}
            <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setDuplicateConflict(null)}
                className="flex-1 py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs uppercase tracking-wider transition text-center"
              >
                ANNULEREN
              </button>

              <button
                type="button"
                onClick={handleResolveConflictCorrection}
                className="flex-1 py-2.5 px-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs uppercase tracking-wider transition text-center shadow"
              >
                CORRIGEREN
              </button>

              <button
                type="button"
                onClick={(e) => handleRecordShooting(e, true)}
                className="flex-1 py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs uppercase tracking-wider transition text-center shadow"
              >
                TOEVOEGEN ALS EXTRA
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
