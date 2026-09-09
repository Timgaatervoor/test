import { EventWorkbookPanel } from '../EventWorkbookPanel';
import React, { useState, useRef, useEffect } from 'react';
import { BibAssignmentModal } from '../BibAssignmentModal';
import { updateBibs } from '../../services/bibAssignment';
import { StamhoofdIntegrationModal } from '../StamhoofdIntegrationModal';
import {
  Users,
  Search,
  Upload,
  UserPlus,
  ArrowUpDown,
  Download,
  CheckCircle2,
  AlertTriangle,
  FileSpreadsheet,
  X,
  Edit2,
  Trash2,
  Layers,
  Filter,
  CheckSquare,
  Square,
  Sparkles,
} from 'lucide-react';
import type { Participant, Category, Wave, ImportColumnMapping, RaceProfile } from '../../types';
import { db } from '../../db/dexieDb';
import { generateUUID, operationService } from '../../services/operationService';
import {
  parseFile,
  autoDetectMapping,
  validateAndMapRows,
  combineSheets,
  type ParseResult,
  type ParticipantImportCandidate,
} from '../../services/stamhoofdParser';
import { downloadCsvFile } from '../../services/backupService';
import {
  getCategoryProfileIds,
  getDefaultCategoryProfileId,
  getProfilesForCategory,
} from '../../services/categoryProfileService';
import { SafeConfirmButton } from '../SafeConfirmButton';
import { soundService } from '../../services/soundService';

interface ParticipantsViewProps {
  participants: Participant[];
  categories: Category[];
  waves: Wave[];
  profiles: RaceProfile[];
  onRefresh: () => void;
  onSelectParticipant: (participant: Participant) => void;
}

