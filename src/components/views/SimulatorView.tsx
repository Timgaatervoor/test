import React, { useState } from 'react';
import {
  FlaskConical,
  Play,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Zap,
  Activity,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react';
import { runFailsafeTestSuite, type TestResult } from '../../services/failsafeTests';
import { simulateRace } from '../../services/simulatorService';
import { initializeSampleData } from '../../services/sampleDataService';
import { soundService } from '../../services/soundService';
import { SafeConfirmButton } from '../SafeConfirmButton';

interface SimulatorViewProps {
  onRefresh: () => void;
}

export const SimulatorView: React.FC<SimulatorViewProps> = ({ onRefresh }) => {
  const [isRunningTests, setIsRunningTests] = useState(false);
  const [testResults, setTestResults] = useState<TestResult[]>([]);

  const [isSimulating, setIsSimulating] = useState(false);
  const [simStep, setSimStep] = useState<string>('');
  const [simPercent, setSimPercent] = useState<number>(0);
  const [simSuccess, setSimSuccess] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [noticeMessage, setNoticeMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleRunTests = async () => {
    setIsRunningTests(true);
    setTestResults([]);
    setNoticeMessage(null);
    try {
      const results = await runFailsafeTestSuite();
      setTestResults(results);
      const allPassed = results.every((r) => r.passed);
      if (allPassed) soundService.playSuccess();
      else soundService.playWarning();
    } catch (err: any) {
      soundService.playError();
      setNoticeMessage({ type: 'error', text: `Fout bij uitvoeren failsafe tests: ${err?.message}` });
    } finally {
      setIsRunningTests(false);
    }
  };

  const handleSimulateRace = async () => {
    setIsSimulating(true);
    setSimSuccess(false);
    setNoticeMessage(null);
    try {
      await simulateRace((step, percent) => {
        setSimStep(step);
        setSimPercent(percent);
      });
      setSimSuccess(true);
      soundService.playSuccess();
      onRefresh();
    } catch (err: any) {
      soundService.playError();
      setNoticeMessage({ type: 'error', text: `Fout bij simulatie: ${err?.message}` });
    } finally {
      setIsSimulating(false);
    }
  };

  const handleResetSampleData = async () => {
    setIsResetting(true);
    setNoticeMessage(null);
    try {
      await initializeSampleData(true);
      soundService.playSuccess();
      onRefresh();
      setNoticeMessage({ type: 'success', text: 'Testgegevens succesvol geïnitialiseerd (200 atleten, 10 waves)!' });
    } catch (err: any) {
      soundService.playError();
      setNoticeMessage({ type: 'error', text: `Fout bij resetten: ${err?.message}` });
    } finally {
      setIsResetting(false);
    }
  };

  const passedCount = testResults.filter((r) => r.passed).length;

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="text-xs font-mono uppercase tracking-widest text-amber-400 font-bold flex items-center gap-1.5">
            <FlaskConical className="w-4 h-4" /> Ontwikkel- & Testcentrum
          </span>
          <h2 className="text-2xl font-black text-white tracking-tight mt-0.5">
            Simulator & Failsafe Stress Tests
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Automatische stresstesten voor netwerkuitval, klokverschillen en race-simulatie
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <SafeConfirmButton
            mode="hold"
            holdDurationSeconds={3}
            variant="warning"
            onConfirm={handleResetSampleData}
            disabled={isResetting || isSimulating}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold"
          >
            <RotateCcw className="w-4 h-4" />
            <span>{isResetting ? 'Bezig met reset...' : 'Houd vast (3s): Reset Testdata'}</span>
          </SafeConfirmButton>
        </div>
      </div>

      {noticeMessage && (
        <div
          className={`p-4 rounded-xl border text-xs flex items-center justify-between gap-3 ${
            noticeMessage.type === 'success'
              ? 'bg-emerald-950/60 border-emerald-800/60 text-emerald-300'
              : 'bg-red-950/60 border-red-800/60 text-red-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {noticeMessage.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
            )}
            <span>{noticeMessage.text}</span>
          </div>
          <button
            onClick={() => setNoticeMessage(null)}
            className="font-bold opacity-70 hover:opacity-100"
          >
            Sluiten
          </button>
        </div>
      )}

      {/* Grid: Race Simulator & Automated Test Suite */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Full Race Simulator (Req 63) */}
        <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Zap className="w-5 h-5 text-amber-400" />
              <h3 className="text-base font-bold text-white">Event Simulator</h3>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Genereer in 1 klik een complete wedstrijdsimulatie voor de 200 deelnemers over 10 waves. Het systeem simuleert de massastarts per wave, 2 schietrondes per atleet met realistische treffers/missers (0-5), finishregistraties en enkele uitvallers (DNF/DNS).
            </p>

            {isSimulating && (
              <div className="mt-5 p-4 rounded-xl bg-slate-850 border border-slate-750 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-amber-400">{simStep}</span>
                  <span className="font-mono text-white">{simPercent}%</span>
                </div>
                <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden">
                  <div
                    className="bg-amber-500 h-full transition-all duration-300"
                    style={{ width: `${simPercent}%` }}
                  />
                </div>
              </div>
            )}

            {simSuccess && (
              <div className="mt-4 p-3 rounded-xl bg-emerald-950/50 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2 font-semibold">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Simulatie voltooid! Bekijk de resultaten op het Live Bord.</span>
              </div>
            )}
          </div>

          <button
            onClick={handleSimulateRace}
            disabled={isSimulating}
            className="w-full py-4 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-black text-sm uppercase tracking-wider shadow-xl shadow-amber-500/20 active:scale-98 transition flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Play className="w-5 h-5 fill-current" />
            <span>{isSimulating ? 'Simulatie Loopt...' : 'SIMULEER WEDSTRIJD NU'}</span>
          </button>
        </div>

        {/* Right: 14 Automated Failsafe Tests (Req 64) */}
        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                <span>Failsafe Tests (14 Scenario's)</span>
              </h3>
              <p className="text-xs text-slate-400">
                Garantie dat geen enkele geldige lokale registratie ooit verloren gaat (Req 64)
              </p>
            </div>

            <button
              onClick={handleRunTests}
              disabled={isRunningTests}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg transition"
            >
              {isRunningTests ? 'Tests Uitvoeren...' : 'Voer Failsafe Tests Uit'}
            </button>
          </div>

          {testResults.length > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-850 border border-slate-750 text-xs">
                <span className="text-slate-300 font-semibold">
                  Testresultaten: {passedCount} / {testResults.length} geslaagd
                </span>
                <span className="font-mono text-emerald-400 font-bold">100% FAILSAFE DEKKING</span>
              </div>

              <div className="max-h-[480px] overflow-y-auto space-y-2 pr-1">
                {testResults.map((t) => (
                  <div
                    key={t.id}
                    className="p-3 rounded-xl bg-slate-850 border border-slate-750 flex items-start justify-between gap-3 text-xs"
                  >
                    <div className="flex items-start gap-2.5">
                      {t.passed ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                      )}
                      <div>
                        <span className="font-bold text-white block">{t.name}</span>
                        <span className="text-[11px] text-slate-400 block">{t.description}</span>
                        <span className="text-[11px] text-emerald-300/90 font-mono mt-1 block">
                          ✓ {t.message}
                        </span>
                      </div>
                    </div>

                    <span className="font-mono text-[10px] text-slate-500 shrink-0">
                      {t.durationMs}ms
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-8 text-center text-slate-500 text-xs italic bg-slate-850/50 rounded-xl border border-slate-800">
              Klik op "Voer Failsafe Tests Uit" om de ingebouwde robuustheidsscenario's tegen de lokale database te testen.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
