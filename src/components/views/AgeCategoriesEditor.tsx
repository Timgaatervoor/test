import React, { useState } from 'react';
import { CheckCircle2, Plus, Save, Trash2, Users } from 'lucide-react';
import type { Category, RaceProfile } from '../../types';
import { db } from '../../db/dexieDb';
import { operationService } from '../../services/operationService';
import { soundService } from '../../services/soundService';
import { getCategoryProfileIds } from '../../services/categoryProfileService';
import { SafeConfirmButton } from '../SafeConfirmButton';

interface AgeCategoriesEditorProps {
  categories: Category[];
  profiles: RaceProfile[];
  onRefresh: () => void;
  onOpenProfiles: () => void;
}

const newCategoryId = 'new-category';

export const AgeCategoriesEditor: React.FC<AgeCategoriesEditorProps> = ({
  categories,
  profiles,
  onRefresh,
  onOpenProfiles,
}) => {
  const [categoryId, setCategoryId] = useState(newCategoryId);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [gender, setGender] = useState<Category['gender']>('ALL');
  const [minAge, setMinAge] = useState(1);
  const [maxAge, setMaxAge] = useState<number | ''>('');
  const [profileIds, setProfileIds] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const resetForm = () => {
    setCategoryId(newCategoryId);
    setName('');
    setCode('');
    setGender('ALL');
    setMinAge(1);
    setMaxAge('');
    setProfileIds([]);
    setMessage(null);
    setError(null);
  };

  const loadCategory = (category: Category) => {
    setCategoryId(category.id);
    setName(category.name);
    setCode(category.code);
    setGender(category.gender);
    setMinAge(category.minAge ?? 1);
    setMaxAge(category.maxAge ?? '');
    setProfileIds(getCategoryProfileIds(category));
    setMessage(null);
    setError(null);
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (!name.trim() || !code.trim()) {
      setError('Naam en code zijn verplicht.');
      return;
    }
    if (maxAge !== '' && Number(maxAge) < minAge) {
      setError('De maximumleeftijd moet gelijk aan of hoger dan de minimumleeftijd zijn.');
      return;
    }

    const id = categoryId === newCategoryId ? `category-${Date.now()}` : categoryId;
    const uniqueProfileIds = Array.from(new Set<string>(profileIds.filter(Boolean)));
    const existingCategory = categories.find((category) => category.id === id);

    await db.transaction('rw', db.categories, db.participants, async () => {
      await db.categories.put({
        ...existingCategory,
        id,
        name: name.trim(),
        code: code.trim().toUpperCase(),
        gender,
        minAge: Math.max(1, minAge),
        maxAge: maxAge === '' ? undefined : Number(maxAge),
        raceProfileIds: uniqueProfileIds,
        raceProfileId: uniqueProfileIds[0],
      });


    });

    await operationService.logAudit('CATEGORY_UPDATED', `Categorie "${name.trim()}" opgeslagen.`);
    soundService.playSuccess();
    await onRefresh();
    setCategoryId(id);
    setMessage('Leeftijdscategorie opgeslagen.');
  };

  const handleDelete = async () => {
    if (categoryId === newCategoryId) return;
    const category = categories.find((item) => item.id === categoryId);
    if (!category) return;

    await db.categories.delete(category.id);
    await operationService.logAudit('CATEGORY_DELETED', `Categorie "${category.name}" verwijderd.`);
    soundService.playSuccess();
    resetForm();
    await onRefresh();
  };

  return (
    <div className="space-y-6">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-wrap items-start justify-between gap-4">
        <div>
          <span className="text-xs font-mono uppercase tracking-widest text-amber-400 font-bold flex items-center gap-2">
            <Users className="w-4 h-4" /> Wedstrijdinhoud
          </span>
          <h3 className="text-xl font-black text-white mt-1">Leeftijdscategorieën</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Maak en wijzig de categorieën hier. Leeftijd = evenementjaar min geboortejaar: de leeftijd op 31 december. Koppel de toegestane profielen hier of bij het wedstrijdprofiel.
          </p>
        </div>
        <button
          type="button"
          onClick={resetForm}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black transition"
        >
          <Plus className="w-4 h-4" /> Nieuwe categorie
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] gap-6">
        <aside className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow space-y-2 h-fit">
          <p className="text-[11px] text-slate-500 uppercase tracking-wider font-bold px-1 mb-3">
            Bestaande categorieën ({categories.length})
          </p>
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => loadCategory(category)}
              className={`w-full text-left rounded-xl border px-3 py-2.5 transition ${
                categoryId === category.id
                  ? 'bg-amber-500/15 border-amber-500/50 text-white'
                  : 'bg-slate-800/50 border-slate-700 text-slate-300 hover:bg-slate-800'
              }`}
            >
              <span className="font-bold text-xs block">{category.name}</span>
              <span className="text-[10px] text-slate-500 font-mono">{category.code}</span>
            </button>
          ))}
          {categories.length === 0 && (
            <p className="text-xs text-slate-500 italic p-3">Nog geen leeftijdscategorieën.</p>
          )}
        </aside>

        <form onSubmit={handleSave} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow space-y-5">
          <div>
            <h4 className="text-sm font-bold text-white uppercase tracking-wider">
              {categoryId === newCategoryId ? 'Nieuwe leeftijdscategorie' : 'Leeftijdscategorie aanpassen'}
            </h4>
            <p className="text-xs text-slate-400 mt-1">Een maximumleeftijd is optioneel.</p>
          </div>

          {error && <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-300">{error}</div>}
          {message && (
            <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs text-emerald-300 flex items-center gap-2 font-bold">
              <CheckCircle2 className="w-4 h-4" /> {message}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end text-xs">
            <label className="lg:col-span-2 text-slate-300 font-semibold">Naam
              <input value={name} onChange={(event) => setName(event.target.value)} placeholder="U8 Iedereen" required className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white" />
            </label>
            <label className="text-slate-300 font-semibold">Code
              <input value={code} onChange={(event) => setCode(event.target.value)} placeholder="U8" required className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono" />
            </label>
            <label className="text-slate-300 font-semibold">Geslacht
              <select value={gender} onChange={(event) => setGender(event.target.value as Category['gender'])} className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white">
                <option value="ALL">Iedereen</option>
                <option value="M">Jongens/Heren</option>
                <option value="F">Meisjes/Dames</option>
              </select>
            </label>
            <label className="text-slate-300 font-semibold">Min. leeftijd
              <input type="number" min="1" value={minAge} onChange={(event) => setMinAge(Math.max(1, Number(event.target.value)))} className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white" />
            </label>
            <label className="text-slate-300 font-semibold">Max. leeftijd
              <input type="number" min="1" value={maxAge} onChange={(event) => setMaxAge(event.target.value === '' ? '' : Number(event.target.value))} placeholder="Geen limiet" className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white" />
            </label>
          </div>

          <fieldset className="rounded-xl border border-slate-700 bg-slate-950/40 p-3">
            <legend className="px-1 text-slate-300 font-semibold text-xs">Toegestane wedstrijdprofielen</legend>
            <p className="text-[11px] text-slate-500 mb-3">
              Selecteer de toegestane profielen. Bij import bepaalt de combinatie van artikel en leeftijdscategorie welk profiel past. Je kunt de profielen ook later koppelen.
            </p>
            {profiles.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {profiles.map((profile) => {
                  const checked = profileIds.includes(profile.id);
                  return (
                    <label key={profile.id} className={`flex items-center gap-2 rounded-lg border p-2 cursor-pointer ${checked ? 'border-amber-500/50 bg-amber-500/10 text-white' : 'border-slate-700 bg-slate-800/60 text-slate-400'}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => setProfileIds((current) => checked ? current.filter((id) => id !== profile.id) : [...current, profile.id])}
                        className="w-4 h-4 rounded text-amber-500"
                      />
                      <span className="font-semibold text-xs">{profile.name}</span>
                    </label>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-800/60 border border-slate-700 p-3">
                <span className="text-xs text-slate-400">Je kunt de categorie nu opslaan en later aan een wedstrijdprofiel koppelen.</span>
                <button type="button" onClick={onOpenProfiles} className="text-xs font-bold text-amber-300 hover:text-amber-200">
                  Wedstrijdprofiel maken
                </button>
              </div>
            )}
          </fieldset>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-4">
            <div>
              {categoryId !== newCategoryId && (
                <SafeConfirmButton
                  mode="hold"
                  holdDurationSeconds={3}
                  variant="danger"
                  onConfirm={handleDelete}
                  className="flex items-center gap-2"
                >
                  <Trash2 className="w-4 h-4" /> Houd vast om te wissen
                </SafeConfirmButton>
              )}
            </div>
            <button type="submit" className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs uppercase tracking-wider transition">
              <Save className="w-4 h-4" /> Categorie opslaan
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
