// src/components/mailing/AIMailingPanel.tsx
// ═══════════════════════════════════════════════════════════
// Responsabilidad única: UI del panel "Crear con AI"
// Formulario + loading + callback al parent
// NO contiene lógica de negocio ni llamadas directas a Firebase
// ═══════════════════════════════════════════════════════════

import { useState } from 'react';
import type { Brand } from '@/types';
import type { AIMailingResponse } from '@/services/aiMailingContext';
import { type EmailType, type AIMailingOptions, buildAIMailingContext } from '@/services/aiMailingContext';
import { generateAIMailing, type GenerationStep } from '@/services/aiMailingGenerator';
import { generateSmartPrompt } from '@/services/brandTextBankService';
import AIMailingLoading from './AIMailingLoading';

// ═══════════════════════════════════════════════════════════
// CONSTANTES
// ═══════════════════════════════════════════════════════════

const EMAIL_TYPES: { key: EmailType; label: string; icon: string }[] = [
  { key: 'promocional', label: 'Promocional', icon: '🎯' },
  { key: 'informativo', label: 'Informativo', icon: '📰' },
  { key: 'newsletter', label: 'Newsletter', icon: '📬' },
  { key: 'invitación', label: 'Invitación', icon: '🎟️' },
  { key: 'científico', label: 'Científico', icon: '🔬' },
  { key: 'aviso_breve', label: 'Aviso breve', icon: '⚡' },
];

const TONE_OPTIONS = [
  { value: 'profesional' as const, label: 'Profesional' },
  { value: 'cercano' as const, label: 'Cercano' },
  { value: 'académico' as const, label: 'Académico' },
  { value: 'urgente' as const, label: 'Urgente' },
];

const LENGTH_OPTIONS = [
  { value: 'corto' as const, label: 'Corto' },
  { value: 'medio' as const, label: 'Medio' },
  { value: 'largo' as const, label: 'Largo' },
];

import type { ContentBlockType } from '@/services/aiMailingContext';

const CONTENT_BLOCKS: { key: ContentBlockType; label: string; icon: string; description: string }[] = [
  { key: 'hero', label: 'Hero', icon: '🖼️', description: 'Imagen destacada' },
  { key: 'text', label: 'Texto', icon: '📝', description: 'Párrafos y títulos' },
  { key: 'image', label: 'Imagen', icon: '🏞️', description: 'Foto o ilustración' },
  { key: 'bullets', label: 'Bullets', icon: '📋', description: 'Lista con puntos' },
  { key: 'cta', label: 'CTA', icon: '🔘', description: 'Botón de acción' },
  { key: 'quote', label: 'Cita', icon: '💬', description: 'Texto destacado' },
  { key: 'divider', label: 'Separador', icon: '➖', description: 'Línea divisoria' },
  { key: 'columns', label: 'Columnas', icon: '📊', description: 'Contenido en 2 cols' },
];

// ═══════════════════════════════════════════════════════════
// PROPS
// ═══════════════════════════════════════════════════════════

interface AIMailingPanelProps {
  brand: Brand;
  tenantId: string;
  onGenerated: (response: AIMailingResponse, meta: { emailType: EmailType; userPrompt: string; tone?: string; length?: string }) => void;
  onClose: () => void;
}

// ═══════════════════════════════════════════════════════════
// COMPONENTE
// ═══════════════════════════════════════════════════════════

