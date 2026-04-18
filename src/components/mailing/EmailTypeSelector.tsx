// src/components/mailing/EmailTypeSelector.tsx
// ═══════════════════════════════════════════════════════════
// Modal para seleccionar tipo de email al guardar
// ═══════════════════════════════════════════════════════════

import { useState } from 'react';
import type { TextBankEmailType } from '@/types';

const EMAIL_TYPES: { key: TextBankEmailType; label: string; icon: string }[] = [
  { key: 'promocional', label: 'Promocional', icon: '🎯' },
  { key: 'informativo', label: 'Informativo', icon: '📰' },
  { key: 'newsletter', label: 'Newsletter', icon: '📬' },
  { key: 'invitación', label: 'Invitación', icon: '🎟️' },
  { key: 'científico', label: 'Científico', icon: '🔬' },
  { key: 'aviso_breve', label: 'Aviso breve', icon: '⚡' },
  { key: 'otro', label: 'Otro', icon: '📄' },
];

interface EmailTypeSelectorProps {
  onSelect: (type: TextBankEmailType) => void;
  onSkip: () => void;
}

const EmailTypeSelector: React.FC<EmailTypeSelectorProps> = ({ onSelect, onSkip }) => {
  const [selected, setSelected] = useState<TextBankEmailType | null>(null);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-in zoom-in-95">
        <h3 className="text-base font-semibold text-gray-800 mb-1">
          ¿Qué tipo de email es este?
        </h3>
        <p className="text-xs text-gray-400 mb-4">
          Esto nos ayuda a mejorar las sugerencias de IA para tu marca.
        </p>

        <div className="grid grid-cols-2 gap-2 mb-5">
          {EMAIL_TYPES.map((t) => (
            <button
              key={t.key}
              onClick={() => setSelected(t.key)}
              className={`px-3 py-2.5 rounded-xl text-xs font-medium transition border text-left flex items-center gap-2 ${
                selected === t.key
                  ? 'bg-blue-50 border-blue-300 text-blue-700'
                  : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              <span>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <button
            onClick={onSkip}
            className="flex-1 px-4 py-2.5 text-xs font-medium text-gray-500 bg-gray-100 rounded-xl hover:bg-gray-200 transition"
          >
            Omitir
          </button>
          <button
            onClick={() => onSelect(selected ?? 'otro')}
            disabled={!selected}
            className="flex-1 px-4 py-2.5 text-xs font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
};

export default EmailTypeSelector;
