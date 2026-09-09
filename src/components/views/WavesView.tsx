import React, { useEffect, useState } from 'react';
import {
  Layers,
  Clock,
  Users,
  Plus,
  Edit2,
  Trash2,
  Check,
  X,
  UserPlus,
  UserMinus,
  AlertCircle,
} from 'lucide-react';
import type { Wave, Category, Participant } from '../../types';
import { db, getActiveEventId } from '../../db/dexieDb';
import { generateUUID, operationService } from '../../services/operationService';
import { WavePlanningPanel } from '../WavePlanningPanel';
import { defaultWaveSettings, nextWaveTime, timeSeconds, waveAllows, type WaveSettings } from '../../services/wavePlanning';
import { soundService } from '../../services/soundService';
import { SafeConfirmButton } from '../SafeConfirmButton';

interface WavesViewProps {
  waves: Wave[];
  categories: Category[];
  participants: Participant[];
  onRefresh: () => void;
}

export const WavesView: React.FC<WavesViewProps> = ({
  waves,
  categories,
  participants,
  onRefresh,
}) => {
  const [waveSettings, setWaveSettings] = useState<WaveSettings>(defaultWaveSettings);
  const [participantSearch, setParticipantSearch] = useState('');
  const [assignmentError, setAssignmentError] = useState('');
  const [assignmentBusy, setAssignmentBusy] = useState(false);
  useEffect(() => { void db.events.toCollection().first().then(event => setWaveSettings(event?.waveSettings ?? defaultWaveSettings)).catch(error => setAssignmentError(error.message)); }, []);
  const matchesSearch = (p: Participant) => `${p.firstName} ${p.lastName} ${p.bibNumber ?? ''} ${p.article ?? p.stamhoofdRegistration?.product ?? ''} ${categories.find(c => c.id === p.categoryId)?.name ?? ''}`.toLowerCase().includes(participantSearch.trim().toLowerCase());
  const [editingWave, setEditingWave] = useState<Wave | null>(null);
  const [managingParticipantsWave, setManagingParticipantsWave] = useState<Wave | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  // Add modal state
  const [newWaveName, setNewWaveName] = useState('');
  const [newStartTime, setNewStartTime] = useState('10:00:00');
  const [newCapacity, setNewCapacity] = useState(25);

  // Quick inline time edit
  const [editingTimeWaveId, setEditingTimeWaveId] = useState<string | null>(null);
  const [inlineTimeValue, setInlineTimeValue] = useState('');

  // Edit modal state
  const [editName, setEditName] = useState('');
  const [editStartTime, setEditStartTime] = useState('');
  const [editCapacity, setEditCapacity] = useState(25);

  const handleStartInlineTimeEdit = (w: Wave) => {
    setEditingTimeWaveId(w.id);
    setInlineTimeValue(w.scheduledStartTime);
  };

  const handleSaveInlineTime = async (w: Wave) => {
    if (!inlineTimeValue.trim()) {
      setEditingTimeWaveId(null);
      return;
    }
    await db.waves.update(w.id, {
      scheduledStartTime: inlineTimeValue.trim(),
    });
    await operationService.logAudit(
      'WAVE_UPDATED',
      `Starttijd van wave "${w.name}" aangepast naar ${inlineTimeValue.trim()}`
    );
    soundService.playSuccess();
    setEditingTimeWaveId(null);
    onRefresh();
  };

  const handleOpenEditModal = (w: Wave) => {
    setEditingWave(w);
    setEditName(w.name);
    setEditStartTime(w.scheduledStartTime);
    setEditCapacity(w.maxParticipants || 25);
  };

  const handleSaveEditWave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingWave || !editName.trim()) return;
    try { timeSeconds(editStartTime.trim()); } catch (error) { setAssignmentError((error as Error).message); return; }
    if (editCapacity < participants.filter(p => p.waveId === editingWave.id).length) { setAssignmentError('De capaciteit kan niet lager zijn dan het huidige aantal deelnemers.'); return; }

    await db.waves.update(editingWave.id, {
      name: editName.trim(),
      scheduledStartTime: editStartTime.trim(),
      maxParticipants: editCapacity,
    });

    await operationService.logAudit(
      'WAVE_UPDATED',
      `Wave "${editName.trim()}" bijgewerkt (Starttijd: ${editStartTime.trim()}, Max: ${editCapacity})`
    );

    soundService.playSuccess();
    setEditingWave(null);
    onRefresh();
  };

  const handleDeleteWave = async (w: Wave) => {
    await db.transaction('rw', db.waves, db.participants, async () => {
      await db.waves.delete(w.id);
      await db.participants.where('waveId').equals(w.id).modify({ waveId: undefined });
    });

    await operationService.logAudit(
      'WAVE_DELETED',
      `Wave "${w.name}" (#${w.waveNumber}) verwijderd`
    );

    soundService.playSuccess();
    onRefresh();
  };

  const handleAddWave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWaveName.trim()) return;
    try { timeSeconds(newStartTime.trim()); } catch (error) { setAssignmentError((error as Error).message); return; }

    const nextWaveNum = waves.length > 0 ? Math.max(...waves.map((w) => w.waveNumber)) + 1 : 1;
    const wave: Wave = {
      id: generateUUID(),
      eventId: await getActiveEventId(),
      name: newWaveName.trim(),
      waveNumber: nextWaveNum,
      scheduledStartTime: newStartTime.trim(),
      categoryIds: [],
      maxParticipants: newCapacity,
      status: 'SCHEDULED',
    };

    await db.waves.put(wave);
    await operationService.logAudit('WAVE_CREATED', `Wave ${wave.name} aangemaakt met startuur ${wave.scheduledStartTime}`);
    setShowAddModal(false);
    setNewWaveName('');
    soundService.playSuccess();
    onRefresh();
  };

  const handleDelayWave = async (wave: Wave, minutes: number) => {
    const parts = wave.scheduledStartTime.split(':').map(Number);
    const h = parts[0] || 0;
    const m = parts[1] || 0;
    const s = parts[2] || 0;

    const date = new Date();
    date.setHours(h, m + minutes, s);
    const updatedTime = date.toTimeString().split(' ')[0];

    await db.waves.update(wave.id, {
      scheduledStartTime: updatedTime,
    });

    await operationService.logAudit(
      'WAVE_DELAYED',
      `Wave ${wave.name} uitgesteld met ${minutes} minuten naar ${updatedTime}`
    );
    soundService.playSuccess();
    onRefresh();
  };

  // Participant assignment functions
  const changeParticipantWave = async (participantId: string, waveId?: string) => {
    setAssignmentBusy(true); setAssignmentError('');
    try {
      await db.transaction('rw', [db.participants, db.waves, db.auditLogs, db.timingRecords, db.shootingResults], async () => {
        const p = await db.participants.get(participantId);
        if (!p || !['REGISTERED', 'CHECKED_IN', 'READY'].includes(p.status)) throw new Error('Deze deelnemer kan niet meer van startgroep veranderen.');
        if ((await db.timingRecords.toArray()).some(t => t.participantId === p.id || (!!p.bibNumber && t.bibNumber === p.bibNumber)) || (await db.shootingResults.toArray()).some(r => r.participantId === p.id)) throw new Error('Deze deelnemer heeft al wedstrijdregistraties.');
        const previous = p.waveId ? await db.waves.get(p.waveId) : undefined;
        if (previous && (previous.status !== 'SCHEDULED' || previous.actualStartTime)) throw new Error('De bestaande wave is al gestart.');
        if (waveId) {
          const wave = await db.waves.get(waveId);
          if (!wave || wave.status !== 'SCHEDULED' || wave.actualStartTime) throw new Error('Deze wave is al gestart of bestaat niet meer.');
          if (p.stamhoofdInactive || !waveAllows(wave, p)) throw new Error('Artikel of categorie past niet bij deze wave, of de inschrijving is inactief.');
          if (p.waveId !== waveId && await db.participants.where('waveId').equals(waveId).count() >= wave.maxParticipants) throw new Error('Deze wave is vol. Verhoog eerst de capaciteit of kies een andere wave.');
        }
        await db.participants.update(participantId, { waveId, updatedAt: new Date().toISOString() });
        await operationService.logAudit('PARTICIPANT_UPDATED', waveId ? 'Deelnemer toegewezen aan wave' : 'Deelnemer ontkoppeld van wave', participantId);
      });
      onRefresh();
    } catch (error) { setAssignmentError((error as Error).message); }
    finally { setAssignmentBusy(false); }
  };
  const handleAssignParticipantToWave = (participantId: string, waveId: string) => changeParticipantWave(participantId, waveId);
  const handleRemoveParticipantFromWave = (participantId: string) => changeParticipantWave(participantId);

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="text-xs font-mono uppercase tracking-widest text-amber-400 font-bold flex items-center gap-1.5">
            <Layers className="w-4 h-4" /> Startgroepen & Tijdschema
          </span>
          <h2 className="text-2xl font-black text-white tracking-tight mt-0.5">
            Startgroepen & startindeling
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {waves.length} startgroepen ingesteld • Starturen aanpassen, uitstellen en deelnemers indelen
          </p>
        </div>

        <button
          onClick={() => {
            const nextNum = waves.length > 0 ? Math.max(...waves.map((w) => w.waveNumber)) + 1 : 1;
            try { setNewStartTime(nextWaveTime(waves, waveSettings)); } catch (error) { setAssignmentError((error as Error).message); return; }
            setNewCapacity(waveSettings.capacity);
            setNewWaveName(`Wave ${nextNum}`);
            setShowAddModal(true);
          }}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow transition uppercase tracking-wider"
        >
          <Plus className="w-4 h-4" /> Nieuwe startgroep
        </button>
      </div>

      {assignmentError && <p role="alert" className="text-amber-300">{assignmentError}</p>}
      <WavePlanningPanel waves={waves} participants={participants} settings={waveSettings} onChange={setWaveSettings} onRefresh={onRefresh} />
      {/* Wave Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {waves.map((w) => {
          const waveParticipants = participants.filter((p) => p.waveId === w.id);
          const finishedCount = waveParticipants.filter((p) => p.status === 'FINISHED').length;
          const startedCount = waveParticipants.filter((p) => p.status === 'STARTED').length;

          return (
            <div
              key={w.id}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col justify-between space-y-4 relative overflow-hidden"
            >
              <div>
                {w.assignmentGroup && <p className="text-xs text-amber-300 mb-2">{w.assignmentGroup.type === 'article' ? `Artikel: ${w.assignmentGroup.value}` : 'Ingedeeld per wedstrijdprofiel'}</p>}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="w-8 h-8 rounded-lg bg-amber-500 text-slate-950 font-black font-mono flex items-center justify-center text-sm shadow">
                      #{w.waveNumber}
                    </span>
                    <div>
                      <h3 className="text-base font-bold text-white">{w.name}</h3>
                      <span className="text-[10px] text-slate-400">
                        {waveParticipants.length} van {w.maxParticipants || 25} lopers
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleOpenEditModal(w)}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
                      title="Wave bewerken"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <SafeConfirmButton
                      mode="hold"
                      holdDurationSeconds={3}
                      variant="danger"
                      onConfirm={() => handleDeleteWave(w)}
                      className="p-1.5"
                      title="Houd 3 seconden vast om deze wave te verwijderen"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </SafeConfirmButton>
                  </div>
                </div>

                <div className="space-y-2 text-xs text-slate-400 mt-4 bg-slate-950/50 p-3 rounded-xl border border-slate-800/80">
                  {/* Scheduled Start Hour with direct edit */}
                  <div className="flex items-center justify-between">
                    <span className="text-slate-300 font-medium flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-amber-400" /> Gepland startuur:
                    </span>
                    {editingTimeWaveId === w.id ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          value={inlineTimeValue}
                          onChange={(e) => setInlineTimeValue(e.target.value)}
                          placeholder="10:00:00"
                          className="w-24 bg-slate-800 border border-amber-500 rounded px-2 py-0.5 text-white font-mono text-xs text-center"
                          autoFocus
                        />
                        <button
                          onClick={() => handleSaveInlineTime(w)}
                          className="p-1 rounded bg-amber-500 text-slate-950 hover:bg-amber-400"
                          title="Opslaan"
                        >
                          <Check className="w-3 h-3 stroke-[3]" />
                        </button>
                        <button
                          onClick={() => setEditingTimeWaveId(null)}
                          className="p-1 rounded bg-slate-800 text-slate-400 hover:text-white"
                          title="Annuleren"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-black text-amber-400 text-sm">
                          {w.scheduledStartTime}
                        </span>
                        <button
                          onClick={() => handleStartInlineTimeEdit(w)}
                          className="text-[10px] text-slate-500 hover:text-amber-400 underline ml-1"
                        >
                          Wijzig
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between">
                    <span>Status:</span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                        w.status === 'STARTED'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          : w.status === 'COMPLETED'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      {w.status}
                    </span>
                  </div>

                  {w.actualStartTime && (
                    <div className="flex items-center justify-between">
                      <span>Werkelijke start:</span>
                      <span className="font-mono text-emerald-400 font-bold">
                        {new Date(w.actualStartTime).toLocaleTimeString('nl-BE')}
                      </span>
                    </div>
                  )}
                </div>

                {/* Progress bar */}
                <div className="mt-4 pt-3 border-t border-slate-800">
                  <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                    <span>Deelnemers voortgang</span>
                    <span>
                      {finishedCount} gefinisht, {startedCount} gestart
                    </span>
                  </div>
                  <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-emerald-400 h-full transition-all"
                      style={{
                        width: `${
                          waveParticipants.length > 0
                            ? (finishedCount / waveParticipants.length) * 100
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Action Buttons: Participants & Quick Delay */}
              <div className="space-y-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => { setManagingParticipantsWave(w); setParticipantSearch(''); setAssignmentError(''); }}
                  className="w-full py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 flex items-center justify-center gap-2 text-xs font-bold transition"
                >
                  <Users className="w-3.5 h-3.5 text-amber-400" />
                  <span>Deelnemers in startgroep ({waveParticipants.length})</span>
                </button>

                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-[11px] text-slate-500">Snel uitstel:</span>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => handleDelayWave(w, 2)}
                      className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 font-mono text-[11px]"
                      title="Stel wave uit met 2 minuten"
                    >
                      +2m
                    </button>
                    <button
                      onClick={() => handleDelayWave(w, 5)}
                      className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 font-mono text-[11px]"
                      title="Stel wave uit met 5 minuten"
                    >
                      +5m
                    </button>
                    <button
                      onClick={() => handleDelayWave(w, 10)}
                      className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 font-mono text-[11px]"
                      title="Stel wave uit met 10 minuten"
                    >
                      +10m
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Edit Wave Modal */}
      {editingWave && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-amber-400" /> Wave Bewerken: #{editingWave.waveNumber}
              </h3>
              <button
                onClick={() => setEditingWave(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {assignmentError && <p role="alert" className="text-amber-300">{assignmentError}</p>}
            <form onSubmit={handleSaveEditWave} className="space-y-4">
              <div>
                <label className="text-slate-300 font-semibold block mb-1">Naam van de startgroep:</label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="bv. Wave 1 - Jeugd & Recreanten"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white font-medium focus:border-amber-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 font-semibold block mb-1">
                    Gepland Startuur:
                  </label>
                  <input
                    type="text"
                    required
                    value={editStartTime}
                    onChange={(e) => setEditStartTime(e.target.value)}
                    placeholder="10:00:00"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white font-mono font-bold focus:border-amber-400"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">Formaat: uu:mm:ss</span>
                </div>

                <div>
                  <label className="text-slate-300 font-semibold block mb-1">
                    Max Deelnemers:
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={1000}
                    value={editCapacity}
                    onChange={(e) => setEditCapacity(parseInt(e.target.value, 10) || 25)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white font-mono font-bold focus:border-amber-400"
                  />
                </div>
              </div>

              <div className="flex justify-between items-center gap-2 pt-4 border-t border-slate-800">
                <SafeConfirmButton
                  mode="hold"
                  holdDurationSeconds={3}
                  variant="danger"
                  onConfirm={async () => {
                    const w = editingWave;
                    if (w) {
                      setEditingWave(null);
                      await handleDeleteWave(w);
                    }
                  }}
                  className="px-3 py-2 flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Houd vast om te wissen
                </SafeConfirmButton>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingWave(null)}
                    className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white font-semibold"
                  >
                    Annuleren
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold uppercase tracking-wider"
                  >
                    Opslaan
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Wave Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Plus className="w-4 h-4 text-amber-400" /> Nieuwe startgroep
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {assignmentError && <p role="alert" className="text-amber-300">{assignmentError}</p>}
            <form onSubmit={handleAddWave} className="space-y-3">
              <div>
                <label className="text-slate-300 font-semibold block mb-1">Wave Naam:</label>
                <input
                  type="text"
                  required
                  value={newWaveName}
                  onChange={(e) => setNewWaveName(e.target.value)}
                  placeholder={`bv. Wave ${waves.length + 1}`}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-medium"
                />
              </div>

              <div>
                <label className="text-slate-300 font-semibold block mb-1">
                  Gepland Startuur (uu:mm:ss):
                </label>
                <input
                  type="text"
                  required
                  value={newStartTime}
                  onChange={(e) => setNewStartTime(e.target.value)}
                  placeholder="10:00:00"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono font-bold"
                />
              </div>

              <div>
                <label className="text-slate-300 font-semibold block mb-1">
                  Max Capaciteit (deelnemers):
                </label>
                <input
                  type="number"
                  min={1}
                  max={1000}
                  value={newCapacity}
                  onChange={(e) => setNewCapacity(parseInt(e.target.value, 10) || 25)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono font-bold"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 text-slate-300 font-medium"
                >
                  Annuleren
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold uppercase tracking-wider"
                >
                  Wave Aanmaken
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manage Participants in Wave Modal */}
      {managingParticipantsWave && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-4 text-xs max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Users className="w-4 h-4 text-amber-400" /> Deelnemers in {managingParticipantsWave.name}
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Startuur: {managingParticipantsWave.scheduledStartTime} • Max {managingParticipantsWave.maxParticipants || 25} lopers
                </p>
              </div>
              <button
                onClick={() => setManagingParticipantsWave(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <label className="block text-slate-300">Deelnemers zoeken
              <input type="search" value={participantSearch} onChange={e => setParticipantSearch(e.target.value)} placeholder="Naam, borstnummer, artikel of leeftijdscategorie" className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-white" />
            </label>
            {assignmentError && <p role="alert" className="text-amber-300">{assignmentError}</p>}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 overflow-hidden">
              {/* Currently in this wave */}
              <div className="flex flex-col border border-slate-800 rounded-xl p-3 bg-slate-950/50">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-white text-xs">
                    In deze Wave ({participants.filter((p) => p.waveId === managingParticipantsWave.id && matchesSearch(p)).length}):
                  </span>
                </div>
                <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 max-h-[350px]">
                  {participants.filter((p) => p.waveId === managingParticipantsWave.id && matchesSearch(p)).length === 0 ? (
                    <div className="text-slate-500 py-6 text-center italic">
                      Geen deelnemers in deze wave gevonden voor deze zoekopdracht.
                    </div>
                  ) : (
                    participants
                      .filter((p) => p.waveId === managingParticipantsWave.id && matchesSearch(p))
                      .map((p) => (
                        <div
                          key={p.id}
                          className="flex items-center justify-between p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-200"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-amber-400 w-8">
                              #{p.bibNumber}
                            </span>
                            <div>
                              <div className="font-semibold text-white">
                                {p.firstName} {p.lastName}
                              </div>
                              <div className="text-[10px] text-slate-400">
                                {categories.find((c) => c.id === p.categoryId)?.name || 'Geen cat.'}
                              </div>
                            </div>
                          </div>

                          <button
                            type="button"
                            disabled={assignmentBusy}
                            onClick={() => handleRemoveParticipantFromWave(p.id)}
                            className="p-1.5 rounded bg-red-950/40 text-red-400 hover:bg-red-900/50 border border-red-800/40"
                            title="Verwijder uit wave"
                          >
                            <UserMinus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))
                  )}
                </div>
              </div>

              {/* Unassigned or other participants */}
              <div className="flex flex-col border border-slate-800 rounded-xl p-3 bg-slate-950/50">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-white text-xs">
                    Deelnemers zonder Wave ({participants.filter((p) => !p.waveId && !p.stamhoofdInactive && matchesSearch(p)).length}):
                  </span>
                </div>
                <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 max-h-[350px]">
                  {participants.filter((p) => !p.waveId && !p.stamhoofdInactive && matchesSearch(p)).length === 0 ? (
                    <div className="text-slate-500 py-6 text-center italic">
                      Geen deelnemers zonder wave gevonden voor deze zoekopdracht.
                    </div>
                  ) : (
                    participants
                      .filter((p) => !p.waveId && !p.stamhoofdInactive && matchesSearch(p))
                      .map((p) => (
                        <div
                          key={p.id}
                          className="flex items-center justify-between p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-200"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-slate-400 w-8">
                              #{p.bibNumber}
                            </span>
                            <div>
                              <div className="font-semibold text-white">
                                {p.firstName} {p.lastName}
                              </div>
                              <div className="text-[10px] text-slate-400">
                                {categories.find((c) => c.id === p.categoryId)?.name || 'Geen cat.'}
                              </div>
                            </div>
                          </div>

                          <button
                            type="button"
                            disabled={assignmentBusy}
                            onClick={() => handleAssignParticipantToWave(p.id, managingParticipantsWave.id)}
                            className="px-2 py-1 rounded bg-amber-500 text-slate-950 font-bold hover:bg-amber-400 flex items-center gap-1 text-[11px]"
                          >
                            <UserPlus className="w-3 h-3" /> Toevoegen
                          </button>
                        </div>
                      ))
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setManagingParticipantsWave(null)}
                className="px-5 py-2 rounded-xl bg-slate-800 text-white font-bold hover:bg-slate-700"
              >
                Sluiten
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
