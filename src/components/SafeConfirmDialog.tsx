import React from 'react';
import { AlertTriangle, Info, CheckCircle2, ShieldAlert, X } from 'lucide-react';
import { soundService } from '../services/soundService';

export interface SafeConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'info';
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  requireTyping?: boolean;
  typeKeyword?: string;
}

export const SafeConfirmDialog: React.FC<SafeConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  confirmLabel = 'Bevestigen',
  cancelLabel = 'Annuleren',
  variant = 'warning',
  onConfirm,
  onCancel,
  requireTyping = false,
  typeKeyword = 'BEVESTIG',
}) => {
  const [typedValue, setTypedValue] = React.useState('');
  const [isProcessing, setIsProcessing] = React.useState(false);

  React.useEffect(() => {
    if (isOpen) {
      setTypedValue('');
      if (variant === 'danger') soundService.playWarning();
      else if (variant === 'warning') soundService.playWarning();
    }
  }, [isOpen, variant]);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    if (requireTyping && typedValue.trim().toUpperCase() !== typeKeyword.trim().toUpperCase()) {
      soundService.playError();
      return;
    }
    setIsProcessing(true);
    try {
      soundService.playSuccess();
      await onConfirm();
    } catch {
      soundService.playError();
    } finally {
      setIsProcessing(false);
      onCancel();
    }
  };

  const isConfirmedDisabled = requireTyping && typedValue.trim().toUpperCase() !== typeKeyword.trim().toUpperCase();

  const icon = {
    danger: <ShieldAlert className="w-5 h-5 text-red-400" />,
    warning: <AlertTriangle className="w-5 h-5 text-amber-400" />,
    info: <Info className="w-5 h-5 text-blue-400" />,
  }[variant];

  const confirmBtnClass = {
    danger: 'bg-red-600 hover:bg-red-500 text-white',
    warning: 'bg-amber-500 hover:bg-amber-400 text-slate-950 font-black',
    info: 'bg-blue-600 hover:bg-blue-500 text-white',
  }[variant];

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-fadeIn"
    >
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 text-xs text-slate-200">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            {icon}
            <h3 className="text-base font-black text-white">{title}</h3>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="leading-relaxed whitespace-pre-line text-slate-300">{message}</p>

        {requireTyping && (
          <div>
            <label className="block text-slate-300 font-semibold mb-1">
              Typ <strong className="text-red-400 font-mono tracking-wider">{typeKeyword}</strong> om te bevestigen:
            </label>
            <input
              type="text"
              autoFocus
              value={typedValue}
              onChange={(e) => setTypedValue(e.target.value)}
              placeholder={typeKeyword}
              className="w-full bg-slate-950 border border-slate-700 focus:border-amber-500 rounded-xl px-3 py-2 text-white font-mono uppercase text-center font-bold tracking-widest text-sm focus:outline-none"
            />
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold transition"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={isConfirmedDisabled || isProcessing}
            onClick={handleConfirm}
            className={`px-5 py-2 rounded-xl font-bold uppercase tracking-wider transition disabled:opacity-40 flex items-center gap-1.5 ${confirmBtnClass}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
