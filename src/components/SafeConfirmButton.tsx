import React, { useState, useRef, useEffect } from 'react';
import { ShieldAlert, AlertTriangle, Check, X } from 'lucide-react';
import { soundService } from '../services/soundService';

export interface SafeConfirmButtonProps {
  onConfirm: () => void | Promise<void>;
  mode?: 'hold' | 'double-click';
  holdDurationSeconds?: number;
  requireTypeConfirm?: boolean;
  typeConfirmKeyword?: string;
  typeConfirmTitle?: string;
  typeConfirmDescription?: string;
  children: React.ReactNode;
  className?: string;
  variant?: 'danger' | 'warning' | 'primary' | 'secondary';
  disabled?: boolean;
  title?: string;
  id?: string;
}

export const SafeConfirmButton: React.FC<SafeConfirmButtonProps> = ({
  onConfirm,
  mode = 'hold',
  holdDurationSeconds = 3,
  requireTypeConfirm = false,
  typeConfirmKeyword = 'BEVESTIG',
  typeConfirmTitle = 'Bevestig deze actie definitief',
  typeConfirmDescription = 'Typ het woord hieronder over om deze ingrijpende actie uit te voeren.',
  children,
  className = '',
  variant = 'danger',
  disabled = false,
  title,
  id,
}) => {
  // Hold state
  const [isHolding, setIsHolding] = useState(false);
  const [progress, setProgress] = useState(0); // 0 to 1
  const [remainingSeconds, setRemainingSeconds] = useState(holdDurationSeconds);
  const holdStartTimeRef = useRef<number | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Double click state
  const [pendingSecondClick, setPendingSecondClick] = useState(false);
  const doubleClickTimeoutRef = useRef<number | null>(null);

  // Type modal state
  const [showTypeModal, setShowTypeModal] = useState(false);
  const [typeInput, setTypeInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (doubleClickTimeoutRef.current) window.clearTimeout(doubleClickTimeoutRef.current);
    };
  }, []);

  const triggerConfirm = async () => {
    setIsProcessing(true);
    try {
      soundService.playSuccess();
      await onConfirm();
    } catch {
      soundService.playError();
    } finally {
      setIsProcessing(false);
      resetHold();
      setPendingSecondClick(false);
      setShowTypeModal(false);
      setTypeInput('');
    }
  };

  const onHoldCompleted = () => {
    resetHold();
    if (requireTypeConfirm) {
      soundService.playWarning();
      setShowTypeModal(true);
      setTypeInput('');
    } else {
      triggerConfirm();
    }
  };

  const startHold = (e: React.MouseEvent | React.TouchEvent) => {
    if (disabled || isProcessing || mode !== 'hold') return;
    // Don't trigger on right-click
    if ('button' in e && e.button !== 0) return;

    soundService.playWarning();
    setIsHolding(true);
    setProgress(0);
    setRemainingSeconds(holdDurationSeconds);
    holdStartTimeRef.current = Date.now();

    const updateProgress = () => {
      if (!holdStartTimeRef.current) return;
      const elapsed = Date.now() - holdStartTimeRef.current;
      const totalMs = holdDurationSeconds * 1000;
      const currentProgress = Math.min(1, elapsed / totalMs);
      setProgress(currentProgress);

      const remaining = Math.max(1, Math.ceil((totalMs - elapsed) / 1000));
      setRemainingSeconds(remaining);

      if (currentProgress >= 1) {
        onHoldCompleted();
      } else {
        animFrameRef.current = requestAnimationFrame(updateProgress);
      }
    };

    animFrameRef.current = requestAnimationFrame(updateProgress);
  };

  const cancelHold = () => {
    if (mode !== 'hold' || !isHolding) return;
    resetHold();
  };

  const resetHold = () => {
    setIsHolding(false);
    setProgress(0);
    setRemainingSeconds(holdDurationSeconds);
    holdStartTimeRef.current = null;
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
  };

  const handleButtonClick = (e: React.MouseEvent) => {
    if (disabled || isProcessing) return;

    if (mode === 'double-click') {
      e.preventDefault();
      if (!pendingSecondClick) {
        // First click
        soundService.playWarning();
        setPendingSecondClick(true);
        if (doubleClickTimeoutRef.current) window.clearTimeout(doubleClickTimeoutRef.current);
        doubleClickTimeoutRef.current = window.setTimeout(() => {
          setPendingSecondClick(false);
        }, 3500);
      } else {
        // Second click
        if (doubleClickTimeoutRef.current) window.clearTimeout(doubleClickTimeoutRef.current);
        setPendingSecondClick(false);
        if (requireTypeConfirm) {
          setShowTypeModal(true);
          setTypeInput('');
        } else {
          triggerConfirm();
        }
      }
    }
  };

  const handleTypeModalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (typeInput.trim().toUpperCase() !== typeConfirmKeyword.trim().toUpperCase()) {
      soundService.playError();
      return;
    }
    await triggerConfirm();
  };

  // Variant styling
  const variantStyles = {
    danger: 'bg-red-950/50 hover:bg-red-900/60 text-red-200 border-red-800/60 focus:ring-red-500',
    warning: 'bg-amber-950/50 hover:bg-amber-900/60 text-amber-200 border-amber-800/60 focus:ring-amber-500',
    primary: 'bg-blue-950/50 hover:bg-blue-900/60 text-blue-200 border-blue-800/60 focus:ring-blue-500',
    secondary: 'bg-slate-800 hover:bg-slate-750 text-slate-200 border-slate-700 focus:ring-slate-500',
  }[variant];

  const progressBgColor = {
    danger: 'bg-red-600',
    warning: 'bg-amber-500',
    primary: 'bg-blue-500',
    secondary: 'bg-slate-600',
  }[variant];

  return (
    <>
      <button
        id={id}
        type="button"
        title={title}
        disabled={disabled || isProcessing}
        onMouseDown={startHold}
        onMouseUp={cancelHold}
        onMouseLeave={cancelHold}
        onTouchStart={startHold}
        onTouchEnd={cancelHold}
        onTouchCancel={cancelHold}
        onClick={handleButtonClick}
        className={`relative overflow-hidden select-none border font-bold text-xs rounded-xl px-4 py-2.5 transition active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none ${variantStyles} ${className}`}
      >
        {/* Animated Progress Bar for Hold */}
        {mode === 'hold' && isHolding && (
          <span
            className={`absolute inset-0 ${progressBgColor} opacity-40 transition-none pointer-events-none`}
            style={{ width: `${progress * 100}%` }}
          />
        )}

        {/* Content */}
        <span className="relative z-10 flex items-center justify-center gap-2">
          {mode === 'hold' && isHolding ? (
            <>
              <AlertTriangle className="w-4 h-4 animate-bounce" />
              <span>Houd ingedrukt ({remainingSeconds}s)...</span>
            </>
          ) : mode === 'double-click' && pendingSecondClick ? (
            <>
              <AlertTriangle className="w-4 h-4 animate-pulse text-amber-400" />
              <span>Nogmaals klikken om te bevestigen!</span>
            </>
          ) : (
            children
          )}
        </span>
      </button>

      {/* Explicit Type-to-Confirm Modal */}
      {showTypeModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-fadeIn"
        >
          <div className="bg-slate-900 border-2 border-red-500/60 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 text-xs text-slate-200">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-red-400" />
                <h3 className="text-base font-black text-white">{typeConfirmTitle}</h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowTypeModal(false);
                  setTypeInput('');
                }}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="leading-relaxed text-slate-300">{typeConfirmDescription}</p>

            <form onSubmit={handleTypeModalSubmit} className="space-y-4">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Typ ter bevestiging exact: <strong className="text-red-400 font-mono tracking-widest">{typeConfirmKeyword}</strong>
                </label>
                <input
                  type="text"
                  autoFocus
                  required
                  value={typeInput}
                  onChange={(e) => setTypeInput(e.target.value)}
                  placeholder={typeConfirmKeyword}
                  className="w-full bg-slate-950 border-2 border-slate-700 focus:border-red-500 rounded-xl px-3 py-2.5 text-white font-mono uppercase text-center font-bold tracking-widest text-sm focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setShowTypeModal(false);
                    setTypeInput('');
                  }}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold transition"
                >
                  Annuleren
                </button>
                <button
                  type="submit"
                  disabled={typeInput.trim().toUpperCase() !== typeConfirmKeyword.trim().toUpperCase() || isProcessing}
                  className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:hover:bg-red-600 text-white font-bold uppercase tracking-wider transition flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>Definitief uitvoeren</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};