const AIMailingPanel: React.FC<AIMailingPanelProps> = ({
  brand,
  tenantId,
  onGenerated,
  onClose,
}) => {
  // Form state
  const [prompt, setPrompt] = useState('');
  const [emailType, setEmailType] = useState<EmailType | undefined>();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [selectedBlocks, setSelectedBlocks] = useState<ContentBlockType[]>([]);
  const [options, setOptions] = useState<AIMailingOptions>({
    includeHeroImage: true,
    includeClinicalData: true,
    includeQR: true,
    includeSocialLinks: true,
    tone: 'profesional',
    length: 'medio',
  });

  // Generation state
  const [generating, setGenerating] = useState(false);
  const [currentStep, setCurrentStep] = useState<GenerationStep>('building_context');
  const [stepMessage, setStepMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [suggestingPrompt, setSuggestingPrompt] = useState(false);

  const canGenerate = prompt.trim().length > 5;

  const handleGenerate = async () => {
    if (!canGenerate) return;

    setGenerating(true);
    setError(null);
    setCurrentStep('building_context');
    setStepMessage('Analizando identidad de marca...');

    try {
      // 1. Build context
      const contextOptions = {
        ...options,
        selectedBlocks: selectedBlocks.length > 0 ? selectedBlocks : undefined,
      };
      const context = await buildAIMailingContext(
        brand.id,
        tenantId,
        prompt.trim(),
        emailType,
        contextOptions,
      );

      // 2. Generate email
      const response = await generateAIMailing(context, (progress) => {
        setCurrentStep(progress.step);
        setStepMessage(progress.message);
      });

      // 3. Callback to parent
      onGenerated(response, {
        emailType: emailType ?? 'promocional',
        userPrompt: prompt.trim(),
        tone: options.tone,
        length: options.length,
      });
    } catch (err) {
      setCurrentStep('error');
      setError(err instanceof Error ? err.message : 'Error al generar el email');
      setGenerating(false);
    }
  };

  const handleSmartPrompt = async () => {
    setSuggestingPrompt(true);
    try {
      const suggested = await generateSmartPrompt(brand, tenantId, emailType, prompt);
      setPrompt(suggested);
    } catch (err) {
      console.error('[SmartPrompt] Error:', err);
    } finally {
      setSuggestingPrompt(false);
    }
  };

  const updateOption = <K extends keyof AIMailingOptions>(key: K, value: AIMailingOptions[K]) => {
    setOptions((prev) => ({ ...prev, [key]: value }));
  };

  // ── Loading state ──
  if (generating) {
    return (
      <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
          <AIMailingLoading currentStep={currentStep} message={stepMessage} />
          {error && (
            <div className="mt-4 text-center">
              <p className="text-sm text-red-600 mb-3">{error}</p>
              <button
                onClick={() => { setGenerating(false); setError(null); }}
                className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition"
              >
                Volver al panel
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Form ──
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-end">
      <div className="bg-white h-full w-full max-w-md shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-linear-to-r from-blue-50 to-cyan-50">
          <div className="flex items-center gap-2">
            <span className="text-lg">✨</span>
            <h2 className="text-sm font-bold text-gray-800">Crear Email con IA</h2>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg bg-white/80 hover:bg-white flex items-center justify-center text-gray-500 hover:text-gray-700 transition shadow-sm"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Brand info */}
          <div className="flex items-center gap-3 bg-gray-50 rounded-xl p-3">
            {brand.params.logoUrl ? (
              <img
                src={brand.params.logoUrl}
                alt={brand.name}
                className="w-9 h-9 object-contain rounded-lg bg-white p-1 shadow-sm"
              />
            ) : (
              <div className="w-9 h-9 rounded-lg bg-linear-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white text-xs font-bold shadow-sm">
                {brand.name.charAt(0)}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-800 truncate">{brand.name}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span
                  className="w-3 h-3 rounded-full shadow-inner"
                  style={{ backgroundColor: brand.params.colorPrimary }}
                />
                <span
                  className="w-3 h-3 rounded-full shadow-inner"
                  style={{ backgroundColor: brand.params.colorSecondary }}
                />
                <span className="text-[10px] text-gray-400">
                  {brand.params.fontTitle}
                </span>
              </div>
            </div>
            <div className="text-right text-[10px] text-gray-400 space-y-0.5">
              <p>{brand.params.claims?.length || 0} claims</p>
            </div>
          </div>

          {/* Email type */}
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-2 block">
              ¿Qué tipo de email quieres crear?
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {EMAIL_TYPES.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setEmailType(emailType === t.key ? undefined : t.key)}
                  className={`px-2.5 py-2 rounded-lg text-xs font-medium transition border ${
                    emailType === t.key
                      ? 'bg-blue-50 border-blue-300 text-blue-700'
                      : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <span className="mr-1">{t.icon}</span>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Prompt */}
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-2 block">
              Describe tu email
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Ej: Email para invitar médicos gastroenterólogos a un webinar sobre nuevos datos de eficacia en úlcera gástrica..."
              rows={4}
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none transition placeholder:text-gray-300"
            />
            <p className="text-[10px] text-gray-400 mt-1">
              {prompt.length > 0 ? `${prompt.length} caracteres` : 'Mínimo 6 caracteres'}
            </p>
            <button
              type="button"
              onClick={handleSmartPrompt}
              disabled={suggestingPrompt || generating}
              className="mt-2 text-xs font-medium text-purple-600 hover:text-purple-800 flex items-center gap-1.5 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {suggestingPrompt ? (
                <>
                  <span className="inline-block h-3 w-3 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
                  Pensando...
                </>
              ) : (
                <>✨ Sugerir prompt</>
              )}
            </button>
          </div>

          {/* Block selector */}
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1.5 block">
              Bloques del email <span className="text-gray-400 font-normal">(opcional)</span>
            </label>
            <p className="text-[10px] text-gray-400 mb-2">
              Selecciona los bloques que quieres incluir. Si no seleccionas ninguno, la IA decide.
            </p>
            <div className="grid grid-cols-4 gap-1.5">
              {CONTENT_BLOCKS.map((b) => {
                const isSelected = selectedBlocks.includes(b.key);
                return (
                  <button
                    key={b.key}
                    type="button"
                    onClick={() =>
                      setSelectedBlocks((prev) =>
                        isSelected ? prev.filter((k) => k !== b.key) : [...prev, b.key],
                      )
                    }
                    className={`flex flex-col items-center gap-0.5 px-1.5 py-2 rounded-lg text-[10px] font-medium transition border ${
                      isSelected
                        ? 'bg-blue-50 border-blue-300 text-blue-700'
                        : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
                    }`}
                    title={b.description}
                  >
                    <span className="text-sm">{b.icon}</span>
                    {b.label}
                  </button>
                );
              })}
            </div>
            {selectedBlocks.length > 0 && (
              <div className="mt-2 flex items-center justify-between">
                <p className="text-[10px] text-blue-600">
                  {selectedBlocks.length} bloque{selectedBlocks.length > 1 ? 's' : ''}: {selectedBlocks.join(' → ')}
                </p>
                <button
                  type="button"
                  onClick={() => setSelectedBlocks([])}
                  className="text-[10px] text-gray-400 hover:text-gray-600 transition"
                >
                  Limpiar
                </button>
              </div>
            )}
          </div>

          {/* Advanced options */}
          <div>
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-xs font-medium text-gray-500 hover:text-gray-700 flex items-center gap-1 transition"
            >
              <svg
                className={`w-3 h-3 transition-transform ${showAdvanced ? 'rotate-90' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
              Opciones avanzadas
            </button>

            {showAdvanced && (
              <div className="mt-3 space-y-3 bg-gray-50 rounded-xl p-3">
                {/* Toggles */}
                {([
                  ['includeHeroImage', 'Incluir hero image'] as const,
                  ['includeClinicalData', 'Incluir datos clínicos'] as const,
                  ['includeQR', 'Incluir QR'] as const,
                  ['includeSocialLinks', 'Incluir redes sociales'] as const,
                ]).map(([key, label]) => (
                  <label key={key} className="flex items-center justify-between">
                    <span className="text-xs text-gray-600">{label}</span>
                    <input
                      type="checkbox"
                      checked={options[key] ?? true}
                      onChange={(e) => updateOption(key, e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </label>
                ))}

                {/* Tone */}
                <div>
                  <label className="text-xs text-gray-600 mb-1 block">Tono</label>
                  <select
                    value={options.tone || 'profesional'}
                    onChange={(e) => updateOption('tone', e.target.value as AIMailingOptions['tone'])}
                    className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg bg-white"
                  >
                    {TONE_OPTIONS.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>

                {/* Length */}
                <div>
                  <label className="text-xs text-gray-600 mb-1 block">Longitud</label>
                  <select
                    value={options.length || 'medio'}
                    onChange={(e) => updateOption('length', e.target.value as AIMailingOptions['length'])}
                    className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg bg-white"
                  >
                    {LENGTH_OPTIONS.map((l) => (
                      <option key={l.value} value={l.value}>{l.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer with generate button */}
        <div className="px-5 py-4 border-t border-gray-100 bg-white">
          <button
            onClick={handleGenerate}
            disabled={!canGenerate}
            className="w-full py-3 bg-linear-to-r from-blue-600 to-cyan-600 text-white text-sm font-bold rounded-xl hover:from-blue-700 hover:to-cyan-700 transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-blue-500/25"
          >
            <span>🚀</span>
            Generar Email
          </button>
        </div>
      </div>
    </div>
  );
};

export default AIMailingPanel;
