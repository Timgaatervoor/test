import React, { useState } from 'react';
import {
  Laptop,
  Download,
  CheckCircle2,
  HardDrive,
  FolderDown,
  ExternalLink,
  X,
  Smartphone,
  ShieldCheck,
  Terminal,
  AlertTriangle,
} from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { createFullSnapshot, downloadJsonFile } from '../services/backupService';
import type { RaceEvent } from '../types';

interface InstallDesktopModalProps {
  isOpen: boolean;
  onClose: () => void;
  event: RaceEvent | null;
}

export const InstallDesktopModal: React.FC<InstallDesktopModalProps> = ({
  isOpen,
  onClose,
  event,
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [downloadingBackup, setDownloadingBackup] = useState(false);
  const [backupSuccess, setBackupSuccess] = useState(false);
  const [backupError, setBackupError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleQuickBackup = async () => {
    if (!event) return;
    setDownloadingBackup(true);
    setBackupError(null);
    try {
      const snap = await createFullSnapshot(event);
      downloadJsonFile(
        snap,
        `biathlon_lokaal_bestand_${event.name.replace(/\s+/g, '_')}_${Date.now()}.json`
      );
      setBackupSuccess(true);
      setTimeout(() => setBackupSuccess(false), 4000);
    } catch (e: any) {
      setBackupError(`Fout bij opslaan: ${e?.message}`);
    } finally {
      setDownloadingBackup(false);
    }
  };

  const handleInstallClick = async () => {
    if (isInstallable) {
      await install();
    } else {
      // Open in full tab if inside iframe
      window.open(window.location.href, '_blank');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl space-y-6 text-xs relative max-h-[95vh] overflow-y-auto">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-6 right-6 p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div>
          <span className="text-xs font-mono uppercase tracking-widest text-amber-400 font-bold flex items-center gap-1.5">
            <Laptop className="w-4 h-4" /> Zelfstandig & Offline Uitvoeren
          </span>
          <h2 className="text-2xl font-black text-white tracking-tight mt-1">
            Lokaal Opslaan & Als Desktop App Gebruiken
          </h2>
          <p className="text-xs text-slate-300 mt-1 leading-relaxed">
            U kunt dit tijdregistratiesysteem op <strong>twee manieren</strong> lokaal als zelfstandig programma gebruiken. Onderaan kunt u daarnaast een afzonderlijke gegevensback-up bewaren.
          </p>
        </div>

        <div className="space-y-4">
          {/* Method 1: PWA Desktop App */}
          <div className="bg-slate-950/70 border border-amber-500/40 rounded-2xl p-5 space-y-3 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center font-bold">
                  1
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">
                    Methode 1: Direct Installeren als Desktop Programma (PWA)
                  </h3>
                  <span className="text-[11px] text-emerald-400 font-semibold">
                    Aanbevolen • Werkt direct in Chrome, Edge, Safari & Brave
                  </span>
                </div>
              </div>

              {isInstalled && (
                <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold">
                  Reeds geïnstalleerd
                </span>
              )}
            </div>

            <p className="text-slate-300 leading-relaxed">
              Het programma wordt op uw computer opgeslagen met een <strong>eigen snelkoppeling op uw Bureaublad en in het Startmenu</strong>. Het opent in een eigen zelfstandig venster (zonder browserbalken) en werkt <strong>100% offline</strong> dankzij lokale caching en de ingebouwde IndexedDB database.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="button"
                onClick={handleInstallClick}
                className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs uppercase tracking-wider flex items-center gap-2 shadow-lg transition"
              >
                <Download className="w-4 h-4 stroke-[2.5]" />
                <span>{isInstallable ? 'Installeer Nu als Desktop App' : 'Open in Nieuw Tabblad voor Installatie'}</span>
              </button>

              <div className="text-[11px] text-slate-400">
                Of klik in <strong>Chrome / Edge</strong> rechts in de adresbalk op het download-icoon: <em>"App installeren"</em>.
              </div>
            </div>

            {isIOS && (
              <div className="mt-3 p-3 rounded-xl bg-slate-900 border border-slate-800 text-[11px] text-slate-300">
                <div className="font-bold text-white flex items-center gap-1.5 mb-1">
                  <Smartphone className="w-3.5 h-3.5 text-blue-400" /> Installeren op iPad / iPhone:
                </div>
                Tik in Safari onderaan op het <strong>Delen</strong> icoon en kies <strong>"Zet op beginscherm"</strong>.
              </div>
            )}
          </div>

          {/* Method 2: Standalone ZIP Package */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-5 space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/30 flex items-center justify-center font-bold">
                2
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">
                  Methode 2: Lokaal Downloaden als Zelfstandig Programmamap (ZIP)
                </h3>
                <span className="text-[11px] text-slate-400">
                  Volledige broncode met dubbelklikbare startscripts
                </span>
              </div>
            </div>

            <p className="text-slate-300 leading-relaxed">
              Wilt u het programma als een compleet lokaal pakket op een laptop of USB-stick meenemen?
            </p>

            <div className="flex flex-wrap items-center gap-2">
              <a
                href="https://github.com/Timgaatervoor/Tijdregistratie/archive/refs/heads/main.zip"
                target="_blank"
                rel="noreferrer"
                className="w-fit px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs uppercase tracking-wider flex items-center gap-2 shadow-lg transition"
              >
                <Download className="w-4 h-4 stroke-[2.5]" />
                <span>Download via GitHub (.zip)</span>
              </a>
              <a
                href="https://nodejs.org/en/download"
                target="_blank"
                rel="noreferrer"
                className="w-fit px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-bold text-xs flex items-center gap-2 shadow transition"
              >
                <ExternalLink className="w-4 h-4" />
                <span>Node.js installeren</span>
              </a>
            </div>

            <div className="bg-slate-900/90 rounded-xl p-3.5 border border-slate-800 font-mono text-[11px] text-slate-300 space-y-1.5">
              <div className="flex items-center gap-1.5 text-amber-400 font-bold">
                <Terminal className="w-3.5 h-3.5" /> Meegeleverde startbestanden in de map:
              </div>
              <div className="text-slate-300">
                • <strong className="text-white">start-windows.bat</strong>: Dubbelklikken op Windows om het programma lokaal te starten.
              </div>
              <div className="text-slate-300">
                • <strong className="text-white">start-mac-linux.sh</strong>: Startscript voor macOS en Linux.
              </div>
            </div>

            <div className="text-[11px] text-slate-400">
              Download het volledige project via <strong>Export to ZIP</strong> of <strong>GitHub</strong> en pak de ZIP eerst uit. Ontbreekt Node.js, dan vraagt <strong>start-windows.bat</strong> toestemming om de LTS-versie automatisch te installeren. Alleen bij de eerste start is internet nodig.
            </div>
          </div>

          {/* Separate local database backup (.json) */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1 max-w-md">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-emerald-400" /> Gegevensback-up bewaren op harde schijf of USB
              </h3>
              <p className="text-slate-300">
                Sla alle huidige deelnemers, waves, categorieën en geregistreerde tijden op als een veilig lokaal <code className="text-amber-400">.json</code> bestand op uw computer.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleQuickBackup}
                disabled={downloadingBackup}
                className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-2 shadow transition"
              >
                <FolderDown className="w-4 h-4" />
                <span>{downloadingBackup ? 'Bezig...' : 'Download Lokale Back-up (.json)'}</span>
              </button>
            </div>
          </div>

          {backupSuccess && (
            <div className="p-3 rounded-xl bg-emerald-950/50 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2 font-semibold">
              <CheckCircle2 className="w-4 h-4" />
              <span>Back-up bestand succesvol opgeslagen op uw computer!</span>
            </div>
          )}

          {backupError && (
            <div className="p-3 rounded-xl bg-red-950/50 border border-red-500/40 text-red-300 text-xs flex items-center gap-2 font-semibold">
              <AlertTriangle className="w-4 h-4" />
              <span>{backupError}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end pt-2 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold"
          >
            Sluiten
          </button>
        </div>
      </div>
    </div>
  );
};
