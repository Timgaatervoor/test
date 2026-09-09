import { raceClock } from '../../services/raceClock';
import React, { useEffect, useState } from 'react';
import './LiveLeaderboardView.css';
import {
  Trophy,
  Search,
  Filter,
  Medal,
  Tv,
  Lock,
  Unlock,
  Download,
  Share2,
  Crosshair,
  Flag,
  Settings,
  Clock,
  Sun,
  Moon,
  Shield,
  KeyRound,
  Play,
  Pause,
  ChevronLeft,
  ChevronRight,
  Activity,
  Users,
  AlertTriangle,
} from 'lucide-react';
import type { RaceResult, Category, Wave, RaceEvent, ParticipantStatus } from '../../types';
import { formatDuration } from '../../services/timingEngine';
import { downloadCsvFile } from '../../services/backupService';
import { soundService } from '../../services/soundService';
import { SafeConfirmButton } from '../SafeConfirmButton';

interface LiveLeaderboardViewProps {
  results: RaceResult[];
  categories: Category[];
  waves: Wave[];
  event: RaceEvent | null;
  mode?: 'live' | 'results';
  onSelectParticipant: (result: RaceResult) => void;
  onKioskModeChange?: (isKioskMode: boolean) => void;
}

interface TvKioskConfig {
  showPodium: boolean;
  showClock: boolean;
  rotateCategories: boolean;
  categoryIds: string[];
  rotationSeconds: number;
  textScale: 'normal' | 'large' | 'extra-large' | 'jumbo-tv';
  theme: 'dark' | 'daylight';
  pageSize: number;
  autoPaginate: boolean;
  kioskPin?: string;
}

const defaultTvKioskConfig: TvKioskConfig = {
  showPodium: true,
  showClock: true,
  rotateCategories: false,
  categoryIds: [],
  rotationSeconds: 15,
  textScale: 'large',
  theme: 'dark',
  pageSize: 12,
  autoPaginate: true,
  kioskPin: '',
};

