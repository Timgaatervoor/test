import React, { useState } from 'react';
import {
  Layers,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Crosshair,
  Flag,
  Activity,
  Save,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';
import type { RaceProfile, RaceLegConfig, Category, LegType, ShootingStance } from '../../types';
import { db } from '../../db/dexieDb';
import { operationService } from '../../services/operationService';
import { applyClassification } from '../../services/applyClassification';
import { soundService } from '../../services/soundService';
import {
  categoryUsesProfile,
  getCategoryProfileIds,
  withCategoryProfiles,
} from '../../services/categoryProfileService';
import { SafeConfirmButton } from '../SafeConfirmButton';

interface RaceProfileEditorProps {
  profiles: RaceProfile[];
  categories: Category[];
  onRefresh: () => void;
  onManageCategories: () => void;
}

export const RaceProfileEditor: React.FC<RaceProfileEditorProps> = ({
  profiles,
  categories,
  onRefresh,
  onManageCategories,
}) => {
  const [selectedProfileId, setSelectedProfileId] = useState<string>(
    profiles[0]?.id || 'new-profile'
  );

  // Form State
  const [name, setName] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [penaltySeconds, setPenaltySeconds] = useState<number>(20);
  const [penaltyLaps, setPenaltyLaps] = useState<number>(1);
  const [legs, setLegs] = useState<RaceLegConfig[]>([]);
  const [assignedCategoryIds, setAssignedCategoryIds] = useState<string[]>([]);
  const [articles, setArticles] = useState<string[]>([]);
  const [availableArticles, setAvailableArticles] = useState<string[]>([]);
  const [classificationMessage, setClassificationMessage] = useState('');
  React.useEffect(() => { void db.participants.toArray().then(rows => setAvailableArticles([...new Set(rows.map(p => p.article ?? String(p.stamhoofdRegistration?.product ?? '')).filter(Boolean))])); }, [profiles]);
  const [savedMessage, setSavedMessage] = useState<boolean>(false);

  const loadProfileIntoForm = (prof: RaceProfile | undefined) => {
    if (prof) {
      setSelectedProfileId(prof.id);
      setName(prof.name);
      setArticles(prof.articles ?? []);
      setDescription(prof.description || '');
      setPenaltySeconds(prof.penaltySecondsPerMiss || 20);
      setPenaltyLaps(prof.penaltyLapsPerMiss || 1);
      setLegs(prof.legs || []);
      const assigned = categories
        .filter((category) => categoryUsesProfile(category, prof.id))
        .map((c) => c.id);
      setAssignedCategoryIds(assigned);
    } else {
      startNewProfile();
    }
  };

  const startNewProfile = () => {
    setSelectedProfileId('new-profile');
    setArticles([]);
    setName('Nieuw Wedstrijdprofiel (Loop - Schiet - Loop...)');
    setDescription('Aangepast parcours: Loop, schiet, loop, schiet, loop...');
    setPenaltySeconds(20);
    setPenaltyLaps(1);
    setLegs([
      { id: `leg-${Date.now()}-1`, type: 'RUN', name: 'Loopronde 1', distanceMeters: 1000, laps: 1 },
      { id: `leg-${Date.now()}-2`, type: 'SHOOT', name: 'Schietbeurt 1', shotCount: 5, stance: 'prone', maxHits: 5, penaltyType: 'time', penaltyValueSeconds: 20 },
      { id: `leg-${Date.now()}-3`, type: 'RUN', name: 'Loopronde 2', distanceMeters: 1000, laps: 1 },
      { id: `leg-${Date.now()}-4`, type: 'SHOOT', name: 'Schietbeurt 2', shotCount: 5, stance: 'standing', maxHits: 5, penaltyType: 'time', penaltyValueSeconds: 20 },
      { id: `leg-${Date.now()}-5`, type: 'RUN', name: 'Loopronde 3', distanceMeters: 1000, laps: 1 },
      { id: `leg-${Date.now()}-6`, type: 'FINISH', name: 'Finish' },
    ]);
    setAssignedCategoryIds([]);
  };

  // Initial load once
  const initializedRef = React.useRef(false);
  React.useEffect(() => {
    if (!initializedRef.current) {
      if (profiles.length > 0) {
        loadProfileIntoForm(profiles[0]);
      } else {
        startNewProfile();
      }
      initializedRef.current = true;
    }
  }, [profiles]);

  // Leg helpers
  const handleAddLeg = (type: LegType) => {
    const newId = `leg-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
    let newLeg: RaceLegConfig;

    if (type === 'RUN') {
      const runCount = legs.filter((l) => l.type === 'RUN').length + 1;
      newLeg = {
        id: newId,
        type: 'RUN',
        name: `Loopronde ${runCount}`,
        distanceMeters: 1000,
        laps: 1,
      };
    } else if (type === 'SHOOT') {
      const shootCount = legs.filter((l) => l.type === 'SHOOT').length + 1;
      newLeg = {
        id: newId,
        type: 'SHOOT',
        name: `Schietbeurt ${shootCount}`,
        shotCount: 5,
        stance: shootCount % 2 === 1 ? 'prone' : 'standing',
        maxHits: 5,
        penaltyType: 'time',
        penaltyValueSeconds: penaltySeconds,
      };
    } else {
      newLeg = {
        id: newId,
        type: 'FINISH',
        name: 'Finish',
      };
    }

    setLegs([...legs, newLeg]);
  };

  const handleUpdateLeg = (index: number, updates: Partial<RaceLegConfig>) => {
    const updated = [...legs];
    updated[index] = { ...updated[index], ...updates };
    setLegs(updated);
  };

  const handleMoveLeg = (index: number, direction: 'UP' | 'DOWN') => {
    if (direction === 'UP' && index === 0) return;
    if (direction === 'DOWN' && index === legs.length - 1) return;

    const targetIndex = direction === 'UP' ? index - 1 : index + 1;
    const updated = [...legs];
    const temp = updated[index];
    updated[index] = updated[targetIndex];
    updated[targetIndex] = temp;
    setLegs(updated);
  };

  const handleRemoveLeg = (index: number) => {
    setLegs(legs.filter((_, i) => i !== index));
  };

  const handleToggleCategory = (catId: string) => {
    if (assignedCategoryIds.includes(catId)) {
      setAssignedCategoryIds(assignedCategoryIds.filter((id) => id !== catId));
    } else {
      setAssignedCategoryIds([...assignedCategoryIds, catId]);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();

    const profileId =
      selectedProfileId === 'new-profile' ? `profile-${Date.now()}` : selectedProfileId;

    const updatedProfile: RaceProfile = {
      id: profileId,
      name: name.trim() || 'Wedstrijdprofiel',
      description: description.trim(),
      penaltySecondsPerMiss: penaltySeconds,
      penaltyLapsPerMiss: penaltyLaps,
      legs,
      articles,
      isDefault: profiles.length === 0 || profiles.find((p) => p.id === selectedProfileId)?.isDefault,
    };

    // Save profile to Dexie
    await db.raceProfiles.put(updatedProfile);

    const currentCategories = await db.categories.toArray();
    await db.transaction('rw', db.categories, db.participants, async () => {
      for (const cat of currentCategories) {
        const currentProfileIds = getCategoryProfileIds(cat);
        let nextProfileIds = currentProfileIds;
        if (assignedCategoryIds.includes(cat.id)) {
          nextProfileIds = [...new Set([...currentProfileIds, profileId])];
        } else {
          nextProfileIds = currentProfileIds.filter((id) => id !== profileId);

        }

        await db.categories.put(withCategoryProfiles(cat, nextProfileIds));
      }
    });

    await operationService.logAudit(
      'SETTINGS_UPDATED',
      `Wedstrijdopbouw profiel "${name}" opgeslagen met ${legs.length} onderdelen`
    );

    soundService.playSuccess();
    setSavedMessage(true);
    setSelectedProfileId(profileId);
    await onRefresh();
    setTimeout(() => setSavedMessage(false), 3000);
  };

  const handleDeleteProfile = async () => {
    const profToDelete = profiles.find((p) => p.id === selectedProfileId);
    if (!profToDelete) return;

    const currentCategories = await db.categories.toArray();
    await db.transaction('rw', db.raceProfiles, db.categories, db.participants, async () => {
      await db.raceProfiles.delete(profToDelete.id);
      for (const category of currentCategories) {
        const nextProfileIds = getCategoryProfileIds(category).filter((id) => id !== profToDelete.id);

        await db.categories.put(withCategoryProfiles(category, nextProfileIds));
        await db.participants.where('categoryId').equals(category.id).modify((participant) => {
          if (participant.raceProfileId === profToDelete.id) {
            participant.raceProfileId = '';
          }
        });
      }
    });

    await operationService.logAudit(
      'SETTINGS_UPDATED',
      `Wedstrijdprofiel "${profToDelete.name}" verwijderd`
    );

    soundService.playWarning();
    const remaining = profiles.filter((p) => p.id !== profToDelete.id);
    if (remaining.length > 0) {
      loadProfileIntoForm(remaining[0]);
    } else {
      startNewProfile();
    }
    await onRefresh();
  };

  const isExistingProfile = selectedProfileId !== 'new-profile';

  return (
    <div className="space-y-6">
      {/* Intro info */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow">
        <div className="flex items-start justify-between gap-4">
          <div>
            <span className="text-xs font-mono uppercase tracking-widest text-amber-400 font-bold flex items-center gap-1.5">
              <Layers className="w-4 h-4" /> Wedstrijdinhoud & Parcoursopbouw
            </span>
            <h3 className="text-xl font-black text-white mt-1">
              Wedstrijdprofielen & Volgorde van Onderdelen
            </h3>
            <p className="text-xs text-slate-300 mt-1 max-w-3xl leading-relaxed">
              Hier stelt u de precieze volgorde in van uw biathlon: bijvoorbeeld{' '}
              <strong className="text-amber-400">
                Loopronde &rarr; Schietbeurt &rarr; Loopronde &rarr; Schietbeurt &rarr; Loopronde &rarr; Finish
              </strong>
              . U kunt afstanden per ronde, aantal schoten (bv. 5 schoten), houding (liggend of staand)
              en straftijden per onderdeel exact instellen en toewijzen aan categorieën.
            </p>
          </div>
        </div>

        {/* Profile Selector Pills */}
        <div className="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t border-slate-800">
          <span className="text-xs font-semibold text-slate-400 mr-1">Selecteer Profiel:</span>
          {profiles.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => loadProfileIntoForm(p)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                selectedProfileId === p.id
                  ? 'bg-amber-500 text-slate-950 shadow-md'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-750 border border-slate-700'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>{p.name}</span>
              <span className="text-[10px] opacity-75">({p.legs?.length || 0} stappen)</span>
            </button>
          ))}

          <button
            type="button"
            onClick={startNewProfile}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
              selectedProfileId === 'new-profile'
                ? 'bg-emerald-500 text-slate-950 shadow-md'
                : 'bg-emerald-950/40 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-900/60'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ Nieuw Wedstrijdprofiel</span>
          </button>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
        <p className="text-sm">Sla eerst de profielen en leeftijdscategorieën op. Pas daarna de opgeslagen regels toe op geïmporteerde deelnemers. Handmatige keuzes en deelnemers die al gestart zijn blijven behouden.</p>
        <button type="button" className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400" onClick={async () => { try { const result = await applyClassification(); setClassificationMessage(`${result.updated} indelingen bijgewerkt. ${result.problems.length} te controleren.\n${result.problems.join('\n')}`); onRefresh(); } catch (error) { setClassificationMessage((error as Error).message); } }}>Artikel + leeftijdscategorie toepassen</button>
        {classificationMessage && <p role="status" className="whitespace-pre-wrap max-h-72 overflow-auto text-sm">{classificationMessage}</p>}
      </div>
      {/* Editor Form */}
      <form onSubmit={handleSaveProfile} className="space-y-6">
        {/* Profile Details Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow space-y-4 text-xs">
          <h4 className="text-sm font-bold text-white uppercase tracking-wider flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-amber-400" /> Profielgegevens
            </span>
            {isExistingProfile && (
              <SafeConfirmButton
                mode="hold"
                holdDurationSeconds={3}
                variant="danger"
                onConfirm={handleDeleteProfile}
                className="text-xs flex items-center gap-1"
                title="Houd 3 seconden vast om dit profiel te verwijderen"
              >
                <Trash2 className="w-3.5 h-3.5" /> Houd vast om profiel te wissen
              </SafeConfirmButton>
            )}
          </h4>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label className="text-slate-300 font-semibold block mb-1">Naam van het Profiel:</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="bv. Volwassenen Biathlon (3x Loop, 2x Schiet)"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-white font-bold text-sm focus:outline-none focus:border-amber-400"
              />
            </div>

            <div>
              <label className="text-slate-300 font-semibold block mb-1">
                Standaard Straftijd per Misser:
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  value={penaltySeconds}
                  onChange={(e) => setPenaltySeconds(parseInt(e.target.value, 10) || 0)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-amber-400 font-mono font-bold text-sm"
                />
                <span className="text-slate-400 font-semibold">sec</span>
              </div>
            </div>

            <div className="md:col-span-3">
              <label className="text-slate-300 font-semibold block mb-1">
                Korte Omschrijving / Parcoursdetails:
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="bv. 1,5 km Loop + 5 Schoten Liggend + 1,5 km Loop + 5 Schoten Staand + 1,5 km Finish"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-white text-xs focus:outline-none focus:border-amber-400"
              />
            </div>
          </div>
        </div>

        {/* Legs Sequencer: Loop, Schiet, Loop, Schiet, Finish... */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Layers className="w-4 h-4 text-emerald-400" /> Volgorde van Wedstrijdonderdelen
                ({legs.length})
              </h4>
              <p className="text-xs text-slate-400 mt-0.5">
                Stel de volgorde in van start tot finish. Verschuif stappen met de pijltjes omhoog/omlaag.
              </p>
            </div>

            {/* Add Buttons */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleAddLeg('RUN')}
                className="px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30 text-xs font-bold flex items-center gap-1.5 transition"
              >
                <Plus className="w-3.5 h-3.5" /> + Loopronde
              </button>
              <button
                type="button"
                onClick={() => handleAddLeg('SHOOT')}
                className="px-3 py-1.5 rounded-lg bg-blue-500/20 text-blue-300 border border-blue-500/30 hover:bg-blue-500/30 text-xs font-bold flex items-center gap-1.5 transition"
              >
                <Plus className="w-3.5 h-3.5" /> + Schietbeurt
              </button>
              <button
                type="button"
                onClick={() => handleAddLeg('FINISH')}
                className="px-3 py-1.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30 text-xs font-bold flex items-center gap-1.5 transition"
              >
                <Plus className="w-3.5 h-3.5" /> + Finish
              </button>
            </div>
          </div>

          {/* Sequential List of Legs */}
          <div className="space-y-3">
            {legs.length === 0 && (
              <div className="p-8 text-center bg-slate-950/50 rounded-xl border border-dashed border-slate-800 text-slate-400 text-xs">
                Nog geen onderdelen ingesteld. Klik op &ldquo;+ Loopronde&rdquo; of &ldquo;+ Schietbeurt&rdquo; om te beginnen.
              </div>
            )}

            {legs.map((leg, idx) => {
              const isFirst = idx === 0;
              const isLast = idx === legs.length - 1;

              return (
                <div
                  key={leg.id}
                  className={`p-3.5 rounded-xl border transition flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs ${
                    leg.type === 'RUN'
                      ? 'bg-emerald-950/20 border-emerald-900/50 text-emerald-200'
                      : leg.type === 'SHOOT'
                      ? 'bg-blue-950/20 border-blue-900/50 text-blue-200'
                      : 'bg-amber-950/20 border-amber-900/50 text-amber-200'
                  }`}
                >
                  {/* Step Number & Type Icon */}
                  <div className="flex items-center gap-3 min-w-[140px]">
                    <span className="w-6 h-6 rounded-full bg-slate-800 text-white font-mono font-bold flex items-center justify-center text-xs shadow">
                      {idx + 1}
                    </span>
                    <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-[11px]">
                      {leg.type === 'RUN' && (
                        <>
                          <Activity className="w-4 h-4 text-emerald-400" />
                          <span className="text-emerald-300">Loopronde</span>
                        </>
                      )}
                      {leg.type === 'SHOOT' && (
                        <>
                          <Crosshair className="w-4 h-4 text-blue-400" />
                          <span className="text-blue-300">Schieten</span>
                        </>
                      )}
                      {leg.type === 'FINISH' && (
                        <>
                          <Flag className="w-4 h-4 text-amber-400" />
                          <span className="text-amber-300">Finish</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Name Input */}
                  <div className="flex-1">
                    <input
                      type="text"
                      value={leg.name}
                      onChange={(e) => handleUpdateLeg(idx, { name: e.target.value })}
                      placeholder="Naam van het onderdeel"
                      className="w-full bg-slate-900/80 border border-slate-700/80 rounded-lg px-3 py-1.5 text-white font-medium text-xs focus:outline-none focus:border-amber-400"
                    />
                  </div>

                  {/* Specific Fields depending on Leg Type */}
                  {leg.type === 'RUN' && (
                    <div className="flex items-center gap-2">
                      <label className="text-slate-400 font-semibold text-[11px] whitespace-nowrap">
                        Afstand:
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="50"
                        value={leg.distanceMeters || 1000}
                        onChange={(e) =>
                          handleUpdateLeg(idx, { distanceMeters: parseInt(e.target.value, 10) || 0 })
                        }
                        className="w-20 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-right text-white font-mono"
                      />
                      <span className="text-slate-400 text-[11px]">m</span>
                    </div>
                  )}

                  {leg.type === 'SHOOT' && (
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Shot count */}
                      <div className="flex items-center gap-1">
                        <label className="text-slate-400 text-[11px]">Schoten:</label>
                        <input
                          type="number"
                          min="1"
                          max="10"
                          value={leg.shotCount || 5}
                          onChange={(e) =>
                            handleUpdateLeg(idx, {
                              shotCount: parseInt(e.target.value, 10) || 5,
                              maxHits: parseInt(e.target.value, 10) || 5,
                            })
                          }
                          className="w-14 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-center text-white font-mono"
                        />
                      </div>

                      {/* Stance */}
                      <div className="flex items-center gap-1">
                        <label className="text-slate-400 text-[11px]">Houding:</label>
                        <select
                          value={leg.stance || 'prone'}
                          onChange={(e) =>
                            handleUpdateLeg(idx, { stance: e.target.value as ShootingStance })
                          }
                          className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-white font-medium"
                        >
                          <option value="prone">Liggend</option>
                          <option value="standing">Staand</option>
                          <option value="free">Vrij</option>
                        </select>
                      </div>

                      {/* Penalty */}
                      <div className="flex items-center gap-1">
                        <label className="text-slate-400 text-[11px]">Straf:</label>
                        <input
                          type="number"
                          min="0"
                          value={leg.penaltyValueSeconds ?? penaltySeconds}
                          onChange={(e) =>
                            handleUpdateLeg(idx, {
                              penaltyValueSeconds: parseInt(e.target.value, 10) || 0,
                            })
                          }
                          className="w-14 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-center text-amber-400 font-mono font-bold"
                        />
                        <span className="text-slate-400 text-[11px]">s</span>
                      </div>
                    </div>
                  )}

                  {leg.type === 'FINISH' && (
                    <div className="text-[11px] text-amber-300 italic font-mono">
                      Officiële T1 tijdstop
                    </div>
                  )}

                  {/* Reorder and Delete Actions */}
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={isFirst}
                      onClick={() => handleMoveLeg(idx, 'UP')}
                      title="Naar boven verplaatsen"
                      className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white disabled:opacity-20 transition"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={isLast}
                      onClick={() => handleMoveLeg(idx, 'DOWN')}
                      title="Naar beneden verplaatsen"
                      className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white disabled:opacity-20 transition"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveLeg(idx)}
                      title="Verwijderen"
                      className="p-1 rounded hover:bg-red-500/20 text-slate-500 hover:text-red-400 transition ml-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
          <h4 className="font-bold">Artikelen voor dit wedstrijdprofiel</h4>
          <p className="text-sm text-slate-400">Een deelnemer komt in aanmerking als zowel het artikel als een hieronder geselecteerde leeftijdscategorie past. Importeer eerst deelnemers om hun artikelen hier te kiezen, of voeg een exacte artikelnaam toe.</p>
          {[...new Set([...availableArticles, ...articles])].map(article => <label key={article} className="block"><input type="checkbox" checked={articles.includes(article)} onChange={e => setArticles(current => e.target.checked ? [...current, article] : current.filter(a => a !== article))} /> {article}</label>)}
          <input aria-label="Artikelnaam toevoegen" placeholder="Exacte artikelnaam; druk Enter om toe te voegen" className="w-full bg-slate-800 p-2 rounded" onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); const value = e.currentTarget.value.trim(); if (value) setArticles(current => [...new Set([...current, value])]); e.currentTarget.value = ''; } }} />
        </div>
        {/* Assigned Categories Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow space-y-3 text-xs">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h4 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-amber-400" /> Leeftijdscategorieën koppelen
              </h4>
              <p className="text-xs text-slate-400 mt-1">
                Selecteer welke bestaande categorieën deze wedstrijdopbouw mogen gebruiken. Een categorie mag bij meerdere profielen horen.
              </p>
            </div>
            <button
              type="button"
              onClick={onManageCategories}
              className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-amber-300 font-bold transition"
            >
              Leeftijdscategorieën beheren
            </button>
          </div>

          {categories.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 pt-2">
              {categories.map((c) => {
                const isChecked = assignedCategoryIds.includes(c.id);
                return (
                  <label
                    key={c.id}
                    className={`p-2.5 rounded-xl border flex items-center gap-2.5 cursor-pointer transition ${
                      isChecked
                        ? 'bg-amber-500/10 border-amber-500/40 text-white'
                        : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => handleToggleCategory(c.id)}
                      className="w-4 h-4 rounded text-amber-500"
                    />
                    <div>
                      <span className="font-bold block text-xs">{c.name}</span>
                      <span className="text-[10px] text-slate-500 font-mono">Code: {c.code}</span>
                    </div>
                  </label>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-700 bg-slate-950/40 p-5 text-center">
              <p className="text-slate-400">Nog geen leeftijdscategorieën. Je kunt het wedstrijdprofiel wel al opslaan.</p>
              <button type="button" onClick={onManageCategories} className="mt-2 text-amber-300 hover:text-amber-200 font-bold">
                Eerste leeftijdscategorie maken
              </button>
            </div>
          )}
        </div>

        {/* Save Bar */}
        <div className="flex items-center justify-between pt-2">
          {savedMessage ? (
            <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold animate-pulse">
              <CheckCircle2 className="w-4 h-4" />
              <span>Wedstrijdprofiel & volgorde succesvol opgeslagen!</span>
            </div>
          ) : (
            <div className="text-xs text-slate-500">
              Wijzigingen worden direct van kracht op alle posten en schietstanden.
            </div>
          )}

          <button
            type="submit"
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs uppercase tracking-wider transition shadow-lg shadow-amber-500/20"
          >
            <Save className="w-4 h-4" /> Wedstrijdprofiel Opslaan
          </button>
        </div>
      </form>
    </div>
  );
};