export const ParticipantsView: React.FC<ParticipantsViewProps> = ({
  participants,
  categories,
  waves,
  profiles,
  onRefresh,
  onSelectParticipant,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [showBibAssignment, setShowBibAssignment] = useState(false);
  const [bibMessage, setBibMessage] = useState('');
  const [clearingBibs, setClearingBibs] = useState(false);
  const [showStamhoofd, setShowStamhoofd] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  // New participant form state
  const [newFirstName, setNewFirstName] = useState('');
  const [newLastName, setNewLastName] = useState('');
  const [newBib, setNewBib] = useState('');
  const [newCatId, setNewCatId] = useState(categories[0]?.id || '');
  const [newProfileId, setNewProfileId] = useState(getDefaultCategoryProfileId(categories[0]) || profiles[0]?.id || '');
  const [newWaveId, setNewWaveId] = useState(waves[0]?.id || '');
  const [newClub, setNewClub] = useState('');
  const [newGender, setNewGender] = useState<'M' | 'F' | 'X'>('M');

  // Import workflow state
  const [importStep, setImportStep] = useState<'upload' | 'sheets' | 'mapping' | 'preview'>('upload');
  const [parsedData, setParsedData] = useState<ParseResult | null>(null);
  const [columnMapping, setColumnMapping] = useState<ImportColumnMapping>({});
  const [candidates, setCandidates] = useState<ParticipantImportCandidate[]>([]);
  const [duplicateAction, setDuplicateAction] = useState<'skip' | 'update'>('skip');
  const [isImporting, setIsImporting] = useState(false);
  const [selectedSheetNames, setSelectedSheetNames] = useState<string[]>([]);
  const [useSheetAsCategory, setUseSheetAsCategory] = useState<boolean>(true);
  const [previewSheetFilter, setPreviewSheetFilter] = useState<string>('ALL');
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Category & Wave maps
  const categoryMap = new Map<string, Category>(categories.map((c) => [c.id, c]));
  const waveMap = new Map<string, Wave>(waves.map((w) => [w.id, w]));
  const newParticipantProfiles = getProfilesForCategory(profiles, categoryMap.get(newCatId));

  // Filtered participants
  const filtered = participants.filter((p) => {
    if (selectedCategory !== 'ALL' && p.categoryId !== selectedCategory) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      const matchName = `${p.firstName} ${p.lastName}`.toLowerCase().includes(q);
      const matchBib = String(p.bibNumber || '').includes(q);
      const matchClub = (p.club || '').toLowerCase().includes(q);
      const matchExt = (p.externalId || '').toLowerCase().includes(q);
      const matchTicket = (p.stamhoofdTicketSecret || '').toLowerCase().includes(q) || (!!p.stamhoofdTicketUrl && p.stamhoofdTicketUrl.toLowerCase() === q);
      const matchArticle = (p.article ?? String(p.stamhoofdRegistration?.product ?? '')).toLowerCase().includes(q);
      if (!matchArticle && !matchName && !matchBib && !matchClub && !matchExt && !matchTicket) return false;
    }
    return true;
  });

  const handleAddParticipant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFirstName.trim() || !newLastName.trim()) return;

    const parsedBib = parseInt(newBib.trim(), 10);
    const bibNumber = !isNaN(parsedBib) && parsedBib > 0 ? parsedBib : undefined;

    const selectedCat = categoryMap.get(newCatId);
    const selectedProfileId = newProfileId || getDefaultCategoryProfileId(selectedCat);
    if (!selectedProfileId) {
      soundService.playWarning();
      setBibMessage('Kies eerst een wedstrijdprofiel voor deze deelnemer.');
      return;
    }
    const allowedProfileIds = getCategoryProfileIds(selectedCat);
    if (allowedProfileIds.length > 0 && !allowedProfileIds.includes(selectedProfileId)) {
      soundService.playWarning();
      setBibMessage('Dit wedstrijdprofiel is niet gekoppeld aan de gekozen leeftijdscategorie.');
      return;
    }
    const now = new Date().toISOString();

    const newP: Participant = {
      id: generateUUID(),
      firstName: newFirstName.trim(),
      lastName: newLastName.trim(),
      gender: newGender,
      bibNumber,
      categoryId: newCatId,
      raceProfileId: selectedProfileId,
      waveId: newWaveId || undefined,
      club: newClub.trim() || undefined,
      status: 'READY',
      createdAt: now,
      updatedAt: now,
    };

    await db.participants.put(newP);
    await operationService.logAudit(
      'PARTICIPANT_ADDED',
      `Deelnemer toegevoegd: ${newP.firstName} ${newP.lastName} (#${newP.bibNumber || 'geen bib'})`,
      newP.id,
      newP.bibNumber
    );

    setShowAddModal(false);
    setNewFirstName('');
    setNewLastName('');
    setNewBib('');
    setNewClub('');
    setNewProfileId(profiles[0]?.id || '');
    onRefresh();
  };

  const handleClearBibs = async () => {
    setClearingBibs(true);
    setBibMessage('');
    try {
      const count = await updateBibs({ clear: true });
      soundService.playSuccess();
      setBibMessage(`${count} borstnummers verwijderd.`);
      onRefresh();
    } catch (error) {
      soundService.playError();
      setBibMessage((error as Error).message);
    } finally {
      setClearingBibs(false);
    }
  };

  // Process uploaded file (supports CSV and multi-sheet Excel)
  const processUploadedFile = async (file: File) => {
    try {
      const result = await parseFile(file);
      setParsedData(result);

      if (result.isExcel && result.sheets && result.sheets.length > 1) {
        // Multi-sheet Excel workbook: automatically collect all sheets
        const initialSelected =
          result.selectedSheetNames && result.selectedSheetNames.length > 0
            ? result.selectedSheetNames
            : result.sheets.filter((s) => s.rowCount > 0).length > 0
            ? result.sheets.filter((s) => s.rowCount > 0).map((s) => s.name)
            : result.sheets.map((s) => s.name);
        setSelectedSheetNames(initialSelected);

        const combined = combineSheets(result.sheets, initialSelected);
        setParsedData({
          ...result,
          headers: combined.headers,
          rows: combined.rows,
          selectedSheetNames: initialSelected,
        });

        const autoMap = autoDetectMapping(combined.headers);
        setColumnMapping(autoMap);
        // Automatically proceed to mapping with all columns collected across all sheets
        setImportStep('mapping');
      } else {
        // Single sheet or CSV
        if (result.sheets && result.sheets.length === 1) {
          setSelectedSheetNames([result.sheets[0].name]);
        } else {
          setSelectedSheetNames([]);
        }
        const autoMap = autoDetectMapping(result.headers);
        setColumnMapping(autoMap);
        setImportStep('mapping');
      }
    } catch (err: any) {
      soundService.playError();
      setBibMessage(`Fout bij openen bestand: ${err?.message}`);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processUploadedFile(file);
    if (e.target) e.target.value = '';
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFile(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      await processUploadedFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFile(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFile(false);
  };

  // Sheet selection helpers
  const handleToggleSheet = (sheetName: string) => {
    if (!parsedData?.sheets) return;
    let next: string[];
    if (selectedSheetNames.includes(sheetName)) {
      next = selectedSheetNames.filter((n) => n !== sheetName);
    } else {
      next = [...selectedSheetNames, sheetName];
    }
    setSelectedSheetNames(next);
    const combined = combineSheets(parsedData.sheets, next);
    setParsedData({
      ...parsedData,
      headers: combined.headers,
      rows: combined.rows,
      selectedSheetNames: next,
    });
    setColumnMapping(autoDetectMapping(combined.headers));
  };

  const handleSelectAllSheets = () => {
    if (!parsedData?.sheets) return;
    const allNames = parsedData.sheets.map((s) => s.name);
    setSelectedSheetNames(allNames);
    const combined = combineSheets(parsedData.sheets, allNames);
    setParsedData({
      ...parsedData,
      headers: combined.headers,
      rows: combined.rows,
      selectedSheetNames: allNames,
    });
    setColumnMapping(autoDetectMapping(combined.headers));
  };

  const handleSelectFilledSheets = () => {
    if (!parsedData?.sheets) return;
    const filledNames = parsedData.sheets.filter((s) => s.rowCount > 0).map((s) => s.name);
    setSelectedSheetNames(filledNames);
    const combined = combineSheets(parsedData.sheets, filledNames);
    setParsedData({
      ...parsedData,
      headers: combined.headers,
      rows: combined.rows,
      selectedSheetNames: filledNames,
    });
    setColumnMapping(autoDetectMapping(combined.headers));
  };

  const handleDeselectAllSheets = () => {
    if (!parsedData?.sheets) return;
    setSelectedSheetNames([]);
    setParsedData({
      ...parsedData,
      headers: [],
      rows: [],
      selectedSheetNames: [],
    });
    setColumnMapping({});
  };

  const handleSelectSingleSheet = (sheetName: string) => {
    if (!parsedData?.sheets) return;
    const single = [sheetName];
    setSelectedSheetNames(single);
    const combined = combineSheets(parsedData.sheets, single);
    setParsedData({
      ...parsedData,
      headers: combined.headers,
      rows: combined.rows,
      selectedSheetNames: single,
    });
    setColumnMapping(autoDetectMapping(combined.headers));
    setImportStep('mapping');
  };

  // Process mapping to preview candidates
  const handleProceedToPreview = () => {
    if (!parsedData) return;
    const validated = validateAndMapRows(
      parsedData.rows,
      columnMapping,
      participants,
      useSheetAsCategory
    );
    setCandidates(validated);
    setPreviewSheetFilter('ALL');
    setImportStep('preview');
  };

  // Synchronize default category selection when categories change
  useEffect(() => {
    if (!newCatId && categories.length > 0) {
      setNewCatId(categories[0].id);
    }
  }, [categories, newCatId]);

  useEffect(() => {
    if (!newProfileId && profiles.length > 0) setNewProfileId(profiles[0].id);
  }, [profiles, newProfileId]);

  // Execute import
  const handleConfirmImport = async () => {
    setIsImporting(true);
    const now = new Date().toISOString();
    const newParticipants: Participant[] = [];
    const updatedParticipants: Participant[] = [];

    // Ensure a default race profile exists
    const existingProfiles = await db.raceProfiles.toArray();
    let defaultProfile = existingProfiles.find((p) => p.isDefault) || existingProfiles[0];
    if (!defaultProfile) {
      defaultProfile = {
        id: 'profile-adult',
        name: 'Standaard Biathlon',
        description: '1,5 km Run + Schieten (5) + 1,5 km Run + Schieten (5) + 1,5 km Finish',
        penaltySecondsPerMiss: 20,
        penaltyLapsPerMiss: 1,
        isDefault: true,
        legs: [
          { id: 'a1', type: 'RUN', name: 'Ronde 1', distanceMeters: 1500, laps: 1 },
          { id: 'a2', type: 'SHOOT', name: 'Schietproef 1', shotCount: 5, stance: 'prone', maxHits: 5, penaltyType: 'time', penaltyValueSeconds: 20 },
          { id: 'a3', type: 'RUN', name: 'Ronde 2', distanceMeters: 1500, laps: 1 },
          { id: 'a4', type: 'SHOOT', name: 'Schietproef 2', shotCount: 5, stance: 'standing', maxHits: 5, penaltyType: 'time', penaltyValueSeconds: 20 },
          { id: 'a5', type: 'RUN', name: 'Ronde 3', distanceMeters: 1500, laps: 1 },
          { id: 'a6', type: 'FINISH', name: 'Finish' },
        ],
      };
      await db.raceProfiles.put(defaultProfile);
    }
    const defaultProfileId = defaultProfile.id;

    // Ensure at least one category exists in db
    let currentCategories = await db.categories.toArray();
    if (currentCategories.length === 0 && categories.length > 0) {
      currentCategories = [...categories];
    }
    if (currentCategories.length === 0) {
      const defaultCat: Category = {
        id: 'cat-general',
        name: 'Algemeen',
        code: 'ALG',
        gender: 'ALL',
        raceProfileIds: [defaultProfileId],
        raceProfileId: defaultProfileId,
        bibRangeStart: 1,
        bibRangeEnd: 999,
      };
      await db.categories.put(defaultCat);
      currentCategories.push(defaultCat);
    }

    // Find highest bib
    let nextBib = Math.max(0, ...participants.map((p) => p.bibNumber || 0)) + 1;

    for (const c of candidates) {
      if (!c.isValid) continue;

      // Duplicate handling
      if (c.isDuplicate) {
        if (duplicateAction === 'skip') continue;
        if (duplicateAction === 'update' && c.existingParticipantId) {
          const existing = await db.participants.get(c.existingParticipantId);
          if (existing) {
            updatedParticipants.push({
              ...existing,
              firstName: c.firstName || existing.firstName,
              lastName: c.lastName || existing.lastName,
              email: c.email || existing.email,
              phone: c.phone || existing.phone,
              club: c.club || existing.club,
              externalId: c.externalId || existing.externalId,
              updatedAt: now,
            });
          }
          continue;
        }
      }

      // Find matching category (supports exact name, code, case-insensitive, or substring matching)
      const targetCatName = (c.categoryName || '').toLowerCase().trim();
      let matchedCategory = currentCategories.find(
        (cat) =>
          cat.name.toLowerCase() === targetCatName ||
          cat.code.toLowerCase() === targetCatName ||
          (targetCatName && cat.name.toLowerCase().includes(targetCatName)) ||
          (targetCatName && targetCatName.includes(cat.name.toLowerCase()))
      );

      // If category doesn't exist yet but candidate specifies a category name, create it dynamically
      if (!matchedCategory && c.categoryName && c.categoryName.trim()) {
        const cleanCatName = c.categoryName.trim();
        const cleanCode =
          cleanCatName.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) || 'CAT';
        const newCat: Category = {
          id: `cat-${generateUUID().slice(0, 8)}`,
          name: cleanCatName,
          code: cleanCode,
          gender: c.gender === 'F' ? 'F' : c.gender === 'M' ? 'M' : 'ALL',
          raceProfileIds: [defaultProfileId],
          raceProfileId: defaultProfileId,
        };
        await db.categories.put(newCat);
        currentCategories.push(newCat);
        matchedCategory = newCat;
      }

      if (!matchedCategory) {
        matchedCategory = currentCategories[0];
      }

      const assignedBib = c.bibNumber || nextBib++;
      const categoryId = matchedCategory?.id || currentCategories[0]?.id || 'cat-general';
      const raceProfileId =
        getDefaultCategoryProfileId(matchedCategory) ||
        getDefaultCategoryProfileId(currentCategories[0]) ||
        defaultProfileId;

      newParticipants.push({
        id: generateUUID(),
        externalId: c.externalId,
        firstName: c.firstName,
        lastName: c.lastName,
        gender: c.gender || 'M',
        birthDate: c.birthDate,
        email: c.email,
        phone: c.phone,
        club: c.club,
        categoryId,
        raceProfileId,
        bibNumber: assignedBib,
        status: 'READY',
        createdAt: now,
        updatedAt: now,
      });
    }

    if (newParticipants.length > 0) {
      await db.participants.bulkPut(newParticipants);
    }
    if (updatedParticipants.length > 0) {
      await db.participants.bulkPut(updatedParticipants);
    }

    const sheetInfoText =
      selectedSheetNames.length > 0
        ? ` (${selectedSheetNames.length} tabbladen: ${selectedSheetNames.join(', ')})`
        : '';

    await operationService.logAudit(
      'STAMHOOFD_IMPORT_COMPLETED',
      `Stamhoofd import voltooid: ${newParticipants.length} nieuw toegevoegd, ${updatedParticipants.length} bijgewerkt${sheetInfoText}`
    );

    setIsImporting(false);
    setShowImportModal(false);
    setImportStep('upload');
    setParsedData(null);
    setSelectedSheetNames([]);
    setCandidates([]);
    onRefresh();
  };

  const handleExportCsv = () => {
    const headers =
      'Startnummer,Voornaam,Achternaam,Geslacht,Categorie,Wave,Club,E-mail,Telefoon,Stamhoofd ID,Status\n';
    const rows = filtered.map((p) => {
      const cat = categoryMap.get(p.categoryId)?.name || '';
      const wave = p.waveId ? waveMap.get(p.waveId)?.name || '' : '';
      return `${p.bibNumber || ''},"${p.firstName}","${p.lastName}",${p.gender || ''},"${cat}","${wave}","${
        p.club || ''
      }","${p.email || ''}","${p.phone || ''}","${p.externalId || ''}",${p.status}`;
    });
    const csv = headers + rows.join('\n');
    downloadCsvFile(csv, `deelnemers_${Date.now()}.csv`);
  };

  return (
    <div className="space-y-6">
      {showStamhoofd && <StamhoofdIntegrationModal participants={participants} categories={categories} onRefresh={onRefresh} onClose={() => setShowStamhoofd(false)} />}
      {showBibAssignment && <BibAssignmentModal participants={participants} onClose={() => setShowBibAssignment(false)} onRefresh={onRefresh} />}
      {bibMessage && <p role="status" className="rounded-xl bg-slate-800 p-3 text-amber-300">{bibMessage}</p>}
      <EventWorkbookPanel onRefresh={onRefresh} />
      {/* Top Banner & Action Buttons */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="text-xs font-mono uppercase tracking-widest text-blue-400 font-bold flex items-center gap-1.5">
            <Users className="w-4 h-4" /> Deelnemers Administratie
          </span>
          <h2 className="text-2xl font-black text-white tracking-tight mt-0.5">
            Deelnemersbeheer & import
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Totaal: <strong className="text-white">{participants.length}</strong> deelnemers geregistreerd
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button onClick={() => setShowStamhoofd(true)} className="px-3.5 py-2 rounded-xl bg-blue-600 text-white font-bold text-xs">Stamhoofd API</button>
          <button
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-lg shadow-blue-500/20 transition"
          >
            <Upload className="w-4 h-4" /> Andere CSV/Excel import
          </button>
          <button
            onClick={() => setShowBibAssignment(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 text-xs font-semibold transition"
            title="Wijs borstnummers toe per leeftijdsbereik"
          >
            <ArrowUpDown className="w-4 h-4" /> Borstnummers per leeftijd
          </button>
          <SafeConfirmButton
            mode="hold"
            holdDurationSeconds={3}
            variant="danger"
            disabled={clearingBibs || !participants.some(p => p.bibNumber !== undefined)}
            onConfirm={handleClearBibs}
            className="flex items-center gap-1.5"
          >
            <Trash2 className="w-4 h-4" /> Borstnummers wissen
          </SafeConfirmButton>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow transition"
          >
            <UserPlus className="w-4 h-4" /> Nieuwe Deelnemer
          </button>
          <button
            onClick={handleExportCsv}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 border border-slate-700 transition"
            title="Download Deelnemers CSV"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Zoek op naam, borstnummer, club of ticket secret..."
            className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-blue-500"
          />
        </div>

        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-medium focus:outline-none focus:border-blue-500"
        >
          <option value="ALL">Alle Categorieën ({categories.length})</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {/* Participants Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-850 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
                <th className="py-3 px-4 w-16 text-center">Bib</th>
                <th className="py-3 px-4">Naam</th>
                <th className="py-3 px-4">Geslacht</th>
                <th className="py-3 px-4">Categorie</th>
                <th className="py-3 px-4">Startgroep</th>
                <th className="py-3 px-4">Club / Team</th>
                <th className="py-3 px-4">Stamhoofd ID</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-center w-24">Actie</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-500 italic">
                    Geen deelnemers gevonden.
                  </td>
                </tr>
              ) : (
                filtered.map((p) => {
                  const cat = categoryMap.get(p.categoryId);
                  const wave = p.waveId ? waveMap.get(p.waveId) : undefined;

                  return (
                    <tr
                      key={p.id}
                      onClick={() => onSelectParticipant(p)}
                      className="hover:bg-slate-850/80 cursor-pointer transition"
                    >
                      <td className="py-3 px-4 text-center font-mono font-black text-amber-400 text-sm">
                        #{p.bibNumber || '-'}
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-bold text-white block">
                          {p.firstName} {p.lastName}
                          {(p.article || p.stamhoofdRegistration?.product) && <span className="block text-xs text-slate-400">Artikel: {p.article || String(p.stamhoofdRegistration?.product)}</span>}
                          <span className="block text-xs text-slate-400">Profiel: {profiles.find(profile => profile.id === p.raceProfileId)?.name || 'Nog niet gekoppeld'}</span>
                          {(!p.categoryId || !p.raceProfileId) && <span className="block text-xs text-amber-300">Indeling controleren</span>}
                          {p.stamhoofdInactive && <span className="block text-xs text-amber-300">Stamhoofd: geannuleerd/inactief</span>}
                        </span>
                        {p.email && <span className="text-[11px] text-slate-500">{p.email}</span>}
                      </td>
                      <td className="py-3 px-4 text-slate-300">
                        {p.gender === 'M' ? 'Man' : p.gender === 'F' ? 'Vrouw' : 'Open'}
                      </td>
                      <td className="py-3 px-4 text-slate-300 font-medium">
                        {cat?.name || 'Niet toegewezen'}
                      </td>
                      <td className="py-3 px-4 text-slate-400">
                        {wave ? `${wave.name} (${wave.scheduledStartTime})` : 'Geen wave'}
                      </td>
                      <td className="py-3 px-4 text-slate-400">{p.club || '-'}</td>
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-400">
                        {p.externalId || '-'}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                            p.status === 'FINISHED'
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : p.status === 'STARTED'
                              ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                              : p.status === 'DNF' || p.status === 'DNS' || p.status === 'DSQ'
                              ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {p.status || 'READY'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectParticipant(p);
                          }}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-400 hover:text-amber-300 border border-slate-700 text-[11px] font-medium transition shadow-sm"
                          title="Deelnemer bewerken & details bekijken"
                        >
                          <Edit2 className="w-3 h-3" />
                          <span>Aanpassen</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Manual Add Participant Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-amber-400" /> Deelnemer Toevoegen
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddParticipant} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-slate-400 block mb-1">Voornaam *:</label>
                  <input
                    type="text"
                    required
                    value={newFirstName}
                    onChange={(e) => setNewFirstName(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Achternaam *:</label>
                  <input
                    type="text"
                    required
                    value={newLastName}
                    onChange={(e) => setNewLastName(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-slate-400 block mb-1">Startnummer (optioneel):</label>
                  <input
                    type="number"
                    value={newBib}
                    onChange={(e) => setNewBib(e.target.value)}
                    placeholder="bv. 101"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Geslacht:</label>
                  <select
                    value={newGender}
                    onChange={(e) => setNewGender(e.target.value as any)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
                  >
                    <option value="M">Man (M)</option>
                    <option value="F">Vrouw (V)</option>
                    <option value="X">Open / X</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Categorie:</label>
                <select
                  value={newCatId}
                  onChange={(e) => {
                    const categoryId = e.target.value;
                    setNewCatId(categoryId);
                    const categoryProfileId = getDefaultCategoryProfileId(categoryMap.get(categoryId));
                    if (categoryProfileId) setNewProfileId(categoryProfileId);
                  }}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Wedstrijdprofiel *:</label>
                <select
                  required
                  value={newProfileId}
                  onChange={(e) => setNewProfileId(e.target.value)}
                  className="w-full bg-slate-800 border border-emerald-600/60 rounded-lg px-3 py-2 text-white"
                >
                  <option value="">Kies een wedstrijdprofiel...</option>
                  {newParticipantProfiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>{profile.name}</option>
                  ))}
                </select>
                {profiles.find((profile) => profile.id === newProfileId) && (
                  <span className="text-[10px] text-emerald-400 block mt-1">
                    {profiles.find((profile) => profile.id === newProfileId)?.legs.filter((leg) => leg.type === 'RUN').map((leg) => `${leg.distanceMeters || 0}m`).join(' + ') || 'Geen looponderdeel'}{' '}
                    • {profiles.find((profile) => profile.id === newProfileId)?.legs.filter((leg) => leg.type === 'SHOOT').length || 0} schietproeven
                  </span>
                )}
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Wave / Startgroep:</label>
                <select
                  value={newWaveId}
                  onChange={(e) => setNewWaveId(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
                >
                  {waves.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({w.scheduledStartTime})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Club / Woonplaats:</label>
                <input
                  type="text"
                  value={newClub}
                  onChange={(e) => setNewClub(e.target.value)}
                  placeholder="Naam van de club"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
                />
              </div>

              <div className="flex gap-2 justify-end pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 font-medium"
                >
                  Annuleren
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-amber-500 text-slate-950 font-bold"
                >
                  Toevoegen
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Stamhoofd Import Modal (Supports multi-sheet Excel and CSV) */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-4xl w-full max-h-[92vh] flex flex-col p-6 shadow-2xl space-y-4 text-xs">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-blue-400" /> Stamhoofd CSV / Excel Import
                </h3>
                <p className="text-slate-400 text-[11px]">
                  Ondersteunt UTF-8, CSV en Excel-werkmappen (.xlsx, .xls) met meerdere tabbladen
                </p>
              </div>
              <button
                onClick={() => setShowImportModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Step Wizard Indicator */}
            <div className="flex items-center gap-2 text-[11px] font-medium text-slate-400 border-b border-slate-800 pb-2.5">
              <span
                className={`flex items-center gap-1 ${
                  importStep === 'upload' ? 'text-blue-400 font-bold' : 'text-slate-500'
                }`}
              >
                1. Bestand
              </span>
              <span>›</span>
              {parsedData?.isExcel && parsedData.sheets && parsedData.sheets.length > 1 && (
                <>
                  <span
                    className={`flex items-center gap-1 ${
                      importStep === 'sheets' ? 'text-blue-400 font-bold' : 'text-slate-500'
                    }`}
                  >
                    2. Tabbladen ({selectedSheetNames.length}/{parsedData.sheets.length})
                  </span>
                  <span>›</span>
                </>
              )}
              <span
                className={`flex items-center gap-1 ${
                  importStep === 'mapping' ? 'text-blue-400 font-bold' : 'text-slate-500'
                }`}
              >
                {parsedData?.isExcel && parsedData.sheets && parsedData.sheets.length > 1 ? '3' : '2'}. Kolomkoppeling
              </span>
              <span>›</span>
              <span
                className={`flex items-center gap-1 ${
                  importStep === 'preview' ? 'text-blue-400 font-bold' : 'text-slate-500'
                }`}
              >
                {parsedData?.isExcel && parsedData.sheets && parsedData.sheets.length > 1 ? '4' : '3'}. Controle & Import
              </span>
            </div>

            {/* Step 1: Upload */}
            {importStep === 'upload' && (
              <div className="py-8 text-center space-y-4">
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`border-2 border-dashed p-8 rounded-2xl cursor-pointer transition flex flex-col items-center justify-center space-y-3 ${
                    isDraggingFile
                      ? 'border-blue-400 bg-blue-950/30'
                      : 'border-slate-700 hover:border-blue-500 bg-slate-850'
                  }`}
                >
                  <Upload className="w-10 h-10 text-blue-400" />
                  <div>
                    <span className="text-sm font-bold text-white block">
                      Klik om een Stamhoofd exportbestand te selecteren
                    </span>
                    <span className="text-slate-400">of sleep het bestand hierheen</span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono">
                    <span className="bg-slate-800 px-2 py-0.5 rounded border border-slate-700 text-slate-300">
                      Excel (.xlsx, .xls) met meerdere tabbladen
                    </span>
                    <span>of</span>
                    <span className="bg-slate-800 px-2 py-0.5 rounded border border-slate-700 text-slate-300">
                      CSV (.csv)
                    </span>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </div>
              </div>
            )}

            {/* Step 2: Sheet selection for multi-sheet Excel files */}
            {importStep === 'sheets' && parsedData?.sheets && (
              <div className="space-y-4 overflow-y-auto max-h-[62vh] pr-1">
                <div className="bg-blue-950/40 border border-blue-800/60 rounded-xl p-3.5 text-blue-200">
                  <div className="flex items-start gap-3">
                    <Layers className="w-5 h-5 text-blue-400 mt-0.5 shrink-0" />
                    <div>
                      <h4 className="font-bold text-white text-sm">
                        Meerdere tabbladen gevonden in {parsedData.fileName}
                      </h4>
                      <p className="text-blue-300/90 text-[11px] mt-0.5">
                        Dit Excel-bestand bevat <strong>{parsedData.sheets.length} tabbladen</strong>. Selecteer welke tabbladen je wilt inlezen. Je kunt meerdere tabbladen automatisch laten samenvoegen tot één gezamenlijke deelnemerslijst.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Quick actions bar */}
                <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-slate-850 rounded-lg border border-slate-750">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleSelectAllSheets}
                      className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-[11px] border border-slate-700 transition"
                    >
                      Alles selecteren ({parsedData.sheets.length})
                    </button>
                    <button
                      onClick={handleSelectFilledSheets}
                      className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-[11px] border border-slate-700 transition"
                    >
                      Alleen gevulde tabbladen ({parsedData.sheets.filter((s) => s.rowCount > 0).length})
                    </button>
                    <button
                      onClick={handleDeselectAllSheets}
                      className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 text-[11px] border border-slate-700 transition"
                    >
                      Deselecteren
                    </button>
                  </div>

                  <div className="text-right">
                    <span className="font-bold text-white">
                      {selectedSheetNames.length} van {parsedData.sheets.length} geselecteerd
                    </span>
                    <span className="text-slate-400 text-[11px] ml-2">
                      • {parsedData.rows.length} rijen in totaal
                    </span>
                  </div>
                </div>

                {/* Tabbladen grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {parsedData.sheets.map((sheet) => {
                    const isSelected = selectedSheetNames.includes(sheet.name);
                    const isFilled = sheet.rowCount > 0;
                    return (
                      <div
                        key={sheet.name}
                        onClick={() => handleToggleSheet(sheet.name)}
                        className={`p-3 rounded-lg border cursor-pointer transition flex flex-col justify-between space-y-2 ${
                          isSelected
                            ? 'bg-blue-950/30 border-blue-500/70 shadow-sm'
                            : 'bg-slate-850/60 border-slate-750 hover:border-slate-600 opacity-80'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {}} // Handled by card click
                              className="rounded border-slate-600 text-blue-500 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                            />
                            <div>
                              <span className="font-bold text-white text-xs block">{sheet.name}</span>
                              <span
                                className={`text-[10px] font-medium px-1.5 py-0.5 rounded inline-block mt-0.5 ${
                                  isFilled
                                    ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/50'
                                    : 'bg-slate-800 text-slate-400'
                                }`}
                              >
                                {isFilled ? `${sheet.rowCount} deelnemers / rijen` : '0 rijen (leeg tabblad)'}
                              </span>
                            </div>
                          </div>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSelectSingleSheet(sheet.name);
                            }}
                            className="text-[10px] px-2 py-1 bg-slate-800 hover:bg-blue-600 hover:text-white text-slate-300 rounded border border-slate-700 transition"
                            title="Selecteer alleen dit tabblad en ga direct naar kolomkoppeling"
                          >
                            Enkel dit tabblad →
                          </button>
                        </div>

                        {sheet.headers.length > 0 ? (
                          <div className="text-[10px] text-slate-400 truncate">
                            <span className="text-slate-500">Kolommen:</span>{' '}
                            {sheet.headers.slice(0, 4).join(', ')}
                            {sheet.headers.length > 4 && ` (+${sheet.headers.length - 4})`}
                          </div>
                        ) : (
                          <div className="text-[10px] text-slate-500 italic">Geen kolommen gevonden</div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Option to use tab name as category */}
                <div className="bg-slate-850 p-3 rounded-lg border border-slate-750 flex items-start gap-3">
                  <input
                    type="checkbox"
                    id="useSheetCat"
                    checked={useSheetAsCategory}
                    onChange={(e) => setUseSheetAsCategory(e.target.checked)}
                    className="rounded border-slate-600 text-blue-500 focus:ring-blue-500 w-4 h-4 mt-0.5 cursor-pointer"
                  />
                  <label htmlFor="useSheetCat" className="cursor-pointer">
                    <span className="font-semibold text-white block text-xs">
                      Gebruik tabbladnaam automatisch als Categorie (aanbevolen)
                    </span>
                    <span className="text-slate-400 text-[11px] block mt-0.5">
                      Ideaal wanneer verschillende categorieën of reeksen (zoals &quot;Kids&quot;, &quot;Heren&quot;, &quot;Dames&quot;) als afzonderlijke tabbladen zijn opgeslagen.
                    </span>
                  </label>
                </div>

                <div className="flex justify-between pt-3 border-t border-slate-800">
                  <button
                    onClick={() => setImportStep('upload')}
                    className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 font-medium"
                  >
                    Terug naar Upload
                  </button>
                  <button
                    onClick={() => setImportStep('mapping')}
                    disabled={selectedSheetNames.length === 0 || parsedData.rows.length === 0}
                    className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold transition"
                  >
                    Doorgaan naar Kolomkoppeling ({parsedData.rows.length} rijen) →
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Column Mapping */}
            {importStep === 'mapping' && parsedData && (
              <div className="space-y-4 overflow-y-auto max-h-[62vh]">
                {/* Multi-sheet info banner */}
                {parsedData.isExcel && parsedData.sheets && parsedData.sheets.length > 1 ? (
                  <div className="bg-blue-950/40 border border-blue-800/60 p-3 rounded-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-blue-200">
                    <div className="flex items-center gap-2.5 truncate">
                      <Layers className="w-5 h-5 text-blue-400 shrink-0" />
                      <div className="truncate">
                        <span className="font-semibold text-white block text-sm">
                          Alle {selectedSheetNames.length} tabbladen verzameld ({parsedData.rows.length} rijen in totaal)
                        </span>
                        <span className="text-xs text-blue-300/80 block truncate">
                          {selectedSheetNames.join(', ')} • Dubbele kolomkoppen zijn per tabblad aangeduid als [Tabblad] Kopnaam
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => setImportStep('sheets')}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-blue-200 hover:text-white rounded text-xs font-medium shrink-0 transition"
                    >
                      Tabbladen filteren
                    </button>
                  </div>
                ) : (
                  <p className="text-slate-300">
                    Bestand: <strong className="text-white">{parsedData.fileName}</strong>{' '}
                    {selectedSheetNames[0] && (
                      <span className="text-slate-400">(Tabblad: {selectedSheetNames[0]})</span>
                    )}{' '}
                    — {parsedData.rows.length} rijen gevonden. Controleer de kolomkoppelingen:
                  </p>
                )}

                {/* Tab to category fallback toggle */}
                {selectedSheetNames.length > 0 && (
                  <div className="bg-slate-850 p-2.5 rounded-lg border border-slate-750 flex items-center gap-2.5">
                    <input
                      type="checkbox"
                      id="useSheetCatMapping"
                      checked={useSheetAsCategory}
                      onChange={(e) => setUseSheetAsCategory(e.target.checked)}
                      className="rounded border-slate-600 text-blue-500 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                    />
                    <label htmlFor="useSheetCatMapping" className="cursor-pointer text-slate-300 text-xs">
                      Val terug op tabbladnaam als categorie indien kolom leeg of niet gekoppeld is
                    </label>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    { key: 'firstName', label: 'Voornaam *' },
                    { key: 'lastName', label: 'Achternaam *' },
                    { key: 'category', label: 'Categorie / Reeks *' },
                    { key: 'bibNumber', label: 'Startnummer (Bib)' },
                    { key: 'externalId', label: 'Stamhoofd ID' },
                    { key: 'club', label: 'Club / Team' },
                    { key: 'gender', label: 'Geslacht' },
                    { key: 'birthDate', label: 'Geboortedatum' },
                    { key: 'email', label: 'E-mailadres' },
                    { key: 'phone', label: 'Telefoonnummer' },
                  ].map((f) => (
                    <div key={f.key} className="bg-slate-850 p-2.5 rounded-lg border border-slate-750">
                      <label className="text-slate-300 font-semibold block mb-1">{f.label}:</label>
                      <select
                        value={columnMapping[f.key as keyof ImportColumnMapping] || ''}
                        onChange={(e) =>
                          setColumnMapping({
                            ...columnMapping,
                            [f.key]: e.target.value || undefined,
                          })
                        }
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-white"
                      >
                        <option value="">-- Niet gekoppeld --</option>
                        {parsedData.headers.map((h, hIdx) => (
                          <option key={`hdr-${f.key}-${h}-${hIdx}`} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>

                <div className="flex justify-between items-center pt-3 border-t border-slate-800">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setImportStep('upload')}
                      className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 font-medium transition"
                    >
                      ← Ander bestand kiezen
                    </button>
                    {parsedData.isExcel && parsedData.sheets && parsedData.sheets.length > 1 && (
                      <button
                        onClick={() => setImportStep('sheets')}
                        className="px-3 py-2 rounded-lg bg-slate-850 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-750 text-xs font-medium transition"
                      >
                        Tabbladen filteren ({selectedSheetNames.length})
                      </button>
                    )}
                  </div>
                  <button
                    onClick={handleProceedToPreview}
                    className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold"
                  >
                    Controleer Gegevens & Duplicaten →
                  </button>
                </div>
              </div>
            )}

            {/* Step 4: Preview & Duplicate Resolution */}
            {importStep === 'preview' && (
              <div className="space-y-4 overflow-y-auto max-h-[62vh]">
                <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-slate-850 rounded-lg border border-slate-750">
                  <div>
                    <span className="font-bold text-white block">
                      {candidates.filter((c) => c.isValid).length} van de {candidates.length} rijen geldig
                    </span>
                    <span className="text-slate-400 text-[11px]">
                      {candidates.filter((c) => c.isDuplicate).length} duplicaten gedetecteerd
                    </span>
                  </div>

                  {/* Duplicate handling strategy */}
                  <div className="flex items-center gap-2">
                    <span className="text-slate-300 font-semibold">Bij duplicaat:</span>
                    <select
                      value={duplicateAction}
                      onChange={(e) => setDuplicateAction(e.target.value as any)}
                      className="bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-white"
                    >
                      <option value="skip">Overslaan (Bestaande behouden)</option>
                      <option value="update">Bestaande gegevens bijwerken</option>
                    </select>
                  </div>
                </div>

                {/* Multi-sheet preview filter tabs */}
                {selectedSheetNames.length > 1 && (
                  <div className="flex flex-wrap items-center gap-1.5 p-2 bg-slate-850 rounded-lg border border-slate-750">
                    <span className="text-slate-400 text-[11px] font-medium flex items-center gap-1 mr-1">
                      <Filter className="w-3.5 h-3.5" /> Filter tabblad:
                    </span>
                    <button
                      onClick={() => setPreviewSheetFilter('ALL')}
                      className={`px-2.5 py-0.5 rounded text-[11px] font-medium transition ${
                        previewSheetFilter === 'ALL'
                          ? 'bg-blue-600 text-white font-bold'
                          : 'bg-slate-800 text-slate-300 hover:bg-slate-750'
                      }`}
                    >
                      Alle tabbladen ({candidates.length})
                    </button>
                    {selectedSheetNames.map((sheetName) => {
                      const count = candidates.filter((c) => c.sheetName === sheetName).length;
                      return (
                        <button
                          key={sheetName}
                          onClick={() => setPreviewSheetFilter(sheetName)}
                          className={`px-2.5 py-0.5 rounded text-[11px] font-medium transition ${
                            previewSheetFilter === sheetName
                              ? 'bg-blue-600 text-white font-bold'
                              : 'bg-slate-800 text-slate-300 hover:bg-slate-750'
                          }`}
                        >
                          {sheetName} ({count})
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Candidate list preview */}
                <div className="max-h-60 overflow-y-auto space-y-1.5 font-mono text-[11px]">
                  {candidates
                    .filter(
                      (c) =>
                        previewSheetFilter === 'ALL' ||
                        !c.sheetName ||
                        c.sheetName === previewSheetFilter
                    )
                    .slice(0, 20)
                    .map((c, i) => (
                      <div
                        key={`preview-cand-${c.externalId || c.bibNumber || i}-${c.sheetName || ''}-${i}`}
                        className={`p-2 rounded flex items-center justify-between border ${
                          c.isDuplicate
                            ? 'bg-amber-950/40 border-amber-500/40 text-amber-200'
                            : c.isValid
                            ? 'bg-slate-800/80 border-slate-700 text-slate-200'
                            : 'bg-red-950/40 border-red-500/40 text-red-200'
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          {c.sheetName && selectedSheetNames.length > 1 && (
                            <span className="bg-slate-700 text-slate-300 text-[9px] px-1.5 py-0.5 rounded shrink-0 border border-slate-600">
                              Tab: {c.sheetName}
                            </span>
                          )}
                          <span className="font-bold text-white">
                            {c.firstName} {c.lastName}
                          </span>
                          <span>•</span>
                          <span className={c.categorySource === 'sheet' ? 'text-blue-300 font-semibold' : ''}>
                            {c.categoryName || 'Geen categorie'}
                            {c.categorySource === 'sheet' && (
                              <span className="text-[9px] text-blue-400 ml-1">(uit tabblad)</span>
                            )}
                          </span>
                          {c.bibNumber && <span>• Bib #{c.bibNumber}</span>}
                        </div>
                        <span className="text-[10px] shrink-0 ml-2">
                          {c.isDuplicate
                            ? `Duplicaat: ${c.duplicateReason}`
                            : c.isValid
                            ? 'OK'
                            : c.validationErrors.join(', ')}
                        </span>
                      </div>
                    ))}
                  {candidates.filter(
                    (c) =>
                      previewSheetFilter === 'ALL' ||
                      !c.sheetName ||
                      c.sheetName === previewSheetFilter
                  ).length > 20 && (
                    <div className="text-center text-slate-500 italic py-1">
                      ... en nog{' '}
                      {candidates.filter(
                        (c) =>
                          previewSheetFilter === 'ALL' ||
                          !c.sheetName ||
                          c.sheetName === previewSheetFilter
                      ).length - 20}{' '}
                      andere rijen
                    </div>
                  )}
                </div>

                <div className="flex justify-between pt-3 border-t border-slate-800">
                  <button
                    onClick={() => setImportStep('mapping')}
                    className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 font-medium"
                  >
                    Terug naar Koppeling
                  </button>
                  <button
                    onClick={handleConfirmImport}
                    disabled={isImporting || candidates.filter((c) => c.isValid).length === 0}
                    className="px-6 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold shadow"
                  >
                    {isImporting ? 'Importeren...' : 'Definitief Importeren'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