export const LiveLeaderboardView: React.FC<LiveLeaderboardViewProps> = ({
  results,
  categories,
  waves,
  event,
  mode = 'live',
  onSelectParticipant,
  onKioskModeChange,
}) => {
  const kioskStorageKey = `biathlon_tv_kiosk_config:${event?.id || 'new'}`;
  const profileOptions = [...new Map(results.map(r => [r.raceProfileId ?? '', r.raceProfileName ?? 'Nog niet gekoppeld'])).entries()];
  const [selectedProfile, setSelectedProfile] = useState('__default');
  const activeProfile = profileOptions.some(([id]) => id === selectedProfile) ? selectedProfile : profileOptions.find(([id]) => !!id)?.[0] ?? '';
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedWave, setSelectedWave] = useState<string>('ALL');
  const [selectedGender, setSelectedGender] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | ParticipantStatus>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isKioskMode, setIsKioskMode] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState(() => new Date(raceClock.nowMs()));
  const [showKioskSettings, setShowKioskSettings] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [rotationSecondsLeft, setRotationSecondsLeft] = useState(15);
  const [isRotationPaused, setIsRotationPaused] = useState(false);
  const [showExitPinModal, setShowExitPinModal] = useState(false);
  const [exitPinInput, setExitPinInput] = useState('');
  const [exitPinError, setExitPinError] = useState<string | null>(null);

  const [tvConfig, setTvConfig] = useState<TvKioskConfig>(() => {
    try {
      const storedConfig = JSON.parse(localStorage.getItem(kioskStorageKey) || '{}');
      return {
        ...defaultTvKioskConfig,
        showPodium: storedConfig.showPodium !== false,
        showClock: storedConfig.showClock !== false,
        rotateCategories: storedConfig.rotateCategories === true,
        rotationSeconds: [10, 15, 20, 30, 60].includes(storedConfig.rotationSeconds) ? storedConfig.rotationSeconds : 15,
        categoryIds: Array.isArray(storedConfig.categoryIds) ? storedConfig.categoryIds : [],
        textScale: ['normal', 'large', 'extra-large', 'jumbo-tv'].includes(storedConfig.textScale) ? storedConfig.textScale : defaultTvKioskConfig.textScale,
        theme: storedConfig.theme === 'daylight' ? 'daylight' : 'dark',
        pageSize: typeof storedConfig.pageSize === 'number' ? storedConfig.pageSize : 12,
        autoPaginate: storedConfig.autoPaginate !== false,
        kioskPin: typeof storedConfig.kioskPin === 'string' ? storedConfig.kioskPin : '',
      };
    } catch {
      return defaultTvKioskConfig;
    }
  });

  const availableCategoryIds = categories.filter(c => results.some(r => (r.raceProfileId ?? '') === activeProfile && r.categoryId === c.id && (selectedWave === 'ALL' || r.waveId === selectedWave) && (selectedGender === 'ALL' || r.gender === selectedGender))).map(c => c.id);
  const configuredCategoryIds = tvConfig.categoryIds.filter((id) => availableCategoryIds.includes(id));
  const rotationCategoryIds = configuredCategoryIds.length === 0 ? availableCategoryIds : configuredCategoryIds;
  const rotationCategoryKey = rotationCategoryIds.join('|');

  useEffect(() => {
    try { localStorage.setItem(kioskStorageKey, JSON.stringify(tvConfig)); } catch { /* Kiosk remains usable if browser storage is unavailable. */ }
  }, [tvConfig, kioskStorageKey]);

  useEffect(() => {
    onKioskModeChange?.(isKioskMode);
  }, [isKioskMode, onKioskModeChange]);

  useEffect(() => () => onKioskModeChange?.(false), [onKioskModeChange]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && isKioskMode && !tvConfig.kioskPin) {
        setIsKioskMode(false);
        setShowKioskSettings(false);
      }
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, [isKioskMode, tvConfig.kioskPin]);

  useEffect(() => {
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isKioskMode) {
        if (tvConfig.kioskPin && tvConfig.kioskPin.trim()) {
          setExitPinInput('');
          setExitPinError(null);
          setShowExitPinModal(true);
        } else {
          performExitKiosk();
        }
      }
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [isKioskMode, tvConfig.kioskPin]);

  const enterKioskMode = async () => {
    soundService.playSuccess();
    try {
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      }
    } catch { /* Fullscreen may be rejected in certain iframes */ }
    setIsKioskMode(true);
    setCurrentPage(0);
    setRotationSecondsLeft(tvConfig.rotationSeconds);
  };

  const performExitKiosk = async () => {
    soundService.playSuccess();
    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen?.();
      } catch { /* ignore */ }
    }
    setIsKioskMode(false);
    setShowKioskSettings(false);
    setShowExitPinModal(false);
  };

  const handleConfirmExitPin = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (tvConfig.kioskPin && exitPinInput !== tvConfig.kioskPin) {
      soundService.playError();
      setExitPinError('Onjuiste Kiosk-PIN. Probeer opnieuw.');
      return;
    }
    performExitKiosk();
  };

  const toggleRotationCategory = (categoryId: string) => {
    setTvConfig((current) => {
      const selectedIds = current.categoryIds.length === 0
        ? availableCategoryIds
        : current.categoryIds.filter((id) => availableCategoryIds.includes(id));

      if (selectedIds.includes(categoryId) && selectedIds.length === 1) return current;

      const nextIds = selectedIds.includes(categoryId)
        ? selectedIds.filter((id) => id !== categoryId)
        : availableCategoryIds.filter((id) => selectedIds.includes(id) || id === categoryId);

      return {
        ...current,
        categoryIds: nextIds.length === availableCategoryIds.length ? [] : nextIds,
      };
    });
  };

  useEffect(() => {
    if (!isKioskMode || !tvConfig.showClock) return;
    const clock = window.setInterval(() => setCurrentTime(new Date(raceClock.nowMs())), 1000);
    return () => window.clearInterval(clock);
  }, [isKioskMode, tvConfig.showClock]);

  // Filter logic
  const filteredResults = results.filter((r) => {
    if ((r.raceProfileId ?? '') !== activeProfile) return false;
    if (selectedCategory !== 'ALL' && r.categoryId !== selectedCategory) return false;
    if (selectedWave !== 'ALL' && r.waveId !== selectedWave) return false;
    if (selectedGender !== 'ALL' && r.gender !== selectedGender) return false;
    if (statusFilter !== 'ALL' && r.status !== statusFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = r.name.toLowerCase().includes(q);
      const matchBib = String(r.bibNumber || '').includes(q);
      const matchClub = (r.club || '').toLowerCase().includes(q);
      if (!matchName && !matchBib && !matchClub) return false;
    }
    return true;
  });

  // Status statistics for live indicators
  const finishedCount = results.filter((r) => r.status === 'FINISHED').length;
  const onCourseCount = results.filter((r) => r.status === 'STARTED').length;
  const onRangeCount = results.filter((r) => r.status === 'STARTED' && r.shootingRounds.length > 0 && r.shootingRounds.length < 2).length;
  const waitingCount = results.filter((r) => r.status === 'REGISTERED' || r.status === 'READY' || r.status === 'CHECKED_IN').length;

  // Pagination for large categories in kiosk mode
  const effectivePageSize = isKioskMode && tvConfig.pageSize > 0 ? tvConfig.pageSize : filteredResults.length || 1;
  const totalPages = Math.max(1, Math.ceil(filteredResults.length / effectivePageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages - 1);
  const displayedResults = isKioskMode && tvConfig.pageSize > 0
    ? filteredResults.slice(safeCurrentPage * effectivePageSize, (safeCurrentPage + 1) * effectivePageSize)
    : filteredResults;

  useEffect(() => {
    setCurrentPage(0);
  }, [selectedCategory, selectedWave, selectedGender, activeProfile]);

  // Combined Category Rotation & Pagination Timer
  useEffect(() => {
    if (!isKioskMode || !tvConfig.rotateCategories || rotationCategoryIds.length === 0) return;

    setSelectedCategory((current) => (
      rotationCategoryIds.includes(current) ? current : rotationCategoryIds[0]
    ));

    const timer = window.setInterval(() => {
      if (isRotationPaused) return;

      setRotationSecondsLeft((prev) => {
        if (prev <= 1) {
          if (tvConfig.autoPaginate && totalPages > 1 && safeCurrentPage < totalPages - 1) {
            setCurrentPage((p) => p + 1);
          } else {
            setCurrentPage(0);
            setSelectedCategory((current) => {
              const currentIndex = rotationCategoryIds.indexOf(current);
              return rotationCategoryIds[(currentIndex + 1) % rotationCategoryIds.length];
            });
          }
          return tvConfig.rotationSeconds;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [isKioskMode, rotationCategoryKey, tvConfig.rotateCategories, tvConfig.rotationSeconds, isRotationPaused, totalPages, safeCurrentPage, tvConfig.autoPaginate]);

  // Search and status only hide rows; category, wave and gender define the ranking.
  const ranked = results.filter(r => r.raceProfileId === activeProfile && r.rankOverall !== undefined &&
    (selectedCategory === 'ALL' || r.categoryId === selectedCategory) &&
    (selectedWave === 'ALL' || r.waveId === selectedWave) &&
    (selectedGender === 'ALL' || r.gender === selectedGender)).sort((a, b) => a.rankOverall! - b.rankOverall!);
  const ranks = new Map(ranked.map((r, index) => [r.participantId, index + 1]));
  const displayRank = (r: RaceResult) => ranks.get(r.participantId);
  const displayGap = (r: RaceResult) => displayRank(r) && ranked.length ? `+${formatDuration(r.officialTimeMs! - ranked[0].officialTimeMs!, true, false)}` : '';

  // Top 3 Podium finishers for the current filter
  const finishedPodium = filteredResults
    .filter((r) => r.status === 'FINISHED' && displayRank(r))
    .slice(0, 3);

  const handleExportCsv = () => {
    const headers =
      'Plaats,Startnummer,Naam,Club,Geslacht,Wedstrijdprofiel,Categorie,Wave,Starttijd,Finishtijd,Looptijd (Raw),Missers,Straftijd,Officiële Tijd,Verschil,Status\n';
    const rows = filteredResults.map((r) => {
      return `${displayRank(r) || ''},${r.bibNumber || ''},"${r.name}","${
        r.club || ''
      }",${r.gender || ''},"${r.raceProfileName || ''}","${r.categoryName || ''}","${r.waveName || ''}",${r.startTime || ''},${
        r.finishTime || ''
      },${r.rawElapsedFormatted || ''},${r.totalMisses || 0},${r.penaltyFormatted || ''},${
        r.officialTimeFormatted || ''
      },${displayGap(r) || ''},${r.status}`;
    });

    const csv = headers + rows.join('\n');
    downloadCsvFile(csv, `uitslagen_${Date.now()}.csv`);
  };

  return (
    <div
      data-text-scale={isKioskMode ? tvConfig.textScale : undefined}
      data-theme={isKioskMode ? tvConfig.theme : undefined}
      className={`space-y-5 text-xs ${
        isKioskMode
          ? `leaderboard-kiosk p-3 sm:p-6 min-h-screen ${
              tvConfig.theme === 'daylight' ? 'bg-white text-slate-950' : 'bg-slate-950 text-white'
            }`
          : ''
      }`}
    >
      {/* Kiosk Mode Status Summary Bar */}
      {isKioskMode && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-sm">🏁</div>
            <div>
              <div className="text-[10px] text-slate-400 uppercase font-semibold">Gefinisht</div>
              <div className="text-base font-black text-white font-mono">{finishedCount}</div>
            </div>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-sm">🏃</div>
            <div>
              <div className="text-[10px] text-slate-400 uppercase font-semibold">Op Parcours</div>
              <div className="text-base font-black text-white font-mono">{onCourseCount}</div>
            </div>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-sm">🎯</div>
            <div>
              <div className="text-[10px] text-slate-400 uppercase font-semibold">Schietstand</div>
              <div className="text-base font-black text-white font-mono">{onRangeCount}</div>
            </div>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-slate-800 text-slate-400 flex items-center justify-center font-bold text-sm">⏱️</div>
            <div>
              <div className="text-[10px] text-slate-400 uppercase font-semibold">Wacht op Start</div>
              <div className="text-base font-black text-white font-mono">{waitingCount}</div>
            </div>
          </div>
        </div>
      )}

      {/* Top Banner & TV Kiosk Mode Toggle */}
      <div className={isKioskMode
        ? 'flex flex-wrap items-center justify-between gap-3 bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-lg'
        : 'bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-wrap items-center justify-between gap-4'}>
        {!isKioskMode && <div>
          <div className="flex items-center gap-2 mb-1">
            <Trophy className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-mono uppercase tracking-widest text-amber-400 font-bold">
              {mode === 'results' ? 'Officiële Wedstrijduitslagen' : 'Live Wedstrijdbord (Realtime)'}
            </span>
            {event?.officialResultsLocked ? (
              <span className="text-[10px] bg-red-500/20 text-red-300 border border-red-500/30 px-2 py-0.5 rounded font-bold uppercase flex items-center gap-1">
                <Lock className="w-3 h-3" /> Officieel Vastgelegd
              </span>
            ) : (
              <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded font-bold uppercase">
                {mode === 'results' ? 'Voorlopige Uitslag' : 'Live Tussentijden'}
              </span>
            )}
          </div>
          <p className="text-amber-300 font-bold">{profileOptions.find(([id]) => id === activeProfile)?.[1]} · {selectedCategory === 'ALL' ? 'Alle leeftijdscategorieën' : categories.find(c => c.id === selectedCategory)?.name}</p>
          <h2 className="text-2xl font-black text-white tracking-tight">
            {event?.name || 'Nieuw evenement'}
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {mode === 'results'
              ? `Eindklassementen inclusief schietstraftijden (+${event?.penaltySecondsPerMiss || 20}s per misser) en categorie-podia`
              : `Realtime updates tijdens de race: actieve lopers op parcours, live schietbeurten en virtuele tussenstanden`}
          </p>
        </div>}

        {isKioskMode && (
          <div className="flex items-center gap-3">
            <Trophy className="w-5 h-5 text-amber-400" />
            <div>
              <p className="text-sm font-bold text-amber-300">
                {profileOptions.find(([id]) => id === activeProfile)?.[1]} · {selectedCategory === 'ALL' ? 'Alle categorieën' : categories.find(c => c.id === selectedCategory)?.name}
              </p>
              <h2 className="text-lg font-black text-white">{event?.name || 'Biathlon Klassement'}</h2>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2.5">
          {isKioskMode && tvConfig.showClock && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/80 border border-slate-700 text-amber-300 font-mono font-bold text-sm">
              <Clock className="w-4 h-4" />
              <span>{currentTime.toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
            </div>
          )}

          {isKioskMode && (
            <button
              type="button"
              onClick={() => {
                const nextTheme = tvConfig.theme === 'daylight' ? 'dark' : 'daylight';
                setTvConfig({ ...tvConfig, theme: nextTheme });
                soundService.playSuccess();
              }}
              title={tvConfig.theme === 'daylight' ? 'Schakel naar Donkere Modus' : 'Schakel naar Zonlicht / Daglicht Modus'}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 text-xs font-bold transition"
            >
              {tvConfig.theme === 'daylight' ? <Moon className="w-4 h-4 text-indigo-400" /> : <Sun className="w-4 h-4 text-amber-400" />}
              <span className="hidden sm:inline">{tvConfig.theme === 'daylight' ? 'Nacht' : 'Zonlicht'}</span>
            </button>
          )}

          {!isKioskMode && (
            <button
              onClick={handleExportCsv}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 text-xs font-medium transition"
            >
              <Download className="w-4 h-4" /> CSV Export
            </button>
          )}

          {isKioskMode && (
            <button
              type="button"
              aria-expanded={showKioskSettings}
              aria-controls="kiosk-settings"
              onClick={() => setShowKioskSettings((current) => !current)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 text-slate-200 hover:bg-slate-700 border border-slate-700 text-xs font-bold transition"
            >
              <Settings className="w-4 h-4" />
              <span className="hidden sm:inline">Opties</span>
            </button>
          )}

          {!isKioskMode ? (
            <button
              onClick={enterKioskMode}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold bg-slate-800 text-slate-200 hover:bg-slate-750 border border-slate-700 transition"
            >
              <Tv className="w-4 h-4 text-amber-400" />
              <span>TV Kiosk Modus</span>
            </button>
          ) : tvConfig.kioskPin && tvConfig.kioskPin.trim() ? (
            <button
              onClick={() => {
                setExitPinInput('');
                setExitPinError(null);
                setShowExitPinModal(true);
              }}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-black bg-amber-500 hover:bg-amber-400 text-slate-950 shadow transition"
            >
              <Lock className="w-4 h-4" />
              <span>Kiosk Verlaten</span>
            </button>
          ) : (
            <SafeConfirmButton
              mode="hold"
              holdDurationSeconds={3}
              variant="warning"
              onConfirm={performExitKiosk}
              className="py-1.5 px-3 text-xs font-black shadow"
            >
              <Unlock className="w-4 h-4" />
              <span>Houd 3s: Sluit Kiosk</span>
            </SafeConfirmButton>
          )}
        </div>
      </div>

      {/* Rotation Progress & Controls in Kiosk Mode */}
      {isKioskMode && tvConfig.rotateCategories && (
        <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-2.5 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setIsRotationPaused(!isRotationPaused)}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
            title={isRotationPaused ? 'Hervat automatische rotatie' : 'Pauzeer automatische rotatie'}
          >
            {isRotationPaused ? <Play className="w-3.5 h-3.5 text-amber-400" /> : <Pause className="w-3.5 h-3.5 text-slate-400" />}
          </button>
          <div className="flex-1 space-y-1">
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span className="font-semibold text-slate-300">
                Rotatie: {categories.find(c => c.id === selectedCategory)?.name || 'Alle Categorieën'}
                {totalPages > 1 && ` (Pagina ${safeCurrentPage + 1}/${totalPages})`}
              </span>
              <span className="font-mono text-amber-400 font-bold">
                {isRotationPaused ? 'Gepauzeerd' : `${rotationSecondsLeft}s`}
              </span>
            </div>
            <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-1000 ease-linear ${
                  isRotationPaused ? 'bg-slate-600' : 'bg-amber-400'
                }`}
                style={{
                  width: isRotationPaused
                    ? '100%'
                    : `${((tvConfig.rotationSeconds - rotationSecondsLeft) / tvConfig.rotationSeconds) * 100}%`,
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Settings Drawer in Kiosk Mode */}
      {isKioskMode && showKioskSettings && (
        <div id="kiosk-settings" className="bg-slate-900 border border-amber-500/40 rounded-2xl p-5 space-y-4 text-xs shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="font-bold text-white text-sm flex items-center gap-2">
              <Settings className="w-4 h-4 text-amber-400" /> Kiosk- en TV-Instellingen
            </h3>
            <button
              onClick={() => setShowKioskSettings(false)}
              className="text-slate-400 hover:text-white font-bold"
            >
              ✕ Sluiten
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            <label className="flex items-center gap-2 text-slate-200">
              <input
                type="checkbox"
                checked={tvConfig.theme === 'daylight'}
                onChange={(event) => setTvConfig({ ...tvConfig, theme: event.target.checked ? 'daylight' : 'dark' })}
              />
              <span className="font-medium">☀️ High-Contrast Zonlicht / Daglicht</span>
            </label>

            <label className="flex items-center gap-2 text-slate-200">
              <input
                type="checkbox"
                checked={tvConfig.showPodium}
                onChange={(event) => setTvConfig({ ...tvConfig, showPodium: event.target.checked })}
              />
              <span>Top-3 Podium tonen</span>
            </label>

            <label className="flex items-center gap-2 text-slate-200">
              <input
                type="checkbox"
                checked={tvConfig.showClock}
                onChange={(event) => setTvConfig({ ...tvConfig, showClock: event.target.checked })}
              />
              <span>Live Klok tonen</span>
            </label>

            <label className="flex items-center gap-2 text-slate-200">
              <input
                type="checkbox"
                checked={tvConfig.rotateCategories}
                onChange={(event) => setTvConfig({ ...tvConfig, rotateCategories: event.target.checked })}
              />
              <span>Categorieën roteren</span>
            </label>

            <div className="space-y-1">
              <span className="text-slate-300 block">Rotatie Interval:</span>
              <select
                value={tvConfig.rotationSeconds}
                onChange={(event) => setTvConfig({ ...tvConfig, rotationSeconds: Number(event.target.value) })}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white"
              >
                <option value={10}>10 seconden</option>
                <option value={15}>15 seconden</option>
                <option value={20}>20 seconden</option>
                <option value={30}>30 seconden</option>
                <option value={60}>60 seconden</option>
              </select>
            </div>

            <div className="space-y-1">
              <span className="text-slate-300 block">TV Typografie & Schaalgrootte:</span>
              <select
                value={tvConfig.textScale}
                onChange={(event) => setTvConfig({ ...tvConfig, textScale: event.target.value as TvKioskConfig['textScale'] })}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white"
              >
                <option value="normal">Normaal (Desktop/Tablet)</option>
                <option value="large">Groot (TV 3-5 meter)</option>
                <option value="extra-large">Extra Groot (TV 5-8 meter)</option>
                <option value="jumbo-tv">Grote TV / Kiosk (10+ meter afstand)</option>
              </select>
            </div>

            <div className="space-y-1">
              <span className="text-slate-300 block">Paginering bij grote groepen:</span>
              <select
                value={tvConfig.pageSize}
                onChange={(event) => setTvConfig({ ...tvConfig, pageSize: Number(event.target.value) })}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white"
              >
                <option value={8}>8 atleten per pagina</option>
                <option value={12}>12 atleten per pagina</option>
                <option value={16}>16 atleten per pagina</option>
                <option value={20}>20 atleten per pagina</option>
                <option value={0}>Alle atleten ineens (geen paging)</option>
              </select>
            </div>

            <div className="space-y-1">
              <span className="text-slate-300 flex items-center gap-1">
                <Shield className="w-3.5 h-3.5 text-amber-400" /> Kiosk PIN-vergrendeling (optioneel):
              </span>
              <input
                type="text"
                maxLength={6}
                value={tvConfig.kioskPin || ''}
                onChange={(e) => setTvConfig({ ...tvConfig, kioskPin: e.target.value })}
                placeholder="bv. 1234 (leeg = 3s hold)"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-mono placeholder:text-slate-500"
              />
            </div>
          </div>

          <fieldset className="border-t border-slate-800 pt-3">
            <div className="flex items-center justify-between gap-3 mb-2">
              <legend className="font-bold text-slate-200">Categorieën in de rotatie</legend>
              <button
                type="button"
                onClick={() => setTvConfig((current) => ({ ...current, categoryIds: [] }))}
                className="text-amber-300 hover:text-amber-200 font-semibold"
              >
                Alle selecteren
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {categories.filter(category => availableCategoryIds.includes(category.id)).map((category) => (
                <label key={`kiosk-category-${category.id}`} className="flex items-center gap-2 rounded-lg bg-slate-800/70 border border-slate-700 px-3 py-2 text-slate-200">
                  <input
                    type="checkbox"
                    checked={rotationCategoryIds.includes(category.id)}
                    onChange={() => toggleRotationCategory(category.id)}
                  />
                  <span>{category.name}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      )}

      {/* Filter Toolbar */}
      <div role="region" aria-label="Scorebordfilters" className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            aria-label="Zoeken op naam, startnummer of club"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Zoek op naam, startnummer of club..."
            className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-amber-500"
          />
        </div>

        <label className="text-xs">Wedstrijdprofiel
          <select aria-label="Wedstrijdprofiel" value={activeProfile} onChange={e => { setSelectedProfile(e.target.value); setSelectedCategory('ALL'); }} className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white ml-2">
            {profileOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </label>
        {/* Category Filter */}
        <select
          aria-label="Leeftijdscategorie"
          value={selectedCategory}
          onChange={(e) => {
            setSelectedCategory(e.target.value);
            setTvConfig(current => ({ ...current, rotateCategories: false }));
          }}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-medium focus:outline-none focus:border-amber-500"
        >
          <option value="ALL">Alle Categorieën ({categories.length})</option>
          {categories.map((c) => (
            <option key={`lb-cat-${c.id}`} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        {/* Wave Filter */}
        <select
          aria-label="Startgroep"
          value={selectedWave}
          onChange={(e) => setSelectedWave(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-medium focus:outline-none focus:border-amber-500"
        >
          <option value="ALL">Alle Waves ({waves.length})</option>
          {waves.map((w) => (
            <option key={`lb-wave-${w.id}`} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>

        {/* Gender Filter */}
        <select
          aria-label="Geslacht"
          value={selectedGender}
          onChange={(e) => setSelectedGender(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-medium focus:outline-none focus:border-amber-500"
        >
          <option value="ALL">Geslacht (Alle)</option>
          <option value="M">Heren</option>
          <option value="F">Dames</option>
          <option value="X">Open / onbekend</option>
        </select>
        <select aria-label="Deelnemerstatus" value={statusFilter} onChange={e => setStatusFilter(e.target.value as typeof statusFilter)} className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white">
          <option value="ALL">Alle statussen</option>
          <option value="REGISTERED">Ingeschreven</option>
          <option value="CHECKED_IN">Aangemeld</option>
          <option value="READY">Klaar voor start</option>
          <option value="STARTED">Onderweg</option>
          <option value="FINISHED">Gefinisht</option>
          <option value="DNS">Niet gestart (DNS)</option>
          <option value="DNF">Niet gefinisht (DNF)</option>
          <option value="DSQ">Gediskwalificeerd (DSQ)</option>
        </select>
        {isKioskMode && tvConfig.rotateCategories && <p className="text-xs text-amber-300">Categorierotatie actief. Zelf een categorie kiezen stopt de rotatie.</p>}
      </div>

      {/* Podium Cards if finishes exist */}
      {tvConfig.showPodium && finishedPodium.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Silver #2 */}
          {finishedPodium[1] && (
            <div
              onClick={() => !isKioskMode && onSelectParticipant(finishedPodium[1])}
              className="bg-slate-900 border border-slate-750 hover:border-slate-600 rounded-2xl p-5 shadow cursor-pointer transition flex flex-col justify-between order-2 sm:order-1 relative overflow-hidden"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="w-9 h-9 rounded-xl bg-slate-300 text-slate-950 font-black text-base flex items-center justify-center shadow">
                  #2
                </span>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  ZILVER
                </span>
              </div>
              <div>
                <span className="text-lg font-bold text-white block">
                  {finishedPodium[1].name}
                </span>
                <span className="text-xs text-slate-400">
                  Bib #{finishedPodium[1].bibNumber} • {finishedPodium[1].categoryName}
                </span>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs">
                <span className="text-slate-400">
                  {finishedPodium[1].totalMisses} missers ({finishedPodium[1].penaltyFormatted})
                </span>
                <span className="font-mono font-black text-slate-200 text-base">
                  {finishedPodium[1].officialTimeFormatted}
                </span>
              </div>
            </div>
          )}

          {/* Gold #1 */}
          {finishedPodium[0] && (
            <div
              onClick={() => !isKioskMode && onSelectParticipant(finishedPodium[0])}
              className="bg-gradient-to-b from-amber-950/40 to-slate-900 border-2 border-amber-500/60 rounded-2xl p-6 shadow-2xl cursor-pointer transition flex flex-col justify-between order-1 sm:order-2 scale-105 z-10 relative overflow-hidden"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="w-11 h-11 rounded-xl bg-amber-400 text-slate-950 font-black text-xl flex items-center justify-center shadow-lg shadow-amber-400/30">
                  #1
                </span>
                <span className="text-xs font-black text-amber-400 uppercase tracking-widest flex items-center gap-1">
                  <Medal className="w-4 h-4" /> GOUD
                </span>
              </div>
              <div>
                <span className="text-xl font-black text-white block">
                  {finishedPodium[0].name}
                </span>
                <span className="text-xs text-slate-300">
                  Bib #{finishedPodium[0].bibNumber} • {finishedPodium[0].categoryName}
                </span>
                {finishedPodium[0].club && (
                  <span className="text-[11px] text-slate-400 block italic">
                    {finishedPodium[0].club}
                  </span>
                )}
              </div>
              <div className="mt-4 pt-3 border-t border-amber-500/20 flex items-center justify-between text-xs">
                <span className="text-slate-300">
                  {finishedPodium[0].totalMisses} missers ({finishedPodium[0].penaltyFormatted})
                </span>
                <span className="font-mono font-black text-amber-400 text-xl">
                  {finishedPodium[0].officialTimeFormatted}
                </span>
              </div>
            </div>
          )}

          {/* Bronze #3 */}
          {finishedPodium[2] && (
            <div
              onClick={() => !isKioskMode && onSelectParticipant(finishedPodium[2])}
              className="bg-slate-900 border border-slate-750 hover:border-slate-600 rounded-2xl p-5 shadow cursor-pointer transition flex flex-col justify-between order-3 relative overflow-hidden"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="w-9 h-9 rounded-xl bg-amber-700 text-slate-100 font-black text-base flex items-center justify-center shadow">
                  #3
                </span>
                <span className="text-xs font-bold text-amber-600 uppercase tracking-wider">
                  BRONS
                </span>
              </div>
              <div>
                <span className="text-lg font-bold text-white block">
                  {finishedPodium[2].name}
                </span>
                <span className="text-xs text-slate-400">
                  Bib #{finishedPodium[2].bibNumber} • {finishedPodium[2].categoryName}
                </span>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs">
                <span className="text-slate-400">
                  {finishedPodium[2].totalMisses} missers ({finishedPodium[2].penaltyFormatted})
                </span>
                <span className="font-mono font-black text-slate-200 text-base">
                  {finishedPodium[2].officialTimeFormatted}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Main Results Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-850 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
                <th className="py-3.5 px-4 w-14 text-center">Pl.</th>
                <th className="py-3.5 px-3 w-16 text-center">Bib</th>
                <th className="py-3.5 px-4">Deelnemer</th>
                <th className="py-3.5 px-4">Categorie</th>
                <th className="py-3.5 px-4">Startgroep</th>
                <th className="py-3.5 px-4 text-center">Schieten (H/M)</th>
                <th className="py-3.5 px-4 text-right">Looptijd (Raw)</th>
                <th className="py-3.5 px-4 text-right">Straf</th>
                <th className="py-3.5 px-4 text-right font-bold text-white">Officiële Tijd</th>
                <th className="py-3.5 px-4 text-right">Verschil</th>
                <th className="py-3.5 px-4 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {displayedResults.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-8 text-center text-slate-500 italic">
                    Geen deelnemers gevonden die aan de filters voldoen.
                  </td>
                </tr>
              ) : (
                displayedResults.map((r) => {
                  const isFinished = r.status === 'FINISHED';

                  return (
                    <tr
                      key={`lb-row-${r.participantId}`}
                      onClick={() => !isKioskMode && onSelectParticipant(r)}
                      className="hover:bg-slate-850/80 cursor-pointer transition"
                    >
                      {/* Rank */}
                      <td className="py-3 px-4 text-center font-mono font-bold">
                        {displayRank(r) ? (
                          <span
                            className={`inline-block w-6 h-6 rounded text-xs leading-6 ${
                              displayRank(r) === 1
                                ? 'bg-amber-400 text-slate-950 font-black'
                                : displayRank(r) === 2
                                ? 'bg-slate-300 text-slate-950 font-black'
                                : displayRank(r) === 3
                                ? 'bg-amber-700 text-white font-black'
                                : 'text-slate-400'
                            }`}
                          >
                            {displayRank(r)}
                          </span>
                        ) : (
                          <span className="text-slate-600">-</span>
                        )}
                      </td>

                      {/* Bib */}
                      <td className="py-3 px-3 text-center font-mono font-bold text-amber-400">
                        #{r.bibNumber || '-'}
                      </td>

                      {/* Name + Club */}
                      <td className="py-3 px-4">
                        <span className="font-bold text-white block">{r.name}</span>
                        {r.club && <span className="text-[11px] text-slate-400">{r.club}</span>}
                      </td>

                      {/* Category */}
                      <td className="py-3 px-4 text-slate-300 font-medium">
                        {r.categoryName || '-'}
                      </td>

                      {/* Wave */}
                      <td className="py-3 px-4 text-slate-400">{r.waveName || '-'}</td>

                      {/* Shooting Splits */}
                      <td className="py-3 px-4 text-center">
                        {r.shootingRounds.length === 0 ? (
                          <span className="text-slate-600">-</span>
                        ) : (
                          <div className="flex items-center justify-center gap-1.5 font-mono text-[11px]">
                            {r.shootingRounds.map((sr, sIdx) => (
                              <span
                                key={sr.id ? `sr-pill-${sr.id}` : `sr-pill-${r.participantId}-${sr.round}-${sIdx}`}
                                className={`px-1.5 py-0.5 rounded ${
                                  sr.misses === 0
                                    ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800'
                                    : 'bg-red-950/60 text-red-300 border border-red-800'
                                }`}
                              >
                                {sr.hits}/{sr.shots ?? 5}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>

                      {/* Raw Elapsed */}
                      <td className="py-3 px-4 text-right font-mono text-slate-400">
                        {r.rawElapsedFormatted || '-'}
                      </td>

                      {/* Penalty */}
                      <td className="py-3 px-4 text-right font-mono text-amber-400 font-semibold">
                        {r.totalMisses > 0 ? r.penaltyFormatted : '-'}
                      </td>

                      {/* Official Time */}
                      <td className="py-3 px-4 text-right font-mono font-black text-sm text-emerald-400">
                        {isFinished ? r.officialTimeFormatted : '-'}
                      </td>

                      {/* Gap */}
                      <td className="py-3 px-4 text-right font-mono text-slate-400">
                        {displayGap(r) || '-'}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                            r.status === 'FINISHED'
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : r.status === 'STARTED'
                              ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                              : r.status === 'DNF' || r.status === 'DNS' || r.status === 'DSQ'
                              ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {r.resultIssues?.length ? 'VOORLOPIG' : r.status}
                        </span>
                        {r.resultIssues?.map(issue => <span key={issue} className="block text-amber-300 text-xs">{issue}</span>)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Navigation */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 bg-slate-900 border-t border-slate-800 rounded-b-2xl">
            <div className="text-xs text-slate-400 font-mono">
              Weergave {safeCurrentPage * effectivePageSize + 1} - {Math.min((safeCurrentPage + 1) * effectivePageSize, filteredResults.length)} van {filteredResults.length} deelnemers
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={safeCurrentPage === 0}
                onClick={() => {
                  setCurrentPage((p) => Math.max(0, p - 1));
                  soundService.playSuccess();
                }}
                className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 font-medium transition"
              >
                <ChevronLeft className="w-4 h-4" /> Vorige
              </button>
              <span className="text-xs text-amber-300 font-bold px-2 font-mono">
                Pagina {safeCurrentPage + 1} van {totalPages}
              </span>
              <button
                type="button"
                disabled={safeCurrentPage >= totalPages - 1}
                onClick={() => {
                  setCurrentPage((p) => Math.min(totalPages - 1, p + 1));
                  soundService.playSuccess();
                }}
                className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 font-medium transition"
              >
                Volgende <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Exit Kiosk PIN Modal */}
      {showExitPinModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-amber-500/20 text-amber-400 rounded-xl">
                <KeyRound className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Kiosk-PIN Vereist</h3>
                <p className="text-xs text-slate-400">Voer de Kiosk-PIN in om de TV-presentatie te ontgrendelen.</p>
              </div>
            </div>

            <form onSubmit={handleConfirmExitPin} className="space-y-4">
              <input
                type="password"
                autoFocus
                inputMode="numeric"
                maxLength={6}
                value={exitPinInput}
                onChange={(e) => {
                  setExitPinInput(e.target.value);
                  setExitPinError(null);
                }}
                placeholder="PIN invoeren..."
                className="w-full text-center text-2xl tracking-[0.5em] font-mono py-3 rounded-xl bg-slate-950 border border-slate-700 text-white focus:border-amber-500 focus:outline-none"
              />

              {exitPinError && (
                <p className="text-xs text-red-400 font-semibold text-center flex items-center justify-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" /> {exitPinError}
                </p>
              )}

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowExitPinModal(false);
                    setExitPinError(null);
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs transition"
                >
                  Annuleren
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow transition"
                >
                  Ontgrendelen
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
