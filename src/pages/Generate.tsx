import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, Link, useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useTenant } from '@/hooks/useTenant';
import { useToast } from '@/hooks/useToast';
import { getBrand } from '@/services/brandService';
import { loadGoogleFonts } from '@/services/fontService';
import { getMolecule, getIndications } from '@/services/moleculeService';
import { getInsightsByStatus } from '@/services/insightService';
import { getTemplates, seedTemplates, expandTemplateForPages } from '@/services/templateService';
import {
  callGenerateContent,
  createSession,
  getSession,
  addMessageToSession,
  updateSessionSlots,
  saveSession,
  getDraftSessionsByBrand,
  deleteSession,
  getAvailableProviders,
  isProviderAvailable,
  generateCampaignIdeas,
  validateCompliance,
  translateSession,
  generateABVariants,
} from '@/services/generationService';
import type { AIProvider, CampaignIdea, ComplianceResult, ABVariant } from '@/services/generationService';
import { generateImage, type ImageBrandContext, type ImageStyle, IMAGE_STYLE_LABELS, getDefaultImageProvider, generateProductPhotoshoot, PHOTOSHOOT_SCENES, type PhotoshootScene } from '@/services/imageService';
import { uploadGeneratedImage } from '@/services/uploadService';
import { getKnowledgeForBrand } from '@/services/knowledgeService';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import type {
  Brand,
  Molecule,
  Indication,
  Insight,
  Template,
  ChatMessage,
  GenerationSession,
} from '@/types';
import { Timestamp } from 'firebase/firestore';

// ── Vista de Setup (selección de plantilla + indicaciones) ──

interface SetupProps {
  brand: Brand;
  molecule: Molecule | null;
  indications: Indication[];
  templates: Template[];
  drafts: GenerationSession[];
  onStart: (templateId: string, indicationIds: string[], campaignName: string, initialPrompt: string, imageStyle: ImageStyle, pageCount?: number) => void;
  onResumeDraft: (sessionId: string) => void;
  onDeleteDraft: (sessionId: string) => void;
  loading: boolean;
}

