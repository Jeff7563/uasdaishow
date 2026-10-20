import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorMessageProps {
  message: string;
  onRetry: () => void;
}

export const ErrorMessage: React.FC<ErrorMessageProps> = ({ message, onRetry }) => {
  return (
    <div className="bg-[#181318]/90 border border-rose-500/30 rounded-2xl p-2.5 text-xs text-rose-200 flex items-start gap-2 shadow-sm backdrop-blur-xl">
      <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
      <div className="flex-1 overflow-hidden">
        <div className="font-semibold text-rose-300 text-[11px]">Notice</div>
        <div className="text-[10px] text-rose-300/80 truncate">{message}</div>
      </div>
      <button
        onClick={onRetry}
        className="px-2 py-0.5 bg-[#251520] hover:bg-rose-900/40 rounded-full border border-rose-500/20 text-[10px] font-medium text-rose-200 flex items-center gap-1 transition-colors shrink-0"
      >
        <RotateCcw className="w-2.5 h-2.5" />
        Retry
      </button>
    </div>
  );
};
