// src/components/mailing/AIMailingLoading.tsx
import type { GenerationStep } from '@/services/aiMailingGenerator';

const STEPS: { key: GenerationStep; label: string }[] = [
  { key: 'building_context', label: 'Analizando identidad de marca' },
  { key: 'generating_content', label: 'Generando estructura y contenido' },
  { key: 'generating_images', label: 'Creando imágenes' },
  { key: 'validating', label: 'Validando compliance' },
  { key: 'done', label: 'Email generado' },
];

interface Props {
  currentStep: GenerationStep;
  message?: string;
}

const AIMailingLoading: React.FC<Props> = ({ currentStep, message }) => {
  const currentIdx = STEPS.findIndex((s) => s.key === currentStep);

  return (
    <div className="flex flex-col items-center py-10 px-4">
      {/* Spinner */}
      <div className="relative mb-6">
        <div className="w-12 h-12 rounded-full border-2 border-gray-200" />
        <div className="absolute inset-0 w-12 h-12 rounded-full border-2 border-transparent border-t-blue-600 animate-spin" />
        <span className="absolute inset-0 flex items-center justify-center text-lg">✨</span>
      </div>

      <p className="text-sm font-semibold text-gray-700 mb-6">
        {message || 'Creando tu email...'}
      </p>

      {/* Steps */}
      <div className="w-full max-w-xs space-y-2.5">
        {STEPS.map((step, i) => {
          const isDone = i < currentIdx || currentStep === 'done';
          const isCurrent = i === currentIdx && currentStep !== 'done' && currentStep !== 'error';
          const isPending = i > currentIdx;

          return (
            <div key={step.key} className="flex items-center gap-2.5 text-xs">
              {isDone && (
                <span className="w-5 h-5 rounded-full bg-green-100 text-green-600 flex items-center justify-center shrink-0">
                  ✓
                </span>
              )}
              {isCurrent && (
                <span className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                  <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
                </span>
              )}
              {isPending && (
                <span className="w-5 h-5 rounded-full bg-gray-100 shrink-0" />
              )}
              <span
                className={
                  isDone
                    ? 'text-green-700'
                    : isCurrent
                      ? 'text-blue-700 font-medium'
                      : 'text-gray-400'
                }
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Progress bar */}
      <div className="w-full max-w-xs mt-6 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-linear-to-r from-blue-500 to-cyan-500 rounded-full transition-all duration-500"
          style={{ width: `${Math.min(((currentIdx + 1) / STEPS.length) * 100, 100)}%` }}
        />
      </div>
    </div>
  );
};

export default AIMailingLoading;