const SetupView: React.FC<SetupProps> = ({ brand, molecule, indications, templates, drafts, onStart, onResumeDraft, onDeleteDraft, loading }) => {
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [selectedIndications, setSelectedIndications] = useState<string[]>([]);
  const [campaignName, setCampaignName] = useState('');
  const [initialPrompt, setInitialPrompt] = useState('');
  const [pageCount, setPageCount] = useState(2);
  const [imageStyle, setImageStyle] = useState<ImageStyle>('auto');

  const handleToggleIndication = (id: string) => {
    setSelectedIndications((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  return (
    <div className="max-w-2xl mx-auto">
      <nav className="text-xs text-gray-400 mb-4 flex items-center gap-1">
        <Link to="/marcas" className="hover:text-gray-600 transition-colors">Marcas</Link>
        <span>/</span>
        <Link to={`/marcas/${brand.id}`} className="hover:text-gray-600 transition-colors">{brand.name}</Link>
        <span>/</span>
        <span className="text-gray-600 font-medium">Nueva campaña</span>
      </nav>

      {/* Hero mini */}
      <div className="relative overflow-hidden rounded-2xl bg-linear-to-br from-[#0f172a] via-[#1e3a5f] to-[#0c4a6e] p-6 mb-6">
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 80% 30%, rgba(56,189,248,0.4) 0%, transparent 50%)' }} />
        <div className="relative">
          <h1 className="text-lg font-bold text-white mb-1">Nueva campaña</h1>
          <p className="text-xs text-blue-200/80">
            Marca: <span className="font-semibold text-blue-200">{brand.name}</span>
            {molecule && <> · Molécula: <span className="font-semibold text-cyan-300">{molecule.name}</span></>}
          </p>
        </div>
      </div>

      {/* Botón de Ideas IA - Deshabilitado en flujo simplificado */}
      <button
        onClick={() => {}}
        disabled
        className="w-full mb-6 rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50
                   px-5 py-5 text-left opacity-50 cursor-not-allowed"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-linear-to-br from-purple-500 to-blue-500 flex items-center justify-center
                          text-white text-lg group-hover:scale-110 transition-transform">
            💡
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">¿Sin ideas? Deja que la IA proponga</p>
            <p className="text-xs text-gray-500">Analiza tu marca y genera ideas de campaña listas para usar</p>
          </div>
          <svg className="w-5 h-5 text-gray-400 ml-auto group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </button>

      <div className="space-y-5">
        {/* Nombre de la campaña */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">Nombre de la campaña</label>
          <input
            type="text"
            value={campaignName}
            onChange={(e) => setCampaignName(e.target.value)}
            placeholder={`Ej: Lanzamiento ${brand.name} 2026`}
            className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm text-gray-800
                       placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400
                       transition-all bg-white"
          />
        </div>

        {/* Plantilla — selector compacto */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">Tipo de material</label>
          <div className="flex flex-wrap gap-2">
            {templates.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelectedTemplate(t.id)}
                className={`px-3 py-2 rounded-lg text-xs font-medium border transition-all
                  ${selectedTemplate === t.id
                    ? 'border-blue-500 bg-blue-50 text-blue-700 ring-2 ring-blue-200'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'}`}
              >
                {t.name}
                <span className="ml-1 text-[10px] text-gray-400 uppercase">{t.format}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Número de páginas (solo para folletos) */}
        {selectedTemplate === 'folleto-2p' && (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Páginas</label>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5, 6, 8, 10].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setPageCount(n)}
                  className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors ${
                    pageCount === n
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Indicaciones (si hay molécula) — checkboxes compactos */}
        {molecule && indications.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">
              Indicaciones
              <span className="text-gray-400 font-normal ml-1">(selecciona las relevantes)</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {indications.map((ind) => (
                <button
                  key={ind.id}
                  onClick={() => handleToggleIndication(ind.id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all
                    ${selectedIndications.includes(ind.id)
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'}`}
                >
                  {selectedIndications.includes(ind.id) && '✓ '}{ind.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Prompt inicial */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">
            ¿Qué quieres crear?
          </label>
          <textarea
            value={initialPrompt}
            onChange={(e) => setInitialPrompt(e.target.value)}
            placeholder={`Ej: "Genera un folleto profesional sobre ${molecule?.name ?? 'el producto'} enfocado en eficacia clínica, dirigido a médicos especialistas"`}
            rows={3}
            className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm text-gray-800
                       placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400
                       transition-all bg-white resize-none"
          />
          <p className="text-[11px] text-gray-400 mt-1">
            Describe lo que necesitas y la IA generará todo el contenido. Luego puedes ajustar con más prompts.
          </p>
        </div>

        {/* Estilo de imagen */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">Estilo de imágenes</label>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(IMAGE_STYLE_LABELS) as ImageStyle[]).map((key) => {
              const { label, emoji } = IMAGE_STYLE_LABELS[key];
              return (
                <button
                  key={key}
                  onClick={() => setImageStyle(key)}
                  className={`px-3 py-2 rounded-lg text-xs font-medium border transition-all
                    ${imageStyle === key
                      ? 'border-purple-500 bg-purple-50 text-purple-700 ring-2 ring-purple-200'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'}`}
                >
                  {emoji} {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Botón iniciar */}
        <button
          onClick={() => onStart(
            selectedTemplate,
            selectedIndications,
            campaignName.trim() || `${brand.name} – ${new Date().toLocaleDateString('es-ES')}`,
            initialPrompt.trim(),
            imageStyle,
            selectedTemplate === 'folleto-2p' ? pageCount : undefined,
          )}
          disabled={!selectedTemplate || !initialPrompt.trim() || loading}
          className="w-full rounded-xl bg-linear-to-r from-blue-600 to-cyan-600 px-4 py-3.5 text-sm font-semibold text-white
                     hover:from-blue-500 hover:to-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all
                     shadow-lg shadow-blue-600/25"
        >
          {loading ? 'Preparando...' : '✨ Crear campaña'}
        </button>
      </div>

      {/* Borradores existentes */}
      {drafts.length > 0 && (
        <div className="mt-8">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Borradores guardados</h2>
          <div className="space-y-2">
            {drafts.map((draft) => {
              const filledCount = Object.values(draft.slotValues).filter((v) => v?.trim()).length;
              const ago = draft.updatedAt?.seconds
                ? new Date(draft.updatedAt.seconds * 1000).toLocaleString('es-ES', {
                    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                  })
                : '';
              return (
                <div
                  key={draft.id}
                  className="flex items-center justify-between border border-gray-200/80 rounded-xl p-3 bg-white hover:border-blue-300 hover:shadow-sm transition-all"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{draft.campaignName || draft.templateName}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {draft.templateName} · {filledCount} slots
                      {ago && ` · ${ago}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 ml-3">
                    <button
                      onClick={() => onResumeDraft(draft.id)}
                      className="text-xs px-3 py-1.5 rounded-lg bg-blue-50 text-blue-600 font-medium
                                 hover:bg-blue-100 transition-colors"
                    >
                      Continuar
                    </button>
                    <button
                      onClick={() => onDeleteDraft(draft.id)}
                      className="text-xs px-2 py-1.5 rounded-lg text-red-500 hover:bg-red-50 transition-colors"
                      title="Eliminar borrador"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

// ── Vista de Ideas de Campaña (generadas por IA) ────────

interface IdeasViewProps {
  brand: Brand;
  molecule: Molecule | null;
  indications: Indication[];
  insights: Insight[];
  templates: Template[];
  knowledgeContent: string;
  onSelectIdea: (idea: CampaignIdea, templateId: string, indicationIds: string[]) => void;
  onSkip: () => void;
}

const IdeasView: React.FC<IdeasViewProps> = ({ brand, molecule, indications, insights, templates, knowledgeContent, onSelectIdea, onSkip }) => {
  const [ideas, setIdeas] = useState<CampaignIdea[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError('');
        const indicationNames = indications.map(i => i.name);
        const claims = brand.params.claims?.map(c => c.text);
        const result = await generateCampaignIdeas(
          brand, insights, molecule?.name ?? null, indicationNames, claims, knowledgeContent
        );
        if (!cancelled) setIdeas(result);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Error generando ideas');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [brand, molecule, indications, insights, knowledgeContent]);

  const handleIdeaClick = (idea: CampaignIdea) => {
    const templateId = selectedTemplate || idea.templateSuggestion || templates[0]?.id || '';
    const indicationIds = indications.map(i => i.id); // Auto-seleccionar todas
    onSelectIdea(idea, templateId, indicationIds);
  };

  return (
    <div className="max-w-4xl mx-auto">
      <nav className="text-xs text-gray-400 mb-4 flex items-center gap-1">
        <Link to="/marcas" className="hover:text-gray-600 transition-colors">Marcas</Link>
        <span>/</span>
        <Link to={`/marcas/${brand.id}`} className="hover:text-gray-600 transition-colors">{brand.name}</Link>
        <span>/</span>
        <span className="text-gray-600 font-medium">Nueva campaña</span>
      </nav>

      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl bg-linear-to-br from-[#0f172a] via-[#1e3a5f] to-[#312e81] p-6 mb-6">
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 70% 40%, rgba(168,85,247,0.4) 0%, transparent 50%)' }} />
        <div className="relative flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-white">💡 Paso 2: Elige tu idea de campaña</h1>
            <p className="text-xs text-purple-200/80 mt-1">
              La IA analizó tu marca y generó propuestas. Elige una o crea la tuya.
            </p>
          </div>
        </div>
      </div>

      {/* Selector de tipo de material */}
      <div className="mb-6">
        <label className="block text-sm font-semibold text-gray-700 mb-3">¿Qué tipo de material quieres crear?</label>
        <div className="flex flex-wrap gap-3">
          {templates.map((t) => (
            <button
              key={t.id}
              onClick={() => setSelectedTemplate(t.id)}
              className={`px-4 py-3 rounded-xl text-sm font-medium border transition-all
                ${selectedTemplate === t.id
                  ? 'border-blue-500 bg-blue-50 text-blue-700 ring-2 ring-blue-200'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:shadow-sm'}`}
            >
              <div className="flex items-center gap-2">
                <span className="text-base">
                  {t.id === 'folleto-2p' ? '📄' : t.id === 'email-promo' ? '📧' : t.id === 'slide-deck' ? '📊' : '🖼️'}
                </span>
                <span>{t.name}</span>
              </div>
              <span className="block text-xs text-gray-400 mt-1">{t.format}</span>
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-500 mt-2">
          {selectedTemplate ? '✅ Tipo seleccionado' : '💡 Selecciona el tipo de material (opcional - las ideas incluyen sugerencias)'}
        </p>
      </div>

      {loading && (
        <div className="text-center py-16">
          <div className="w-14 h-14 border-3 border-purple-200 border-t-purple-600 rounded-full animate-spin mx-auto mb-5" />
          <p className="text-sm font-semibold text-gray-700">Analizando tu marca y generando ideas...</p>
          <p className="text-xs text-gray-400 mt-1">{brand.name} · {molecule?.name ?? 'Sin molécula'}</p>
        </div>
      )}

      {error && (
        <div className="text-center py-16">
          <p className="text-sm text-red-500 mb-2">{error}</p>
          <button
            onClick={onSkip}
            className="text-xs text-blue-600 hover:underline"
          >
            Continuar sin ideas →
          </button>
        </div>
      )}

      {!loading && !error && (
        <div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {ideas.map((idea, idx) => {
              const tpl = templates.find(t => t.id === (selectedTemplate || idea.templateSuggestion));
              return (
                <button
                  key={idx}
                  onClick={() => handleIdeaClick(idea)}
                  className="text-left border border-gray-100 rounded-2xl p-5 bg-white hover:shadow-lg
                             hover:-translate-y-1 transition-all duration-300 group"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-linear-to-br from-purple-500 to-blue-500
                                    flex items-center justify-center text-lg shrink-0 group-hover:scale-110 transition-transform shadow-md shadow-purple-500/20">
                      {['🚀', '💎', '🎯', '⚡', '🌟', '🔬'][idx % 6]}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-bold text-gray-900 line-clamp-1 mb-1">{idea.title}</h3>
                      <p className="text-xs text-gray-500 line-clamp-2 mb-3">{idea.description}</p>
                      <div className="flex items-center gap-2">
                        {tpl && (
                          <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium">
                            {tpl.name}
                          </span>
                        )}
                        <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                          {idea.style}
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Opción para idea personalizada */}
          <div className="mt-6 pt-6 border-t border-gray-200">
            <button
              onClick={() => handleIdeaClick({
                title: 'Idea personalizada',
                description: 'Describe tu propia idea de campaña',
                suggestedPrompt: 'Crear material promocional personalizado',
                templateSuggestion: selectedTemplate || templates[0]?.id || '',
                style: 'moderno'
              })}
              className="w-full text-left border-2 border-dashed border-gray-300 rounded-2xl p-5 bg-gray-50 hover:bg-gray-100
                         hover:border-gray-400 transition-all group"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gray-200 flex items-center justify-center text-lg group-hover:bg-gray-300 transition-colors">
                  ✏️
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-700">Crear mi propia idea</p>
                  <p className="text-xs text-gray-500">Describe exactamente lo que necesitas</p>
                </div>
              </div>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Vista de Chat ───────────────────────────────────────

interface ChatViewProps {
  session: GenerationSession;
  template: Template;
  brand: Brand;
  insights: Insight[];
  molecule: Molecule | null;
  knowledgeContent?: string;
  initialPrompt?: string;
  imageStyle?: ImageStyle;
}

const ChatView: React.FC<ChatViewProps> = ({ session, template: baseTemplate, brand, insights, molecule, knowledgeContent, initialPrompt, imageStyle = 'auto' }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<ChatMessage[]>(session.messages);
  const [slotValues, setSlotValues] = useState<Record<string, string>>(session.slotValues);

  // Expand template slots based on page count
  const template = useMemo(() => {
    const pc = parseInt(slotValues['__page_count'] || '0') || 0;
    return pc > 0 ? expandTemplateForPages(baseTemplate, pc) : baseTemplate;
  }, [baseTemplate, slotValues['__page_count']]);
  const [inputValue, setInputValue] = useState('');
  const [sending, setSending] = useState(false);
  const [generatingImages, setGeneratingImages] = useState<Set<string>>(new Set());
  const [aiProvider, setAiProvider] = useState<AIProvider>(() => {
    const providers = getAvailableProviders();
    return providers.includes('deepseek') ? 'deepseek' : 'gemini';
  });
  const [lastUsedProvider, setLastUsedProvider] = useState<AIProvider | null>(null);
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [compliance, setCompliance] = useState<ComplianceResult | null>(null);
  const [checkingCompliance, setCheckingCompliance] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [abVariants, setAbVariants] = useState<ABVariant[] | null>(null);
  const [generatingAB, setGeneratingAB] = useState(false);
  const [showPhotoshoot, setShowPhotoshoot] = useState(false);
  const [photoshootScene, setPhotoshootScene] = useState<PhotoshootScene>('hero');
  const [generatingPhotoshoot, setGeneratingPhotoshoot] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Voice input
  const { isListening, interimTranscript, isSupported: voiceSupported, toggleListening } = useSpeechRecognition({
    lang: 'es-ES',
    onResult: (transcript) => {
      setInputValue(prev => {
        const separator = prev.trim() ? ' ' : '';
        return prev + separator + transcript;
      });
    },
  });

  // Auto-scroll al fondo del chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-focus del input
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Auto-enviar el prompt inicial al montar.
  // Estrategia 1: handleStart pre-carga el userMsg en session.messages → messages = [userMsg]
  // Estrategia 2 (fallback): initialPrompt llega como prop y messages está vacío
  const initialPromptSent = useRef(false);

  const triggerInitialAI = useCallback((userMsg: ChatMessage) => {
    console.log('[InitialPrompt] Triggering AI for:', userMsg.content.substring(0, 80));
    setSending(true);
    callGenerateContent(
      brand, template, insights,
      session.indicationNames,
      molecule?.name ?? null,
      [userMsg],
      Object.keys(slotValues).length > 0 ? slotValues : null,
      aiProvider,
      knowledgeContent,
    ).then((response) => {
      console.log('[InitialPrompt] AI responded, provider:', response.provider);
      setLastUsedProvider(response.provider);
      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: response.message,
        timestamp: Timestamp.now(),
        slotValues: response.slotValues ?? undefined,
      };
      setMessages((prev) => [...prev, assistantMsg]);
      addMessageToSession(session.id, assistantMsg).catch(() => {});
      if (response.slotValues) {
        setSlotValues((prev) => {
          const newSlots = { ...prev, ...response.slotValues! };
          updateSessionSlots(session.id, newSlots).catch(() => {});
          runComplianceCheck(newSlots);
          return newSlots;
        });
        triggerImagesAfterFirstPrompt();
      }
    }).catch((err) => {
      console.error('[InitialPrompt] Error:', err);
      const errMsg = err instanceof Error ? err.message : 'Error desconocido';
      toast(`Error al generar: ${errMsg}`, 'error');
    }).finally(() => {
      setSending(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brand, template, insights, session.id, session.indicationNames, molecule, aiProvider, knowledgeContent]);

  useEffect(() => {
    if (initialPromptSent.current) return;

    // Estrategia 1: session ya tiene un userMsg pre-cargado (handleStart lo añadió)
    if (messages.length === 1 && messages[0].role === 'user' && !messages.some(m => m.role === 'assistant')) {
      console.log('[InitialPrompt] Strategy 1: pre-loaded user message detected');
      initialPromptSent.current = true;
      triggerInitialAI(messages[0]);
      return;
    }

    // Estrategia 2 (fallback): initialPrompt llega como prop
    if (initialPrompt && messages.length === 0) {
      console.log('[InitialPrompt] Strategy 2: using initialPrompt prop');
      initialPromptSent.current = true;
      const userMsg: ChatMessage = {
        role: 'user',
        content: initialPrompt,
        timestamp: Timestamp.now(),
      };
      setMessages([userMsg]);
      setInputValue('');
      addMessageToSession(session.id, userMsg).catch(() => {});
      triggerInitialAI(userMsg);
      return;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-generar imágenes DESPUÉS del primer prompt (no al montar)
  const imagesTriggeredAfterPrompt = useRef(false);

  const triggerImagesAfterFirstPrompt = useCallback(async () => {
    if (imagesTriggeredAfterPrompt.current) return;
    imagesTriggeredAfterPrompt.current = true;

    const isImageFilled = (v?: string) => v?.startsWith('data:image') || v?.startsWith('https://');
    const emptyImageSlots = template.slots.filter(
      (s) => s.type === 'image' && !isImageFilled(slotValues[s.id]),
    );

    if (emptyImageSlots.length > 0) {
      // Generate all images in parallel for faster results
      await Promise.allSettled(
        emptyImageSlots.map(slot => autoGenerateImage(slot.id))
      );
    }
  }, [template, slotValues]);

  // Run compliance validation on generated text slots
  const runComplianceCheck = useCallback(async (currentSlots: Record<string, string>) => {
    const claims = brand.params.claims?.map(c => c.text) ?? [];
    // Combine all text slot values into one string for validation
    const textSlots = template.slots.filter(s => s.type !== 'image');
    const generatedText = textSlots
      .map(s => currentSlots[s.id])
      .filter(Boolean)
      .join('\n\n');

    if (!generatedText.trim() || generatedText.length < 20) return;

    try {
      setCheckingCompliance(true);
      const result = await validateCompliance(generatedText, claims, brand.name);
      setCompliance(result);
    } catch (err) {
      console.warn('Compliance check failed:', err);
    } finally {
      setCheckingCompliance(false);
    }
  }, [brand, template]);

  const handleSend = async () => {
    const text = inputValue.trim();
    if (!text || sending || !user) return;

    const userMsg: ChatMessage = {
      role: 'user',
      content: text,
      timestamp: Timestamp.now(),
    };

    // Optimistic update
    setMessages((prev) => [...prev, userMsg]);
    setInputValue('');
    setSending(true);

    try {
      // Guardar mensaje del usuario (fire-and-forget, no bloquea)
      addMessageToSession(session.id, userMsg).catch(() => {});

      // Llamar a la IA
      const allMessages = [...messages, userMsg];
      const response = await callGenerateContent(
        brand,
        template,
        insights,
        session.indicationNames,
        molecule?.name ?? null,
        allMessages,
        Object.keys(slotValues).length > 0 ? slotValues : null,
        aiProvider,
        knowledgeContent,
      );

      setLastUsedProvider(response.provider);

      // Crear mensaje de respuesta
      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: response.message,
        timestamp: Timestamp.now(),
        slotValues: response.slotValues ?? undefined,
      };

      setMessages((prev) => [...prev, assistantMsg]);
      // Fire-and-forget
      addMessageToSession(session.id, assistantMsg).catch(() => {});

      // Actualizar slot values si la IA generó contenido
      if (response.slotValues) {
        setSlotValues((prev) => {
          const newSlots = { ...prev, ...response.slotValues! };
          updateSessionSlots(session.id, newSlots).catch((e) => {
            console.error('Error guardando slots:', e);
            toast('Error al guardar contenido. Intenta de nuevo.', 'error');
          });
          return newSlots;
        });

        // Después del primer prompt que genera contenido, lanzar la generación de imágenes
        triggerImagesAfterFirstPrompt();

        // Validar compliance con los claims aprobados
        const updatedSlots = { ...slotValues, ...response.slotValues! };
        runComplianceCheck(updatedSlots);
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Error desconocido';
      toast(`Error: ${errMsg}`, 'error');
      // Remover mensaje optimista del usuario en caso de error
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSlotEdit = (slotId: string, value: string) => {
    setSlotValues((prev) => {
      const newSlots = { ...prev, [slotId]: value };
      updateSessionSlots(session.id, newSlots).catch((e) => {
        console.error('Error guardando slots:', e);
        toast('Error al guardar. Intenta de nuevo.', 'error');
      });
      return newSlots;
    });
    // Trigger auto-save indicator
    triggerAutoSave();
  };

  // Auto-save: guardar status como 'saved' con debounce
  const triggerAutoSave = () => {
    setAutoSaveStatus('saving');
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(async () => {
      try {
        await saveSession(session.id);
        setAutoSaveStatus('saved');
        // Volver a idle después de 3s
        setTimeout(() => setAutoSaveStatus('idle'), 3000);
      } catch {
        setAutoSaveStatus('idle');
      }
    }, 2000);
  };

  // Auto-save al desmontar el componente
  useEffect(() => {
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
      // Guardar al salir si hay slots con contenido
      const hasContent = Object.values(slotValues).some((v) => v?.trim());
      if (hasContent) {
        saveSession(session.id).catch(() => {});
      }
    };
  }, [session.id, slotValues]);

  // Proteger contra cierre de pestaña
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (generatingImages.size > 0 || sending) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [generatingImages, sending]);

  const autoGenerateImage = async (slotId: string, retryCount = 0) => {
    const slot = template.slots.find((s) => s.id === slotId);
    if (!slot) return;

    // Hero/principal images get an enhanced prompt for full-bleed cover use
    const isHeroImage = slot.id.includes('hero') || slot.id === 'imagen_fondo' || slot.id === 'imagen_portada';
    const basePrompt = slot.imagePromptHint || `Professional pharmaceutical image for ${brand.name}`;
    const prompt = isHeroImage
      ? `${basePrompt}. Create a STUNNING full-bleed photographic composition perfect for a magazine cover or marketing hero section. Wide landscape orientation. Ultra-premium quality, dramatic lighting, rich depth of field. The image should work as a full-page background with text overlay.`
      : basePrompt;

    // Build rich brand context for image generation
    const brandCtx: ImageBrandContext = {
      brandName: brand.name,
      colorPrimary: brand.params.colorPrimary,
      colorSecondary: brand.params.colorSecondary,
      moleculeName: molecule?.name ?? session.moleculeName,
      indicationNames: session.indicationNames,
      claims: brand.params.claims?.map(c => c.text),
      knowledgeSummary: knowledgeContent
        ? knowledgeContent.substring(0, 500) // Limit to avoid huge prompts
        : undefined,
    };

    setGeneratingImages((prev) => new Set(prev).add(slotId));
    try {
      const dataUrl = await generateImage(prompt, brandCtx, getDefaultImageProvider(), imageStyle);
      // Subir a Storage para no guardar base64 gigante en Firestore
      const storageUrl = await uploadGeneratedImage(session.id, slotId, dataUrl);
      handleSlotEdit(slotId, storageUrl);
    } catch (err) {
      console.warn(`Error generando imagen para ${slotId} (intento ${retryCount + 1}):`, err);
      // Reintentar hasta 3 veces antes de mostrar error
      if (retryCount < 2) {
        setGeneratingImages((prev) => { const n = new Set(prev); n.delete(slotId); return n; });
        await new Promise((r) => setTimeout(r, 1500 * (retryCount + 1))); // espera incremental
        return autoGenerateImage(slotId, retryCount + 1);
      }
      toast(`Error generando imagen "${slot.name}". Usa el botón para reintentar.`, 'error');
    } finally {
      setGeneratingImages((prev) => {
        const next = new Set(prev);
        next.delete(slotId);
        return next;
      });
    }
  };

  const handleSave = () => {
    navigate(`/publicaciones/${session.id}`);
  };

  const handleTranslate = async (lang: 'en' | 'pt') => {
    try {
      setTranslating(true);
      const newId = await translateSession(session.id, lang);
      const label = lang === 'en' ? 'inglés' : 'portugués';
      toast(`Traducido a ${label} — abriendo nueva sesión`);
      navigate(`/marcas/${brand.id}/generar?session=${newId}`);
    } catch {
      toast('Error al traducir', 'error');
    } finally {
      setTranslating(false);
    }
  };

  const handleGenerateAB = async () => {
    try {
      setGeneratingAB(true);
      const variants = await generateABVariants(
        brand, template, insights, session.indicationNames, molecule?.name ?? null, slotValues
      );
      setAbVariants(variants);
    } catch {
      toast('Error al generar variantes', 'error');
    } finally {
      setGeneratingAB(false);
    }
  };

  const handleSelectVariant = async (variant: ABVariant) => {
    const merged = { ...slotValues, ...variant.slotValues };
    setSlotValues(merged);
    setAbVariants(null);
    try {
      await updateSessionSlots(session.id, merged);
      toast(`Variante "${variant.label}" aplicada`);
      runComplianceCheck(merged);
    } catch {
      toast('Error al aplicar variante', 'error');
    }
  };

  const handlePhotoshoot = async () => {
    try {
      setGeneratingPhotoshoot(true);
      const brandCtx: ImageBrandContext = {
        brandName: brand.name,
        colorPrimary: brand.params.colorPrimary,
        colorSecondary: brand.params.colorSecondary,
        moleculeName: molecule?.name,
        indicationNames: session.indicationNames,
      };
      const dataUrl = await generateProductPhotoshoot(
        brand.name,
        photoshootScene,
        brandCtx,
      );
      // Guardar como imagen en el primer slot de imagen disponible
      const imageSlot = template.slots.find(
        s => s.type === 'image' && !slotValues[s.id]?.trim()
      ) ?? template.slots.find(s => s.type === 'image');

      if (imageSlot) {
        const url = await uploadGeneratedImage(dataUrl, session.id, imageSlot.id);
        const newSlots = { ...slotValues, [imageSlot.id]: url };
        setSlotValues(newSlots);
        await updateSessionSlots(session.id, newSlots);
        toast('📸 Photoshoot generado y aplicado');
      } else {
        toast('No hay slots de imagen disponibles. Descarga la imagen manualmente.', 'error');
      }
      setShowPhotoshoot(false);
    } catch {
      toast('Error al generar photoshoot', 'error');
    } finally {
      setGeneratingPhotoshoot(false);
    }
  };

  const filledSlotsCount = template.slots.filter((s) => slotValues[s.id]?.trim()).length;

  return (
    <div className="flex h-[calc(100vh-5rem)] -m-6 lg:-m-8">
      {/* ── Chat (full width) ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-gray-100 bg-white shrink-0 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-linear-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-md shadow-blue-500/20">
                <svg className="w-4.5 h-4.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
              </div>
              <div>
                <h2 className="text-sm font-bold text-gray-900">{session.campaignName || `Chat AI – ${brand.name}`}</h2>
                <p className="text-[11px] text-gray-400 flex items-center gap-1.5">
                  <span className="inline-flex items-center gap-1 bg-gray-100 rounded-full px-2 py-0.5 text-gray-500 font-medium">{brand.name}</span>
                  <span>·</span>
                  <span>{template.name}</span>
                  <span>·</span>
                  <span className="text-purple-500 font-medium">🖼 {getDefaultImageProvider() === 'dalle3' ? 'DALL-E 3' : 'Gemini'}</span>
                  {generatingImages.size > 0 && (
                    <span className="ml-1 text-purple-500 animate-pulse">
                      · Generando {generatingImages.size} imagen{generatingImages.size > 1 ? 'es' : ''}...
                    </span>
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Selector de proveedor IA */}
              <div className="flex items-center gap-1.5 bg-gray-50 rounded-lg px-2 py-1 border border-gray-200">
                <span className="text-[10px] text-gray-400 hidden sm:inline">IA:</span>
                <select
                  value={aiProvider}
                  onChange={(e) => setAiProvider(e.target.value as AIProvider)}
                  className="text-xs bg-transparent border-none focus:outline-none text-gray-700 cursor-pointer"
                >
                  {isProviderAvailable('gemini') && (
                    <option value="gemini">Gemini 2.5 Flash</option>
                  )}
                  {isProviderAvailable('deepseek') && (
                    <option value="deepseek">DeepSeek V3</option>
                  )}
                </select>
              </div>
              {/* Compliance badge */}
              {checkingCompliance && (
                <span className="flex items-center gap-1 text-xs text-purple-500 animate-pulse">
                  <div className="w-2.5 h-2.5 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
                  Verificando...
                </span>
              )}
              {compliance && !checkingCompliance && (
                <span
                  className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-lg cursor-default ${
                    compliance.score >= 90
                      ? 'bg-green-50 text-green-700'
                      : compliance.score >= 70
                        ? 'bg-amber-50 text-amber-700'
                        : 'bg-red-50 text-red-700'
                  }`}
                  title={compliance.checks
                    .filter(c => c.status !== 'compliant')
                    .map(c => `${c.status === 'warning' ? '⚠️' : '❌'} ${c.text}: ${c.reason}`)
                    .join('\n') || 'Todo el contenido es conforme'}
                >
                  {compliance.score >= 90 ? '✅' : compliance.score >= 70 ? '⚠️' : '❌'}
                  {' '}{compliance.score}% compliant
                </span>
              )}
              {/* Auto-save indicator */}
              {autoSaveStatus === 'saving' && (
                <span className="flex items-center gap-1 text-xs text-amber-600 animate-pulse">
                  <div className="w-2.5 h-2.5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                  Guardando...
                </span>
              )}
              {autoSaveStatus === 'saved' && (
                <span className="flex items-center gap-1 text-xs text-green-600">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Guardado
                </span>
              )}
              <Link
                to={`/publicaciones/${session.id}`}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600
                           hover:bg-gray-50 transition-colors flex items-center gap-1"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                Vista previa
              </Link>
              <button
                onClick={handleSave}
                disabled={filledSlotsCount === 0}
                className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white
                           hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed
                           transition-colors flex items-center gap-1 shadow-sm shadow-green-600/20"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M5 13l4 4L19 7" />
                </svg>
                Ver publicación
              </button>
              {/* Traducción */}
              {filledSlotsCount > 0 && (
                <div className="relative group/translate">
                  <button
                    disabled={translating}
                    className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600
                               hover:bg-gray-50 transition-colors flex items-center gap-1 disabled:opacity-50"
                  >
                    {translating ? (
                      <>
                        <div className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                        Traduciendo...
                      </>
                    ) : (
                      <>🌐 Traducir</>
                    )}
                  </button>
                  {!translating && (
                    <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg
                                    opacity-0 invisible group-hover/translate:opacity-100 group-hover/translate:visible
                                    transition-all z-20 min-w-[140px]">
                      <button
                        onClick={() => handleTranslate('en')}
                        className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 rounded-t-lg"
                      >
                        🇬🇧 Inglés
                      </button>
                      <button
                        onClick={() => handleTranslate('pt')}
                        className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 rounded-b-lg"
                      >
                        🇧🇷 Portugués
                      </button>
                    </div>
                  )}
                </div>
              )}
              {/* Variantes A/B */}
              {filledSlotsCount > 0 && (
                <button
                  onClick={handleGenerateAB}
                  disabled={generatingAB}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600
                             hover:bg-gray-50 transition-colors flex items-center gap-1 disabled:opacity-50"
                >
                  {generatingAB ? (
                    <>
                      <div className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                      Generando...
                    </>
                  ) : (
                    <>🔀 Variantes A/B</>
                  )}
                </button>
              )}
              {/* Photoshoot */}
              <button
                onClick={() => setShowPhotoshoot(!showPhotoshoot)}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600
                           hover:bg-gray-50 transition-colors flex items-center gap-1"
              >
                📸 Photoshoot
              </button>
            </div>
          </div>
        </div>

        {/* A/B Variants Panel */}
        {abVariants && (
          <div className="px-4 py-3 border-b border-purple-200 bg-purple-50/50 shrink-0">
            <div className="max-w-3xl mx-auto">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-purple-800">🔀 Elige una variante</h3>
                <button
                  onClick={() => setAbVariants(null)}
                  className="text-xs text-purple-500 hover:text-purple-700"
                >
                  Cerrar
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {abVariants.map((v) => {
                  const previewSlots = Object.entries(v.slotValues)
                    .filter(([, val]) => val?.trim())
                    .slice(0, 3);
                  return (
                    <button
                      key={v.label}
                      onClick={() => handleSelectVariant(v)}
                      className="text-left border border-purple-200 rounded-xl p-3 bg-white hover:border-purple-400
                                 hover:shadow-md transition-all group"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span className="w-7 h-7 rounded-lg bg-purple-100 text-purple-700 text-xs font-bold
                                         flex items-center justify-center group-hover:bg-purple-200 transition-colors">
                          {v.label}
                        </span>
                        <span className="text-xs font-medium text-purple-700">{v.tone}</span>
                      </div>
                      <div className="space-y-1">
                        {previewSlots.map(([key, val]) => (
                          <p key={key} className="text-[11px] text-gray-600 line-clamp-2">
                            <span className="font-medium text-gray-500">{key}:</span> {val}
                          </p>
                        ))}
                      </div>
                      <p className="text-[10px] text-purple-500 mt-2 font-medium group-hover:text-purple-700">
                        Aplicar variante →
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Photoshoot Panel */}
        {showPhotoshoot && (
          <div className="px-4 py-3 border-b border-green-200 bg-green-50/50 shrink-0">
            <div className="max-w-3xl mx-auto">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-green-800">📸 Product Photoshoot — {brand.name}</h3>
                <button
                  onClick={() => setShowPhotoshoot(false)}
                  className="text-xs text-green-500 hover:text-green-700"
                >
                  Cerrar
                </button>
              </div>
              <p className="text-xs text-green-700 mb-3">
                Genera una imagen de producto profesional en diferentes escenarios. Se aplicará al primer slot de imagen disponible.
              </p>
              <div className="flex flex-wrap gap-2 mb-3">
                {PHOTOSHOOT_SCENES.map((scene) => (
                  <button
                    key={scene.id}
                    onClick={() => setPhotoshootScene(scene.id)}
                    className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                      photoshootScene === scene.id
                        ? 'bg-green-600 text-white shadow-sm'
                        : 'bg-white border border-green-200 text-green-700 hover:border-green-400'
                    }`}
                  >
                    <span>{scene.emoji}</span>
                    {scene.label}
                  </button>
                ))}
              </div>
              <button
                onClick={handlePhotoshoot}
                disabled={generatingPhotoshoot}
                className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white
                           hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {generatingPhotoshoot ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Generando photoshoot...
                  </>
                ) : (
                  <>📸 Generar imagen</>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 max-w-3xl mx-auto w-full" style={{ backgroundImage: 'radial-gradient(circle at 50% 0%, rgba(219,234,254,0.3) 0%, transparent 60%)' }}>
          {messages.length === 0 && !sending && (
            <div className="text-center py-16">
              <div className="w-16 h-16 bg-linear-to-br from-blue-500 to-cyan-500 rounded-3xl flex items-center justify-center mx-auto mb-5 shadow-lg shadow-blue-500/25">
                <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
              </div>
              <h3 className="text-base font-bold text-gray-900 mb-2">¿Qué quieres crear?</h3>
              <p className="text-sm text-gray-400 max-w-sm mx-auto leading-relaxed">
                Describe lo que necesitas y la IA se encargará del resto.
              </p>
            </div>
          )}

          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                  msg.role === 'user'
                    ? 'bg-linear-to-br from-blue-600 to-blue-700 text-white shadow-md shadow-blue-500/20'
                    : 'bg-white border border-gray-100 text-gray-800 shadow-sm'
                }`}
              >
                <p className="text-sm whitespace-pre-wrap">{formatMessageContent(msg.content)}</p>
                {msg.slotValues && (
                  <p className="text-xs mt-2 opacity-70">
                    ✓ {Object.keys(msg.slotValues).length} slots actualizados
                  </p>
                )}
              </div>
            </div>
          ))}

          {sending && (
            <div className="flex justify-start">
              <div className="bg-white border border-gray-100 rounded-2xl px-5 py-4 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  <span className="text-xs text-gray-500 font-medium">
                    PharmaDesign AI está pensando...
                  </span>
                </div>
              </div>
            </div>
          )}

          {lastUsedProvider && !sending && messages.length > 0 && (
            <div className="text-center">
              <span className="text-[10px] text-gray-300">
                Última respuesta vía {lastUsedProvider === 'deepseek' ? 'DeepSeek V3' : 'Gemini 2.5 Flash'}
              </span>
            </div>
          )}

          {/* Compliance details */}
          {compliance && !checkingCompliance && compliance.checks.some(c => c.status !== 'compliant') && (
            <div className={`rounded-lg border p-3 text-xs space-y-1.5 ${
              compliance.score >= 70
                ? 'bg-amber-50/50 border-amber-200'
                : 'bg-red-50/50 border-red-200'
            }`}>
              <p className="font-semibold text-gray-700 mb-2">
                Verificación de Compliance — {compliance.score}%
              </p>
              {compliance.checks
                .filter(c => c.status !== 'compliant')
                .map((check, idx) => (
                  <div key={idx} className="flex items-start gap-2">
                    <span className="shrink-0 mt-0.5">
                      {check.status === 'warning' ? '⚠️' : '❌'}
                    </span>
                    <div>
                      <span className="text-gray-700">"{check.text}"</span>
                      <span className="text-gray-500 ml-1">— {check.reason}</span>
                      {check.suggestion && (
                        <p className="text-blue-600 mt-0.5">💡 {check.suggestion}</p>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="px-4 py-3 border-t border-gray-100 bg-white shrink-0 shadow-[0_-2px_10px_rgba(0,0,0,0.03)]">
          <div className="flex items-end gap-2 max-w-3xl mx-auto">
            <div className="flex-1 relative">
              <textarea
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={messages.length === 0
                  ? "Escribe tu prompt para generar contenido... (Enter para enviar)"
                  : "Escribe tu instrucción... (Enter para enviar, Shift+Enter para nueva línea)"}
                rows={2}
                className="w-full rounded-xl border border-gray-200 px-4 py-3 pr-10 text-sm resize-none
                           focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400
                           placeholder-gray-300 transition-all bg-gray-50/50"
                disabled={sending}
              />
              {/* Interim transcript indicator */}
              {isListening && interimTranscript && (
                <div className="absolute left-4 bottom-1.5 text-[10px] text-purple-500 italic truncate max-w-[80%]">
                  {interimTranscript}…
                </div>
              )}
            </div>
            {/* Mic button */}
            {voiceSupported && (
              <button
                onClick={toggleListening}
                type="button"
                className={`shrink-0 rounded-xl p-2.5 transition-all ${
                  isListening
                    ? 'bg-red-500 text-white hover:bg-red-600 animate-pulse shadow-lg shadow-red-500/20'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
                title={isListening ? 'Detener dictado' : 'Dictar con voz'}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  {isListening ? (
                    <>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 1a3 3 0 00-3 3v4a3 3 0 006 0V4a3 3 0 00-3-3z" />
                    </>
                  ) : (
                    <>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 1a3 3 0 00-3 3v4a3 3 0 006 0V4a3 3 0 00-3-3z" />
                    </>
                  )}
                </svg>
              </button>
            )}
            <button
              onClick={handleSend}
              disabled={!inputValue.trim() || sending}
              className="shrink-0 rounded-xl bg-linear-to-br from-blue-600 to-cyan-600 p-2.5 text-white
                         hover:from-blue-500 hover:to-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed
                         transition-all shadow-md shadow-blue-500/20"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Helpers ─────────────────────────────────────────────

/** Quita el bloque JSON del mensaje para mostrar solo la parte conversacional */
function formatMessageContent(content: string): string {
  return content.replace(/```json[\s\S]*?```/g, '').trim();
}

// ── Página principal ────────────────────────────────────

const GeneratePage: React.FC = () => {
  const { brandId } = useParams<{ brandId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const sessionIdParam = searchParams.get('session');
  const { user } = useAuth();
  const tenantId = useTenant();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);

  // Flow step: 'ideas' → 'chat' (simplified 3-step flow)
  const [step, setStep] = useState<'ideas' | 'chat'>('ideas');

  // Data
  const [brand, setBrand] = useState<Brand | null>(null);
  const [molecule, setMolecule] = useState<Molecule | null>(null);
  const [indications, setIndications] = useState<Indication[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [drafts, setDrafts] = useState<GenerationSession[]>([]);

  // Session / Chat
  const [session, setSession] = useState<GenerationSession | null>(null);
  const [activeTemplate, setActiveTemplate] = useState<Template | null>(null);
  const [sessionInsights, setSessionInsights] = useState<Insight[]>([]);
  const [knowledgeContent, setKnowledgeContent] = useState<string>('');
  const [initialPromptFromUrl, setInitialPromptFromUrl] = useState<string | undefined>(undefined);

  // Load initial data
  const loadData = useCallback(async () => {
    if (!brandId) return;
    try {
      setLoading(true);

      // Seed templates (idempotent)
      await seedTemplates(tenantId);

      const [brandData, templateList] = await Promise.all([
        getBrand(brandId),
        getTemplates(),
      ]);

      setBrand(brandData);
      setTemplates(templateList);
      // Cargar fuentes de Google de la marca
      if (brandData) loadGoogleFonts([brandData.params.fontTitle, brandData.params.fontBody]);

      // Si la marca tiene molécula, cargar indicaciones
      if (brandData?.moleculeId) {
        const [mol, inds] = await Promise.all([
          getMolecule(brandData.moleculeId),
          getIndications(brandData.moleculeId),
        ]);
        setMolecule(mol);
        setIndications(inds);
      }

      // Si hay sessionId en URL, cargar sesión existente
      if (sessionIdParam) {
        const existingSession = await getSession(sessionIdParam);
        if (existingSession) {
          const fallbackTemplate = templateList.find((t) => t.id === 'folleto-2p') ?? templateList[0] ?? null;
          const tpl = templateList.find((t) => t.id === existingSession.templateId) ?? fallbackTemplate;

          if (!tpl) {
            toast('No se encontró ninguna plantilla disponible para abrir la sesión.', 'error');
            return;
          }

          if (tpl.id !== existingSession.templateId) {
            toast('La plantilla original no estaba disponible. Se abrió una plantilla compatible.', 'info');
          }

          setActiveTemplate(tpl);
          // Cargar insights de las indicaciones de la sesión
          const [allInsights, kContent] = await Promise.all([
            loadInsightsForIndications(existingSession.indicationIds),
            loadKnowledgeContent(tenantId, brandData!.id),
          ]);
          setSessionInsights(allInsights);
          setKnowledgeContent(kContent);
          setStep('chat');
          setSession(existingSession);
          // Si viene prompt por URL, consumirlo solo cuando la sesión aún no tiene mensajes.
          const promptParam = searchParams.get('prompt');
          if (promptParam && existingSession.messages.length === 0) {
            setInitialPromptFromUrl(promptParam);
          } else {
            setInitialPromptFromUrl(undefined);
          }
          if (promptParam) {
            setSearchParams({ session: existingSession.id }, { replace: true });
          }
        }
      } else if (brandData) {
        // Cargar borradores existentes para esta marca
        const brandDrafts = await getDraftSessionsByBrand(brandData.id);
        setDrafts(brandDrafts);
      }
    } catch {
      toast('Error al cargar datos', 'error');
    } finally {
      setLoading(false);
    }
  }, [brandId, tenantId, sessionIdParam]);

  // Auto-load insights and knowledge for ideas step
  useEffect(() => {
    if (!brand || !indications.length || sessionIdParam || step !== 'ideas') return;

    const loadIdeasData = async () => {
      try {
        setStarting(true);
        const [allInsights, kContent] = await Promise.all([
          loadInsightsForIndications(indications.map(i => i.id)),
          loadKnowledgeContent(tenantId, brand.id),
        ]);
        setSessionInsights(allInsights);
        setKnowledgeContent(kContent);
      } catch {
        toast('Error cargando datos para ideas', 'error');
      } finally {
        setStarting(false);
      }
    };

    loadIdeasData();
  }, [brand, indications, tenantId, sessionIdParam, step]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Iniciar sesión de generación
  const handleStart = async (templateId: string, indicationIds: string[], campaignName: string, initialPrompt: string, imageStyle: ImageStyle, pageCount?: number) => {
    if (!brand || !user) return;
    try {
      setStarting(true);

      const tpl = templates.find((t) => t.id === templateId);
      if (!tpl) {
        toast('Plantilla no encontrada', 'error');
        return;
      }

      // Cargar insights aprobados de las indicaciones seleccionadas
      const [allInsights, kContent] = await Promise.all([
        loadInsightsForIndications(indicationIds),
        loadKnowledgeContent(tenantId, brand.id),
      ]);

      // Nombres de indicaciones
      const indNames = indicationIds
        .map((id) => indications.find((i) => i.id === id)?.name ?? '')
        .filter(Boolean);

      // Build initial slot values for multi-page templates
      const initialSlotValues: Record<string, string> = {};
      if (pageCount && tpl.id === 'folleto-2p') {
        initialSlotValues['__page_count'] = String(pageCount);
      }

      // Crear sesión en Firestore
      const sessionId = await createSession({
        brandId: brand.id,
        brandName: brand.name,
        campaignName,
        templateId: tpl.id,
        templateName: tpl.name,
        moleculeId: molecule?.id ?? null,
        moleculeName: molecule?.name ?? null,
        indicationIds,
        indicationNames: indNames,
        tenantId,
        createdBy: user.email!,
        initialSlotValues,
      });

      const newSession = await getSession(sessionId);
      if (newSession) {
        // Pre-cargar el mensaje del usuario en la sesión para que ChatView lo detecte
        const userMsg: ChatMessage = {
          role: 'user',
          content: initialPrompt,
          timestamp: Timestamp.now(),
        };
        newSession.messages = [userMsg];
        addMessageToSession(sessionId, userMsg).catch(() => {});

        // Actualizar URL con el ID de sesión para no perderla al navegar
        setSearchParams({ session: sessionId }, { replace: true });
        setActiveTemplate(tpl);
        setSessionInsights(allInsights);
        setKnowledgeContent(kContent);
        // No needed — message is in session
        setStep('chat');
        setSession(newSession);
      }
    } catch {
      toast('Error al crear sesión', 'error');
    } finally {
      setStarting(false);
    }
  };

  // Retomar un borrador existente
  const handleResumeDraft = async (draftId: string) => {
    try {
      setStarting(true);
      const existingSession = await getSession(draftId);
      if (!existingSession) {
        toast('Borrador no encontrado', 'error');
        return;
      }
      const tpl = templates.find((t) => t.id === existingSession.templateId);
      if (!tpl) {
        toast('Plantilla no encontrada', 'error');
        return;
      }
      const [allInsights, kContent] = await Promise.all([
        loadInsightsForIndications(existingSession.indicationIds),
        loadKnowledgeContent(tenantId, brand!.id),
      ]);
      setSearchParams({ session: draftId }, { replace: true });
      setActiveTemplate(tpl);
      setSessionInsights(allInsights);
      setKnowledgeContent(kContent);
      setStep('chat');
      setSession(existingSession);
    } catch {
      toast('Error al retomar borrador', 'error');
    } finally {
      setStarting(false);
    }
  };

  // Eliminar borrador
  const handleDeleteDraft = async (draftId: string) => {
    if (!confirm('¿Eliminar este borrador? Esta acción no se puede deshacer.')) return;
    try {
      await deleteSession(draftId);
      setDrafts((prev) => prev.filter((d) => d.id !== draftId));
      toast('Borrador eliminado', 'success');
    } catch {
      toast('Error al eliminar borrador', 'error');
    }
  };

  // Handler para cuando el usuario selecciona una idea de campaña
  const handleSelectIdea = (idea: CampaignIdea, templateId: string, indicationIds: string[]) => {
    handleStart(
      templateId,
      indicationIds,
      idea.title,
      idea.suggestedPrompt,
      'auto',
    );
  };

  if (loading) return <LoadingSpinner />;
  if (!brand) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-500">Marca no encontrada.</p>
        <Link to="/marcas" className="text-sm text-blue-600 hover:underline mt-2 inline-block">
          ← Volver a marcas
        </Link>
      </div>
    );
  }

  // Si hay sesión activa, mostrar chat
  if (step === 'chat' && session && activeTemplate) {
    return (
      <ChatView
        session={session}
        template={activeTemplate}
        brand={brand}
        insights={sessionInsights}
        molecule={molecule}
        knowledgeContent={knowledgeContent}
        initialPrompt={initialPromptFromUrl}
        imageStyle={'auto'}
      />
    );
  }

  // Paso de Ideas
  if (step === 'ideas') {
    return (
      <IdeasView
        brand={brand}
        molecule={molecule}
        indications={indications}
        insights={sessionInsights}
        templates={templates}
        knowledgeContent={knowledgeContent}
        onSelectIdea={handleSelectIdea}
        onSkip={() => {
          // En flujo simplificado, "skip" significa crear idea personalizada
          handleSelectIdea({
            title: 'Idea personalizada',
            description: 'Describe exactamente lo que necesitas crear',
            suggestedPrompt: 'Crear material promocional personalizado para ' + brand.name,
            templateSuggestion: templates[0]?.id || '',
            style: 'moderno'
          }, templates[0]?.id || '', indications.map(i => i.id));
        }}
      />
    );
  }

  // Si no, mostrar setup
  return (
    <SetupView
      brand={brand}
      molecule={molecule}
      indications={indications}
      templates={templates}
      drafts={drafts}
      onStart={handleStart}
      onResumeDraft={handleResumeDraft}
      onDeleteDraft={handleDeleteDraft}
      loading={starting}
    />
  );
};

// ── Helper: cargar insights aprobados de múltiples indicaciones ──

async function loadInsightsForIndications(indicationIds: string[]): Promise<Insight[]> {
  const results = await Promise.all(
    indicationIds.map((id) => getInsightsByStatus(id, 'approved'))
  );
  return results.flat();
}

// ── Helper: construir contenido de Knowledge Bank para el prompt ──

async function loadKnowledgeContent(tenantId: string, brandId: string): Promise<string> {
  try {
    const items = await getKnowledgeForBrand(tenantId, brandId);
    if (items.length === 0) return '';

    const lines: string[] = [];
    items.forEach((item, i) => {
      lines.push(`\n[Material ${i + 1}] (${item.type}${item.scope === 'brand' ? ` — ${item.brandName}` : ' — Global'}): "${item.title}"`);
      if (item.description) lines.push(`  Descripción: ${item.description}`);
      if (item.content) lines.push(`  Contenido: ${item.content}`);
      if (item.tags.length > 0) lines.push(`  Tags: ${item.tags.join(', ')}`);
      if (item.fileNames.length > 0) lines.push(`  Archivos de referencia: ${item.fileNames.join(', ')}`);
    });
    return lines.join('\n');
  } catch {
    return '';
  }
}

export default GeneratePage;
