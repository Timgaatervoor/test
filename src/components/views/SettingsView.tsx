import { OnlineSyncSettings } from '../OnlineSyncSettings';
import React, { useState } from 'react';
import {
  Settings,
  ShieldCheck,
  Lock,
  Unlock,
  Volume2,
  Laptop,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Database,
  Cloud,
  Users,
  HardDriveDownload,
  FlaskConical,
  VolumeX,
  Play,
} from 'lucide-react';
import type { RaceEvent, DeviceConfig, RaceProfile, Category, Wave, Participant, UserRole } from '../../types';
import { db } from '../../db/dexieDb';
import { operationService } from '../../services/operationService';
import { soundService } from '../../services/soundService';
import { SafeConfirmButton } from '../SafeConfirmButton';
import { RaceProfileEditor } from './RaceProfileEditor';
import { AgeCategoriesEditor } from './AgeCategoriesEditor';
import { EventSetupAndReset } from './EventSetupAndReset';
import { BackupRecoveryView } from './BackupRecoveryView';
import { SimulatorView } from './SimulatorView';

interface SettingsViewProps {
  event: RaceEvent | null;
  deviceConfig: DeviceConfig | null;
  profiles?: RaceProfile[];
  categories?: Category[];
  waves?: Wave[];
  participants?: Participant[];
  onRefresh: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  event,
  deviceConfig,
  profiles = [],
  categories = [],
  waves = [],
  participants = [],
  onRefresh,
}) => {
  const [activeSection, setActiveSection] = useState<'general' | 'profiles' | 'categories' | 'event_setup' | 'sync' | 'backup' | 'tests'>('general');

  // Race Event Settings
  const [eventName, setEventName] = useState(event?.name || '');
  const [eventDate, setEventDate] = useState(event?.date || '');
  const [eventLocation, setEventLocation] = useState(event?.location || '');
  const [organizer, setOrganizer] = useState(event?.organizer || '');
  const [penaltySeconds, setPenaltySeconds] = useState(event?.penaltySecondsPerMiss || 20);
  const [requireStartConfirmation, setRequireStartConfirmation] = useState(event?.requireStartConfirmation ?? true);
  const [requireFinishConfirmation, setRequireFinishConfirmation] = useState(event?.requireFinishConfirmation ?? true);
  const [isPublicResultsLive, setIsPublicResultsLive] = useState(event?.isPublicResultsLive ?? true);
  const [isTestMode, setIsTestMode] = useState(event?.isTestMode ?? true);
  const [isLocked, setIsLocked] = useState(event?.officialResultsLocked ?? false);

  // Device & Operator Settings
  const [deviceId, setDeviceId] = useState(deviceConfig?.id || 'FINISH-01');
  const [operatorName, setOperatorName] = useState(deviceConfig?.operatorName || '');
  const [stationName, setStationName] = useState(deviceConfig?.stationName || '');
  const [deviceRole, setDeviceRole] = useState<UserRole>(deviceConfig?.role || 'FINISH_OPERATOR');
  const [deviceLocked, setDeviceLocked] = useState(deviceConfig?.isLocked ?? false);
  const [devicePin, setDevicePin] = useState(deviceConfig?.pin || '');
  const [savedMessage, setSavedMessage] = useState(false);

  // Audio settings
  const [audioVolume, setAudioVolume] = useState(() => Math.round(soundService.getVolume() * 100));
  const [audioMuted, setAudioMuted] = useState(() => soundService.isMuted());
  const [lastTestedSound, setLastTestedSound] = useState<string | null>(null);

  const handleVolumeSliderChange = (newVolPct: number) => {
    setAudioVolume(newVolPct);
    soundService.setVolume(newVolPct / 100);
    if (audioMuted && newVolPct > 0) {
      setAudioMuted(false);
      soundService.setMuted(false);
    }
  };

  const handleToggleAudioMute = () => {
    const nextMute = !audioMuted;
    setAudioMuted(nextMute);
    soundService.setMuted(nextMute);
  };

  const handleTestAudio = async (type: 'fanfare' | 'finish' | 'hit' | 'miss' | 'warning') => {
    await soundService.resume();
    setLastTestedSound(type);
    if (type === 'fanfare') soundService.playGoFanfare();
    else if (type === 'finish') soundService.playFinishChord();
    else if (type === 'hit') soundService.playHit();
    else if (type === 'miss') soundService.playMiss();
    else if (type === 'warning') soundService.playWarning();
  };

  // Synchronize on initial mount without overwriting during active typing
  const initialLoadRef = React.useRef(false);
  const deviceConfigLoadRef = React.useRef(false);
  React.useEffect(() => {
    if (!initialLoadRef.current && event) {
      setEventName(event.name);
      setEventDate(event.date);
      setEventLocation(event.location);
      setOrganizer(event.organizer);
      setPenaltySeconds(event.penaltySecondsPerMiss || 20);
      setRequireStartConfirmation(event.requireStartConfirmation ?? true);
      setRequireFinishConfirmation(event.requireFinishConfirmation ?? true);
      setIsPublicResultsLive(event.isPublicResultsLive ?? true);
      setIsTestMode(event.isTestMode ?? true);
      setIsLocked(event.officialResultsLocked ?? false);
      initialLoadRef.current = true;
    }
  }, [event]);

  React.useEffect(() => {
    if (deviceConfig && !deviceConfigLoadRef.current) {
      setDeviceId(deviceConfig.id);
      setOperatorName(deviceConfig.operatorName || '');
      setStationName(deviceConfig.stationName);
      setDeviceRole(deviceConfig.role);
      setDeviceLocked(deviceConfig.isLocked);
      setDevicePin(deviceConfig.pin || '');
      deviceConfigLoadRef.current = true;
    }
  }, [deviceConfig]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();

    const currentEvent = (await db.events.toCollection().first()) || event;
    const eventId = currentEvent?.id || event?.id || 'event-de-haan-2026';

    const updatedEvent: RaceEvent = {
      id: eventId,
      name: eventName.trim() || 'Nieuw evenement',
      date: eventDate,
      location: eventLocation.trim(),
      organizer: organizer.trim(),
      status: currentEvent?.status || 'READY',
      timezone: 'Europe/Brussels',
      penaltySecondsPerMiss: penaltySeconds,
      requireStartConfirmation,
      requireFinishConfirmation,
      isPublicResultsLive,
      isTestMode,
      officialResultsLocked: isLocked,
      officialResultsVersion: isLocked ? 'Definitief 1.0' : 'Voorlopig',
      createdAt: currentEvent?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await db.events.put(updatedEvent);

    const activeDeviceId = deviceId.trim() || 'FINISH-01';
    await db.devices.clear();
    await db.devices.put({
      id: activeDeviceId,
      name: `Tablet ${activeDeviceId}`,
      role: deviceRole,
      operatorName: operatorName.trim(),
      stationName: stationName.trim() || 'Wedstrijdpost',
      pin: devicePin.trim() || undefined,
      isLocked: deviceLocked,
      clockOffsetMs: deviceConfig?.clockOffsetMs || 0,
    });

    operationService.setDeviceAndOperator(activeDeviceId, operatorName.trim() || 'Operator');

    await operationService.logAudit(
      'SETTINGS_UPDATED',
      `Wedstrijdinstellingen bijgewerkt: "${eventName}", ${penaltySeconds}s straftijd, Datum: ${eventDate}, Testmodus: ${isTestMode}`
    );

    document.title = `${eventName.trim()} - Tijdregistratie Biathlon`;
    soundService.playSuccess();
    setSavedMessage(true);
    await onRefresh();
    setTimeout(() => setSavedMessage(false), 3000);
  };

  const toggleOfficialLock = async () => {
    if (!event) return;
    const nextLocked = !isLocked;

    setIsLocked(nextLocked);
    await db.events.update(event.id, {
      officialResultsLocked: nextLocked,
      officialResultsVersion: nextLocked ? 'Officieel Vastgelegd v1.0' : 'Voorlopig (in bewerking)',
      updatedAt: new Date().toISOString(),
    });

    await operationService.logAudit(
      nextLocked ? 'RESULTS_LOCKED' : 'RESULTS_UNLOCKED',
      `Officiële resultaten ${nextLocked ? 'VERGRENDELD' : 'ONTGRENDELD'}`
    );

    soundService.playSuccess();
    onRefresh();
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="text-xs font-mono uppercase tracking-widest text-slate-400 font-bold flex items-center gap-1.5">
            <Settings className="w-4 h-4" /> Systeemconfiguratie
          </span>
          <h2 className="text-2xl font-black text-white tracking-tight mt-0.5">
            Instellingen & Parameters
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Wedstrijdregels, leeftijdscategorieën, parcoursopbouw, apparaatidentiteit en officiële vergrendeling
          </p>
        </div>

        {/* Sub-tab Navigation */}
        <div className="flex flex-wrap items-center gap-2 bg-slate-950 p-1.5 rounded-xl border border-slate-800">
          <button
            type="button"
            onClick={() => setActiveSection('general')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition ${
              activeSection === 'general'
                ? 'bg-amber-500 text-slate-950 shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Settings className="w-4 h-4" />
            <span>Algemeen & Tijd</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSection('profiles')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition ${
              activeSection === 'profiles'
                ? 'bg-amber-500 text-slate-950 shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Wedstrijdinhoud</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSection('categories')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition ${
              activeSection === 'categories'
                ? 'bg-amber-500 text-slate-950 shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Leeftijdscategorieën</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSection('event_setup')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition ${
              activeSection === 'event_setup'
                ? 'bg-amber-500 text-slate-950 shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Database className="w-4 h-4" />
            <span>Gevarenzone & reset</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSection('sync')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition ${
              activeSection === 'sync'
                ? 'bg-amber-500 text-slate-950 shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Cloud className="w-4 h-4" />
            <span>Online Synchronisatie</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSection('backup')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition ${
              activeSection === 'backup'
                ? 'bg-amber-500 text-slate-950 shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <HardDriveDownload className="w-4 h-4" />
            <span>Back-up & herstel</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSection('tests')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition ${
              activeSection === 'tests'
                ? 'bg-amber-500 text-slate-950 shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <FlaskConical className="w-4 h-4" />
            <span>Tests</span>
          </button>
        </div>
      </div>

      {activeSection === 'profiles' ? (
        <RaceProfileEditor
          profiles={profiles}
          categories={categories}
          onRefresh={onRefresh}
          onManageCategories={() => setActiveSection('categories')}
        />
      ) : activeSection === 'categories' ? (
        <AgeCategoriesEditor
          categories={categories}
          profiles={profiles}
          onRefresh={onRefresh}
          onOpenProfiles={() => setActiveSection('profiles')}
        />
      ) : activeSection === 'event_setup' ? (
        <EventSetupAndReset
          event={event}
          waves={waves}
          participants={participants}
          onRefresh={onRefresh}
        />
      ) : activeSection === 'sync' ? (
        <OnlineSyncSettings eventId={event?.id || ''} eventName={event?.name || ''} onJoined={onRefresh} />
      ) : activeSection === 'backup' ? (
        <BackupRecoveryView event={event} onRefresh={onRefresh} />
      ) : activeSection === 'tests' ? (
        event?.isTestMode ? (
          <SimulatorView onRefresh={onRefresh} />
        ) : (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center shadow-xl">
            <FlaskConical className="w-10 h-10 text-amber-400 mx-auto mb-3" />
            <h3 className="text-lg font-black text-white">Tests zijn beschikbaar in testmodus</h3>
            <p className="text-xs text-slate-400 mt-2">
              Schakel testmodus in bij Algemeen & Tijd om de robuustheidstests en wedstrijdsimulator te gebruiken.
            </p>
            <button type="button" onClick={() => setActiveSection('general')} className="mt-4 px-4 py-2 rounded-lg bg-amber-500 text-slate-950 text-xs font-black">
              Naar Algemeen & Tijd
            </button>
          </div>
        )
      ) : (
        <form onSubmit={handleSaveSettings} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Race Event General Config */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow space-y-4 text-xs">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Settings className="w-4 h-4 text-amber-400" /> Wedstrijd Algemeen
            </h3>

            <div>
              <label className="text-slate-300 font-semibold block mb-1">
                Wedstrijdnaam:
              </label>
              <input
                type="text"
                required
                value={eventName}
                onChange={(e) => setEventName(e.target.value)}
                placeholder="Naam van je evenement"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm font-bold text-white focus:outline-none focus:border-amber-400"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-slate-300 font-semibold block mb-1">
                  Wedstrijddatum:
                </label>
                <input
                  type="date"
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="text-slate-300 font-semibold block mb-1">
                  Locatie:
                </label>
                <input
                  type="text"
                  value={eventLocation}
                  onChange={(e) => setEventLocation(e.target.value)}
                  placeholder="bv. Gemeentelijk sportpark"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                />
              </div>
            </div>

            <div>
              <label className="text-slate-300 font-semibold block mb-1">
                Organiserende Club / Instantie:
              </label>
              <input
                type="text"
                value={organizer}
                onChange={(e) => setOrganizer(e.target.value)}
                placeholder="Naam van je organisatie"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-amber-400"
              />
            </div>
          </div>

          {/* Rules & Biathlon Calculation */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow space-y-4 text-xs">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-400" /> Wedstrijdreglement & Tijdregistratie
            </h3>

            <div>
              <label className="text-slate-300 font-semibold block mb-1">
                Straftijd per gemiste schijf (seconden):
              </label>
              <input
                type="number"
                min="0"
                value={penaltySeconds}
                onChange={(e) => setPenaltySeconds(parseInt(e.target.value, 10) || 0)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-base font-mono font-bold text-amber-400"
              />
              <span className="text-[11px] text-slate-500 block mt-1">
                Standaard biathlon tijdstraf: 20 seconden per misser
              </span>
            </div>

            <div className="space-y-2 pt-2 border-t border-slate-800">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isPublicResultsLive}
                  onChange={(e) => setIsPublicResultsLive(e.target.checked)}
                  className="w-4 h-4 rounded text-amber-500"
                />
                <div>
                  <span className="font-bold text-white block">Publieke Live Uitslagen Actief</span>
                  <span className="text-[11px] text-slate-400">
                    Toont resultaten op het live leaderboard en publieke schermen
                  </span>
                </div>
              </label>

              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={requireFinishConfirmation}
                  onChange={(e) => setRequireFinishConfirmation(e.target.checked)}
                  className="w-4 h-4 rounded text-amber-500"
                />
                <div>
                  <span className="font-bold text-white block">Bevestiging bij Finish</span>
                  <span className="text-[11px] text-slate-400">
                    Voorkomt per ongeluk direct toewijzen van finish pulsen
                  </span>
                </div>
              </label>

              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isTestMode}
                  onChange={(e) => setIsTestMode(e.target.checked)}
                  className="w-4 h-4 rounded text-amber-500"
                />
                <div>
                  <span className="font-bold text-white block">Test Modus Actief</span>
                  <span className="text-[11px] text-slate-400">
                    Toont testbanner en laat alle demodata en simulaties toe
                  </span>
                </div>
              </label>
            </div>
          </div>

          {/* Device & Operator Identity (Req 31) */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow space-y-4 text-xs md:col-span-2">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Laptop className="w-4 h-4 text-blue-400" /> Toestel- & Operator Identiteit
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="text-slate-300 font-semibold block mb-1">
                  Apparaat Identificatie (Device ID):
                </label>
                <input
                  type="text"
                  value={deviceId}
                  onChange={(e) => setDeviceId(e.target.value)}
                  placeholder="bv. FINISH-01"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-white font-mono font-bold"
                />
              </div>

              <div>
                <label className="text-slate-300 font-semibold block mb-1">Rol van dit toestel:</label>
                <select
                  value={deviceRole}
                  onChange={(event) => setDeviceRole(event.target.value as UserRole)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-white font-semibold"
                >
                  <option value="ADMIN">Beheerder</option>
                  <option value="RACE_DIRECTOR">Wedstrijdleider</option>
                  <option value="REGISTRATION">Inschrijving</option>
                  <option value="START_OPERATOR">Startpost</option>
                  <option value="SHOOTING_OPERATOR">Schietpost</option>
                  <option value="FINISH_OPERATOR">Finishpost</option>
                  <option value="VIEWER">Alleen live uitslagen</option>
                </select>
              </div>

              <div>
                <label className="text-slate-300 font-semibold block mb-1">
                  Huidige Operator Naam:
                </label>
                <input
                  type="text"
                  value={operatorName}
                  onChange={(e) => setOperatorName(e.target.value)}
                  placeholder="Naam van de medewerker"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-white"
                />
              </div>

              <div>
                <label className="text-slate-300 font-semibold block mb-1">Station Locatie:</label>
                <input
                  type="text"
                  value={stationName}
                  onChange={(e) => setStationName(e.target.value)}
                  placeholder="bv. Finishpost"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-white"
                />
              </div>

              <label className="sm:col-span-2 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-950/20 p-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={deviceLocked}
                  onChange={(event) => setDeviceLocked(event.target.checked)}
                  className="w-4 h-4 mt-0.5 rounded text-amber-500"
                />
                <span>
                  <strong className="block text-white">Vergrendel toestel op toegewezen post</strong>
                  <span className="block mt-0.5 text-[11px] text-slate-400">
                    Na opslaan ziet de operator alleen het scherm dat bij de gekozen rol hoort.
                  </span>
                </span>
              </label>

              <div>
                <label className="text-slate-300 font-semibold block mb-1">Beheerderscode:</label>
                <input
                  type="password"
                  inputMode="numeric"
                  value={devicePin}
                  onChange={(event) => setDevicePin(event.target.value)}
                  placeholder="Optioneel, bv. 2468"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-white font-mono"
                />
                <span className="text-[11px] text-slate-500 block mt-1">Nodig om een vergrendelde post te openen.</span>
              </div>
            </div>
          </div>
        </div>

        {/* Audio Feedback & Volume Controls (Web Audio API) */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow space-y-4 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              {audioMuted ? (
                <VolumeX className="w-5 h-5 text-red-400" />
              ) : (
                <Volume2 className="w-5 h-5 text-amber-400" />
              )}
              <div>
                <h3 className="text-sm font-bold text-white">Audiofeedback & Geluidssignalen (Web Audio API)</h3>
                <p className="text-slate-400 text-[11px]">
                  Akoestische signalen voor startfanfares, schietresultaten (treffers/missers), finishakkoorden en waarschuwingen.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleToggleAudioMute}
              className={`px-3 py-1.5 rounded-xl border font-bold text-xs transition flex items-center gap-1.5 ${
                audioMuted
                  ? 'bg-red-950/60 text-red-300 border-red-800/60 hover:bg-red-900/60'
                  : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-750'
              }`}
            >
              {audioMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              <span>{audioMuted ? 'Geluid Gedempt' : 'Geluid Actief'}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="volume-slider" className="text-slate-300 font-semibold flex items-center gap-2">
                  <span>Hoofdvolume</span>
                  <span className="text-[11px] text-slate-500 font-normal">
                    (gesynchroniseerd in localStorage)
                  </span>
                </label>
                <span className="text-amber-400 font-mono font-bold text-sm">{audioVolume}%</span>
              </div>
              <div className="flex items-center gap-3">
                <VolumeX className="w-4 h-4 text-slate-500" />
                <input
                  id="volume-slider"
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={audioMuted ? 0 : audioVolume}
                  onChange={(e) => handleVolumeSliderChange(parseInt(e.target.value, 10))}
                  className="w-full accent-amber-500 cursor-pointer h-2 bg-slate-800 rounded-lg appearance-none"
                />
                <Volume2 className="w-4 h-4 text-amber-400" />
              </div>
            </div>

            <div className="space-y-2">
              <span className="text-slate-300 font-semibold block">Geluidstests</span>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => handleTestAudio('fanfare')}
                  className="px-3 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 font-bold transition flex items-center gap-1.5"
                  title="Test Startfanfare"
                >
                  <Play className="w-3.5 h-3.5 fill-current" /> Test Geluidseffecten
                </button>
                <button
                  type="button"
                  onClick={() => handleTestAudio('finish')}
                  className="px-2.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 font-medium transition"
                >
                  Finish akkoord
                </button>
                <button
                  type="button"
                  onClick={() => handleTestAudio('hit')}
                  className="px-2.5 py-2 rounded-xl bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-800/40 font-medium transition"
                >
                  Treffer (Hit)
                </button>
                <button
                  type="button"
                  onClick={() => handleTestAudio('miss')}
                  className="px-2.5 py-2 rounded-xl bg-red-950/40 hover:bg-red-900/60 text-red-300 border border-red-800/40 font-medium transition"
                >
                  Misser
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Results Freezing & Locking (Req 48, 59) */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow flex flex-col sm:flex-row items-center justify-between gap-4 text-xs">
          <div>
            <div className="flex items-center gap-2 mb-1">
              {isLocked ? (
                <Lock className="w-5 h-5 text-red-400" />
              ) : (
                <Unlock className="w-5 h-5 text-emerald-400" />
              )}
              <h3 className="text-sm font-bold text-white">
                Officiële Resultatenstatus:{' '}
                <span className={isLocked ? 'text-red-400' : 'text-emerald-400'}>
                  {isLocked ? 'VERGRENDELD' : 'VOORLOPIG'}
                </span>
              </h3>
            </div>
            <p className="text-slate-400">
              Wanneer vergrendeld, zijn de uitslagen definitief en worden ze gemarkeerd als goedgekeurd door de jury.
            </p>
          </div>

          <SafeConfirmButton
            mode="hold"
            holdDurationSeconds={3}
            variant={isLocked ? 'danger' : 'primary'}
            onConfirm={toggleOfficialLock}
            className="px-5 py-2.5 font-bold text-xs uppercase tracking-wider"
          >
            {isLocked ? 'Houd vast (3s): Ontgrendelen' : 'Houd vast (3s): Vergrendel als Officieel'}
          </SafeConfirmButton>
        </div>

        <div className="flex justify-end items-center gap-4">
          {savedMessage && (
            <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" /> Instellingen opgeslagen!
            </span>
          )}
          <button
            type="submit"
            className="px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-lg transition uppercase tracking-wider"
          >
            Instellingen Opslaan
          </button>
        </div>
      </form>
      )}
    </div>
  );
};
