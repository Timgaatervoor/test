import React, { useState, useRef } from 'react';
import {
  HardDriveDownload,
  Download,
  Upload,
  CheckCircle2,
  AlertTriangle,
  FileCheck,
  RotateCcw,
  ShieldCheck,
  History,
  Laptop,
  Terminal,
  FolderDown,
} from 'lucide-react';
import type { RaceEvent, EventSnapshot } from '../../types';
import { db } from '../../db/dexieDb';
import {
  createFullSnapshot,
  downloadJsonFile,
  validateRecoveryFile,
  restoreSnapshot,
  type RecoveryValidation,
} from '../../services/backupService';
import { InstallDesktopModal } from '../InstallDesktopModal';
import { soundService } from '../../services/soundService';
import { SafeConfirmButton } from '../SafeConfirmButton';

interface BackupRecoveryViewProps {
  event: RaceEvent | null;
  onRefresh: () => void;
}

export const BackupRecoveryView: React.FC<BackupRecoveryViewProps> = ({
  event,
  onRefresh,
}) => {
  const [isCreatingSnapshot, setIsCreatingSnapshot] = useState(false);
  const [createdSnapshot, setCreatedSnapshot] = useState<EventSnapshot | null>(null);
  const [validationResult, setValidationResult] = useState<RecoveryValidation | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreSuccess, setRestoreSuccess] = useState(false);
  const [restoreIdentityWarning, setRestoreIdentityWarning] = useState(false);
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCreateSnapshot = async () => {
    if (!event) return;
    setIsCreatingSnapshot(true);
    setActionError(null);
    try {
      const snap = await createFullSnapshot(event);
      setCreatedSnapshot(snap);
      downloadJsonFile(snap, `biathlon_backup_${event.name.replace(/\s+/g, '_')}_${Date.now()}.json`);
      soundService.playSuccess();
    } catch (err: any) {
      soundService.playError();
      setActionError(`Fout bij maken back-up: ${err?.message}`);
    } finally {
      setIsCreatingSnapshot(false);
    }
  };

  const handleSelectRecoveryFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setActionError(null);

    try {
      const text = await file.text();
      const validation = await validateRecoveryFile(text);
      setValidationResult(validation);
      setRestoreSuccess(false);
      soundService.playSuccess();
    } catch (err: any) {
      soundService.playError();
      setActionError(`Fout bij lezen bestand: ${err?.message}`);
    }
  };

  const handleConfirmRestore = async () => {
    if (!validationResult || !validationResult.snapshot) return;
    setIsRestoring(true);
    setActionError(null);
    try {
      await restoreSnapshot(validationResult.snapshot);
      soundService.playSuccess();
      setRestoreSuccess(true);
      setRestoreIdentityWarning(true);
      setValidationResult(null);
      onRefresh();
    } catch (err: any) {
      soundService.playError();
      setActionError(`Fout bij herstellen: ${err?.message}`);
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="text-xs font-mono uppercase tracking-widest text-emerald-400 font-bold flex items-center gap-1.5">
            <HardDriveDownload className="w-4 h-4" /> Noodherstel & Back-up
          </span>
          <h2 className="text-2xl font-black text-white tracking-tight mt-0.5">
            Back-up & Herstelmodule
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Cryptografisch gevalideerde JSON snapshots (SHA-256) voor offline redundantie
          </p>
        </div>

        <button
          onClick={handleCreateSnapshot}
          disabled={isCreatingSnapshot || !event}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-500/20 transition uppercase tracking-wider"
        >
          <Download className="w-4 h-4" />
          <span>{isCreatingSnapshot ? 'Bezig met snapshot...' : 'Volledige Back-up Downloaden'}</span>
        </button>
      </div>

      {actionError && (
        <div className="p-4 rounded-xl bg-red-950/60 border border-red-800/60 text-red-200 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
            <span>{actionError}</span>
          </div>
          <button
            onClick={() => setActionError(null)}
            className="text-red-400 hover:text-white font-bold text-xs"
          >
            Sluiten
          </button>
        </div>
      )}

      {/* Local Standalone & Desktop Program Execution Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-amber-950/30 border border-amber-500/30 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="text-xs font-mono uppercase tracking-widest text-amber-400 font-bold flex items-center gap-1.5">
              <Laptop className="w-4 h-4" /> Zelfstandig Uitvoerbaar Programma
            </span>
            <h3 className="text-lg font-black text-white tracking-tight">
              Lokaal Opslaan & Als Desktop App Gebruiken
            </h3>
            <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
              Draai deze tijdregistratie lokaal op uw Windows-, Mac- of Linux-laptop zonder afhankelijk te zijn van internet of externe servers. Alle data wordt 100% lokaal in uw computer opgeslagen.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => setShowInstallModal(true)}
              className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs uppercase tracking-wider flex items-center gap-2 shadow-lg transition"
            >
              <Laptop className="w-4 h-4" />
              <span>Installeer als Desktop App</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-800 text-xs">
          <div className="bg-slate-950/70 p-3.5 rounded-xl border border-slate-800/80">
            <span className="font-bold text-white block mb-1 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              Methode 1: PWA Desktop Installatie (Aanbevolen)
            </span>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              Installeer via Chrome/Edge direct als zelfstandige desktop applicatie met eigen snelkoppeling op uw Bureaublad. Werkt 100% offline via Service Worker & Dexie IndexedDB.
            </p>
          </div>

          <div className="bg-slate-950/70 p-3.5 rounded-xl border border-slate-800/80">
            <span className="font-bold text-white block mb-1 flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5 text-blue-400" />
              Methode 2: Startscripts (start-windows.bat)
            </span>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              Export het volledige project naar ZIP en pak het eerst uit. Dubbelklik daarna op <code className="text-amber-400">start-windows.bat</code>. Als Node.js ontbreekt, vraagt het startscript toestemming om Node.js LTS automatisch te installeren.
            </p>
          </div>
        </div>
      </div>

      {/* Snapshot Verification Card */}
      {createdSnapshot && (
        <div className="p-4 bg-emerald-950/40 border border-emerald-500/40 rounded-xl space-y-2 text-xs text-emerald-200">
          <div className="flex items-center gap-2 font-bold text-emerald-300">
            <CheckCircle2 className="w-4 h-4" />
            <span>Snapshot succesvol gegenereerd en gedownload!</span>
          </div>
          <div className="font-mono text-[11px] break-all bg-emerald-950/80 p-2 rounded border border-emerald-800">
            SHA-256 Checksum: {createdSnapshot.checksum}
          </div>
        </div>
      )}

      {/* Restore Area (Req 83) */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <RotateCcw className="w-5 h-5 text-amber-400" /> Back-up Bestand Herstellen (Failsafe Restore)
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Het systeem valideert vóór het overschrijven altijd eerst het bestand, controleert de checksum, en toont de verschillen met de huidige database (Req 83).
          </p>
        </div>

        <div className="border-2 border-dashed border-slate-700 hover:border-amber-500 p-6 rounded-2xl bg-slate-850 text-center space-y-3">
          <Upload className="w-8 h-8 text-amber-400 mx-auto" />
          <div>
            <span className="text-xs font-bold text-white block">
              Selecteer een JSON snapshot bestand om te verifiëren
            </span>
            <span className="text-[11px] text-slate-400">
              Alleen gevalideerde JSON-bestanden met correcte schema's worden geaccepteerd
            </span>
          </div>

          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-white font-semibold text-xs border border-slate-700 transition"
          >
            Bestand Kiezen...
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleSelectRecoveryFile}
            className="hidden"
          />
        </div>

        {/* Validation Diff Report */}
        {validationResult && (
          <div className="p-5 rounded-2xl bg-slate-850 border border-slate-750 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-750 pb-3">
              <div className="flex items-center gap-2">
                {validationResult.isValid ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-red-400" />
                )}
                <span className="font-bold text-white text-sm">
                  {validationResult.isValid
                    ? 'Bestandsvalidatie Geslaagd'
                    : 'Bestandsvalidatie Mislukt'}
                </span>
              </div>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                  validationResult.checksumMatch
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : 'bg-amber-500/20 text-amber-300'
                }`}
              >
                {validationResult.checksumMatch ? 'Checksum OK' : 'Geen checksum match'}
              </span>
            </div>

            {validationResult.isValid && validationResult.eventDetails ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-slate-900 p-3 rounded-lg border border-slate-800">
                    <span className="text-slate-400 block text-[11px]">Evenement</span>
                    <span className="font-bold text-white text-sm">
                      {validationResult.eventDetails.name}
                    </span>
                  </div>
                  <div className="bg-slate-900 p-3 rounded-lg border border-slate-800">
                    <span className="text-slate-400 block text-[11px]">Deelnemers in Back-up</span>
                    <span className="font-bold text-white text-sm">
                      {validationResult.eventDetails.participantsCount}
                    </span>
                  </div>
                  <div className="bg-slate-900 p-3 rounded-lg border border-slate-800">
                    <span className="text-slate-400 block text-[11px]">Tijdrecords</span>
                    <span className="font-bold text-white text-sm">
                      {validationResult.eventDetails.timingRecordsCount}
                    </span>
                  </div>
                  <div className="bg-slate-900 p-3 rounded-lg border border-slate-800">
                    <span className="text-slate-400 block text-[11px]">Schietrecords</span>
                    <span className="font-bold text-white text-sm">
                      {validationResult.eventDetails.shootingCount}
                    </span>
                  </div>
                </div>

                {/* Diff Comparison */}
                <div className="p-3 bg-slate-900 rounded-lg border border-slate-800">
                  <span className="font-bold text-slate-300 block mb-1">
                    Verschil met huidige database:
                  </span>
                  <div className="flex gap-4 text-[11px] text-slate-400">
                    <span>
                      Deelnemers:{' '}
                      <strong className="text-white">
                        {validationResult.diff.participantsDiff >= 0 ? '+' : ''}
                        {validationResult.diff.participantsDiff}
                      </strong>
                    </span>
                    <span>
                      Finishes:{' '}
                      <strong className="text-white">
                        {validationResult.diff.finishesDiff >= 0 ? '+' : ''}
                        {validationResult.diff.finishesDiff}
                      </strong>
                    </span>
                    <span>
                      Schietbeurten:{' '}
                      <strong className="text-white">
                        {validationResult.diff.shootingDiff >= 0 ? '+' : ''}
                        {validationResult.diff.shootingDiff}
                      </strong>
                    </span>
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    onClick={() => setValidationResult(null)}
                    className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700"
                  >
                    Annuleren
                  </button>
                  <SafeConfirmButton
                    mode="hold"
                    holdDurationSeconds={3}
                    requireTypeConfirm={true}
                    typeConfirmKeyword="BEVESTIG"
                    typeConfirmTitle="Database herstellen bevestigen"
                    typeConfirmDescription={`U staat op het punt de huidige database te overschrijven met snapshot "${validationResult.snapshot.snapshotId}". Er worden ${validationResult.eventDetails?.participantsCount ?? 0} deelnemers hersteld. Typ BEVESTIG om uit te voeren.`}
                    variant="danger"
                    onConfirm={handleConfirmRestore}
                    disabled={isRestoring}
                    className="px-6 py-2 rounded-lg font-bold shadow-lg"
                  >
                    {isRestoring ? 'Herstellen...' : 'Houd vast (3s) om te herstellen'}
                  </SafeConfirmButton>
                </div>
              </div>
            ) : (
              <p className="text-red-400">{validationResult.error}</p>
            )}
          </div>
        )}

        {restoreSuccess && (
          <div className="space-y-3">
            <div className="p-4 rounded-xl bg-emerald-950/50 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2 font-semibold">
              <CheckCircle2 className="w-5 h-5" />
              <span>Database is succesvol hersteld vanuit het back-upbestand!</span>
            </div>
            {restoreIdentityWarning && (
              <div className="p-4 rounded-xl bg-amber-950/50 border border-amber-500/50 text-amber-200 text-xs space-y-2">
                <div className="flex items-center gap-2 font-bold text-amber-300">
                  <AlertTriangle className="w-5 h-5" />
                  <span>Controleer de identiteit van deze pc</span>
                </div>
                <p>
                  De backup bevatte ook de toestelinstellingen van de oorspronkelijke pc. Ga nu naar
                  <strong> Instellingen &gt; Algemeen & Tijd</strong> en pas de <strong>Device ID</strong>,
                  gebruikersnaam en stationnaam aan voor deze pc. Gebruik op elke pc een unieke Device ID.
                </p>
                <button
                  type="button"
                  onClick={() => setRestoreIdentityWarning(false)}
                  className="px-3 py-1.5 rounded-lg bg-amber-500 text-slate-950 font-bold"
                >
                  Melding gelezen
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <InstallDesktopModal
        isOpen={showInstallModal}
        onClose={() => setShowInstallModal(false)}
        event={event}
      />
    </div>
  );
};
