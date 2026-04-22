import { createElement, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useAuth } from '@/hooks/useAuth';
import { useTenant } from '@/hooks/useTenant';
import { useToast } from '@/hooks/useToast';
import { getBrands } from '@/services/brandService';
import {
  getSystemEmailDesigns,
  getCustomDesignTemplates,
  createDesignTemplate,
  ALL_EMAIL_TAGS,
  type SystemDesignTemplate,
  type EmailDesignTag,
} from '@/services/designTemplateService';
import {
  getMailingProject,
  createMailingProject,
  createMailingProjectFromBlocks,
  updateMailingBlocks,
  updateMailingProject,
  generateMailingHTML,
  suggestBlockCopy,
  type CopySuggestion,
} from '@/services/mailingService';
import { analyzeEmailDesign } from '@/services/designAnalysisService';
import { uploadFile } from '@/services/uploadService';
import { getBrandKnowledge } from '@/services/knowledgeService';
import { getInsightsByStatus } from '@/services/insightService';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import AIMailingPanel from '@/components/mailing/AIMailingPanel';
import EmailTypeSelector from '@/components/mailing/EmailTypeSelector';
import type { AIMailingResponse } from '@/services/aiMailingContext';
import {
  createTextBankEntry,
  extractTextsFromBlocks,
  determineSource,
} from '@/services/brandTextBankService';
import type { Brand, DesignTemplate, MailingProject, MailingBlockContent, DesignBlockType, TextBankEmailType } from '@/types';

// ── Step indicators ──────────────────────────────────────

type Step = 'brand' | 'design' | 'editor' | 'preview';

const STEPS: { key: Step; label: string; icon: string }[] = [
  { key: 'brand', label: 'Marca', icon: '🏷️' },
  { key: 'design', label: 'Diseño', icon: '🎨' },
  { key: 'editor', label: 'Editor', icon: '✏️' },
  { key: 'preview', label: 'Preview', icon: '👁️' },
];

// ── Block type labels & icons ────────────────────────────

const BLOCK_LABELS: Record<DesignBlockType, string> = {
  header: 'Encabezado',
  hero: 'Hero Image',
  text: 'Texto',
  image: 'Imagen',
  cta: 'Botón (CTA)',
  event: 'Evento',
  speaker: 'Speaker',
  footer: 'Pie de email',
  spacer: 'Espaciador',
  divider: 'Separador',
  bullets: 'Lista',
  columns: 'Columnas',
  quote: 'Cita',
  social: 'Redes Sociales',
  video: 'Video',
};

// ── Main Component ───────────────────────────────────────

const MailingEditor: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const isEditing = !!id && id !== 'new';
  const navigate = useNavigate();
  const { user } = useAuth();
  const tenantId = useTenant();
  const { toast } = useToast();

  // Global state
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState<Step>('brand');
  const [showAIPanel, setShowAIPanel] = useState(false);

  // AI tracking — para Brand Text Bank
  const [isAIGenerated, setIsAIGenerated] = useState(false);
  const [originalAIBlocks, setOriginalAIBlocks] = useState<MailingBlockContent[] | null>(null);
  const [aiEmailType, setAiEmailType] = useState<TextBankEmailType | null>(null);
  const [aiContext, setAiContext] = useState<{ userPrompt: string; reasoning?: string; tone?: string; length?: string } | null>(null);
  const [showTypeSelector, setShowTypeSelector] = useState(false);
  const [pendingSaveCallback, setPendingSaveCallback] = useState<(() => void) | null>(null);

  // Step 1: Brand selection
  const [brands, setBrands] = useState<Brand[]>([]);
  const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null);

  // Step 2: Design selection
  const [designs, setDesigns] = useState<SystemDesignTemplate[]>([]);
  const [customDesigns, setCustomDesigns] = useState<DesignTemplate[]>([]);
  const [selectedDesign, setSelectedDesign] = useState<SystemDesignTemplate | DesignTemplate | null>(null);

  // Step 3: Editor
  const [projectName, setProjectName] = useState('');
  const [subject, setSubject] = useState('');
  const [blocks, setBlocks] = useState<MailingBlockContent[]>([]);
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [emailSettings, setEmailSettings] = useState<{
    bodyBackground?: string;
    bodyBackgroundImage?: string;
    containerWidth?: number;
    borderRadius?: number;
    preheaderText?: string;
  }>({});

  // Step 4: Preview
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop');

  // Mailing project (when editing)
  const [project, setProject] = useState<MailingProject | null>(null);

  // Style derived from brand + design
  const computedStyle = useMemo(() => {
    if (project) return project.style;
    return {
      colorPrimary: selectedBrand?.params.colorPrimary ?? '#2563EB',
      colorSecondary: selectedBrand?.params.colorSecondary ?? '#0EA5E9',
      colorBackground: '#FFFFFF',
      fontTitle: selectedBrand?.params.fontTitle ?? 'Inter',
      fontBody: selectedBrand?.params.fontBody ?? 'Inter',
      logoUrl: selectedBrand?.params.logoUrl ?? '',
    };
  }, [selectedBrand, project]);

  // ── Load initial data ──────────────────────────────────

  const loadInitial = useCallback(async () => {
    try {
      setLoading(true);

      // Load system designs (in-memory, instant)
      setDesigns(getSystemEmailDesigns());

      if (isEditing) {
        // Load existing project
        const proj = await getMailingProject(id);
        if (!proj) {
          toast('Email no encontrado', 'error');
          navigate('/mailing');
          return;
        }
        setProject(proj);
        setBlocks(proj.blocks);
        setProjectName(proj.name);
        setSubject(proj.subject);
        setStep('editor');

        // Load brands for context
        const allBrands = await getBrands(tenantId);
        setBrands(allBrands);
        setSelectedBrand(allBrands.find((b) => b.id === proj.brandId) ?? null);
      } else {
        // New: load brands
        const allBrands = await getBrands(tenantId);
        setBrands(allBrands);
      }

      // Load custom designs from Firestore (non-blocking)
      try {
        const custom = await getCustomDesignTemplates(tenantId);
        setCustomDesigns(custom.filter((d) => d.category === 'email'));
      } catch {
        // Collection might not exist yet
      }
    } catch {
      toast('Error al cargar datos', 'error');
    } finally {
      setLoading(false);
    }
  }, [id, isEditing, tenantId]);

  useEffect(() => { loadInitial(); }, [loadInitial]);

  // ── Handlers ───────────────────────────────────────────

  const handleSelectBrand = (brand: Brand) => {
    setSelectedBrand(brand);
    setStep('design');
  };

  const handleSelectDesign = (design: SystemDesignTemplate | DesignTemplate) => {
    setSelectedDesign(design);
    // Initialize blocks from design layout with brand data injected
    const brandLogo = selectedBrand?.params.logoUrl ?? '';
    const brandName = selectedBrand?.name ?? '';
    const initialBlocks: MailingBlockContent[] = design.layout.blocks.map((b) => ({
      id: b.id,
      type: b.type,
      content: b.type === 'header'
        ? (brandName || b.defaultContent || '')
        : (b.defaultContent ?? ''),
      imageUrl: b.type === 'header' && brandLogo ? brandLogo : undefined,
      style: b.style,
    }));
    setBlocks(initialBlocks);
    setProjectName(`Email ${brandName}`);
    setSubject('');
    setStep('editor');
  };

  const handleAIGenerated = (response: AIMailingResponse, meta: { emailType: string; userPrompt: string; tone?: string; length?: string }) => {
    setBlocks(response.blocks);
    setSubject(response.subject);
    setProjectName(response.projectName);
    setEmailSettings({
      preheaderText: response.emailSettings.preheaderText,
      bodyBackground: response.emailSettings.bodyBackground,
      containerWidth: response.emailSettings.containerWidth,
      borderRadius: response.emailSettings.borderRadius,
    });
    // AI tracking
    setIsAIGenerated(true);
    setOriginalAIBlocks(structuredClone(response.blocks));
    setAiEmailType(meta.emailType as TextBankEmailType);
    setAiContext({ userPrompt: meta.userPrompt, tone: meta.tone, length: meta.length });
    setShowAIPanel(false);
    setStep('editor');
    toast('Email generado con IA', 'success');
  };

  const handleBlockChange = (blockId: string, updates: Partial<MailingBlockContent>) => {
    setBlocks((prev) =>
      prev.map((b) => (b.id === blockId ? { ...b, ...updates } : b)),
    );
  };

  const handleAddBlock = (type: DesignBlockType, afterId?: string) => {
    const newBlock: MailingBlockContent = {
      id: `block_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type,
      content: type === 'event' ? 'ENCUENTRO CIENTÍFICO' : '',
      ctaText: type === 'event' ? 'Inscribirse' : undefined,
      style: type === 'event'
        ? {
            eventTitle: 'Actualización científica exclusiva',
            eventDescription: 'Revisa evidencia clínica relevante y participa en una conversación práctica con especialistas.',
            eventDate: 'Jueves 12 de junio',
            eventTime: '19:00 h',
            eventLocation: 'Streaming en vivo',
            eventSpeaker: 'Dra. Valentina Rojas',
            eventCapacity: '120 cupos',
            eventMode: 'Online',
          }
        : type === 'speaker'
          ? {
              speakerName: 'Dra. Valentina Rojas',
              speakerRole: 'Especialista invitada',
              speakerOrg: 'Hospital Clínico',
              speakerBio: 'Compartirá una mirada clínica práctica sobre evidencia reciente y aplicación en pacientes reales.',
              speakerImageShape: 'circle',
              speakerCardBg: '#f8fafc',
              speakerVariant: 'classic',
            }
        : undefined,
    };
    setBlocks((prev) => {
      if (afterId) {
        const idx = prev.findIndex((b) => b.id === afterId);
        const out = [...prev];
        out.splice(idx + 1, 0, newBlock);
        return out;
      }
      return [...prev, newBlock];
    });
    setActiveBlockId(newBlock.id);
  };

  const handleDeleteBlock = (blockId: string) => {
    setBlocks((prev) => prev.filter((b) => b.id !== blockId));
    if (activeBlockId === blockId) setActiveBlockId(null);
  };

  const handleReorderBlocks = (activeId: string, overId: string) => {
    setBlocks((prev) => {
      const oldIndex = prev.findIndex((b) => b.id === activeId);
      const newIndex = prev.findIndex((b) => b.id === overId);
      if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return prev;
      const out = [...prev];
      const [moved] = out.splice(oldIndex, 1);
      out.splice(newIndex, 0, moved);
      return out;
    });
  };

  const handleMoveBlock = (blockId: string, direction: 'up' | 'down') => {
    setBlocks((prev) => {
      const idx = prev.findIndex((b) => b.id === blockId);
      if (idx < 0) return prev;
      if (direction === 'up' && idx === 0) return prev;
      if (direction === 'down' && idx === prev.length - 1) return prev;
      const out = [...prev];
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      [out[idx], out[swapIdx]] = [out[swapIdx], out[idx]];
      return out;
    });
  };

  const handleDuplicateBlock = (blockId: string) => {
    setBlocks((prev) => {
      const idx = prev.findIndex((b) => b.id === blockId);
      if (idx < 0) return prev;
      const clone = {
        ...prev[idx],
        id: `block_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      };
      const out = [...prev];
      out.splice(idx + 1, 0, clone);
      return out;
    });
  };

  // Strip undefined values recursively so Firestore doesn't reject the write
  const sanitize = (obj: unknown): unknown => {
    if (obj === null || obj === undefined) return null;
    if (Array.isArray(obj)) return obj.map(sanitize);
    if (typeof obj === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
        if (v !== undefined) out[k] = sanitize(v);
      }
      return out;
    }
    return obj;
  };

  const saveToBrandTextBank = async (projectId: string) => {
    if (!selectedBrand || !user) return;
    const emailType = aiEmailType ?? 'otro';
    const source = determineSource(isAIGenerated, originalAIBlocks, blocks);
    try {
      const entry: Parameters<typeof createTextBankEntry>[0] = {
        tenantId,
        brandId: selectedBrand.id,
        brandName: selectedBrand.name,
        mailingProjectId: projectId,
        emailType,
        source,
        subject,
        tags: [],
        texts: extractTextsFromBlocks(blocks),
        blockSequence: blocks.map((b) => b.type),
        createdBy: user.uid,
      };
      if (aiContext) {
        entry.aiContext = { userPrompt: aiContext.userPrompt, tone: aiContext.tone, length: aiContext.length };
      }
      await createTextBankEntry(entry);
    } catch (err) {
      console.error('[TextBank] Error al guardar en brand text bank:', err);
    }
  };

  const handleSave = async () => {
    if (!user) return;

    // Si es email manual sin emailType → pedir tipo primero
    if (!isAIGenerated && !aiEmailType && !isEditing) {
      setShowTypeSelector(true);
      setPendingSaveCallback(() => () => performSave());
      return;
    }

    await performSave();
  };

  const performSave = async () => {
    setSaving(true);
    try {
      const cleanBlocks = sanitize(blocks) as MailingBlockContent[];
      if (isEditing && project) {
        await updateMailingBlocks(project.id, cleanBlocks);
        await updateMailingProject(project.id, { name: projectName, subject, status: 'ready' });
        await saveToBrandTextBank(project.id);
        toast('Email guardado', 'success');
      } else if (selectedBrand && selectedDesign) {
        const newId = await createMailingProject({
          name: projectName,
          subject,
          brandId: selectedBrand.id,
          brandName: selectedBrand.name,
          designTemplate: selectedDesign,
          style: computedStyle,
          tenantId,
          createdBy: user!.uid,
        });
        await saveToBrandTextBank(newId);
        toast('Email creado', 'success');
        navigate(`/mailing/${newId}`, { replace: true });
      } else if (selectedBrand && !selectedDesign && blocks.length > 0) {
        // AI-generated flow — no design template selected
        const newId = await createMailingProjectFromBlocks({
          name: projectName,
          subject,
          brandId: selectedBrand.id,
          brandName: selectedBrand.name,
          blocks: cleanBlocks,
          style: computedStyle,
          emailSettings,
          tenantId,
          createdBy: user!.uid,
        });
        await saveToBrandTextBank(newId);
        toast('Email creado', 'success');
        navigate(`/mailing/${newId}`, { replace: true });
      }
    } catch (err) {
      console.error('[Save] Error al guardar mailing:', err);
      toast('Error al guardar', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleExportHTML = async () => {
    if (!project && !selectedDesign) return;

    const fakeProject: MailingProject = project ?? {
      id: 'preview',
      name: projectName,
      subject,
      brandId: selectedBrand?.id ?? '',
      brandName: selectedBrand?.name ?? '',
      designTemplateId: selectedDesign?.id ?? '',
      designTemplateName: selectedDesign?.name ?? '',
      blocks,
      layout: selectedDesign?.layout ?? { width: 600, height: 800, blocks: [] },
      style: computedStyle,
      emailSettings,
      status: 'draft',
      tenantId,
      createdBy: user?.uid ?? '',
    } as MailingProject;

    try {
      const html = await generateMailingHTML(fakeProject);
      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${projectName || 'email'}.html`;
      a.click();
      URL.revokeObjectURL(url);
      toast('HTML descargado', 'success');
    } catch (err) {
      console.error('Export HTML error:', err);
      toast('Error al exportar HTML', 'error');
    }
  };

  // ── Render ──────────────────────────────────────────────

  if (loading) return <LoadingSpinner />;

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/mailing')}
            className="p-2 rounded-xl hover:bg-gray-100 transition text-gray-500"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              {isEditing ? 'Editar email' : 'Nuevo email'}
            </h1>
            {selectedBrand && (
              <p className="text-xs text-gray-400 mt-0.5">
                {selectedBrand.name} · {selectedDesign?.name ?? project?.designTemplateName ?? ''}
              </p>
            )}
          </div>
        </div>

        {step === 'editor' || step === 'preview' ? (
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition disabled:opacity-50 cursor-pointer"
            >
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
            <button
              onClick={handleExportHTML}
              className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-200 transition"
            >
              Descargar HTML
            </button>
          </div>
        ) : null}
      </div>

      {/* Step indicators */}
      <div className="flex items-center gap-2 mb-8">
        {STEPS.map((s, i) => {
          const isActive = s.key === step;
          const stepIndex = STEPS.findIndex((x) => x.key === step);
          const isPast = i < stepIndex;
          return (
            <button
              key={s.key}
              onClick={() => {
                if (isPast) setStep(s.key);
              }}
              disabled={!isPast && !isActive}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition ${
                isActive
                  ? 'bg-blue-100 text-blue-700'
                  : isPast
                    ? 'bg-gray-100 text-gray-600 hover:bg-gray-200 cursor-pointer'
                    : 'bg-gray-50 text-gray-300 cursor-not-allowed'
              }`}
            >
              <span>{s.icon}</span>
              {s.label}
            </button>
          );
        })}
      </div>

      {/* Step content */}
      {step === 'brand' && (
        <StepBrand brands={brands} onSelect={handleSelectBrand} />
      )}
      {step === 'design' && (
        <StepDesign
          systemDesigns={designs}
          customDesigns={customDesigns}
          brandStyle={computedStyle}
          onSelect={handleSelectDesign}
          onUploadComplete={(d) => setCustomDesigns((prev) => [d, ...prev])}
          onOpenAI={() => setShowAIPanel(true)}
          tenantId={tenantId}
          userId={user?.uid ?? ''}
        />
      )}
      {step === 'editor' && (
        <StepEditor
          blocks={blocks}
          style={computedStyle}
          layout={selectedDesign?.layout ?? project?.layout ?? { width: 600, height: 800, blocks: [] }}
          projectName={projectName}
          subject={subject}
          onNameChange={setProjectName}
          onSubjectChange={setSubject}
          activeBlockId={activeBlockId}
          onActiveBlockChange={setActiveBlockId}
          onBlockChange={handleBlockChange}
          onAddBlock={handleAddBlock}
          onDeleteBlock={handleDeleteBlock}
          onMoveBlock={handleMoveBlock}
          onReorderBlocks={handleReorderBlocks}
          onDuplicateBlock={handleDuplicateBlock}
          emailSettings={emailSettings}
          onEmailSettingsChange={(u) => setEmailSettings((prev) => ({ ...prev, ...u }))}
          onGoPreview={() => setStep('preview')}
          tenantId={tenantId}
          brand={selectedBrand}
        />
      )}
      {step === 'preview' && (
        <StepPreview
          blocks={blocks}
          style={computedStyle}
          layout={selectedDesign?.layout ?? project?.layout ?? { width: 600, height: 800, blocks: [] }}
          previewMode={previewMode}
          onModeChange={setPreviewMode}
          onBack={() => setStep('editor')}
          subject={subject}
          projectName={projectName}
        />
      )}

      {/* AI Mailing Panel */}
      {showAIPanel && selectedBrand && (
        <AIMailingPanel
          brand={selectedBrand}
          tenantId={tenantId}
          onGenerated={handleAIGenerated}
          onClose={() => setShowAIPanel(false)}
        />
      )}

      {/* Email Type Selector — para emails manuales sin tipo */}
      {showTypeSelector && (
        <EmailTypeSelector
          onSelect={(type) => {
            setAiEmailType(type);
            setShowTypeSelector(false);
            pendingSaveCallback?.();
            setPendingSaveCallback(null);
          }}
          onSkip={() => {
            setAiEmailType('otro');
            setShowTypeSelector(false);
            pendingSaveCallback?.();
            setPendingSaveCallback(null);
          }}
        />
      )}
    </div>
  );
};

export default MailingEditor;

// ═══════════════════════════════════════════════════════════
// Step 1: Brand Selection
// ═══════════════════════════════════════════════════════════

const StepBrand: React.FC<{
  brands: Brand[];
  onSelect: (b: Brand) => void;
}> = ({ brands, onSelect }) => (
  <div>
    <h2 className="text-lg font-semibold text-gray-800 mb-1">Selecciona una marca</h2>
    <p className="text-sm text-gray-400 mb-6">Los colores, tipografías y logo se aplicarán automáticamente al email.</p>

    {brands.length === 0 ? (
      <div className="text-center py-16 text-gray-400 text-sm">
        No hay marcas configuradas. Crea una marca primero en la sección Marcas.
      </div>
    ) : (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {brands.map((b) => (
          <button
            key={b.id}
            onClick={() => onSelect(b)}
            className="text-left bg-white rounded-2xl border border-gray-100 p-5 hover:border-blue-300 hover:shadow-lg transition-all group"
          >
            <div className="flex items-center gap-3 mb-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm shadow-md"
                style={{ background: `linear-gradient(135deg, ${b.params.colorPrimary}, ${b.params.colorSecondary})` }}
              >
                {b.name.charAt(0)}
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-900 group-hover:text-blue-600 transition">{b.name}</h3>
                <p className="text-[11px] text-gray-400">{b.params.fontTitle} · {b.params.fontBody}</p>
              </div>
            </div>
            <div className="flex gap-1.5">
              <div className="w-6 h-6 rounded-md border border-gray-200" style={{ backgroundColor: b.params.colorPrimary }} title="Primario" />
              <div className="w-6 h-6 rounded-md border border-gray-200" style={{ backgroundColor: b.params.colorSecondary }} title="Secundario" />
            </div>
          </button>
        ))}
      </div>
    )}
  </div>
);

// ═══════════════════════════════════════════════════════════
// Step 2: Design Selection — Elementor-style gallery
// ═══════════════════════════════════════════════════════════

const StepDesign: React.FC<{
  systemDesigns: SystemDesignTemplate[];
  customDesigns: DesignTemplate[];
  brandStyle: MailingProject['style'];
  onSelect: (d: SystemDesignTemplate | DesignTemplate) => void;
  onUploadComplete?: (d: DesignTemplate) => void;
  onOpenAI?: () => void;
  tenantId: string;
  userId: string;
}> = ({ systemDesigns, customDesigns, brandStyle, onSelect, onUploadComplete, onOpenAI, tenantId, userId }) => {
  const [activeTag, setActiveTag] = useState<EmailDesignTag | 'all' | 'custom'>('all');
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filteredDesigns = activeTag === 'all'
    ? systemDesigns
    : activeTag === 'custom'
      ? []
      : systemDesigns.filter((d) => d.tags.includes(activeTag as EmailDesignTag));

  const totalCount = systemDesigns.length + customDesigns.length;

  const handleUploadDesign = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const supported = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!supported.includes(file.type)) {
      alert('Formato no soportado. Usa JPG, PNG, WebP o PDF.');
      return;
    }

    setUploading(true);
    setUploadProgress('Analizando diseño con IA...');
    try {
      // 1. Analyze with Gemini
      const extracted = await analyzeEmailDesign(file);
      setUploadProgress('Guardando diseño...');

      // 2. Upload thumbnail (the original file as reference)
      const ext = file.name.split('.').pop() ?? 'png';
      const path = `designs/${tenantId}/${Date.now()}.${ext}`;
      const thumbnailUrl = await uploadFile(file, path);

      // 3. Save as custom DesignTemplate in Firestore
      const newId = await createDesignTemplate({
        name: extracted.name,
        brandId: null,
        brandName: null,
        category: 'email',
        thumbnailUrl,
        layout: extracted.layout,
        style: {
          colorPrimary: extracted.detectedColors[0] ?? brandStyle.colorPrimary,
          colorSecondary: extracted.detectedColors[1] ?? brandStyle.colorSecondary,
          colorBackground: '#FFFFFF',
          fontTitle: extracted.detectedFonts[0] ?? 'Inter',
          fontBody: extracted.detectedFonts[1] ?? extracted.detectedFonts[0] ?? 'Inter',
          variant: 'importado',
        },
        source: 'imported',
        sourceFileUrl: thumbnailUrl,
        tenantId,
        createdBy: userId,
      });

      // 4. Build the full DesignTemplate object for immediate use
      const { Timestamp } = await import('firebase/firestore');
      const now = Timestamp.now();
      const newDesign: DesignTemplate = {
        id: newId,
        name: extracted.name,
        brandId: null,
        brandName: null,
        category: 'email',
        thumbnailUrl,
        layout: extracted.layout,
        style: {
          colorPrimary: extracted.detectedColors[0] ?? brandStyle.colorPrimary,
          colorSecondary: extracted.detectedColors[1] ?? brandStyle.colorSecondary,
          colorBackground: '#FFFFFF',
          fontTitle: extracted.detectedFonts[0] ?? 'Inter',
          fontBody: extracted.detectedFonts[1] ?? extracted.detectedFonts[0] ?? 'Inter',
          variant: 'importado',
        },
        source: 'imported',
        sourceFileUrl: thumbnailUrl,
        tenantId,
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      };

      onUploadComplete?.(newDesign);
      setActiveTag('custom');
      setUploadProgress('');
    } catch (err) {
      console.error('Upload design error:', err);
      alert('Error al analizar el diseño. Intenta con una imagen más clara.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div>
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="text-lg font-semibold text-gray-800 mb-1">Elige un diseño de email</h2>
          <p className="text-sm text-gray-400">
            {totalCount} diseños disponibles. Elige la estructura y luego edita cada bloque.
          </p>
        </div>
        {/* Action buttons */}
        <div className="shrink-0 ml-4 flex items-center gap-2">
          {/* AI Generate button */}
          {onOpenAI && (
            <button
              onClick={onOpenAI}
              className="px-4 py-2.5 bg-linear-to-r from-blue-600 to-cyan-600 text-white text-sm font-semibold rounded-xl hover:from-blue-700 hover:to-cyan-700 transition flex items-center gap-2 shadow-md shadow-blue-500/20"
            >
              <span className="text-sm leading-none">✨</span>
              Crear con AI
            </button>
          )}
          {/* Upload button */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            className="hidden"
            onChange={handleUploadDesign}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="px-4 py-2.5 bg-purple-600 text-white text-sm font-semibold rounded-xl hover:bg-purple-700 transition disabled:opacity-50 flex items-center gap-2 shadow-md shadow-purple-500/20"
          >
            {uploading ? (
              <>
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                {uploadProgress || 'Procesando...'}
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                Subir diseño
              </>
            )}
          </button>
        </div>
      </div>

      {/* Upload progress banner */}
      {uploading && (
        <div className="mb-5 bg-purple-50 border border-purple-100 rounded-xl p-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
            <svg className="animate-spin w-4 h-4 text-purple-600" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-medium text-purple-800">Analizando tu diseño con IA</p>
            <p className="text-xs text-purple-600">{uploadProgress}</p>
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex items-center gap-1.5 mb-6 flex-wrap">
        <button
          onClick={() => setActiveTag('all')}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
            activeTag === 'all'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          Todos ({systemDesigns.length})
        </button>
        {ALL_EMAIL_TAGS.map((tag) => {
          const count = systemDesigns.filter((d) => d.tags.includes(tag.key)).length;
          if (count === 0) return null;
          return (
            <button
              key={tag.key}
              onClick={() => setActiveTag(tag.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
                activeTag === tag.key
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {tag.icon} {tag.label} ({count})
            </button>
          );
        })}
        {customDesigns.length > 0 && (
          <button
            onClick={() => setActiveTag('custom')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
              activeTag === 'custom'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-500/20'
                : 'bg-purple-50 text-purple-700 hover:bg-purple-100'
            }`}
          >
            📁 Mis diseños ({customDesigns.length})
          </button>
        )}
      </div>

      {/* Design grid */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {/* System designs */}
        {filteredDesigns.map((d) => (
          <button
            key={d.id}
            onClick={() => onSelect(d)}
            onMouseEnter={() => setHoveredId(d.id)}
            onMouseLeave={() => setHoveredId(null)}
            className="text-left bg-white rounded-2xl border border-gray-100 overflow-hidden hover:border-blue-300 hover:shadow-xl transition-all group relative"
          >
            {/* Mini preview with brand colors */}
            <div className="p-5 bg-gradient-to-b from-gray-50 to-white border-b border-gray-50">
              <div className="mx-auto rounded-lg overflow-hidden shadow-sm bg-white border border-gray-100"
                   style={{ maxWidth: 200 }}>
                <DesignMiniPreview layout={d.layout} style={brandStyle} />
              </div>
            </div>

            {/* Info */}
            <div className="p-4">
              <h3 className="text-sm font-semibold text-gray-900 group-hover:text-blue-600 transition">
                {d.name}
              </h3>
              <p className="text-[11px] text-gray-400 mt-1 line-clamp-2 leading-relaxed">
                {d.description}
              </p>
              <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
                {d.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-[10px] px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-500 font-medium"
                  >
                    {tag}
                  </span>
                ))}
                <span className="text-[10px] text-gray-300 ml-auto">
                  {d.layout.blocks.length} bloques
                </span>
              </div>
            </div>

            {/* Hover overlay with "Usar" button */}
            {hoveredId === d.id && (
              <div className="absolute inset-0 bg-blue-600/10 backdrop-blur-[1px] flex items-center justify-center rounded-2xl transition-all">
                <span className="px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl shadow-lg shadow-blue-500/30">
                  Usar este diseño
                </span>
              </div>
            )}
          </button>
        ))}

        {/* Custom designs */}
        {activeTag === 'custom' && customDesigns.map((d) => (
          <button
            key={d.id}
            onClick={() => onSelect(d)}
            onMouseEnter={() => setHoveredId(d.id)}
            onMouseLeave={() => setHoveredId(null)}
            className="text-left bg-white rounded-2xl border border-purple-100 overflow-hidden hover:border-purple-300 hover:shadow-xl transition-all group relative"
          >
            <div className="p-5 bg-gradient-to-b from-purple-50/50 to-white border-b border-purple-50">
              <div className="mx-auto rounded-lg overflow-hidden shadow-sm bg-white border border-gray-100"
                   style={{ maxWidth: 200 }}>
                <DesignMiniPreview layout={d.layout} style={brandStyle} />
              </div>
            </div>
            <div className="p-4">
              <h3 className="text-sm font-semibold text-gray-900 group-hover:text-purple-600 transition">
                {d.name}
              </h3>
              <div className="flex items-center gap-1.5 mt-2">
                <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-purple-50 text-purple-600 font-medium">
                  personalizado
                </span>
                <span className="text-[10px] text-gray-300 ml-auto">
                  {d.layout.blocks.length} bloques
                </span>
              </div>
            </div>
            {hoveredId === d.id && (
              <div className="absolute inset-0 bg-purple-600/10 backdrop-blur-[1px] flex items-center justify-center rounded-2xl">
                <span className="px-5 py-2.5 bg-purple-600 text-white text-sm font-semibold rounded-xl shadow-lg shadow-purple-500/30">
                  Usar este diseño
                </span>
              </div>
            )}
          </button>
        ))}

        {/* Empty state for custom */}
        {activeTag === 'custom' && customDesigns.length === 0 && (
          <div className="col-span-full text-center py-12">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-purple-50 flex items-center justify-center mb-4">
              <span className="text-2xl">📁</span>
            </div>
            <p className="text-sm font-medium text-gray-600">No tienes diseños propios</p>
            <p className="text-xs text-gray-400 mt-1">Los diseños que crees o importes aparecerán aquí.</p>
          </div>
        )}
      </div>
    </div>
  );
};

/** Tiny visual representation of the email layout */
const DesignMiniPreview: React.FC<{
  layout: { blocks: { type: DesignBlockType; y: number; h: number; x: number; w: number }[] };
  style: MailingProject['style'];
}> = ({ layout, style }) => (
  <div className="relative bg-white" style={{ paddingBottom: '140%' }}>
    {layout.blocks.map((b, i) => {
      const colors: Record<string, string> = {
        header: style.colorPrimary,
        footer: '#f3f4f6',
        cta: style.colorPrimary,
        event: style.colorPrimary,
        speaker: '#f1f5f9',
        hero: `${style.colorPrimary}22`,
        image: '#e5e7eb',
        divider: '#e5e7eb',
        text: '#f9fafb',
        bullets: '#f9fafb',
        spacer: 'transparent',
        columns: '#f9fafb',
      };
      return (
        <div
          key={i}
          className="absolute rounded-sm"
          style={{
            left: `${b.x}%`,
            top: `${(b.y / 100) * 100}%`,
            width: `${b.w}%`,
            height: `${(b.h / 100) * 100}%`,
            backgroundColor: colors[b.type] ?? '#f0f0f0',
          }}
        />
      );
    })}
  </div>
);

// ═══════════════════════════════════════════════════════════
// Step 3: Block Editor — Professional email builder layout
// ═══════════════════════════════════════════════════════════

// ── Sortable Block Item (drag-and-drop) ──────────────────

const SortableBlockItem: React.FC<{
  block: MailingBlockContent;
  index: number;
  total: number;
  isActive: boolean;
  onSelect: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}> = ({ block, index, total, isActive, onSelect, onMoveUp, onMoveDown, onDuplicate, onDelete }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });

  const dragStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
    position: 'relative' as const,
  };

  return (
    <div ref={setNodeRef} style={dragStyle} className="group">
      <button
        onClick={onSelect}
        className={`w-full text-left flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm transition-all ${
          isActive
            ? 'bg-blue-50 border border-blue-200 shadow-sm'
            : 'hover:bg-gray-50 border border-transparent'
        }`}
      >
        {/* Drag handle */}
        <span
          {...attributes}
          {...listeners}
          className="flex-shrink-0 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 transition touch-none"
          title="Arrastrar para reordenar"
          onClick={(e) => e.stopPropagation()}
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
            <circle cx="5" cy="3" r="1.5" /><circle cx="11" cy="3" r="1.5" />
            <circle cx="5" cy="8" r="1.5" /><circle cx="11" cy="8" r="1.5" />
            <circle cx="5" cy="13" r="1.5" /><circle cx="11" cy="13" r="1.5" />
          </svg>
        </span>
        <span className="text-sm flex-shrink-0">{BLOCK_ICONS[block.type]}</span>
        <div className="min-w-0 flex-1">
          <div className={`text-[11px] font-semibold ${isActive ? 'text-blue-700' : 'text-gray-700'}`}>
            {BLOCK_LABELS[block.type]}
          </div>
          <div className="text-[10px] text-gray-400 truncate mt-0.5">
            {block.content.slice(0, 35) || '(vacío — haz clic para editar)'}
          </div>
        </div>
        <span className="text-[9px] text-gray-300 flex-shrink-0">{index + 1}</span>
      </button>
      {isActive && (
        <div className="flex items-center gap-1 px-3 pb-2 -mt-0.5">
          <button onClick={onMoveUp} disabled={index === 0} className="p-1 rounded text-[10px] text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition" title="Subir">↑</button>
          <button onClick={onMoveDown} disabled={index === total - 1} className="p-1 rounded text-[10px] text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition" title="Bajar">↓</button>
          <button onClick={onDuplicate} className="p-1 rounded text-[10px] text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition" title="Duplicar">⧉</button>
          <button onClick={onDelete} className="p-1 rounded text-[10px] text-gray-400 hover:text-red-600 hover:bg-red-50 transition ml-auto" title="Eliminar">🗑</button>
        </div>
      )}
    </div>
  );
};

const BLOCK_ICONS: Record<DesignBlockType, string> = {
  header: '🏷️', hero: '🖼️', text: '📝', image: '🌄', cta: '🔘', event: '📅', speaker: '🎙️',
  footer: '📋', spacer: '↕️', divider: '➖', bullets: '📌', columns: '▥',
  quote: '💬', social: '🔗', video: '🎬',
};

const StepEditor: React.FC<{
  blocks: MailingBlockContent[];
  style: MailingProject['style'];
  layout: { width: number; height: number; blocks: { id: string; type: DesignBlockType; x: number; y: number; w: number; h: number }[] };
  projectName: string;
  subject: string;
  onNameChange: (v: string) => void;
  onSubjectChange: (v: string) => void;
  activeBlockId: string | null;
  onActiveBlockChange: (id: string | null) => void;
  onBlockChange: (id: string, u: Partial<MailingBlockContent>) => void;
  onAddBlock: (type: DesignBlockType, afterId?: string) => void;
  onDeleteBlock: (id: string) => void;
  onMoveBlock: (id: string, dir: 'up' | 'down') => void;
  onReorderBlocks: (activeId: string, overId: string) => void;
  onDuplicateBlock: (id: string) => void;
  emailSettings: { bodyBackground?: string; bodyBackgroundImage?: string; containerWidth?: number; borderRadius?: number; preheaderText?: string };
  onEmailSettingsChange: (u: Partial<{ bodyBackground: string; bodyBackgroundImage: string; containerWidth: number; borderRadius: number; preheaderText: string }>) => void;
  onGoPreview: () => void;
  tenantId: string;
  brand: Brand | null;
}> = ({
  blocks,
  style,
  layout,
  projectName,
  subject,
  onNameChange,
  onSubjectChange,
  activeBlockId,
  onActiveBlockChange,
  onBlockChange,
  onAddBlock,
  onDeleteBlock,
  onMoveBlock,
  onReorderBlocks,
  onDuplicateBlock,
  emailSettings,
  onEmailSettingsChange,
  onGoPreview,
  tenantId,
  brand,
}) => {
  const activeBlock = blocks.find((b) => b.id === activeBlockId);
  const [showAddMenu, setShowAddMenu] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const blockIds = useMemo(() => blocks.map((b) => b.id), [blocks]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      onReorderBlocks(active.id as string, over.id as string);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:h-[calc(100vh-12rem)] lg:min-h-[500px]">
      {/* ── Left panel: email config + block list ── */}
      <div className="lg:col-span-3 space-y-4 lg:overflow-y-auto lg:pr-1">
        {/* Email metadata card */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50 bg-gray-50/50">
            <h3 className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Configuración</h3>
          </div>
          <div className="p-4 space-y-3">
            <div>
              <label className="block text-[11px] font-semibold text-gray-400 mb-1">Nombre interno</label>
              <input
                value={projectName}
                onChange={(e) => onNameChange(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition"
                placeholder="Newsletter Marzo 2026"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-400 mb-1">Asunto del email</label>
              <input
                value={subject}
                onChange={(e) => onSubjectChange(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition"
                placeholder="Descubra las novedades de..."
              />
            </div>
          </div>
        </div>

        {/* Block list card */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50 bg-gray-50/50">
            <h3 className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
              Bloques ({blocks.length})
            </h3>
          </div>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={blockIds} strategy={verticalListSortingStrategy}>
          <div className="p-2">
            {blocks.map((b, idx) => (
              <SortableBlockItem
                key={b.id}
                block={b}
                index={idx}
                total={blocks.length}
                isActive={b.id === activeBlockId}
                onSelect={() => onActiveBlockChange(b.id === activeBlockId ? null : b.id)}
                onMoveUp={() => onMoveBlock(b.id, 'up')}
                onMoveDown={() => onMoveBlock(b.id, 'down')}
                onDuplicate={() => onDuplicateBlock(b.id)}
                onDelete={() => onDeleteBlock(b.id)}
              />
            ))}
          </div>
          </SortableContext>
          </DndContext>

          {/* Add block button */}
          <div className="p-2 pt-0 relative">
            <button
              onClick={() => setShowAddMenu(!showAddMenu)}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border-2 border-dashed border-gray-200 text-[11px] font-semibold text-gray-400 hover:border-blue-300 hover:text-blue-500 hover:bg-blue-50/30 transition-all"
            >
              <span className="text-sm">+</span> Agregar bloque
            </button>
            {showAddMenu && (
              <div className="absolute bottom-full left-2 right-2 mb-1 bg-white rounded-2xl border border-gray-200 shadow-xl z-50 p-3 max-h-72 overflow-y-auto">
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Tipo de bloque</div>
                <div className="grid grid-cols-2 gap-1.5">
                  {(Object.keys(BLOCK_LABELS) as DesignBlockType[]).map((type) => (
                    <button
                      key={type}
                      onClick={() => {
                        onAddBlock(type, activeBlockId ?? undefined);
                        setShowAddMenu(false);
                      }}
                      className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-left hover:bg-blue-50 hover:text-blue-700 transition text-[11px] text-gray-600"
                    >
                      <span>{BLOCK_ICONS[type]}</span>
                      <span className="font-medium">{BLOCK_LABELS[type]}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Color swatch preview */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <h3 className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-3">Marca aplicada</h3>
          <div className="flex items-center gap-2">
            {style.logoUrl && (
              <img src={style.logoUrl} alt="" className="h-6 w-auto object-contain rounded" />
            )}
            <div className="flex gap-1.5 ml-auto">
              <div className="w-6 h-6 rounded-md shadow-inner border border-black/5" style={{ backgroundColor: style.colorPrimary }} title="Primario" />
              <div className="w-6 h-6 rounded-md shadow-inner border border-black/5" style={{ backgroundColor: style.colorSecondary }} title="Secundario" />
            </div>
          </div>
          <div className="flex items-center gap-2 mt-2 text-[10px] text-gray-400">
            <span style={{ fontFamily: `'${style.fontTitle}', sans-serif`, fontWeight: 700 }}>Aa</span>
            <span>{style.fontTitle}</span>
            <span className="text-gray-200">|</span>
            <span style={{ fontFamily: `'${style.fontBody}', sans-serif` }}>Aa</span>
            <span>{style.fontBody}</span>
          </div>
        </div>

        {/* Global email settings */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50 bg-gray-50/50">
            <h3 className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Ajustes del email</h3>
          </div>
          <div className="p-4 space-y-3">
            <div>
              <label className="block text-[10px] font-semibold text-gray-400 mb-1">Preheader</label>
              <input
                value={emailSettings.preheaderText || ''}
                onChange={(e) => onEmailSettingsChange({ preheaderText: e.target.value })}
                className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs focus:outline-none focus:border-blue-400 transition"
                placeholder="Texto preview del email..."
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-semibold text-gray-400 mb-1">Fondo body</label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="color"
                    value={emailSettings.bodyBackground || '#f4f4f8'}
                    onChange={(e) => onEmailSettingsChange({ bodyBackground: e.target.value })}
                    className="w-6 h-6 rounded border border-gray-200 cursor-pointer"
                  />
                  <input
                    value={emailSettings.bodyBackground || ''}
                    onChange={(e) => onEmailSettingsChange({ bodyBackground: e.target.value })}
                    placeholder="#f4f4f8"
                    className="flex-1 px-2 py-1 rounded-lg border border-gray-200 text-[10px] focus:outline-none focus:border-blue-400"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-400 mb-1">Ancho (px)</label>
                <input
                  type="number"
                  value={emailSettings.containerWidth || 600}
                  onChange={(e) => onEmailSettingsChange({ containerWidth: parseInt(e.target.value) || 600 })}
                  min={400}
                  max={800}
                  className="w-full px-2 py-1 rounded-lg border border-gray-200 text-[10px] focus:outline-none focus:border-blue-400"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-semibold text-gray-400 mb-1">Bordes (px)</label>
                <input
                  type="number"
                  value={emailSettings.borderRadius ?? 12}
                  onChange={(e) => onEmailSettingsChange({ borderRadius: parseInt(e.target.value) || 0 })}
                  min={0}
                  max={32}
                  className="w-full px-2 py-1 rounded-lg border border-gray-200 text-[10px] focus:outline-none focus:border-blue-400"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-400 mb-1">Fondo imagen</label>
                <input
                  value={emailSettings.bodyBackgroundImage || ''}
                  onChange={(e) => onEmailSettingsChange({ bodyBackgroundImage: e.target.value })}
                  placeholder="URL..."
                  className="w-full px-2 py-1 rounded-lg border border-gray-200 text-[10px] focus:outline-none focus:border-blue-400"
                />
              </div>
            </div>
          </div>
        </div>

        <button
          onClick={onGoPreview}
          className="w-full px-4 py-3 bg-gradient-to-r from-blue-600 to-cyan-500 text-white text-sm font-bold rounded-xl hover:shadow-lg hover:shadow-blue-500/25 transition-all flex items-center justify-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
          Vista previa
        </button>
      </div>

      {/* ── Center: live email preview ── */}
      <div className="lg:col-span-5 flex flex-col items-center lg:overflow-y-auto lg:pr-1">
        {/* Email "client" chrome */}
        <div className="w-full max-w-[380px]">
          <div className="bg-gray-100 rounded-t-2xl px-4 py-2.5 flex items-center gap-2 border border-gray-200 border-b-0">
            <div className="flex gap-1">
              <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
              <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
              <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
            </div>
            <div className="flex-1 text-center">
              <div className="text-[10px] text-gray-500 font-medium truncate">
                {subject || 'Sin asunto'}
              </div>
            </div>
          </div>
          <div className="bg-white border border-gray-200 rounded-b-2xl overflow-hidden shadow-xl shadow-gray-200/50">
            <EmailVisualPreview
              blocks={blocks}
              style={style}
              activeBlockId={activeBlockId}
              onBlockClick={(id) => onActiveBlockChange(id)}
              onReorder={onReorderBlocks}
              onBlockChange={onBlockChange}
            />
          </div>
        </div>
      </div>

      {/* ── Right: block editor panel ── */}
      <div className="lg:col-span-4 lg:overflow-y-auto lg:pr-1">
        {activeBlock ? (
          <BlockEditor
            block={activeBlock}
            style={style}
            onChange={(updates) => onBlockChange(activeBlock.id, updates)}
            tenantId={tenantId}
            brand={brand}
            subject={subject}
            allBlocks={blocks}
          />
        ) : (
          <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-10 text-center">
            <div className="mx-auto w-12 h-12 rounded-2xl bg-gray-50 flex items-center justify-center mb-3">
              <svg className="w-5 h-5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-500">Selecciona un bloque</p>
            <p className="text-xs text-gray-400 mt-1">Haz clic en un bloque de la lista o en el preview para editarlo</p>
          </div>
        )}
      </div>
    </div>
  );
};

// ── Visual email preview in editor ───────────────────────

/** Lighten a hex color toward white */
function lightenHex(hex: string, amount: number): string {
  const c = hex.replace('#', '');
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  const lr = Math.round(r + (255 - r) * amount);
  const lg = Math.round(g + (255 - g) * amount);
  const lb = Math.round(b + (255 - b) * amount);
  return `#${lr.toString(16).padStart(2, '0')}${lg.toString(16).padStart(2, '0')}${lb.toString(16).padStart(2, '0')}`;
}

/** Extract embed URL from YouTube / Vimeo links */
function getVideoEmbedUrl(url?: string): string | null {
  if (!url) return null;
  // YouTube: watch?v=ID, youtu.be/ID, /embed/ID, /shorts/ID
  const ytMatch = url.match(/(?:youtube\.com\/(?:watch\?.*v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/);
  if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}`;
  // Vimeo: vimeo.com/ID
  const vmMatch = url.match(/vimeo\.com\/(\d+)/);
  if (vmMatch) return `https://player.vimeo.com/video/${vmMatch[1]}`;
  return null;
}

/** Get YouTube thumbnail from URL */
function getYouTubeThumbnail(url?: string): string | null {
  if (!url) return null;
  const m = url.match(/(?:youtube\.com\/(?:watch\?.*v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/);
  return m ? `https://img.youtube.com/vi/${m[1]}/hqdefault.jpg` : null;
}

/** Darken a hex color toward black */
function darkenHex(hex: string, amount: number): string {
  const c = hex.replace('#', '');
  const r = Math.round(parseInt(c.substring(0, 2), 16) * (1 - amount));
  const g = Math.round(parseInt(c.substring(2, 4), 16) * (1 - amount));
  const b = Math.round(parseInt(c.substring(4, 6), 16) * (1 - amount));
  return `#${Math.max(0, r).toString(16).padStart(2, '0')}${Math.max(0, g).toString(16).padStart(2, '0')}${Math.max(0, b).toString(16).padStart(2, '0')}`;
}

// ── Sortable Preview Block wrapper ───────────────────────

const SortablePreviewBlock: React.FC<{
  id: string;
  children: React.ReactNode;
}> = ({ id, children }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const dragStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
    position: 'relative' as const,
  };

  return (
    <div ref={setNodeRef} style={dragStyle} {...attributes} {...listeners}>
      {children}
    </div>
  );
};

// ── Draggable Logo sub-component for header ──────────────

const DraggableLogo: React.FC<{
  logoUrl?: string;
  text: string;
  titleFont: string;
  offsetX: number;
  offsetY: number;
  textStyle?: Record<string, string>;
  onDragEnd: (x: number, y: number) => void;
}> = ({ logoUrl, text, titleFont, offsetX, offsetY, textStyle, onDragEnd }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ mx: 0, my: 0, ox: offsetX, oy: offsetY });
  const [pos, setPos] = useState({ x: offsetX, y: offsetY });

  // Sync with external offset changes
  useEffect(() => {
    if (!dragging) setPos({ x: offsetX, y: offsetY });
  }, [offsetX, offsetY, dragging]);

  const onPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setDragging(true);
    dragStart.current = { mx: e.clientX, my: e.clientY, ox: pos.x, oy: pos.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    const dx = e.clientX - dragStart.current.mx;
    const dy = e.clientY - dragStart.current.my;
    setPos({ x: dragStart.current.ox + dx, y: dragStart.current.oy + dy });
  };

  const onPointerUp = () => {
    if (!dragging) return;
    setDragging(false);
    onDragEnd(pos.x, pos.y);
  };

  return (
    <div
      ref={ref}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{
        position: 'relative',
        left: pos.x,
        top: pos.y,
        display: 'inline-block',
        cursor: dragging ? 'grabbing' : 'grab',
        userSelect: 'none',
        touchAction: 'none',
        border: dragging ? '1px dashed rgba(255,255,255,0.5)' : '1px dashed transparent',
        borderRadius: 4,
        padding: 2,
        transition: dragging ? 'none' : 'border-color 0.2s',
      }}
      title="Arrastra para reposicionar el logo"
    >
      {logoUrl && (
        <img src={logoUrl} alt="" style={{ height: 24, width: 'auto', objectFit: 'contain', display: 'block', marginBottom: text ? 8 : 0, pointerEvents: 'none' }} />
      )}
      {text && (
        <span style={{
          color: textStyle?.color || '#fff',
          fontFamily: `'${textStyle?.fontFamily || titleFont}', sans-serif`,
          fontWeight: 800,
          fontSize: textStyle?.fontSize ? Math.round(parseInt(textStyle.fontSize) * 0.55) : 12,
          letterSpacing: '-0.2px',
          textTransform: (textStyle?.textTransform as React.CSSProperties['textTransform']) || 'uppercase',
          textAlign: (textStyle?.textAlign as React.CSSProperties['textAlign']) || 'left',
          display: 'block',
          pointerEvents: 'none',
        }}>
          {text}
        </span>
      )}
    </div>
  );
};

const EmailVisualPreview: React.FC<{
  blocks: MailingBlockContent[];
  style: MailingProject['style'];
  activeBlockId?: string | null;
  onBlockClick?: (id: string) => void;
  onReorder?: (activeId: string, overId: string) => void;
  onBlockChange?: (blockId: string, updates: Partial<MailingBlockContent>) => void;
}> = ({ blocks, style, activeBlockId, onBlockClick, onReorder, onBlockChange }) => {
  const bodyFont = style.fontBody || 'Inter';
  const titleFont = style.fontTitle || 'Inter';
  const normalizeTag = (tag: string | undefined, fallback: 'p' | 'h1' | 'h2' | 'h3' | 'h4' = 'p') => {
    if (tag === 'h1' || tag === 'h2' || tag === 'h3' || tag === 'h4' || tag === 'p') return tag;
    return fallback;
  };
  const readSize = (value: string | undefined, fallback: number) => {
    const parsed = Number.parseInt(value || '', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  };
  const renderSemanticPreview = (
    tag: string | undefined,
    fallbackTag: 'p' | 'h1' | 'h2' | 'h3' | 'h4',
    content: React.ReactNode,
    textStyle: React.CSSProperties,
  ) => {
    const safeTag = normalizeTag(tag, fallbackTag);
    return createElement(safeTag, { style: { margin: 0, ...textStyle } }, content);
  };

  const previewSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );
  const previewBlockIds = useMemo(() => blocks.map((b) => b.id), [blocks]);

  const handlePreviewDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id && onReorder) {
      onReorder(active.id as string, over.id as string);
    }
  };

  const wrap = (id: string, children: React.ReactNode) => {
    const isActive = id === activeBlockId;
    const inner = (
      <div
        key={id}
        onClick={() => onBlockClick?.(id)}
        className={`cursor-pointer transition-all relative ${
          isActive
            ? 'ring-2 ring-blue-500 ring-offset-1 z-10'
            : 'hover:ring-1 hover:ring-blue-300 hover:z-10'
        }`}
      >
        {children}
        {/* Active indicator */}
        {isActive && (
          <div className="absolute -left-0.5 top-0 bottom-0 w-1 rounded-full" style={{ backgroundColor: '#3b82f6' }} />
        )}
      </div>
    );
    if (onReorder) {
      return <SortablePreviewBlock key={id} id={id}>{inner}</SortablePreviewBlock>;
    }
    return inner;
  };

  const wrapPreview = (id: string, el: React.ReactNode, block: MailingBlockContent, skipBg = false) => {
    const hasBg = !skipBg && (block.backgroundColor || block.backgroundImage);
    const hasPad = block.paddingTop != null || block.paddingBottom != null || block.paddingLeft != null || block.paddingRight != null;
    const inner = (hasBg || hasPad) ? (
      <div
        style={{
          backgroundColor: !skipBg ? (block.backgroundColor || undefined) : undefined,
          backgroundImage: !skipBg && block.backgroundImage ? `url(${block.backgroundImage})` : undefined,
          backgroundSize: !skipBg && block.backgroundImage ? 'cover' : undefined,
          backgroundPosition: !skipBg && block.backgroundImage ? 'center' : undefined,
          paddingTop: block.paddingTop != null ? block.paddingTop * 0.5 : undefined,
          paddingBottom: block.paddingBottom != null ? block.paddingBottom * 0.5 : undefined,
          paddingLeft: block.paddingLeft != null ? block.paddingLeft * 0.5 : undefined,
          paddingRight: block.paddingRight != null ? block.paddingRight * 0.5 : undefined,
        }}
      >
        {el}
      </div>
    ) : el;
    return wrap(id, inner);
  };

  const renderBlock = (block: MailingBlockContent) => {
    switch (block.type) {
      case 'header': {
        // Header manages its own background — backgroundColor and backgroundImage take priority over brand gradient
        const headerStyle: React.CSSProperties = block.backgroundImage
          ? { backgroundImage: `url(${block.backgroundImage})`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundColor: block.backgroundColor || style.colorPrimary }
          : block.backgroundColor
            ? { backgroundColor: block.backgroundColor }
            : { background: `linear-gradient(135deg, ${style.colorPrimary}, ${style.colorSecondary})` };
        const logoX = parseFloat(block.style?.logoX || '0');
        const logoY = parseFloat(block.style?.logoY || '0');
        const hasLogo = !!(block.imageUrl || style.logoUrl);
        return wrapPreview(block.id,
          <div style={headerStyle}>
            {!block.backgroundImage && !block.backgroundColor && (
              <div style={{ height: 3, background: 'linear-gradient(90deg, rgba(255,255,255,0.1), rgba(255,255,255,0.25), rgba(255,255,255,0.1))' }} />
            )}
            <div style={{ padding: '18px 20px 16px', position: 'relative', minHeight: 60, textAlign: (block.style?.textAlign as React.CSSProperties['textAlign']) || 'left' }}>
              {/* Logo + text as draggable sub-component */}
              <DraggableLogo
                logoUrl={hasLogo ? (block.imageUrl || style.logoUrl) : undefined}
                text={block.content || ''}
                titleFont={titleFont}
                offsetX={logoX}
                offsetY={logoY}
                textStyle={block.style}
                onDragEnd={(x, y) => {
                  onBlockChange?.(block.id, { style: { ...block.style, logoX: String(Math.round(x)), logoY: String(Math.round(y)) } });
                }}
              />
              {block.style?.headerDate !== '__hide__' && (
                <span style={{ position: 'absolute', right: 20, bottom: 16, color: 'rgba(255,255,255,.25)', fontSize: 7, fontFamily: `'${bodyFont}', sans-serif`, letterSpacing: '1px', textTransform: 'uppercase' as const }}>
                  {block.style?.headerDate || new Date().toLocaleDateString('es-ES', { month: 'short', year: 'numeric' })}
                </span>
              )}
            </div>
          </div>,
        block, true);
      }
      case 'hero': {
        const hFont = block.style?.fontFamily || titleFont;
        const hSize = block.style?.fontSize ? Math.max(parseInt(block.style.fontSize) * 0.55, 9) : 20;
        const hColor = block.style?.color || '#ffffff';
        const hAlign = (block.style?.textAlign as React.CSSProperties['textAlign']) || 'center';
        const hShadow = block.style?.imgShadow || 'none';
        const hShadowColor = block.style?.imgShadowColor || 'rgba(0,0,0,0.12)';
        const heroShadowMap: Record<string, string> = { none: 'none', sm: `0 1px 4px ${hShadowColor}`, md: `0 4px 16px ${hShadowColor}, 0 1px 4px rgba(0,0,0,0.05)`, lg: `0 12px 40px ${hShadowColor}` };
        const hBorder = (!block.style?.imgBorder || block.style.imgBorder === 'none') ? undefined : block.style.imgBorder.includes('solid') && !block.style.imgBorder.includes('#') ? block.style.imgBorder.replace('solid', `solid ${block.style?.imgBorderColor || '#d1d5db'}`) : block.style.imgBorder;
        const heroTitle = block.style?.heroTitle || '';
        const heroSubtitle = block.style?.heroSubtitle || '';
        const hasOverlay = !!(heroTitle || heroSubtitle);
        return wrapPreview(block.id,
          block.imageUrl ? (
            <div style={{ position: 'relative', overflow: 'hidden' }}>
              <img src={block.imageUrl} alt={block.content || ''} style={{
                width: block.style?.imgWidth === 'auto' ? 'auto' : `${block.style?.imgWidth || '100'}%`,
                display: 'block',
                height: block.style?.imgHeight ? `${block.style.imgHeight}px` : 'auto',
                objectFit: (block.style?.imgObjectFit as React.CSSProperties['objectFit']) || undefined,
                borderRadius: `${block.style?.imgBorderRadius || '0'}px`,
                margin: block.style?.imgAlign === 'left' ? '0 auto 0 0' : block.style?.imgAlign === 'right' ? '0 0 0 auto' : '0 auto',
                boxShadow: heroShadowMap[hShadow] || 'none',
                border: hBorder,
              }} />
              {hasOverlay && (
                <div style={{
                  position: 'absolute', inset: 0,
                  background: 'linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 60%)',
                  display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
                  padding: '20px 24px', textAlign: hAlign,
                  borderRadius: `${block.style?.imgBorderRadius || '0'}px`,
                }}>
                  {heroTitle && (
                    <div style={{
                      fontFamily: `'${hFont}', sans-serif`, fontWeight: 900, fontSize: hSize,
                      color: hColor, letterSpacing: '-0.5px', lineHeight: 1.15,
                      textTransform: (block.style?.textTransform as React.CSSProperties['textTransform']) || undefined,
                    }}>{heroTitle}</div>
                  )}
                  {heroSubtitle && (
                    <div style={{ fontFamily: `'${hFont}', sans-serif`, fontSize: Math.max(hSize * 0.55, 7), color: 'rgba(255,255,255,0.7)', marginTop: 4 }}>{heroSubtitle}</div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div style={{ background: `linear-gradient(165deg, ${darkenHex(style.colorPrimary, 0.7)}, ${darkenHex(style.colorPrimary, 0.45)}, ${darkenHex(style.colorSecondary, 0.5)})`, padding: '40px 24px 36px', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
              <div style={{ fontSize: 72, lineHeight: '1', color: 'rgba(255,255,255,0.03)', fontWeight: 900, fontFamily: `'${titleFont}', sans-serif`, marginBottom: -30 }}>+</div>
              <div style={{ display: 'inline-block', padding: '3px 12px', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 20, fontSize: 7, color: 'rgba(255,255,255,0.5)', letterSpacing: '1.5px', textTransform: 'uppercase' as const, marginBottom: 10 }}>DESTACADO</div>
              <div style={{ fontFamily: `'${titleFont}', sans-serif`, fontWeight: 900, fontSize: 20, color: '#ffffff', letterSpacing: '-0.5px', lineHeight: 1.15, marginBottom: 4 }}>
                {heroTitle || 'Imagen destacada'}
              </div>
              <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.3)' }}>Agrega una imagen hero</div>
            </div>
          ),
        block);
      }
      case 'text': {
        const hl = block.style?.headingLevel || '';
        const isTitle = hl === 'h1' || hl === 'h2' || hl === 'h3' || hl === 'h4' || block.style?.fontWeight === 'bold';
        const defaultSize = hl === 'h1' ? 32 : hl === 'h2' ? 24 : hl === 'h3' ? 20 : hl === 'h4' ? 18 : isTitle ? 24 : 16;
        const baseSize = block.style?.fontSize ? parseInt(block.style.fontSize) : defaultSize;
        const previewSize = Math.max(baseSize * 0.55, 9);
        const customFont = block.style?.fontFamily;
        return wrapPreview(block.id,
          <div style={{ padding: isTitle ? '18px 24px 2px' : '4px 24px 10px' }}>
            {isTitle && block.style?.accentBar !== 'hide' && (
              <div style={{ width: 28, height: 3, backgroundColor: block.style?.accentBarColor || style.colorPrimary, marginBottom: 10 }} />
            )}
            <div style={{
              fontFamily: customFont ? `'${customFont}', sans-serif` : (isTitle ? `'${titleFont}', sans-serif` : `'${bodyFont}', sans-serif`),
              fontSize: previewSize,
              lineHeight: isTitle ? 1.25 : 1.85,
              color: block.style?.color || (isTitle ? '#111111' : '#4a4a4a'),
              fontWeight: isTitle ? 900 : 400,
              textAlign: (block.style?.textAlign as React.CSSProperties['textAlign']) || 'left',
              letterSpacing: isTitle ? '-0.4px' : '0.01em',
              textTransform: (block.style?.textTransform as React.CSSProperties['textTransform']) || undefined,
            }}>
              {(block.content || 'Texto...').split('\n').map((line, i) => (
                <span key={i}>{line}{i < (block.content || '').split('\n').length - 1 && <br />}</span>
              ))}
            </div>
          </div>,
        block);
      }
      case 'image': {
        const iw = block.style?.imgWidth || '100';
        const ih = block.style?.imgHeight;
        const ifit = (block.style?.imgObjectFit as React.CSSProperties['objectFit']) || 'contain';
        const ibr = block.style?.imgBorderRadius || '4';
        const ialign = block.style?.imgAlign || 'center';
        const imargin = ialign === 'left' ? '0 auto 0 0' : ialign === 'right' ? '0 0 0 auto' : '0 auto';
        const ishadow = block.style?.imgShadow || 'md';
        const imgShadowColor = block.style?.imgShadowColor || 'rgba(0,0,0,0.12)';
        const shadowMap: Record<string, string> = { none: 'none', sm: `0 1px 4px ${imgShadowColor}`, md: `0 4px 16px ${imgShadowColor}, 0 1px 4px rgba(0,0,0,0.05)`, lg: `0 12px 40px ${imgShadowColor}` };
        const iborder = (!block.style?.imgBorder || block.style.imgBorder === 'none') ? undefined : block.style.imgBorder.includes('solid') && !block.style.imgBorder.includes('#') ? block.style.imgBorder.replace('solid', `solid ${block.style?.imgBorderColor || '#d1d5db'}`) : block.style.imgBorder;
        const imgFont = block.style?.fontFamily || bodyFont;
        const imgFontSize = block.style?.fontSize ? Math.max(parseInt(block.style.fontSize) * 0.55, 8) : 9;
        return wrapPreview(block.id,
          <div style={{ padding: '12px 24px' }}>
            {block.imageUrl ? (
              <>
                <img src={block.imageUrl} alt={block.content || ''} style={{ width: iw === 'auto' ? 'auto' : `${iw}%`, maxWidth: '100%', height: ih ? `${ih}px` : 'auto', objectFit: ifit, borderRadius: `${ibr}px`, display: 'block', margin: imargin, boxShadow: shadowMap[ishadow] || shadowMap.md, border: iborder }} />
                {block.content && (
                  <div style={{
                    textAlign: (block.style?.textAlign as React.CSSProperties['textAlign']) || 'center',
                    fontFamily: `'${imgFont}', sans-serif`,
                    fontSize: imgFontSize,
                    color: block.style?.color || '#888',
                    marginTop: 6,
                    fontStyle: 'italic',
                    fontWeight: block.style?.fontWeight === 'bold' ? 600 : 400,
                    textTransform: (block.style?.textTransform as React.CSSProperties['textTransform']) || undefined,
                  }}>{block.content}</div>
                )}
              </>
            ) : (
              <div style={{ background: 'linear-gradient(160deg, #f8f8fa, #eeeff2)', borderRadius: 3, height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ color: '#b0b4bc', fontSize: 9, letterSpacing: '0.5px' }}>AGREGAR IMAGEN</span>
              </div>
            )}
          </div>,
        block);
      }
      case 'bullets': {
        const bStyle = block.style?.bulletStyle || 'number';
        const badgeBg = block.style?.bulletBadgeBg || style.colorPrimary;
        const itemBg = block.style?.bulletItemBg || lightenHex(badgeBg, 0.96);
        const bulletFont = block.style?.fontFamily || bodyFont;
        const bulletFontSize = block.style?.fontSize ? Math.max(parseInt(block.style.fontSize) * 0.65, 8) : 10;
        const getBadge = (i: number) => {
          switch (bStyle) {
            case 'bullet': return '•';
            case 'letter': return String.fromCharCode(65 + i);
            case 'none': return '';
            default: return String(i + 1).padStart(2, '0');
          }
        };
        return wrapPreview(block.id,
          <div style={{ padding: '10px 24px 14px' }}>
            {(block.content || '• Item 1\n• Item 2').split('\n').filter(Boolean).map((line, i) => (
              <div key={i} style={{ display: 'flex', marginBottom: 4, borderRadius: 4, overflow: 'hidden' }}>
                {bStyle !== 'none' && (
                  <div style={{ width: 30, backgroundColor: badgeBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, padding: '6px 0' }}>
                    <span style={{ fontSize: bStyle === 'bullet' ? 12 : 8, fontWeight: 800, color: '#fff', letterSpacing: '-0.3px' }}>{getBadge(i)}</span>
                  </div>
                )}
                <div style={{ flex: 1, padding: '6px 10px', backgroundColor: itemBg, textAlign: (block.style?.textAlign as React.CSSProperties['textAlign']) || undefined }}>
                  <span style={{
                    fontFamily: `'${bulletFont}', sans-serif`,
                    fontSize: bulletFontSize,
                    color: block.style?.color || '#333',
                    lineHeight: 1.5,
                    fontWeight: block.style?.fontWeight === 'bold' ? 600 : 400,
                    textTransform: (block.style?.textTransform as React.CSSProperties['textTransform']) || undefined,
                  }}>{line.replace(/^[•\-]\s*/, '')}</span>
                </div>
              </div>
            ))}
          </div>,
        block);
      }
      case 'cta': {
        const bandColor = block.style?.bandBgColor || style.colorPrimary;
        const btnBg = block.style?.btnBgColor || '#ffffff';
        const btnTextColor = block.style?.btnTextColor || style.colorPrimary;
        const ctaFontSize = block.style?.fontSize ? Math.round(parseInt(block.style.fontSize) * 0.65) : 10;
        const ctaAlign = (block.style?.textAlign as React.CSSProperties['textAlign']) || 'center';
        const ctaFont = block.style?.fontFamily || titleFont;
        return wrapPreview(block.id,
          <div style={{ background: `linear-gradient(135deg, ${bandColor}, ${darkenHex(bandColor, 0.15)})`, padding: '20px 24px', textAlign: ctaAlign }}>
            {block.content && (
              <div style={{ fontSize: block.style?.fontSize ? Math.round(parseInt(block.style.fontSize) * 0.5) : 8, color: block.style?.color || 'rgba(255,255,255,0.6)', letterSpacing: '1.5px', textTransform: (block.style?.textTransform as React.CSSProperties['textTransform']) || 'uppercase', fontWeight: 600, marginBottom: 10, fontFamily: `'${ctaFont}', sans-serif` }}>{block.content}</div>
            )}
            <span style={{ display: 'inline-block', backgroundColor: btnBg, color: btnTextColor, padding: '8px 28px', borderRadius: 4, fontSize: ctaFontSize, fontWeight: 800, fontFamily: `'${ctaFont}', sans-serif`, letterSpacing: '0.2px', boxShadow: '0 2px 12px rgba(0,0,0,0.15)', textTransform: 'uppercase' as const }}>
              {block.ctaText || 'Más información'} →
            </span>
          </div>,
        block);
      }
      case 'event': {
        const bandColor = block.style?.bandBgColor || style.colorPrimary;
        const btnBg = block.style?.btnBgColor || '#ffffff';
        const btnTextColor = block.style?.btnTextColor || style.colorPrimary;
        const labelColor = block.style?.color || 'rgba(255,255,255,0.72)';
        const eventFont = block.style?.fontFamily || titleFont;
        const eventAlign = (block.style?.textAlign as React.CSSProperties['textAlign']) || 'left';
        const eventTitle = block.style?.eventTitle || 'Actualización científica exclusiva';
        const eventDescription = block.style?.eventDescription || 'Revisa evidencia clínica relevante y participa en una conversación práctica con especialistas.';
        const eventDate = block.style?.eventDate || 'Jueves 12 de junio';
        const eventTime = block.style?.eventTime || '19:00 h';
        const eventLocation = block.style?.eventLocation || 'Streaming en vivo';
        const eventSpeaker = block.style?.eventSpeaker || 'Dra. Valentina Rojas';
        const eventCapacity = block.style?.eventCapacity || '120 cupos';
        const eventMode = block.style?.eventMode || 'Online';
        const eventLabelTag = block.style?.eventLabelTag;
        const eventTitleTag = block.style?.eventTitleTag;
        const eventDescriptionTag = block.style?.eventDescriptionTag;
        const eventDateTag = block.style?.eventDateTag;
        const eventTimeTag = block.style?.eventTimeTag;
        const eventLabelFont = block.style?.eventLabelFont || eventFont;
        const eventTitleFont = block.style?.eventTitleFont || eventFont;
        const eventDescriptionFont = block.style?.eventDescriptionFont || bodyFont;
        const eventDateFont = block.style?.eventDateFont || eventFont;
        const eventTimeFont = block.style?.eventTimeFont || bodyFont;
        const eventMetaFont = block.style?.eventMetaFont || bodyFont;
        const eventButtonFont = block.style?.eventButtonFont || eventFont;
        const eventLabelSize = Math.max(readSize(block.style?.eventLabelSize, 12) * 0.65, 7);
        const eventTitleSize = Math.max(readSize(block.style?.eventTitleSize, 24) * 0.65, 10);
        const eventDescriptionSize = Math.max(readSize(block.style?.eventDescriptionSize, 14) * 0.65, 8);
        const eventDateSize = Math.max(readSize(block.style?.eventDateSize, 24) * 0.65, 10);
        const eventTimeSize = Math.max(readSize(block.style?.eventTimeSize, 13) * 0.65, 8);
        const eventMetaSize = Math.max(readSize(block.style?.eventMetaSize, 11) * 0.65, 7);
        const eventButtonSize = Math.max(readSize(block.style?.eventButtonSize, 14) * 0.65, 8);
        return wrapPreview(block.id,
          <div style={{ background: `linear-gradient(145deg, ${bandColor}, ${darkenHex(bandColor, 0.18)})`, padding: '22px 24px', textAlign: eventAlign, position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', right: -18, top: -22, width: 86, height: 86, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.08)' }} />
            {block.content && (
              renderSemanticPreview(eventLabelTag, 'p', block.content, {
                fontSize: eventLabelSize,
                color: labelColor,
                letterSpacing: '1.5px',
                textTransform: (block.style?.textTransform as React.CSSProperties['textTransform']) || 'uppercase',
                fontWeight: 600,
                marginBottom: 10,
                lineHeight: 1.3,
                fontFamily: `'${eventLabelFont}', sans-serif`,
              })
            )}
            <div style={{ position: 'relative', display: 'flex', alignItems: 'stretch', gap: 14, flexWrap: 'wrap' }}>
              <div style={{ minWidth: 116, backgroundColor: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 10, padding: '13px 14px', color: '#ffffff', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)' }}>
                <div style={{ fontSize: 8, opacity: 0.7, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 4 }}>Fecha</div>
                {renderSemanticPreview(eventDateTag, 'h3', eventDate, { fontSize: eventDateSize, fontWeight: 800, lineHeight: 1.25, fontFamily: `'${eventDateFont}', sans-serif` })}
                {renderSemanticPreview(eventTimeTag, 'p', eventTime, { fontSize: eventTimeSize, opacity: 0.9, marginTop: 5, lineHeight: 1.35, fontFamily: `'${eventTimeFont}', sans-serif` })}
              </div>
              <div style={{ flex: 1, minWidth: 180 }}>
                {renderSemanticPreview(eventTitleTag, 'h3', eventTitle, { fontFamily: `'${eventTitleFont}', sans-serif`, fontSize: eventTitleSize, color: '#ffffff', fontWeight: 900, lineHeight: 1.18, letterSpacing: '-0.3px' })}
                {renderSemanticPreview(eventDescriptionTag, 'p', eventDescription, { fontFamily: `'${eventDescriptionFont}', sans-serif`, fontSize: eventDescriptionSize, color: 'rgba(255,255,255,0.82)', marginTop: 7, lineHeight: 1.55, whiteSpace: 'pre-line' })}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                  {[eventMode, eventLocation, eventSpeaker, eventCapacity].filter(Boolean).slice(0, 4).map((item) => (
                    <span key={item} style={{ display: 'inline-block', padding: '4px 8px', borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.1)', fontSize: eventMetaSize, color: 'rgba(255,255,255,0.88)', lineHeight: 1.2, fontFamily: `'${eventMetaFont}', sans-serif` }}>
                      {item}
                    </span>
                  ))}
                </div>
              </div>
              <div style={{ alignSelf: 'center' }}>
                <span style={{ display: 'inline-block', backgroundColor: btnBg, color: btnTextColor, padding: '8px 22px', borderRadius: 4, fontSize: eventButtonSize, fontWeight: 800, fontFamily: `'${eventButtonFont}', sans-serif`, letterSpacing: '0.2px', boxShadow: '0 2px 12px rgba(0,0,0,0.15)', textTransform: 'uppercase' as const }}>
                  {block.ctaText || 'Inscribirse'}
                </span>
              </div>
            </div>
          </div>,
        block);
      }
      case 'speaker': {
        const speakerName = block.style?.speakerName || 'Dra. Valentina Rojas';
        const speakerRole = block.style?.speakerRole || 'Especialista invitada';
        const speakerOrg = block.style?.speakerOrg || 'Hospital Clínico';
        const speakerBio = block.style?.speakerBio || 'Compartirá una mirada clínica práctica sobre evidencia reciente y aplicación en pacientes reales.';
        const imageShape = block.style?.speakerImageShape || 'circle';
        const cardBg = block.style?.speakerCardBg || '#f8fafc';
        const speakerVariant = block.style?.speakerVariant || 'classic';
        const speakerBg = speakerVariant === 'spotlight'
          ? `linear-gradient(135deg, ${style.colorPrimary}, ${darkenHex(style.colorPrimary, 0.12)})`
          : cardBg;
        const speakerNameColor = speakerVariant === 'spotlight' ? '#ffffff' : '#111827';
        const speakerMetaColor = speakerVariant === 'spotlight' ? 'rgba(255,255,255,0.82)' : style.colorPrimary;
        const speakerBioColor = speakerVariant === 'spotlight' ? 'rgba(255,255,255,0.9)' : '#4b5563';
        const speakerLabelTag = block.style?.speakerLabelTag;
        const speakerNameTag = block.style?.speakerNameTag;
        const speakerMetaTag = block.style?.speakerMetaTag;
        const speakerBioTag = block.style?.speakerBioTag;
        const speakerLabelFont = block.style?.speakerLabelFont || titleFont;
        const speakerNameFont = block.style?.speakerNameFont || titleFont;
        const speakerMetaFont = block.style?.speakerMetaFont || bodyFont;
        const speakerBioFont = block.style?.speakerBioFont || bodyFont;
        const speakerLabelSize = Math.max(readSize(block.style?.speakerLabelSize, 12) * 0.65, 7);
        const speakerNameSize = Math.max(readSize(block.style?.speakerNameSize, speakerVariant === 'spotlight' ? 28 : 26) * 0.65, 10);
        const speakerMetaSize = Math.max(readSize(block.style?.speakerMetaSize, 14) * 0.65, 8);
        const speakerBioSize = Math.max(readSize(block.style?.speakerBioSize, 14) * 0.65, 8);
        return wrapPreview(block.id,
          <div style={{ padding: '18px 24px' }}>
            <div style={{ background: speakerBg, borderRadius: 16, border: speakerVariant === 'spotlight' ? 'none' : `1px solid ${style.colorPrimary}18`, padding: '18px', display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              <div style={{ width: speakerVariant === 'spotlight' ? 86 : 64, height: speakerVariant === 'spotlight' ? 86 : 64, borderRadius: imageShape === 'circle' ? 999 : 14, background: speakerVariant === 'spotlight' ? 'rgba(255,255,255,0.12)' : `linear-gradient(135deg, ${style.colorPrimary}22, ${style.colorSecondary}28)`, overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {block.imageUrl ? (
                  <img src={block.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <span style={{ fontSize: speakerVariant === 'spotlight' ? 22 : 16, fontWeight: 800, color: speakerVariant === 'spotlight' ? '#ffffff' : style.colorPrimary }}>{speakerName.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('').slice(0, 2) || 'SP'}</span>
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                {block.content && (
                  renderSemanticPreview(speakerLabelTag, 'p', block.content, {
                    fontSize: speakerLabelSize,
                    letterSpacing: '1.5px',
                    textTransform: 'uppercase',
                    color: speakerVariant === 'spotlight' ? 'rgba(255,255,255,0.72)' : style.colorPrimary,
                    fontWeight: 700,
                    marginBottom: 6,
                    lineHeight: 1.3,
                    fontFamily: `'${speakerLabelFont}', sans-serif`,
                  })
                )}
                {renderSemanticPreview(speakerNameTag, 'h3', speakerName, { fontFamily: `'${speakerNameFont}', sans-serif`, fontSize: speakerNameSize, color: speakerNameColor, fontWeight: 900, lineHeight: 1.2 })}
                {renderSemanticPreview(speakerMetaTag, 'p', `${speakerRole}${speakerOrg ? ` · ${speakerOrg}` : ''}`, { fontFamily: `'${speakerMetaFont}', sans-serif`, fontSize: speakerMetaSize, color: speakerMetaColor, fontWeight: 700, marginTop: 5, lineHeight: 1.4 })}
                {renderSemanticPreview(speakerBioTag, 'p', speakerBio, { fontFamily: `'${speakerBioFont}', sans-serif`, fontSize: speakerBioSize, color: speakerBioColor, marginTop: 8, lineHeight: 1.55, whiteSpace: 'pre-line' })}
              </div>
            </div>
          </div>,
        block);
      }
      case 'divider':
        return wrapPreview(block.id,
          <div style={{ padding: '10px 24px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, height: 1, backgroundColor: block.style?.dividerColor || '#e5e5ea' }} />
            <div style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: block.style?.dividerDotColor || style.colorPrimary, flexShrink: 0 }} />
            <div style={{ flex: 1, height: 1, backgroundColor: block.style?.dividerColor || '#e5e5ea' }} />
          </div>,
        block);
      case 'spacer': {
        const spacerH = parseInt(block.style?.spacerHeight || '32') / 2 || 16;
        const spacerBg = block.style?.spacerColor || undefined;
        return wrapPreview(block.id,
          <div style={{ height: Math.max(spacerH, 12), backgroundColor: spacerBg, position: 'relative' }}>
            {/* Always-visible dashed guide so user can click/select */}
            <div style={{
              position: 'absolute', inset: 0,
              border: '1px dashed #d1d5db',
              borderRadius: 4,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ fontSize: 8, color: '#9ca3af', letterSpacing: '0.5px', textTransform: 'uppercase' as const, userSelect: 'none' }}>
                ↕ {block.style?.spacerHeight || '32'}px
              </span>
            </div>
          </div>,
        block);
      }
      case 'footer': {
        const fFont = block.style?.fontFamily || bodyFont;
        const fSize = block.style?.fontSize ? Math.max(parseInt(block.style.fontSize) * 0.55, 7) : 8;
        const fColor = block.style?.color || 'rgba(255,255,255,0.25)';
        const fLinks = block.socialLinks ?? [{ platform: 'linkedin', url: '#' }, { platform: 'instagram', url: '#' }, { platform: 'web', url: '#' }];
        const fBtnColor = block.style?.socialBtnColor || 'rgba(255,255,255,0.5)';
        const fBtnBorder = block.style?.socialBtnColor || 'rgba(255,255,255,0.12)';
        const socialSvgsFooter: Record<string, string> = {
          linkedin: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>`,
          instagram: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>`,
          facebook: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>`,
          twitter: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>`,
          youtube: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>`,
          tiktok: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg>`,
          web: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>`,
          email: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 7l-8.97 5.7a1.94 1.94 0 01-2.06 0L2 7"/></svg>`,
        };
        const qrUrl = block.style?.footerQrUrl;
        const companyInfo = block.style?.footerCompanyInfo;
        return wrapPreview(block.id,
          <div>
            <div style={{ height: 2, background: `linear-gradient(90deg, ${style.colorPrimary}, ${style.colorSecondary}, ${style.colorPrimary})` }} />
            <div style={{ backgroundColor: '#111117', padding: '18px 20px 16px', textAlign: 'center' }}>
              {style.logoUrl && (<img src={style.logoUrl} alt="" style={{ height: 16, margin: '0 auto 10px', display: 'block', opacity: 0.5 }} />)}
              {fLinks.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  {fLinks.map(({ platform }, idx) => (
                    <span key={`${platform}-${idx}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '3px 10px', margin: '0 2px 2px', fontSize: 7, color: fBtnColor, border: `1px solid ${fBtnBorder}`, borderRadius: 12, fontWeight: 600, letterSpacing: '0.3px' }}>
                      <span style={{ width: 10, height: 10, display: 'inline-block' }} dangerouslySetInnerHTML={{ __html: (socialSvgsFooter[platform.toLowerCase()] || socialSvgsFooter.web).replace('currentColor', fBtnColor) }} />
                      {platform.charAt(0).toUpperCase() + platform.slice(1)}
                    </span>
                  ))}
                </div>
              )}
              <div style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginBottom: 10 }} />
              {qrUrl && (
                <div style={{ marginBottom: 10 }}>
                  <img src={`https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encodeURIComponent(qrUrl)}&bgcolor=111117&color=ffffff`} alt="QR" style={{ width: 50, height: 50, display: 'block', margin: '0 auto 4px', opacity: 0.6 }} />
                  <div style={{ fontSize: 6, color: 'rgba(255,255,255,0.2)', letterSpacing: '0.5px' }}>Escanea para más info</div>
                </div>
              )}
              <div style={{ fontFamily: `'${fFont}', sans-serif`, fontSize: fSize, color: fColor, lineHeight: 1.7, fontWeight: block.style?.fontWeight === 'bold' ? 700 : 400, textAlign: (block.style?.textAlign as React.CSSProperties['textAlign']) || 'center', textTransform: (block.style?.textTransform as React.CSSProperties['textTransform']) || undefined }}>
                {(block.content || 'Material exclusivo para profesionales de la salud.').split('\n').map((l, i) => (
                  <span key={i}>{l}{i < (block.content || '').split('\n').length - 1 && <br />}</span>
                ))}
              </div>
              {companyInfo && (
                <div style={{ fontFamily: `'${fFont}', sans-serif`, fontSize: Math.max(fSize - 1, 6), color: 'rgba(255,255,255,0.15)', lineHeight: 1.6, marginTop: 8, borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: 8 }}>
                  {companyInfo.split('\n').map((l, i) => (
                    <span key={i}>{l}{i < companyInfo.split('\n').length - 1 && <br />}</span>
                  ))}
                </div>
              )}
              <div style={{ fontSize: 7, color: 'rgba(255,255,255,0.12)', marginTop: 6, letterSpacing: '1.5px', textTransform: 'uppercase' as const }}>
                © {new Date().getFullYear()} TODOS LOS DERECHOS RESERVADOS
              </div>
            </div>
          </div>,
        block);
      }
      case 'quote': {
        const qIcon = block.style?.quoteIcon || '❝';
        const qBg = block.style?.quoteBg || lightenHex(style.colorPrimary, 0.95);
        const qBorder = block.style?.quoteBorder || style.colorPrimary;
        const qAuthorColor = block.style?.quoteAuthorColor || style.colorPrimary;
        const qFont = block.style?.fontFamily || bodyFont;
        const qSize = block.style?.fontSize ? Math.max(parseInt(block.style.fontSize) * 0.6, 9) : 11;
        return wrapPreview(block.id,
          <div style={{ backgroundColor: qBg, borderLeft: `5px solid ${qBorder}`, padding: '18px 22px 14px', borderRadius: 6 }}>
            {qIcon !== 'none' && (
              <div style={{ fontSize: 30, lineHeight: '1', color: qBorder, opacity: 0.2, marginBottom: 4 }}>{qIcon}</div>
            )}
            <div style={{
              fontFamily: `'${qFont}', sans-serif`,
              fontStyle: 'italic',
              fontSize: qSize,
              color: block.style?.color || '#333',
              lineHeight: 1.7,
              fontWeight: block.style?.fontWeight === 'bold' ? 700 : 400,
              textAlign: (block.style?.textAlign as React.CSSProperties['textAlign']) || undefined,
              textTransform: (block.style?.textTransform as React.CSSProperties['textTransform']) || undefined,
            }}>
              {(block.content || 'Cita...').split('\n').map((line, i) => (
                <span key={i}>{line}{i < (block.content || '').split('\n').length - 1 && <br />}</span>
              ))}
            </div>
            {block.quoteAuthor && (
              <div style={{ fontSize: 8, color: qAuthorColor, fontWeight: 700, marginTop: 8, letterSpacing: '1px', textTransform: 'uppercase' as const }}>— {block.quoteAuthor}</div>
            )}
          </div>,
        block);
      }
      case 'social': {
        const links = block.socialLinks ?? [{ platform: 'linkedin', url: '#' }, { platform: 'instagram', url: '#' }, { platform: 'web', url: '#' }];
        const socialSvgs: Record<string, string> = {
          linkedin: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>`,
          instagram: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>`,
          facebook: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>`,
          twitter: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>`,
          youtube: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>`,
          tiktok: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg>`,
          web: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>`,
          email: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 7l-8.97 5.7a1.94 1.94 0 01-2.06 0L2 7"/></svg>`,
        };
        const btnColor = block.style?.socialBtnColor || style.colorPrimary;
        const btnStyle = block.style?.socialBtnStyle || 'outline';
        const btnShape = block.style?.socialBtnShape || 'pill';
        const btnSize = block.style?.socialBtnSize || 'md';
        const sizeMap: Record<string, { p: string; fs: number; icon: number }> = { sm: { p: '3px 8px', fs: 7, icon: 10 }, md: { p: '5px 12px', fs: 8, icon: 12 }, lg: { p: '7px 16px', fs: 9, icon: 14 } };
        const sz = sizeMap[btnSize] || sizeMap.md;
        const shapeMap: Record<string, number> = { pill: 50, rounded: 6, square: 0 };
        const br = shapeMap[btnShape] ?? 50;
        const isFilled = btnStyle === 'filled';
        const isIconOnly = btnStyle === 'icon-only';
        const socialTextFont = block.style?.fontFamily || bodyFont;
        const socialTextSize = block.style?.fontSize ? Math.max(parseInt(block.style.fontSize) * 0.55, 7) : 8;
        const socialTextColor = block.style?.color || '#999';
        return wrapPreview(block.id,
          <div style={{ padding: '14px 24px', textAlign: 'center' }}>
            {block.content && (<div style={{ fontFamily: `'${socialTextFont}', sans-serif`, fontSize: socialTextSize, color: socialTextColor, marginBottom: 8, letterSpacing: '1px', textTransform: (block.style?.textTransform as React.CSSProperties['textTransform']) || 'uppercase', fontWeight: block.style?.fontWeight === 'bold' ? 700 : 400 }}>{block.content}</div>)}
            <div>
              {links.map(({ platform }, idx) => (
                <span key={`${platform}-${idx}`} style={{
                  display: 'inline-flex', alignItems: 'center', gap: isIconOnly ? 0 : 4,
                  padding: isIconOnly ? `${sz.icon * 0.6}px` : sz.p, margin: '0 2px 3px',
                  fontSize: sz.fs, color: isFilled ? '#fff' : btnColor,
                  backgroundColor: isFilled ? btnColor : 'transparent',
                  border: isIconOnly ? 'none' : `1.5px solid ${btnColor}`,
                  borderRadius: br, fontWeight: 700, letterSpacing: '0.2px',
                }}>
                  <span style={{ width: sz.icon, height: sz.icon, display: 'inline-block', flexShrink: 0 }} dangerouslySetInnerHTML={{ __html: (socialSvgs[platform.toLowerCase()] || socialSvgs.web).replace('currentColor', isFilled ? '#fff' : btnColor) }} />
                  {!isIconOnly && <span>{platform.charAt(0).toUpperCase() + platform.slice(1)}</span>}
                </span>
              ))}
            </div>
          </div>,
        block);
      }
      case 'video': {
        const vFont = block.style?.fontFamily || titleFont;
        const vSize = block.style?.fontSize ? Math.max(parseInt(block.style.fontSize) * 0.65, 8) : 10;
        const vColor = block.style?.color || 'rgba(255,255,255,0.85)';
        const vAlign = (block.style?.textAlign as React.CSSProperties['textAlign']) || 'center';
        const embedUrl = getVideoEmbedUrl(block.videoUrl);
        const isVideoActive = block.id === activeBlockId || !onBlockClick;
        return wrapPreview(block.id,
          <div style={{ padding: '12px 24px' }}>
            {embedUrl ? (
              <div style={{ borderRadius: 4, overflow: 'hidden', position: 'relative' }}>
                <iframe
                  src={embedUrl}
                  style={{ width: '100%', aspectRatio: '16/9', border: 'none', borderRadius: 4, display: 'block', pointerEvents: isVideoActive ? 'auto' : 'none' }}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  title={block.content || 'Video'}
                />
                {block.content && (
                  <div style={{ textAlign: vAlign, padding: '6px 8px', background: 'rgba(0,0,0,0.7)', position: 'absolute', bottom: 0, left: 0, right: 0 }}>
                    <span style={{
                      fontFamily: `'${vFont}', sans-serif`,
                      fontWeight: block.style?.fontWeight === 'bold' ? 900 : 700,
                      fontSize: vSize,
                      color: vColor,
                      letterSpacing: '0.3px',
                      textTransform: (block.style?.textTransform as React.CSSProperties['textTransform']) || undefined,
                    }}>{block.content}</span>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ borderRadius: 4, overflow: 'hidden', position: 'relative', background: block.imageUrl ? undefined : `linear-gradient(160deg, ${darkenHex(style.colorPrimary, 0.65)}, #111117, ${darkenHex(style.colorSecondary, 0.6)})`, textAlign: vAlign }}>
                {block.imageUrl && (
                  <img src={block.imageUrl} alt="" style={{ width: '100%', display: 'block', borderRadius: 4 }} />
                )}
                <div style={{ position: block.imageUrl ? 'absolute' : 'relative', inset: 0, display: 'flex', flexDirection: 'column', alignItems: vAlign === 'left' ? 'flex-start' : vAlign === 'right' ? 'flex-end' : 'center', justifyContent: 'center', padding: '28px 24px', background: block.imageUrl ? 'rgba(0,0,0,0.45)' : undefined, borderRadius: 4 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 18, border: '2px solid rgba(255,255,255,0.5)', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.85)', lineHeight: 1 }}>▶</span>
                  </div>
                  <div style={{
                    fontFamily: `'${vFont}', sans-serif`,
                    fontWeight: block.style?.fontWeight === 'bold' ? 900 : 700,
                    fontSize: vSize,
                    color: vColor,
                    letterSpacing: '0.3px',
                    textTransform: (block.style?.textTransform as React.CSSProperties['textTransform']) || undefined,
                  }}>{block.content || 'Ver video'}</div>
                </div>
              </div>
            )}
          </div>,
        block);
      }
      case 'columns': {
        const cols = (block.content || '').split('|||').map((c) => c.trim());
        const colFont = block.style?.fontFamily || bodyFont;
        return wrapPreview(block.id,
          <div style={{ padding: '10px 24px', display: 'flex', gap: 8 }}>
            <div style={{ flex: 1, fontFamily: `'${colFont}', sans-serif`, fontSize: block.style?.fontSize ? parseInt(block.style.fontSize) * 0.65 : 10, color: block.style?.color || '#4a4a4a', lineHeight: 1.7, textAlign: (block.style?.textAlign as React.CSSProperties['textAlign']) || undefined, fontWeight: block.style?.fontWeight === 'bold' ? 700 : 400, textTransform: (block.style?.textTransform as React.CSSProperties['textTransform']) || undefined }}>
              {(cols[0] || 'Columna izquierda').split('\n').map((l, i) => (<span key={i}>{l}{i < (cols[0] || '').split('\n').length - 1 && <br />}</span>))}
            </div>
            <div style={{ width: 2, backgroundColor: lightenHex(style.colorPrimary, 0.7), flexShrink: 0 }} />
            <div style={{ flex: 1, fontFamily: `'${colFont}', sans-serif`, fontSize: block.style?.fontSize ? parseInt(block.style.fontSize) * 0.65 : 10, color: block.style?.color || '#4a4a4a', lineHeight: 1.7, textAlign: (block.style?.textAlign as React.CSSProperties['textAlign']) || undefined, fontWeight: block.style?.fontWeight === 'bold' ? 700 : 400, textTransform: (block.style?.textTransform as React.CSSProperties['textTransform']) || undefined }}>
              {(cols[1] || 'Columna derecha').split('\n').map((l, i) => (<span key={i}>{l}{i < (cols[1] || '').split('\n').length - 1 && <br />}</span>))}
            </div>
          </div>,
        block);
      }
      default:
        return wrapPreview(block.id,
          <div style={{ padding: '6px 24px', fontSize: 10, color: '#6b7280' }}>{block.content}</div>,
        block);
    }
  };

  // Check if first block is a header with custom background — if so, skip the top accent strip
  const firstBlock = blocks[0];
  const headerHasCustomBg = firstBlock?.type === 'header' && (firstBlock.backgroundColor || firstBlock.backgroundImage);

  return (
    <div style={{ fontFamily: `'${bodyFont}', Arial, sans-serif`, backgroundColor: '#0d0d11', padding: '0 0 12px' }}>
      {/* Top accent strip — hidden when header has custom bg */}
      {!headerHasCustomBg && (
        <div
          style={{
            height: 4,
            background: `linear-gradient(90deg, ${style.colorPrimary}, ${style.colorSecondary}, ${style.colorPrimary})`,
          }}
        />
      )}

      {/* Email body container */}
      <div style={{ backgroundColor: style.colorBackground ?? '#fff' }}>
        {onReorder ? (
          <DndContext sensors={previewSensors} collisionDetection={closestCenter} onDragEnd={handlePreviewDragEnd}>
            <SortableContext items={previewBlockIds} strategy={verticalListSortingStrategy}>
              {blocks.map((block) => {
                return renderBlock(block);
              })}
            </SortableContext>
          </DndContext>
        ) : (
          blocks.map((block) => renderBlock(block))
        )}
      </div>

      {/* Unsubscribe line */}
      <div style={{ textAlign: 'center', padding: '10px 20px 0', fontSize: 7, color: 'rgba(255,255,255,0.2)' }}>
        Cancelar suscripción
      </div>
    </div>
  );
};

// ── Block Editor Panel — Professional ────────────────────

const BlockEditor: React.FC<{
  block: MailingBlockContent;
  style: MailingProject['style'];
  onChange: (updates: Partial<MailingBlockContent>) => void;
  tenantId: string;
  brand: Brand | null;
  subject: string;
  allBlocks: MailingBlockContent[];
}> = ({ block, style, onChange, tenantId, brand, subject, allBlocks }) => {
  const imgInputRef = useRef<HTMLInputElement>(null);
  const bgImgInputRef = useRef<HTMLInputElement>(null);
  const [uploadingImg, setUploadingImg] = useState(false);
  const [uploadingBgImg, setUploadingBgImg] = useState(false);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImg(true);
    try {
      const ext = file.name.split('.').pop() ?? 'png';
      const path = `mailing/${tenantId}/${Date.now()}.${ext}`;
      const url = await uploadFile(file, path);
      onChange({ imageUrl: url });
    } catch {
      alert('Error al subir la imagen.');
    } finally {
      setUploadingImg(false);
      if (imgInputRef.current) imgInputRef.current.value = '';
    }
  };

  const handleBgImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingBgImg(true);
    try {
      const ext = file.name.split('.').pop() ?? 'png';
      const path = `mailing/${tenantId}/bg_${Date.now()}.${ext}`;
      const url = await uploadFile(file, path);
      onChange({ backgroundImage: url });
    } catch {
      alert('Error al subir la imagen de fondo.');
    } finally {
      setUploadingBgImg(false);
      if (bgImgInputRef.current) bgImgInputRef.current.value = '';
    }
  };

  // ── AI Copy Suggestion state ──
  const [aiSuggestions, setAiSuggestions] = useState<CopySuggestion[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');


  const canSuggest = ['text', 'bullets', 'cta', 'event', 'speaker', 'header', 'hero', 'footer', 'quote'].includes(block.type);
  const isTitle = block.type === 'header' || block.type === 'hero' || (block.type === 'text' && block.style?.fontWeight === 'bold');
  const commonFonts = ['Inter', 'Arial', 'Helvetica', 'Georgia', 'Times New Roman', 'Verdana', 'Trebuchet MS', 'Tahoma', 'Courier New', 'Palatino', 'Garamond'];
  const fontOptions = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    const add = (f?: string) => {
      if (!f) return;
      if (seen.has(f)) return;
      seen.add(f);
      out.push(f);
    };
    add(style.fontTitle);
    add(style.fontBody);
    commonFonts.forEach(add);
    return out;
  }, [style.fontTitle, style.fontBody]);

  const renderSemanticTextControls = (
    label: string,
    cfg: {
      tagKey?: string;
      fontKey: string;
      sizeKey: string;
      defaultTag?: 'p' | 'h1' | 'h2' | 'h3' | 'h4';
      defaultSize: number;
      defaultFontHint: string;
    },
  ) => {
    const currentTag = (cfg.tagKey ? block.style?.[cfg.tagKey] : undefined) || cfg.defaultTag || 'p';
    const currentFont = block.style?.[cfg.fontKey] || '';
    const currentSize = Number.parseInt(block.style?.[cfg.sizeKey] || '', 10) || cfg.defaultSize;

    return (
      <div className="rounded-lg border border-gray-100 p-2.5 bg-gray-50/50 space-y-2">
        <label className="block text-[10px] font-semibold text-gray-500">{label}</label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {cfg.tagKey && (
            <select
              value={currentTag}
              onChange={(e) => {
                const s = { ...block.style };
                const next = e.target.value;
                if (next === (cfg.defaultTag || 'p')) delete s[cfg.tagKey!];
                else s[cfg.tagKey!] = next;
                onChange({ style: s });
              }}
              className="px-2 py-1.5 rounded-lg border border-gray-200 text-[10px] focus:outline-none focus:border-blue-400"
            >
              <option value="p">Párrafo (p)</option>
              <option value="h1">Título (h1)</option>
              <option value="h2">Subtítulo (h2)</option>
              <option value="h3">Sección (h3)</option>
              <option value="h4">Detalle (h4)</option>
            </select>
          )}
          <select
            value={currentFont}
            onChange={(e) => {
              const s = { ...block.style };
              if (!e.target.value) delete s[cfg.fontKey];
              else s[cfg.fontKey] = e.target.value;
              onChange({ style: s });
            }}
            className="px-2 py-1.5 rounded-lg border border-gray-200 text-[10px] focus:outline-none focus:border-blue-400"
          >
            <option value="">Fuente por defecto ({cfg.defaultFontHint})</option>
            {fontOptions.map((font) => (
              <option key={font} value={font}>{font}</option>
            ))}
          </select>
          <input
            type="number"
            min={10}
            max={72}
            value={currentSize}
            onChange={(e) => {
              const s = { ...block.style };
              const next = Number.parseInt(e.target.value, 10);
              if (!Number.isFinite(next) || next <= 0 || next === cfg.defaultSize) delete s[cfg.sizeKey];
              else s[cfg.sizeKey] = String(next);
              onChange({ style: s });
            }}
            className="px-2 py-1.5 rounded-lg border border-gray-200 text-[10px] focus:outline-none focus:border-blue-400"
            placeholder={`${cfg.defaultSize}px`}
          />
        </div>
      </div>
    );
  };

  const handleSuggestCopy = async () => {
    if (!brand) return;
    setAiLoading(true);
    setAiError('');
    setAiSuggestions([]);
    try {
      // Gather brand claims
      const claims = brand.params.claims?.map((c) => c.text) ?? [];

      // Gather approved insights for brand's molecule
      let insightTexts: string[] = [];
      try {
        const approvedInsights = await getInsightsByStatus(brand.moleculeId, 'approved');
        insightTexts = approvedInsights.slice(0, 10).map((i) => i.text);
      } catch { /* no insights available */ }

      // Knowledge bank content
      try {
        const knowledge = await getBrandKnowledge(tenantId, brand.id);
        const knowledgeTexts = knowledge.slice(0, 5).map((k) => k.content).filter(Boolean);
        if (knowledgeTexts.length) insightTexts.push(...knowledgeTexts.map((t) => t.slice(0, 200)));
      } catch { /* no knowledge available */ }

      // Other block contents (to avoid repetition)
      const otherContents = allBlocks
        .filter((b) => b.id !== block.id && b.content)
        .map((b) => b.content);

      const suggestions = await suggestBlockCopy({
        blockType: block.type,
        currentContent: block.content,
        subject,
        brand: { name: brand.name, params: brand.params },
        otherBlockContents: otherContents,
        claims,
        insights: insightTexts,
        isTitle,
      });
      setAiSuggestions(suggestions);
    } catch (err) {
      console.error('AI suggestion error:', err);
      setAiError('Error al generar sugerencias. Intenta de nuevo.');
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-gray-50 bg-gray-50/50 flex items-center gap-2.5 flex-shrink-0">
        <span className="text-base">{BLOCK_ICONS[block.type]}</span>
        <div>
          <h3 className="text-sm font-bold text-gray-800">{BLOCK_LABELS[block.type]}</h3>
          <p className="text-[10px] text-gray-400">Edita el contenido de este bloque</p>
        </div>
        <span
          className="ml-auto w-3 h-3 rounded-full"
          style={{ backgroundColor: style.colorPrimary }}
        />
      </div>

      <div className="p-5 space-y-4">
        {/* ── Content textarea (text, bullets, header, footer) ── */}
        {(block.type === 'text' || block.type === 'bullets' || block.type === 'header' || block.type === 'footer') && (
          <div>
            <label className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-semibold text-gray-500">Contenido</span>
              {block.style?.fontWeight === 'bold' && (
                <span className="text-[9px] px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded font-bold">TÍTULO</span>
              )}
            </label>
            <textarea
              value={block.content}
              onChange={(e) => onChange({ content: e.target.value })}
              rows={block.type === 'bullets' ? 6 : block.type === 'footer' || block.type === 'header' ? 2 : 4}
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm leading-relaxed focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition resize-none"
              placeholder={
                block.type === 'bullets' ? 'Un beneficio por línea...' :
                block.type === 'header' ? 'Nombre de marca o título' :
                block.type === 'footer' ? 'Texto legal o disclaimer' :
                'Escribe tu contenido aquí...'
              }
              style={{
                fontFamily: block.style?.fontWeight === 'bold'
                  ? `'${style.fontTitle}', sans-serif`
                  : `'${style.fontBody}', sans-serif`,
              }}
            />
            {block.type === 'bullets' && (
              <p className="text-[10px] text-gray-400 mt-1">Un punto por línea.</p>
            )}
          </div>
        )}

        {/* ── Footer specific controls ── */}
        {block.type === 'footer' && (
          <>
            {/* Social links for footer */}
            <div className="pt-2 border-t border-gray-100">
              <label className="block text-[11px] font-semibold text-gray-500 mb-2">Redes sociales del footer</label>
              {(block.socialLinks ?? [{ platform: 'linkedin', url: '' }, { platform: 'instagram', url: '' }, { platform: 'web', url: '' }]).map(
                (link, idx) => (
                  <div key={idx} className="flex items-center gap-2 mb-2">
                    <select
                      value={link.platform}
                      onChange={(e) => {
                        const links = [...(block.socialLinks ?? [{ platform: 'linkedin', url: '' }, { platform: 'instagram', url: '' }, { platform: 'web', url: '' }])];
                        links[idx] = { ...links[idx], platform: e.target.value };
                        onChange({ socialLinks: links });
                      }}
                      className="px-2 py-1.5 rounded-lg border border-gray-200 text-xs focus:outline-none focus:border-blue-400"
                    >
                      {['linkedin', 'instagram', 'facebook', 'twitter', 'youtube', 'tiktok', 'web', 'email'].map((p) => (
                        <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                      ))}
                    </select>
                    <input
                      value={link.url}
                      onChange={(e) => {
                        const links = [...(block.socialLinks ?? [{ platform: 'linkedin', url: '' }, { platform: 'instagram', url: '' }, { platform: 'web', url: '' }])];
                        links[idx] = { ...links[idx], url: e.target.value };
                        onChange({ socialLinks: links });
                      }}
                      className="flex-1 px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs focus:outline-none focus:border-blue-400"
                      placeholder="https://..."
                    />
                    <button
                      onClick={() => {
                        const links = [...(block.socialLinks ?? [{ platform: 'linkedin', url: '' }, { platform: 'instagram', url: '' }, { platform: 'web', url: '' }])];
                        links.splice(idx, 1);
                        onChange({ socialLinks: links });
                      }}
                      className="p-1 text-red-400 hover:text-red-600 transition text-xs"
                    >✕</button>
                  </div>
                ),
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const links = [...(block.socialLinks ?? [{ platform: 'linkedin', url: '' }, { platform: 'instagram', url: '' }, { platform: 'web', url: '' }])];
                    links.push({ platform: 'web', url: '' });
                    onChange({ socialLinks: links });
                  }}
                  className="text-[11px] text-blue-600 hover:text-blue-800 font-medium transition"
                >
                  + Agregar red social
                </button>
                {block.socialLinks && block.socialLinks.length > 0 && (
                  <button
                    onClick={() => onChange({ socialLinks: [] })}
                    className="text-[11px] text-gray-400 hover:text-red-500 font-medium transition"
                  >
                    Quitar todas
                  </button>
                )}
              </div>
              {/* Button color */}
              <div className="flex items-center gap-2 mt-2">
                <label className="text-[10px] text-gray-400">Color botones</label>
                <input
                  type="color"
                  value={(() => {
                    const c = block.style?.socialBtnColor;
                    if (!c || c.startsWith('rgba')) return '#ffffff';
                    return c;
                  })()}
                  onChange={(e) => onChange({ style: { ...block.style, socialBtnColor: e.target.value } })}
                  className="w-6 h-6 rounded border border-gray-200 cursor-pointer"
                />
                {block.style?.socialBtnColor && (
                  <button onClick={() => { const s = { ...block.style }; delete s.socialBtnColor; onChange({ style: s }); }} className="text-[10px] text-gray-400 hover:text-red-500">✕</button>
                )}
              </div>
            </div>

            {/* QR Code */}
            <div className="pt-2 border-t border-gray-100">
              <label className="block text-[11px] font-semibold text-gray-500 mb-1.5">Código QR <span className="font-normal text-gray-400">(opcional)</span></label>
              <input
                value={block.style?.footerQrUrl || ''}
                onChange={(e) => onChange({ style: { ...block.style, footerQrUrl: e.target.value } })}
                className="w-full px-3.5 py-2 rounded-xl border border-gray-200 text-xs focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition"
                placeholder="https://link-del-producto.com"
              />
              <p className="text-[10px] text-gray-400 mt-1">Se generará un QR automáticamente con este URL</p>
              {block.style?.footerQrUrl && (
                <div className="mt-2 flex items-center gap-3">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(block.style.footerQrUrl)}&bgcolor=111117&color=ffffff`}
                    alt="QR Preview"
                    className="w-16 h-16 rounded-lg border border-gray-200"
                  />
                  <div>
                    <input
                      value={block.style?.footerQrLabel || ''}
                      onChange={(e) => onChange({ style: { ...block.style, footerQrLabel: e.target.value } })}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs focus:outline-none focus:border-blue-400"
                      placeholder="Etiqueta QR (ej: Escanea para más info)"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Company info */}
            <div className="pt-2 border-t border-gray-100">
              <label className="block text-[11px] font-semibold text-gray-500 mb-1.5">Información de la empresa <span className="font-normal text-gray-400">(regulatorio)</span></label>
              <textarea
                value={block.style?.footerCompanyInfo || ''}
                onChange={(e) => onChange({ style: { ...block.style, footerCompanyInfo: e.target.value } })}
                rows={3}
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-xs leading-relaxed focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition resize-none"
                placeholder="Razón social, dirección, teléfono, registro sanitario..."
              />
              <p className="text-[10px] text-gray-400 mt-1">Información obligatoria por regulación en comunicados</p>
            </div>
          </>
        )}

        {/* ── Bullets style controls ── */}
        {block.type === 'bullets' && (
          <div className="space-y-3">
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 mb-1.5">Estilo de viñeta</label>
              <div className="flex gap-1">
                {([['number', '01 Números'], ['bullet', '• Viñetas'], ['letter', 'A Letras'], ['none', '— Sin viñeta']] as const).map(([val, label]) => (
                  <button
                    key={val}
                    onClick={() => onChange({ style: { ...block.style, bulletStyle: val } })}
                    className={`flex-1 py-1.5 text-[9px] font-semibold rounded-lg border transition ${
                      (block.style?.bulletStyle || 'number') === val
                        ? 'bg-blue-50 border-blue-300 text-blue-700'
                        : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 mb-1.5">Color fondo de items</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={block.style?.bulletItemBg || lightenHex(style.colorPrimary, 0.96)}
                  onChange={(e) => onChange({ style: { ...block.style, bulletItemBg: e.target.value } })}
                  className="w-7 h-7 rounded-lg border border-gray-200 cursor-pointer"
                />
                <input
                  value={block.style?.bulletItemBg || ''}
                  onChange={(e) => onChange({ style: { ...block.style, bulletItemBg: e.target.value } })}
                  placeholder="Por defecto"
                  className="flex-1 px-2 py-1.5 rounded-lg border border-gray-200 text-[10px] focus:outline-none focus:border-blue-400"
                />
                {block.style?.bulletItemBg && (
                  <button onClick={() => { const s = { ...block.style }; delete s.bulletItemBg; onChange({ style: s }); }} className="text-[10px] text-gray-400 hover:text-red-500">✕</button>
                )}
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 mb-1.5">Color fondo de viñeta</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={block.style?.bulletBadgeBg || style.colorPrimary}
                  onChange={(e) => onChange({ style: { ...block.style, bulletBadgeBg: e.target.value } })}
                  className="w-7 h-7 rounded-lg border border-gray-200 cursor-pointer"
                />
                <input
                  value={block.style?.bulletBadgeBg || ''}
                  onChange={(e) => onChange({ style: { ...block.style, bulletBadgeBg: e.target.value } })}
                  placeholder={style.colorPrimary}
                  className="flex-1 px-2 py-1.5 rounded-lg border border-gray-200 text-[10px] focus:outline-none focus:border-blue-400"
                />
                {block.style?.bulletBadgeBg && (
                  <button onClick={() => { const s = { ...block.style }; delete s.bulletBadgeBg; onChange({ style: s }); }} className="text-[10px] text-gray-400 hover:text-red-500">✕</button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Image upload + URL (hero, image) ── */}
        {(block.type === 'hero' || block.type === 'image' || block.type === 'speaker') && (
          <>
            {/* Hero overlay text fields */}
            {block.type === 'hero' && (
              <>
                <div>
                  <label className="block text-[11px] font-semibold text-gray-500 mb-1.5">Título sobre imagen</label>
                  <input
                    value={block.style?.heroTitle || ''}
                    onChange={(e) => onChange({ style: { ...block.style, heroTitle: e.target.value } })}
                    className="w-full px-3.5 py-2 rounded-xl border border-gray-200 text-sm font-bold focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition"
                    placeholder="Título destacado..."
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-gray-500 mb-1.5">Subtítulo</label>
                  <input
                    value={block.style?.heroSubtitle || ''}
                    onChange={(e) => onChange({ style: { ...block.style, heroSubtitle: e.target.value } })}
                    className="w-full px-3.5 py-2 rounded-xl border border-gray-200 text-xs focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition"
                    placeholder="Subtítulo opcional..."
                  />
                </div>
              </>
            )}
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 mb-1.5">Imagen</label>
              <input ref={imgInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />

              {block.imageUrl ? (
                <div className="relative group">
                  <img
                    src={block.imageUrl}
                    alt=""
                    className="w-full h-32 object-cover rounded-xl border border-gray-100"
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition rounded-xl flex items-center justify-center gap-2">
                    <button
                      onClick={() => imgInputRef.current?.click()}
                      className="px-3 py-1.5 bg-white text-gray-800 text-xs font-semibold rounded-lg shadow"
                    >
                      Cambiar
                    </button>
                    <button
                      onClick={() => onChange({ imageUrl: '' })}
                      className="px-3 py-1.5 bg-red-500 text-white text-xs font-semibold rounded-lg shadow"
                    >
                      Quitar
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => imgInputRef.current?.click()}
                  disabled={uploadingImg}
                  className="w-full h-28 border-2 border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center gap-1.5 hover:border-blue-300 hover:bg-blue-50/30 transition"
                >
                  {uploadingImg ? (
                    <svg className="animate-spin w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  ) : (
                    <>
                      <svg className="w-6 h-6 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <span className="text-[11px] text-gray-400 font-medium">Subir imagen</span>
                      <span className="text-[9px] text-gray-300">JPG, PNG, WebP</span>
                    </>
                  )}
                </button>
              )}
            </div>

            {/* Or paste URL */}
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 mb-1.5">O pegar URL</label>
              <input
                value={block.imageUrl ?? ''}
                onChange={(e) => onChange({ imageUrl: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl border border-gray-200 text-xs focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition"
                placeholder="https://..."
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-gray-500 mb-1.5">Leyenda / Texto alt</label>
              <input
                value={block.content}
                onChange={(e) => onChange({ content: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl border border-gray-200 text-xs focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition"
                placeholder="Leyenda debajo de la imagen"
              />
            </div>

            {/* ── Image display controls ── */}
            {block.imageUrl && (
              <div className="pt-3 border-t border-gray-100">
                <div className="flex items-center gap-2 mb-2.5">
                  <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Visualización</span>
                </div>
                <div className="space-y-3">
                  {/* Object fit */}
                  <div>
                    <label className="block text-[10px] text-gray-400 mb-1">Encuadre</label>
                    <div className="flex gap-1">
                      {([['contain', '↔ Completa'], ['cover', '⬛ Recortar'], ['fill', '↕ Estirar']] as const).map(([fit, label]) => (
                        <button
                          key={fit}
                          onClick={() => onChange({ style: { ...block.style, imgObjectFit: fit } })}
                          className={`flex-1 py-1.5 text-[10px] font-semibold rounded-lg border transition ${
                            (block.style?.imgObjectFit || 'contain') === fit
                              ? 'bg-blue-50 border-blue-300 text-blue-700'
                              : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Fixed height (enables cover/fill crop) */}
                  <div>
                    <label className="block text-[10px] text-gray-400 mb-1">Alto fijo (px)</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min="80"
                        max="600"
                        step="10"
                        value={block.style?.imgHeight || '0'}
                        onChange={(e) => onChange({ style: { ...block.style, imgHeight: e.target.value === '0' ? '' : e.target.value } })}
                        className="flex-1 h-1.5 accent-blue-500"
                      />
                      <span className="text-[11px] font-mono text-gray-500 w-10 text-right">
                        {block.style?.imgHeight ? `${block.style.imgHeight}px` : 'Auto'}
                      </span>
                      {block.style?.imgHeight && (
                        <button onClick={() => { const s = { ...block.style }; delete s.imgHeight; onChange({ style: s }); }} className="text-[10px] text-gray-400 hover:text-red-500">✕</button>
                      )}
                    </div>
                  </div>
                  {/* Width */}
                  <div>
                    <label className="block text-[10px] text-gray-400 mb-1">Ancho</label>
                    <div className="flex gap-1">
                      {([['100', '100%'], ['75', '75%'], ['50', '50%'], ['auto', 'Auto']] as const).map(([w, label]) => (
                        <button
                          key={w}
                          onClick={() => onChange({ style: { ...block.style, imgWidth: w } })}
                          className={`flex-1 py-1.5 text-[10px] font-semibold rounded-lg border transition ${
                            (block.style?.imgWidth || '100') === w
                              ? 'bg-blue-50 border-blue-300 text-blue-700'
                              : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Alignment */}
                  <div>
                    <label className="block text-[10px] text-gray-400 mb-1">Alineación</label>
                    <div className="flex gap-1">
                      {([['left', '≡ Izq'], ['center', '≡ Centro'], ['right', '≡ Der']] as const).map(([align, label]) => (
                        <button
                          key={align}
                          onClick={() => onChange({ style: { ...block.style, imgAlign: align } })}
                          className={`flex-1 py-1.5 text-[10px] font-semibold rounded-lg border transition ${
                            (block.style?.imgAlign || 'center') === align
                              ? 'bg-blue-50 border-blue-300 text-blue-700'
                              : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Border radius */}
                  <div>
                    <label className="block text-[10px] text-gray-400 mb-1">Redondeo de esquinas</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min="0"
                        max="50"
                        value={block.style?.imgBorderRadius || '4'}
                        onChange={(e) => onChange({ style: { ...block.style, imgBorderRadius: e.target.value } })}
                        className="flex-1 h-1.5 accent-blue-500"
                      />
                      <span className="text-[11px] font-mono text-gray-500 w-8 text-right">
                        {block.style?.imgBorderRadius || '4'}px
                      </span>
                    </div>
                  </div>
                  {/* Border */}
                  <div>
                    <label className="block text-[10px] text-gray-400 mb-1">Borde</label>
                    <div className="flex gap-1">
                      {([['none', 'Ninguno'], ['1px solid #e5e7eb', 'Sutil'], ['2px solid #d1d5db', 'Normal'], ['3px solid', 'Grueso']] as const).map(([val, label]) => (
                        <button
                          key={val}
                          onClick={() => onChange({ style: { ...block.style, imgBorder: val } })}
                          className={`flex-1 py-1.5 text-[10px] font-semibold rounded-lg border transition ${
                            (block.style?.imgBorder || 'none') === val
                              ? 'bg-blue-50 border-blue-300 text-blue-700'
                              : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    {block.style?.imgBorder && block.style.imgBorder !== 'none' && (
                      <div className="flex items-center gap-2 mt-1.5">
                        <label className="text-[10px] text-gray-400">Color</label>
                        <input
                          type="color"
                          value={block.style?.imgBorderColor || '#d1d5db'}
                          onChange={(e) => onChange({ style: { ...block.style, imgBorderColor: e.target.value } })}
                          className="w-6 h-6 rounded border border-gray-200 cursor-pointer"
                        />
                      </div>
                    )}
                  </div>
                  {/* Shadow */}
                  <div>
                    <label className="block text-[10px] text-gray-400 mb-1">Sombra</label>
                    <div className="flex gap-1">
                      {([['none', 'Ninguna'], ['sm', 'Suave'], ['md', 'Media'], ['lg', 'Grande']] as const).map(([val, label]) => (
                        <button
                          key={val}
                          onClick={() => onChange({ style: { ...block.style, imgShadow: val } })}
                          className={`flex-1 py-1.5 text-[10px] font-semibold rounded-lg border transition ${
                            (block.style?.imgShadow || 'md') === val
                              ? 'bg-blue-50 border-blue-300 text-blue-700'
                              : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    {block.style?.imgShadow !== 'none' && (
                      <div className="flex items-center gap-2 mt-1.5">
                        <label className="text-[10px] text-gray-400">Color sombra</label>
                        <input
                          type="color"
                          value={block.style?.imgShadowColor ? (block.style.imgShadowColor.startsWith('#') ? block.style.imgShadowColor : '#000000') : '#000000'}
                          onChange={(e) => {
                            const hex = e.target.value;
                            const r = parseInt(hex.slice(1, 3), 16);
                            const g = parseInt(hex.slice(3, 5), 16);
                            const b = parseInt(hex.slice(5, 7), 16);
                            onChange({ style: { ...block.style, imgShadowColor: `rgba(${r},${g},${b},0.15)` } });
                          }}
                          className="w-6 h-6 rounded border border-gray-200 cursor-pointer"
                        />
                        {block.style?.imgShadowColor && (
                          <button onClick={() => { const s = { ...block.style }; delete s.imgShadowColor; onChange({ style: s }); }} className="text-[10px] text-gray-400 hover:text-red-500">✕</button>
                        )}
                      </div>
                    )}
                  </div>
                  {/* Preview */}
                  <div className="pt-1">
                    <label className="block text-[10px] text-gray-400 mb-1.5">Preview</label>
                    <div className="bg-gray-50 rounded-xl p-3 flex justify-center">
                      <img
                        src={block.imageUrl}
                        alt=""
                        style={{
                          width: block.style?.imgWidth === 'auto' ? 'auto' : `${block.style?.imgWidth || '100'}%`,
                          maxWidth: '100%',
                          height: block.style?.imgHeight ? `${block.style.imgHeight}px` : 'auto',
                          objectFit: (block.style?.imgObjectFit as React.CSSProperties['objectFit']) || 'contain',
                          borderRadius: `${block.style?.imgBorderRadius || '4'}px`,
                          border: block.style?.imgBorder === 'none' ? 'none' : (block.style?.imgBorder?.includes('solid') ? block.style.imgBorder.replace('solid', `solid ${block.style?.imgBorderColor || '#d1d5db'}`) : undefined),
                          boxShadow: (() => { const sc = block.style?.imgShadowColor || 'rgba(0,0,0,0.12)'; const sh = block.style?.imgShadow || 'md'; if (sh === 'none') return 'none'; if (sh === 'sm') return `0 1px 4px ${sc}`; if (sh === 'lg') return `0 12px 40px ${sc}`; return `0 4px 16px ${sc}`; })(),
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── CTA / Event controls ── */}
        {(block.type === 'cta' || block.type === 'event') && (
          <>
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 mb-1.5">Etiqueta superior <span className="font-normal text-gray-400">(opcional)</span></label>
              <input
                value={block.content}
                onChange={(e) => onChange({ content: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition"
                placeholder={block.type === 'event' ? 'Ej: EVENTO MÉDICO' : 'Ej: DESCUBRE MÁS'}
              />
              <p className="text-[10px] text-gray-400 mt-0.5">Texto encima del botón. Déjalo vacío para ocultarlo.</p>
            </div>
            {block.type === 'event' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-semibold text-gray-500 mb-1.5">Título del evento</label>
                  <input
                    value={block.style?.eventTitle || ''}
                    onChange={(e) => onChange({ style: { ...block.style, eventTitle: e.target.value } })}
                    className="w-full px-3.5 py-2 rounded-xl border border-gray-200 text-sm font-semibold focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition"
                    placeholder="Actualización científica exclusiva"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-semibold text-gray-500 mb-1.5">Descripción breve</label>
                  <textarea
                    value={block.style?.eventDescription || ''}
                    onChange={(e) => onChange({ style: { ...block.style, eventDescription: e.target.value } })}
                    rows={3}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm leading-relaxed focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition resize-none"
                    placeholder="Resume por qué vale la pena asistir al evento."
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-gray-500 mb-1.5">Fecha</label>
                  <input
                    value={block.style?.eventDate || ''}
                    onChange={(e) => onChange({ style: { ...block.style, eventDate: e.target.value } })}
                    className="w-full px-3.5 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition"
                    placeholder="Jueves 12 de junio"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-gray-500 mb-1.5">Horario</label>
                  <input
                    value={block.style?.eventTime || ''}
                    onChange={(e) => onChange({ style: { ...block.style, eventTime: e.target.value } })}
                    className="w-full px-3.5 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition"
                    placeholder="19:00 h"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-semibold text-gray-500 mb-1.5">Lugar / modalidad</label>
                  <input
                    value={block.style?.eventLocation || ''}
                    onChange={(e) => onChange({ style: { ...block.style, eventLocation: e.target.value } })}
                    className="w-full px-3.5 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition"
                    placeholder="Auditorio Central o streaming en vivo"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-gray-500 mb-1.5">Speaker / ponente</label>
                  <input
                    value={block.style?.eventSpeaker || ''}
                    onChange={(e) => onChange({ style: { ...block.style, eventSpeaker: e.target.value } })}
                    className="w-full px-3.5 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition"
                    placeholder="Dra. Valentina Rojas"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-gray-500 mb-1.5">Cupos</label>
                  <input
                    value={block.style?.eventCapacity || ''}
                    onChange={(e) => onChange({ style: { ...block.style, eventCapacity: e.target.value } })}
                    className="w-full px-3.5 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition"
                    placeholder="120 cupos"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-semibold text-gray-500 mb-1.5">Modalidad</label>
                  <input
                    value={block.style?.eventMode || ''}
                    onChange={(e) => onChange({ style: { ...block.style, eventMode: e.target.value } })}
                    className="w-full px-3.5 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition"
                    placeholder="Online, Presencial o Híbrido"
                  />
                </div>
              </div>
            )}
            {block.type === 'event' && (
              <div className="pt-2 border-t border-gray-100 space-y-2">
                <label className="block text-[11px] font-semibold text-gray-500">Jerarquía y tipografía del evento</label>
                {renderSemanticTextControls('Etiqueta superior', {
                  tagKey: 'eventLabelTag',
                  fontKey: 'eventLabelFont',
                  sizeKey: 'eventLabelSize',
                  defaultTag: 'p',
                  defaultSize: 12,
                  defaultFontHint: style.fontTitle,
                })}
                {renderSemanticTextControls('Título del evento', {
                  tagKey: 'eventTitleTag',
                  fontKey: 'eventTitleFont',
                  sizeKey: 'eventTitleSize',
                  defaultTag: 'h3',
                  defaultSize: 24,
                  defaultFontHint: style.fontTitle,
                })}
                {renderSemanticTextControls('Descripción', {
                  tagKey: 'eventDescriptionTag',
                  fontKey: 'eventDescriptionFont',
                  sizeKey: 'eventDescriptionSize',
                  defaultTag: 'p',
                  defaultSize: 14,
                  defaultFontHint: style.fontBody,
                })}
                {renderSemanticTextControls('Fecha', {
                  tagKey: 'eventDateTag',
                  fontKey: 'eventDateFont',
                  sizeKey: 'eventDateSize',
                  defaultTag: 'h3',
                  defaultSize: 24,
                  defaultFontHint: style.fontTitle,
                })}
                {renderSemanticTextControls('Horario', {
                  tagKey: 'eventTimeTag',
                  fontKey: 'eventTimeFont',
                  sizeKey: 'eventTimeSize',
                  defaultTag: 'p',
                  defaultSize: 13,
                  defaultFontHint: style.fontBody,
                })}
                {renderSemanticTextControls('Chips informativos', {
                  fontKey: 'eventMetaFont',
                  sizeKey: 'eventMetaSize',
                  defaultSize: 11,
                  defaultFontHint: style.fontBody,
                })}
                {renderSemanticTextControls('Texto del botón', {
                  fontKey: 'eventButtonFont',
                  sizeKey: 'eventButtonSize',
                  defaultSize: 14,
                  defaultFontHint: style.fontTitle,
                })}
              </div>
            )}
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 mb-1.5">Texto del botón</label>
              <input
                value={block.ctaText ?? ''}
                onChange={(e) => onChange({ ctaText: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition"
                placeholder={block.type === 'event' ? 'Inscribirse' : 'Más información'}
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 mb-1.5">URL del botón</label>
              <input
                value={block.ctaUrl ?? ''}
                onChange={(e) => onChange({ ctaUrl: e.target.value })}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && !/^https?:\/\//i.test(v) && v !== '#') {
                    onChange({ ctaUrl: `https://${v}` });
                  }
                }}
                className={`w-full px-3.5 py-2 rounded-xl border text-xs focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition ${
                  !block.ctaUrl ? 'border-amber-300 bg-amber-50/50' : 'border-gray-200'
                }`}
                placeholder="https://..."
              />
              {!block.ctaUrl && (
                <p className="text-[10px] text-amber-600 mt-0.5">⚠ Agrega una URL para que el botón funcione</p>
              )}
            </div>
          </>
        )}

        {/* ── Logo override for header ── */}
        {block.type === 'header' && (
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 mb-1.5">
              Logo del encabezado
            </label>

            {/* Current logo preview */}
            {(block.imageUrl || style.logoUrl) && (
              <div className="flex items-center gap-2 mb-2">
                <img
                  src={block.imageUrl || style.logoUrl}
                  alt="Logo"
                  className="h-10 w-auto object-contain rounded-lg border border-gray-100 bg-white p-1"
                />
                {block.imageUrl && (
                  <button
                    onClick={() => onChange({ imageUrl: '' })}
                    className="text-[10px] text-red-500 hover:text-red-700 font-medium transition"
                  >
                    Quitar
                  </button>
                )}
              </div>
            )}

            {/* Brand logos grid */}
            {(() => {
              const allLogos: { label: string; url: string }[] = [];
              if (brand?.params.logoUrl) allLogos.push({ label: 'Logo principal', url: brand.params.logoUrl });
              if (brand?.params.logos?.length) allLogos.push(...brand.params.logos);
              if (allLogos.length === 0) return null;
              return (
                <div className="mb-2">
                  <span className="text-[10px] text-gray-400 mb-1.5 block">Logos de la marca</span>
                  <div className="grid grid-cols-3 gap-1.5">
                    {allLogos.map((logo, idx) => {
                      const isSelected = block.imageUrl === logo.url || (!block.imageUrl && logo.url === style.logoUrl);
                      return (
                        <button
                          key={idx}
                          onClick={() => onChange({ imageUrl: logo.url })}
                          className={`rounded-lg border p-1.5 flex flex-col items-center gap-1 transition-all ${
                            isSelected
                              ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500/30'
                              : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          <img src={logo.url} alt={logo.label} className="h-8 w-auto max-w-full object-contain" />
                          <span className={`text-[9px] leading-tight text-center truncate w-full ${isSelected ? 'text-blue-700 font-semibold' : 'text-gray-500'}`}>
                            {logo.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Upload custom logo */}
            <input ref={imgInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
            <button
              onClick={() => imgInputRef.current?.click()}
              className="text-[11px] text-blue-600 hover:text-blue-800 font-medium transition flex items-center gap-1"
            >
              <span>📤</span> Subir otro logo
            </button>

            {/* Header background image */}
            <div className="mt-3 pt-3 border-t border-gray-100">
              <label className="block text-[11px] font-semibold text-gray-500 mb-1.5">Imagen de fondo</label>
              {block.backgroundImage ? (
                <div className="relative group mb-1.5">
                  <img src={block.backgroundImage} alt="" className="w-full h-20 object-cover rounded-lg border border-gray-100" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition rounded-lg flex items-center justify-center">
                    <button onClick={() => onChange({ backgroundImage: undefined })} className="px-2.5 py-1 bg-red-500 text-white text-[10px] font-semibold rounded-md shadow">Quitar</button>
                  </div>
                </div>
              ) : (
                <input
                  value=""
                  onChange={(e) => onChange({ backgroundImage: e.target.value })}
                  placeholder="URL de imagen..."
                  className="w-full px-3 py-1.5 rounded-lg border border-gray-200 text-[11px] focus:outline-none focus:border-blue-400 mb-1"
                />
              )}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                id="header-bg-upload"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    const ext = file.name.split('.').pop() ?? 'png';
                    const path = `mailing/${tenantId}/${Date.now()}_bg.${ext}`;
                    const url = await uploadFile(file, path);
                    onChange({ backgroundImage: url });
                  } catch { /* ignore */ }
                  e.target.value = '';
                }}
              />
              <button
                onClick={() => (document.getElementById('header-bg-upload') as HTMLInputElement)?.click()}
                className="text-[11px] text-blue-600 hover:text-blue-800 font-medium transition flex items-center gap-1"
              >
                <span>🖼️</span> Subir imagen de fondo
              </button>
            </div>

            {/* Logo position (drag & drop) */}
            <div className="mt-3 pt-3 border-t border-gray-100">
              <label className="block text-[11px] font-semibold text-gray-500 mb-1.5">
                Posición del logo
                <span className="font-normal text-gray-400 ml-1">(arrastra en el preview)</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] text-gray-400 mb-0.5">X (horizontal)</label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      value={parseInt(block.style?.logoX || '0')}
                      onChange={(e) => onChange({ style: { ...block.style, logoX: e.target.value || '0' } })}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-[11px] font-mono focus:outline-none focus:border-blue-400"
                    />
                    <span className="text-[10px] text-gray-400">px</span>
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] text-gray-400 mb-0.5">Y (vertical)</label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      value={parseInt(block.style?.logoY || '0')}
                      onChange={(e) => onChange({ style: { ...block.style, logoY: e.target.value || '0' } })}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-[11px] font-mono focus:outline-none focus:border-blue-400"
                    />
                    <span className="text-[10px] text-gray-400">px</span>
                  </div>
                </div>
              </div>
              {(block.style?.logoX !== '0' && block.style?.logoX) || (block.style?.logoY !== '0' && block.style?.logoY) ? (
                <button
                  onClick={() => onChange({ style: { ...block.style, logoX: '0', logoY: '0' } })}
                  className="text-[10px] text-gray-400 hover:text-red-500 mt-1.5 transition"
                >
                  ↩ Restablecer posición
                </button>
              ) : null}
            </div>

            {/* Header date text */}
            <div className="mt-3 pt-3 border-t border-gray-100">
              <label className="block text-[11px] font-semibold text-gray-500 mb-1.5">Texto de fecha</label>
              <div className="flex items-center gap-2">
                <input
                  value={block.style?.headerDate === '__hide__' ? '' : (block.style?.headerDate || '')}
                  onChange={(e) => onChange({ style: { ...block.style, headerDate: e.target.value } })}
                  placeholder={new Date().toLocaleDateString('es-ES', { month: 'short', year: 'numeric' })}
                  disabled={block.style?.headerDate === '__hide__'}
                  className="flex-1 px-3 py-1.5 rounded-lg border border-gray-200 text-[11px] focus:outline-none focus:border-blue-400 disabled:opacity-40 disabled:bg-gray-50"
                />
              </div>
              <div className="flex items-center gap-3 mt-1.5">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={block.style?.headerDate !== '__hide__'}
                    onChange={(e) => {
                      if (e.target.checked) {
                        const s = { ...block.style }; delete s.headerDate; onChange({ style: s });
                      } else {
                        onChange({ style: { ...block.style, headerDate: '__hide__' } });
                      }
                    }}
                    className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-[10px] text-gray-500">Mostrar fecha</span>
                </label>
                <p className="text-[10px] text-gray-400">Vacío = fecha automática</p>
              </div>
            </div>
          </div>
        )}

        {/* ── Speaker block ── */}
        {block.type === 'speaker' && (
          <>
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 mb-1.5">Etiqueta superior <span className="font-normal text-gray-400">(opcional)</span></label>
              <input
                value={block.content}
                onChange={(e) => onChange({ content: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition"
                placeholder="Ej: SPEAKER INVITADO"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 mb-1.5">Nombre</label>
              <input
                value={block.style?.speakerName || ''}
                onChange={(e) => onChange({ style: { ...block.style, speakerName: e.target.value } })}
                className="w-full px-3.5 py-2 rounded-xl border border-gray-200 text-sm font-semibold focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition"
                placeholder="Dra. Valentina Rojas"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 mb-1.5">Cargo</label>
                <input
                  value={block.style?.speakerRole || ''}
                  onChange={(e) => onChange({ style: { ...block.style, speakerRole: e.target.value } })}
                  className="w-full px-3.5 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition"
                  placeholder="Especialista invitada"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 mb-1.5">Institución</label>
                <input
                  value={block.style?.speakerOrg || ''}
                  onChange={(e) => onChange({ style: { ...block.style, speakerOrg: e.target.value } })}
                  className="w-full px-3.5 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition"
                  placeholder="Hospital Clínico"
                />
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 mb-1.5">Bio breve</label>
              <textarea
                value={block.style?.speakerBio || ''}
                onChange={(e) => onChange({ style: { ...block.style, speakerBio: e.target.value } })}
                rows={4}
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm leading-relaxed focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition resize-none"
                placeholder="Resumen profesional del speaker y por qué vale la pena escucharlo."
              />
            </div>
            <div className="pt-2 border-t border-gray-100 space-y-2">
              <label className="block text-[11px] font-semibold text-gray-500">Jerarquía y tipografía del speaker</label>
              {renderSemanticTextControls('Etiqueta superior', {
                tagKey: 'speakerLabelTag',
                fontKey: 'speakerLabelFont',
                sizeKey: 'speakerLabelSize',
                defaultTag: 'p',
                defaultSize: 12,
                defaultFontHint: style.fontTitle,
              })}
              {renderSemanticTextControls('Nombre', {
                tagKey: 'speakerNameTag',
                fontKey: 'speakerNameFont',
                sizeKey: 'speakerNameSize',
                defaultTag: 'h3',
                defaultSize: 26,
                defaultFontHint: style.fontTitle,
              })}
              {renderSemanticTextControls('Cargo e institución', {
                tagKey: 'speakerMetaTag',
                fontKey: 'speakerMetaFont',
                sizeKey: 'speakerMetaSize',
                defaultTag: 'p',
                defaultSize: 14,
                defaultFontHint: style.fontBody,
              })}
              {renderSemanticTextControls('Biografía', {
                tagKey: 'speakerBioTag',
                fontKey: 'speakerBioFont',
                sizeKey: 'speakerBioSize',
                defaultTag: 'p',
                defaultSize: 14,
                defaultFontHint: style.fontBody,
              })}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 mb-1.5">Variante visual</label>
                <div className="flex gap-1">
                  {([['classic', 'Classic'], ['spotlight', 'Spotlight']] as const).map(([val, label]) => (
                    <button
                      key={val}
                      onClick={() => onChange({ style: { ...block.style, speakerVariant: val } })}
                      className={`flex-1 py-1.5 text-[10px] font-semibold rounded-lg border transition ${
                        (block.style?.speakerVariant || 'classic') === val
                          ? 'bg-blue-50 border-blue-300 text-blue-700'
                          : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 mb-1.5">Forma de imagen</label>
                <div className="flex gap-1">
                  {([['circle', 'Circular'], ['rounded', 'Redondeada']] as const).map(([val, label]) => (
                    <button
                      key={val}
                      onClick={() => onChange({ style: { ...block.style, speakerImageShape: val } })}
                      className={`flex-1 py-1.5 text-[10px] font-semibold rounded-lg border transition ${
                        (block.style?.speakerImageShape || 'circle') === val
                          ? 'bg-blue-50 border-blue-300 text-blue-700'
                          : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 mb-1.5">Fondo de tarjeta</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={block.style?.speakerCardBg || '#f8fafc'}
                    onChange={(e) => onChange({ style: { ...block.style, speakerCardBg: e.target.value } })}
                    className="w-8 h-8 rounded-lg border border-gray-200 cursor-pointer"
                  />
                  <input
                    value={block.style?.speakerCardBg || ''}
                    onChange={(e) => onChange({ style: { ...block.style, speakerCardBg: e.target.value } })}
                    className="flex-1 px-2.5 py-2 rounded-lg border border-gray-200 text-xs focus:outline-none focus:border-blue-400"
                    placeholder="#f8fafc"
                  />
                </div>
              </div>
            </div>
          </>
        )}

        {/* ── Quote block ── */}
        {block.type === 'quote' && (
          <>
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 mb-1.5">Cita</label>
              <textarea
                value={block.content}
                onChange={(e) => onChange({ content: e.target.value })}
                rows={3}
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm italic leading-relaxed focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition resize-none"
                placeholder="Escribe la cita aquí..."
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 mb-1.5">Autor</label>
              <input
                value={block.quoteAuthor ?? ''}
                onChange={(e) => onChange({ quoteAuthor: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition"
                placeholder="Dr. Juan Pérez"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 mb-1.5">Ícono decorativo</label>
              <div className="flex gap-1 flex-wrap">
                {([['❝', '❝'], ['💬', '💬'], ['🗣️', '🗣️'], ['💡', '💡'], ['✦', '✦'], ['★', '★'], ['🔬', '🔬'], ['🧬', '🧬'], ['none', 'Sin ícono']] as const).map(([val, label]) => (
                  <button
                    key={val}
                    onClick={() => onChange({ style: { ...block.style, quoteIcon: val } })}
                    className={`px-2.5 py-1.5 text-xs rounded-lg border transition ${
                      (block.style?.quoteIcon || '❝') === val
                        ? 'bg-blue-50 border-blue-300 text-blue-700'
                        : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 mb-1.5">Fondo de la cita</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={block.style?.quoteBg || lightenHex(style.colorPrimary, 0.95)}
                    onChange={(e) => onChange({ style: { ...block.style, quoteBg: e.target.value } })}
                    className="w-7 h-7 rounded-lg border border-gray-200 cursor-pointer"
                  />
                  <input
                    value={block.style?.quoteBg || ''}
                    onChange={(e) => onChange({ style: { ...block.style, quoteBg: e.target.value } })}
                    placeholder="Por defecto"
                    className="flex-1 px-2 py-1.5 rounded-lg border border-gray-200 text-[10px] focus:outline-none focus:border-blue-400"
                  />
                  {block.style?.quoteBg && (
                    <button onClick={() => { const s = { ...block.style }; delete s.quoteBg; onChange({ style: s }); }} className="text-[10px] text-gray-400 hover:text-red-500">✕</button>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 mb-1.5">Color del borde</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={block.style?.quoteBorder || style.colorPrimary}
                    onChange={(e) => onChange({ style: { ...block.style, quoteBorder: e.target.value } })}
                    className="w-7 h-7 rounded-lg border border-gray-200 cursor-pointer"
                  />
                  <input
                    value={block.style?.quoteBorder || ''}
                    onChange={(e) => onChange({ style: { ...block.style, quoteBorder: e.target.value } })}
                    placeholder={style.colorPrimary}
                    className="flex-1 px-2 py-1.5 rounded-lg border border-gray-200 text-[10px] focus:outline-none focus:border-blue-400"
                  />
                  {block.style?.quoteBorder && (
                    <button onClick={() => { const s = { ...block.style }; delete s.quoteBorder; onChange({ style: s }); }} className="text-[10px] text-gray-400 hover:text-red-500">✕</button>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 mb-1.5">Color del autor</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={block.style?.quoteAuthorColor || style.colorPrimary}
                    onChange={(e) => onChange({ style: { ...block.style, quoteAuthorColor: e.target.value } })}
                    className="w-7 h-7 rounded-lg border border-gray-200 cursor-pointer"
                  />
                  <input
                    value={block.style?.quoteAuthorColor || ''}
                    onChange={(e) => onChange({ style: { ...block.style, quoteAuthorColor: e.target.value } })}
                    placeholder={style.colorPrimary}
                    className="flex-1 px-2 py-1.5 rounded-lg border border-gray-200 text-[10px] focus:outline-none focus:border-blue-400"
                  />
                  {block.style?.quoteAuthorColor && (
                    <button onClick={() => { const s = { ...block.style }; delete s.quoteAuthorColor; onChange({ style: s }); }} className="text-[10px] text-gray-400 hover:text-red-500">✕</button>
                  )}
                </div>
              </div>
            </div>
            {/* Quote live preview */}
            <div>
              <label className="block text-[10px] text-gray-400 mb-1.5">Preview</label>
              <div
                className="rounded-xl p-4 relative overflow-hidden"
                style={{
                  backgroundColor: block.style?.quoteBg || lightenHex(style.colorPrimary, 0.95),
                  borderLeft: `5px solid ${block.style?.quoteBorder || style.colorPrimary}`,
                }}
              >
                {(block.style?.quoteIcon || '❝') !== 'none' && (
                  <div style={{ fontSize: 28, lineHeight: 1, marginBottom: -8, opacity: 0.2, color: block.style?.quoteBorder || style.colorPrimary }}>{block.style?.quoteIcon || '❝'}</div>
                )}
                <div className="text-xs italic" style={{ color: block.style?.color || '#333' }}>
                  {block.content?.slice(0, 60) || 'Tu cita aquí...'}
                  {(block.content?.length || 0) > 60 ? '...' : ''}
                </div>
                {block.quoteAuthor && (
                  <div className="text-[9px] font-bold mt-2 uppercase tracking-wider" style={{ color: block.style?.quoteAuthorColor || style.colorPrimary }}>
                    — {block.quoteAuthor}
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* ── Social links block ── */}
        {block.type === 'social' && (
          <>
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 mb-1.5">Texto (opcional)</label>
              <input
                value={block.content}
                onChange={(e) => onChange({ content: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition"
                placeholder="Síguenos en redes sociales"
              />
            </div>

            {/* ── Button style controls ── */}
            <div className="pt-2 border-t border-gray-100 space-y-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Estilo de botones</span>
              </div>
              {/* Style */}
              <div>
                <label className="block text-[10px] text-gray-400 mb-1">Estilo</label>
                <div className="flex gap-1">
                  {([['outline', 'Borde'], ['filled', 'Relleno'], ['icon-only', 'Solo icono']] as const).map(([val, label]) => (
                    <button key={val}
                      onClick={() => onChange({ style: { ...block.style, socialBtnStyle: val } })}
                      className={`flex-1 py-1.5 text-[10px] font-semibold rounded-lg border transition ${(block.style?.socialBtnStyle || 'outline') === val ? 'bg-blue-50 border-blue-300 text-blue-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                    >{label}</button>
                  ))}
                </div>
              </div>
              {/* Shape */}
              <div>
                <label className="block text-[10px] text-gray-400 mb-1">Forma</label>
                <div className="flex gap-1">
                  {([['pill', 'Píldora'], ['rounded', 'Redondeado'], ['square', 'Cuadrado']] as const).map(([val, label]) => (
                    <button key={val}
                      onClick={() => onChange({ style: { ...block.style, socialBtnShape: val } })}
                      className={`flex-1 py-1.5 text-[10px] font-semibold rounded-lg border transition ${(block.style?.socialBtnShape || 'pill') === val ? 'bg-blue-50 border-blue-300 text-blue-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                    >{label}</button>
                  ))}
                </div>
              </div>
              {/* Size */}
              <div>
                <label className="block text-[10px] text-gray-400 mb-1">Tamaño</label>
                <div className="flex gap-1">
                  {([['sm', 'Pequeño'], ['md', 'Mediano'], ['lg', 'Grande']] as const).map(([val, label]) => (
                    <button key={val}
                      onClick={() => onChange({ style: { ...block.style, socialBtnSize: val } })}
                      className={`flex-1 py-1.5 text-[10px] font-semibold rounded-lg border transition ${(block.style?.socialBtnSize || 'md') === val ? 'bg-blue-50 border-blue-300 text-blue-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                    >{label}</button>
                  ))}
                </div>
              </div>
              {/* Color */}
              <div>
                <label className="block text-[10px] text-gray-400 mb-1">Color de botones</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={block.style?.socialBtnColor || style.colorPrimary}
                    onChange={(e) => onChange({ style: { ...block.style, socialBtnColor: e.target.value } })}
                    className="w-8 h-8 rounded-lg border border-gray-200 cursor-pointer"
                  />
                  <span className="text-[10px] text-gray-400">{block.style?.socialBtnColor || style.colorPrimary}</span>
                  {block.style?.socialBtnColor && (
                    <button onClick={() => { const s = { ...block.style }; delete s.socialBtnColor; onChange({ style: s }); }} className="text-[10px] text-gray-400 hover:text-red-500">✕ Reset</button>
                  )}
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-gray-100">
              <label className="block text-[11px] font-semibold text-gray-500 mb-2">Redes sociales</label>
              {(block.socialLinks ?? [{ platform: 'linkedin', url: '' }, { platform: 'instagram', url: '' }, { platform: 'web', url: '' }]).map(
                (link, idx) => (
                  <div key={idx} className="flex items-center gap-2 mb-2">
                    <select
                      value={link.platform}
                      onChange={(e) => {
                        const links = [...(block.socialLinks ?? [{ platform: 'linkedin', url: '' }, { platform: 'instagram', url: '' }, { platform: 'web', url: '' }])];
                        links[idx] = { ...links[idx], platform: e.target.value };
                        onChange({ socialLinks: links });
                      }}
                      className="px-2 py-1.5 rounded-lg border border-gray-200 text-xs focus:outline-none focus:border-blue-400"
                    >
                      {['linkedin', 'instagram', 'facebook', 'twitter', 'youtube', 'tiktok', 'web', 'email'].map((p) => (
                        <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                      ))}
                    </select>
                    <input
                      value={link.url}
                      onChange={(e) => {
                        const links = [...(block.socialLinks ?? [{ platform: 'linkedin', url: '' }, { platform: 'instagram', url: '' }, { platform: 'web', url: '' }])];
                        links[idx] = { ...links[idx], url: e.target.value };
                        onChange({ socialLinks: links });
                      }}
                      className="flex-1 px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs focus:outline-none focus:border-blue-400"
                      placeholder="https://..."
                    />
                    <button
                      onClick={() => {
                        const links = [...(block.socialLinks ?? [{ platform: 'linkedin', url: '' }, { platform: 'instagram', url: '' }, { platform: 'web', url: '' }])];
                        links.splice(idx, 1);
                        onChange({ socialLinks: links });
                      }}
                      className="p-1 text-red-400 hover:text-red-600 transition text-xs"
                    >✕</button>
                  </div>
                ),
              )}
              <button
                onClick={() => {
                  const links = [...(block.socialLinks ?? [{ platform: 'linkedin', url: '' }, { platform: 'instagram', url: '' }, { platform: 'web', url: '' }])];
                  links.push({ platform: 'web', url: '' });
                  onChange({ socialLinks: links });
                }}
                className="text-[11px] text-blue-600 hover:text-blue-800 font-medium transition"
              >
                + Agregar red social
              </button>
            </div>
          </>
        )}

        {/* ── Spacer block ── */}
        {block.type === 'spacer' && (
          <div className="space-y-3">
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 mb-1.5">Alto del espaciador</label>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="8"
                  max="120"
                  value={parseInt(block.style?.spacerHeight || '32')}
                  onChange={(e) => onChange({ style: { ...block.style, spacerHeight: e.target.value } })}
                  className="flex-1 h-1.5 accent-blue-500"
                />
                <span className="text-[11px] font-mono text-gray-500 w-10 text-right">
                  {block.style?.spacerHeight || '32'}px
                </span>
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 mb-1.5">Color de fondo</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={block.style?.spacerColor || '#ffffff'}
                  onChange={(e) => onChange({ style: { ...block.style, spacerColor: e.target.value } })}
                  className="w-7 h-7 rounded-lg border border-gray-200 cursor-pointer"
                />
                <input
                  value={block.style?.spacerColor || ''}
                  onChange={(e) => onChange({ style: { ...block.style, spacerColor: e.target.value } })}
                  placeholder="Transparente"
                  className="flex-1 px-2 py-1.5 rounded-lg border border-gray-200 text-[10px] focus:outline-none focus:border-blue-400"
                />
                {block.style?.spacerColor && (
                  <button onClick={() => { const s = { ...block.style }; delete s.spacerColor; onChange({ style: s }); }} className="text-[10px] text-gray-400 hover:text-red-500">✕</button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Divider block ── */}
        {block.type === 'divider' && (
          <div className="space-y-3">
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 mb-1.5">Color de la línea</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={block.style?.dividerColor || '#e5e5ea'}
                  onChange={(e) => onChange({ style: { ...block.style, dividerColor: e.target.value } })}
                  className="w-7 h-7 rounded-lg border border-gray-200 cursor-pointer"
                />
                <input
                  value={block.style?.dividerColor || ''}
                  onChange={(e) => onChange({ style: { ...block.style, dividerColor: e.target.value } })}
                  placeholder="#e5e5ea"
                  className="flex-1 px-2 py-1.5 rounded-lg border border-gray-200 text-[10px] focus:outline-none focus:border-blue-400"
                />
                {block.style?.dividerColor && (
                  <button onClick={() => { const s = { ...block.style }; delete s.dividerColor; onChange({ style: s }); }} className="text-[10px] text-gray-400 hover:text-red-500">✕</button>
                )}
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 mb-1.5">Color del punto</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={block.style?.dividerDotColor || style.colorPrimary}
                  onChange={(e) => onChange({ style: { ...block.style, dividerDotColor: e.target.value } })}
                  className="w-7 h-7 rounded-lg border border-gray-200 cursor-pointer"
                />
                <input
                  value={block.style?.dividerDotColor || ''}
                  onChange={(e) => onChange({ style: { ...block.style, dividerDotColor: e.target.value } })}
                  placeholder={style.colorPrimary}
                  className="flex-1 px-2 py-1.5 rounded-lg border border-gray-200 text-[10px] focus:outline-none focus:border-blue-400"
                />
                {block.style?.dividerDotColor && (
                  <button onClick={() => { const s = { ...block.style }; delete s.dividerDotColor; onChange({ style: s }); }} className="text-[10px] text-gray-400 hover:text-red-500">✕</button>
                )}
              </div>
            </div>
            {/* Divider preview */}
            <div>
              <label className="block text-[10px] text-gray-400 mb-1.5">Preview</label>
              <div className="flex items-center gap-2 p-3 bg-white rounded-xl border border-gray-100">
                <div className="flex-1 h-px" style={{ backgroundColor: block.style?.dividerColor || '#e5e5ea' }} />
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: block.style?.dividerDotColor || style.colorPrimary }} />
                <div className="flex-1 h-px" style={{ backgroundColor: block.style?.dividerColor || '#e5e5ea' }} />
              </div>
            </div>
          </div>
        )}

        {/* ── Video block ── */}
        {block.type === 'video' && (
          <>
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 mb-1.5">Título del video</label>
              <input
                value={block.content}
                onChange={(e) => onChange({ content: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition"
                placeholder="Ver video sobre..."
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 mb-1.5">URL del video</label>
              <input
                value={block.videoUrl ?? ''}
                onChange={(e) => onChange({ videoUrl: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl border border-gray-200 text-xs focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition"
                placeholder="https://youtube.com/watch?v=..."
              />
              {getVideoEmbedUrl(block.videoUrl) && (
                <div className="mt-2 rounded-xl overflow-hidden border border-gray-100">
                  <iframe
                    src={getVideoEmbedUrl(block.videoUrl)!}
                    className="w-full aspect-video border-none"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    title="Video preview"
                  />
                </div>
              )}
              {!getVideoEmbedUrl(block.videoUrl) && block.videoUrl && (
                <p className="text-[10px] text-amber-500 mt-1">URL no reconocida. Soporta YouTube y Vimeo.</p>
              )}
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 mb-1.5">Thumbnail (imagen para email)</label>
              <p className="text-[9px] text-gray-400 mb-1.5">Los emails no soportan video embebido; se usa esta imagen con enlace.</p>
              <input ref={imgInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
              {block.imageUrl ? (
                <div className="relative group">
                  <img src={block.imageUrl} alt="" className="w-full h-28 object-cover rounded-xl border border-gray-100" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition rounded-xl flex items-center justify-center gap-2">
                    <button onClick={() => imgInputRef.current?.click()} className="px-3 py-1.5 bg-white text-gray-800 text-xs font-semibold rounded-lg shadow">Cambiar</button>
                    <button onClick={() => onChange({ imageUrl: '' })} className="px-3 py-1.5 bg-red-500 text-white text-xs font-semibold rounded-lg shadow">Quitar</button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {getYouTubeThumbnail(block.videoUrl) && (
                    <button
                      onClick={() => onChange({ imageUrl: getYouTubeThumbnail(block.videoUrl)! })}
                      className="w-full py-2 border border-blue-200 bg-blue-50/50 rounded-xl text-[11px] text-blue-600 font-semibold hover:bg-blue-100/50 transition"
                    >
                      🎬 Usar thumbnail de YouTube
                    </button>
                  )}
                  <button
                    onClick={() => imgInputRef.current?.click()}
                    className="w-full h-20 border-2 border-dashed border-gray-200 rounded-xl flex items-center justify-center gap-1.5 hover:border-blue-300 hover:bg-blue-50/30 transition text-[11px] text-gray-400"
                  >
                    📷 Subir thumbnail
                  </button>
                </div>
              )}
            </div>
          </>
        )}

        {/* ── Columns block ── */}
        {block.type === 'columns' && (
          <>
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 mb-1.5">Columna izquierda</label>
              <textarea
                value={(block.content || '').split('|||')[0] || ''}
                onChange={(e) => {
                  const parts = (block.content || '').split('|||');
                  parts[0] = e.target.value;
                  onChange({ content: parts.join('|||') });
                }}
                rows={3}
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm leading-relaxed focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition resize-none"
                placeholder="Contenido columna izquierda..."
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 mb-1.5">Columna derecha</label>
              <textarea
                value={(block.content || '').split('|||')[1] || ''}
                onChange={(e) => {
                  const parts = (block.content || '').split('|||');
                  while (parts.length < 2) parts.push('');
                  parts[1] = e.target.value;
                  onChange({ content: parts.join('|||') });
                }}
                rows={3}
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm leading-relaxed focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition resize-none"
                placeholder="Contenido columna derecha..."
              />
            </div>
          </>
        )}

        {/* ── Text styling controls ── */}
        {['text', 'bullets', 'header', 'footer', 'quote', 'hero', 'cta', 'columns', 'video', 'image', 'social'].includes(block.type) && (
          <div className="pt-3 border-t border-gray-100">
            <div className="flex items-center gap-2 mb-2.5">
              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Estilo del texto</span>
            </div>
            <div className="space-y-3">
              {/* Font family (for CTA and all blocks) */}
              {['cta', 'text', 'header', 'footer', 'hero', 'quote', 'columns'].includes(block.type) && (
                <div>
                  <label className="block text-[10px] text-gray-400 mb-1">Fuente</label>
                  <select
                    value={block.style?.fontFamily || ''}
                    onChange={(e) => {
                      if (e.target.value) {
                        onChange({ style: { ...block.style, fontFamily: e.target.value } });
                      } else {
                        const s = { ...block.style }; delete s.fontFamily; onChange({ style: s });
                      }
                    }}
                    className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-[11px] focus:outline-none focus:border-blue-400"
                  >
                    <option value="">Por defecto ({style.fontTitle})</option>
                    <option value="Inter">Inter</option>
                    <option value="Arial">Arial</option>
                    <option value="Helvetica">Helvetica</option>
                    <option value="Georgia">Georgia</option>
                    <option value="Times New Roman">Times New Roman</option>
                    <option value="Verdana">Verdana</option>
                    <option value="Trebuchet MS">Trebuchet MS</option>
                    <option value="Tahoma">Tahoma</option>
                    <option value="Courier New">Courier New</option>
                    <option value="Palatino">Palatino</option>
                    <option value="Garamond">Garamond</option>
                    {style.fontTitle && <option value={style.fontTitle}>{style.fontTitle} (marca)</option>}
                    {style.fontBody && style.fontBody !== style.fontTitle && <option value={style.fontBody}>{style.fontBody} (marca)</option>}
                  </select>
                </div>
              )}
              {/* Text color */}
              <div>
                <label className="block text-[10px] text-gray-400 mb-1">Color del texto</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={block.style?.color || '#333333'}
                    onChange={(e) => onChange({ style: { ...block.style, color: e.target.value } })}
                    className="w-7 h-7 rounded-lg border border-gray-200 cursor-pointer"
                  />
                  <input
                    value={block.style?.color || ''}
                    onChange={(e) => onChange({ style: { ...block.style, color: e.target.value } })}
                    placeholder="Por defecto"
                    className="flex-1 px-2 py-1.5 rounded-lg border border-gray-200 text-[10px] focus:outline-none focus:border-blue-400"
                  />
                  {block.style?.color && (
                    <button onClick={() => { const s = { ...block.style }; delete s.color; onChange({ style: s }); }} className="text-[10px] text-gray-400 hover:text-red-500">✕</button>
                  )}
                </div>
              </div>
              {/* Font size */}
              <div>
                <label className="block text-[10px] text-gray-400 mb-1">Tamaño de fuente</label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="10"
                    max="48"
                    value={parseInt(block.style?.fontSize || (block.style?.fontWeight === 'bold' ? '24' : '16'))}
                    onChange={(e) => onChange({ style: { ...block.style, fontSize: e.target.value } })}
                    className="flex-1 h-1.5 accent-blue-500"
                  />
                  <span className="text-[11px] font-mono text-gray-500 w-8 text-right">
                    {block.style?.fontSize || (block.style?.fontWeight === 'bold' ? '24' : '16')}px
                  </span>
                  {block.style?.fontSize && (
                    <button onClick={() => { const s = { ...block.style }; delete s.fontSize; onChange({ style: s }); }} className="text-[10px] text-gray-400 hover:text-red-500">✕</button>
                  )}
                </div>
              </div>
              {/* Text alignment */}
              <div>
                <label className="block text-[10px] text-gray-400 mb-1">Alineación</label>
                <div className="flex gap-1">
                  {([['left', '≡ Izq'], ['center', '≡ Centro'], ['right', '≡ Der']] as const).map(([align, label]) => (
                    <button
                      key={align}
                      onClick={() => {
                        const newStyle: Record<string, string> = { ...block.style, textAlign: align };
                        if (block.type === 'header') { newStyle.logoX = '0'; }
                        onChange({ style: newStyle });
                      }}
                      className={`flex-1 py-1.5 text-[10px] font-semibold rounded-lg border transition ${
                        (block.style?.textAlign || 'left') === align
                          ? 'bg-blue-50 border-blue-300 text-blue-700'
                          : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {/* Text transform */}
              <div>
                <label className="block text-[10px] text-gray-400 mb-1">Mayúsculas / minúsculas</label>
                <div className="flex gap-1">
                  {([['none', 'Aa Normal'], ['uppercase', 'AA MAYÚS'], ['lowercase', 'aa minús'], ['capitalize', 'Aa Título']] as const).map(([tf, label]) => (
                    <button
                      key={tf}
                      onClick={() => {
                        if (tf === 'none') {
                          const s = { ...block.style }; delete s.textTransform; onChange({ style: s });
                        } else {
                          onChange({ style: { ...block.style, textTransform: tf } });
                        }
                      }}
                      className={`flex-1 py-1.5 text-[9px] font-semibold rounded-lg border transition ${
                        (block.style?.textTransform || 'none') === tf
                          ? 'bg-blue-50 border-blue-300 text-blue-700'
                          : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {/* Heading level & bold (for text/columns/quote blocks) */}
              {['text', 'columns', 'quote'].includes(block.type) && (
                <div>
                  <label className="block text-[10px] text-gray-400 mb-1">Tipo de texto</label>
                  <div className="flex gap-1">
                    {([['', 'Párrafo'], ['h1', 'H1'], ['h2', 'H2'], ['h3', 'H3'], ['h4', 'H4']] as const).map(([level, label]) => {
                      const currentLevel = block.style?.headingLevel || '';
                      const isActive = currentLevel === level;
                      return (
                        <button
                          key={level || 'p'}
                          onClick={() => {
                            const s = { ...block.style };
                            if (level) {
                              s.headingLevel = level;
                              s.fontWeight = 'bold';
                              if (!s.fontSize) {
                                s.fontSize = level === 'h1' ? '32' : level === 'h2' ? '24' : level === 'h3' ? '20' : '18';
                              }
                            } else {
                              delete s.headingLevel;
                              delete s.fontWeight;
                              delete s.fontSize;
                            }
                            onChange({ style: s });
                          }}
                          className={`flex-1 py-1.5 text-[10px] font-semibold rounded-lg border transition ${
                            isActive
                              ? 'bg-blue-50 border-blue-300 text-blue-700'
                              : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                          }`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {/* Accent bar toggle + color (only when heading selected) */}
              {['text', 'columns', 'quote'].includes(block.type) && (block.style?.headingLevel || block.style?.fontWeight === 'bold') && (
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-[10px] text-gray-500 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={block.style?.accentBar !== 'hide'}
                      onChange={(e) => {
                        const s = { ...block.style };
                        if (e.target.checked) { delete s.accentBar; } else { s.accentBar = 'hide'; }
                        onChange({ style: s });
                      }}
                      className="accent-blue-500"
                    />
                    Barra decorativa
                  </label>
                  {block.style?.accentBar !== 'hide' && (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="color"
                        value={block.style?.accentBarColor || style.colorPrimary}
                        onChange={(e) => onChange({ style: { ...block.style, accentBarColor: e.target.value } })}
                        className="w-6 h-6 rounded border border-gray-200 cursor-pointer"
                      />
                      <span className="text-[9px] text-gray-400">Color</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── CTA color controls ── */}
        {block.type === 'cta' && (
          <div className="pt-3 border-t border-gray-100">
            <div className="flex items-center gap-2 mb-2.5">
              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Colores del botón</span>
            </div>
            <div className="space-y-3">
              {/* Band background color */}
              <div>
                <label className="block text-[10px] text-gray-400 mb-1">Fondo de la banda</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={block.style?.bandBgColor || style.colorPrimary}
                    onChange={(e) => onChange({ style: { ...block.style, bandBgColor: e.target.value } })}
                    className="w-7 h-7 rounded-lg border border-gray-200 cursor-pointer"
                  />
                  <input
                    value={block.style?.bandBgColor || ''}
                    onChange={(e) => onChange({ style: { ...block.style, bandBgColor: e.target.value } })}
                    placeholder={style.colorPrimary}
                    className="flex-1 px-2 py-1.5 rounded-lg border border-gray-200 text-[10px] focus:outline-none focus:border-blue-400"
                  />
                  {block.style?.bandBgColor && (
                    <button onClick={() => { const s = { ...block.style }; delete s.bandBgColor; onChange({ style: s }); }} className="text-[10px] text-gray-400 hover:text-red-500">✕</button>
                  )}
                </div>
              </div>
              {/* Button background color */}
              <div>
                <label className="block text-[10px] text-gray-400 mb-1">Color del botón</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={block.style?.btnBgColor || '#ffffff'}
                    onChange={(e) => onChange({ style: { ...block.style, btnBgColor: e.target.value } })}
                    className="w-7 h-7 rounded-lg border border-gray-200 cursor-pointer"
                  />
                  <input
                    value={block.style?.btnBgColor || ''}
                    onChange={(e) => onChange({ style: { ...block.style, btnBgColor: e.target.value } })}
                    placeholder="#ffffff"
                    className="flex-1 px-2 py-1.5 rounded-lg border border-gray-200 text-[10px] focus:outline-none focus:border-blue-400"
                  />
                  {block.style?.btnBgColor && (
                    <button onClick={() => { const s = { ...block.style }; delete s.btnBgColor; onChange({ style: s }); }} className="text-[10px] text-gray-400 hover:text-red-500">✕</button>
                  )}
                </div>
              </div>
              {/* Button text color */}
              <div>
                <label className="block text-[10px] text-gray-400 mb-1">Color del texto del botón</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={block.style?.btnTextColor || style.colorPrimary}
                    onChange={(e) => onChange({ style: { ...block.style, btnTextColor: e.target.value } })}
                    className="w-7 h-7 rounded-lg border border-gray-200 cursor-pointer"
                  />
                  <input
                    value={block.style?.btnTextColor || ''}
                    onChange={(e) => onChange({ style: { ...block.style, btnTextColor: e.target.value } })}
                    placeholder={style.colorPrimary}
                    className="flex-1 px-2 py-1.5 rounded-lg border border-gray-200 text-[10px] focus:outline-none focus:border-blue-400"
                  />
                  {block.style?.btnTextColor && (
                    <button onClick={() => { const s = { ...block.style }; delete s.btnTextColor; onChange({ style: s }); }} className="text-[10px] text-gray-400 hover:text-red-500">✕</button>
                  )}
                </div>
              </div>
              {/* CTA preview with custom colors */}
              <div className="pt-1">
                <label className="block text-[10px] text-gray-400 mb-1.5">Preview</label>
                <div
                  className="p-3 rounded-xl"
                  style={{
                    textAlign: (block.style?.textAlign as React.CSSProperties['textAlign']) || 'center',
                    background: block.style?.bandBgColor
                      ? `linear-gradient(135deg, ${block.style.bandBgColor}, ${darkenHex(block.style.bandBgColor, 0.15)})`
                      : `linear-gradient(135deg, ${style.colorPrimary}, ${darkenHex(style.colorPrimary, 0.15)})`,
                  }}
                >
                  {block.content && (
                    <div style={{ fontSize: block.style?.fontSize ? Math.round(parseInt(block.style.fontSize) * 0.6) : 9, color: block.style?.color || 'rgba(255,255,255,0.6)', letterSpacing: '1.5px', textTransform: 'uppercase' as const, fontWeight: 600, marginBottom: 8, fontFamily: `'${block.style?.fontFamily || style.fontTitle}', sans-serif` }}>
                      {block.content}
                    </div>
                  )}
                  <span
                    style={{
                      display: 'inline-block',
                      backgroundColor: block.style?.btnBgColor || '#ffffff',
                      color: block.style?.btnTextColor || style.colorPrimary,
                      padding: '8px 24px',
                      borderRadius: 6,
                      fontSize: block.style?.fontSize ? Math.round(parseInt(block.style.fontSize) * 0.75) : 12,
                      fontWeight: 700,
                      fontFamily: `'${block.style?.fontFamily || style.fontTitle}', sans-serif`,
                      boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
                    }}
                  >
                    {block.ctaText || 'Botón'} →
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Per-block background settings ── */}
        {!['spacer', 'divider'].includes(block.type) && (
          <div className="pt-3 border-t border-gray-100">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Fondo del bloque</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] text-gray-400 mb-1">Color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={block.backgroundColor || '#ffffff'}
                    onChange={(e) => onChange({ backgroundColor: e.target.value })}
                    className="w-7 h-7 rounded-lg border border-gray-200 cursor-pointer"
                  />
                  <input
                    value={block.backgroundColor || ''}
                    onChange={(e) => onChange({ backgroundColor: e.target.value })}
                    placeholder="Ninguno"
                    className="flex-1 px-2 py-1.5 rounded-lg border border-gray-200 text-[10px] focus:outline-none focus:border-blue-400"
                  />
                  {block.backgroundColor && (
                    <button onClick={() => onChange({ backgroundColor: undefined })} className="text-[10px] text-gray-400 hover:text-red-500">✕</button>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-[10px] text-gray-400 mb-1">Imagen</label>
                <input
                  value={block.backgroundImage || ''}
                  onChange={(e) => onChange({ backgroundImage: e.target.value })}
                  placeholder="URL..."
                  className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-[10px] focus:outline-none focus:border-blue-400"
                />
                <div className="flex items-center gap-1.5 mt-1">
                  <input ref={bgImgInputRef} type="file" accept="image/*" className="hidden" onChange={handleBgImageUpload} />
                  <button
                    onClick={() => bgImgInputRef.current?.click()}
                    disabled={uploadingBgImg}
                    className="flex-1 py-1 text-[10px] font-semibold rounded-lg border border-dashed border-gray-300 text-gray-500 hover:bg-gray-50 hover:border-blue-300 hover:text-blue-600 transition disabled:opacity-50"
                  >
                    {uploadingBgImg ? 'Subiendo...' : '📁 Subir imagen'}
                  </button>
                  {block.backgroundImage && (
                    <button onClick={() => onChange({ backgroundImage: undefined })} className="text-[10px] text-gray-400 hover:text-red-500">✕</button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Espaciado interno ── */}
        {!['spacer'].includes(block.type) && (
          <div className="pt-3 border-t border-gray-100">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Espaciado</span>
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-2">
              {([
                ['paddingTop', '↑ Arriba'],
                ['paddingBottom', '↓ Abajo'],
                ['paddingLeft', '← Izquierda'],
                ['paddingRight', '→ Derecha'],
              ] as const).map(([key, label]) => (
                <div key={key}>
                  <div className="flex justify-between items-center mb-0.5">
                    <label className="text-[10px] text-gray-400">{label}</label>
                    <span className="text-[10px] text-gray-500 font-mono">{block[key] ?? '—'}</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={120}
                    value={block[key] ?? ''}
                    onChange={(e) => onChange({ [key]: e.target.value ? parseInt(e.target.value) : undefined })}
                    className="w-full h-1.5 accent-blue-500"
                  />
                </div>
              ))}
            </div>
            {(block.paddingTop != null || block.paddingBottom != null || block.paddingLeft != null || block.paddingRight != null) && (
              <button
                onClick={() => onChange({ paddingTop: undefined, paddingBottom: undefined, paddingLeft: undefined, paddingRight: undefined })}
                className="mt-1.5 text-[10px] text-gray-400 hover:text-red-500 transition"
              >
                ✕ Restaurar por defecto
              </button>
            )}
          </div>
        )}

        {/* ── AI Copy Suggestion ── */}
        {canSuggest && (
          <div className="pt-2 border-t border-gray-100 space-y-2">
            <button
              onClick={handleSuggestCopy}
              disabled={aiLoading || !brand}
              className="w-full px-4 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-sm font-semibold rounded-xl hover:shadow-lg hover:shadow-purple-500/25 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {aiLoading ? (
                <>
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Generando sugerencias...
                </>
              ) : (
                <>
                  <span className="text-base">✨</span>
                  Sugerir con IA
                </>
              )}
            </button>

            {aiError && (
              <p className="text-xs text-red-500 mt-2 text-center">{aiError}</p>
            )}

            {/* AI Suggestions list */}
            {aiSuggestions.length > 0 && (
              <div className="mt-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">3 variantes</p>
                  <button
                    onClick={() => setAiSuggestions([])}
                    className="text-[10px] text-gray-400 hover:text-gray-600 transition"
                  >
                    Cerrar
                  </button>
                </div>
                {aiSuggestions.map((s, idx) => {
                  const toneColors: Record<string, string> = {
                    informativo: 'bg-blue-50 border-blue-200 hover:border-blue-400',
                    persuasivo: 'bg-amber-50 border-amber-200 hover:border-amber-400',
                    conciso: 'bg-green-50 border-green-200 hover:border-green-400',
                  };
                  const toneIcons: Record<string, string> = {
                    informativo: '📘',
                    persuasivo: '🎯',
                    conciso: '⚡',
                  };
                  const cls = toneColors[s.tone] ?? 'bg-gray-50 border-gray-200 hover:border-gray-400';

                  return (
                    <button
                      key={idx}
                      onClick={() => {
                        if (block.type === 'cta') {
                          onChange({ ctaText: s.text });
                        } else {
                          onChange({ content: s.text });
                        }
                        setAiSuggestions([]);
                      }}
                      className={`w-full text-left p-3 rounded-xl border transition-all ${cls} group`}
                    >
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <span className="text-xs">{toneIcons[s.tone] ?? '💡'}</span>
                        <span className="text-[10px] font-bold text-gray-500 uppercase">{s.tone}</span>
                        <span className="ml-auto text-[9px] text-gray-400 opacity-0 group-hover:opacity-100 transition">Usar →</span>
                      </div>
                      <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-line line-clamp-4">
                        {s.text}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════
// Step 4: Preview
// ═══════════════════════════════════════════════════════════

const StepPreview: React.FC<{
  blocks: MailingBlockContent[];
  style: MailingProject['style'];
  layout: { width: number; height: number; blocks: { id: string; type: DesignBlockType; x: number; y: number; w: number; h: number }[] };
  previewMode: 'desktop' | 'mobile';
  onModeChange: (m: 'desktop' | 'mobile') => void;
  onBack: () => void;
  subject: string;
  projectName: string;
}> = ({ blocks, style, previewMode, onModeChange, onBack, subject }) => (
  <div>
    <div className="flex items-center justify-between mb-6">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-800 transition"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Volver al editor
      </button>
      <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
        <button
          onClick={() => onModeChange('desktop')}
          className={`px-4 py-2 rounded-lg text-xs font-semibold transition ${
            previewMode === 'desktop' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          🖥️ Desktop
        </button>
        <button
          onClick={() => onModeChange('mobile')}
          className={`px-4 py-2 rounded-lg text-xs font-semibold transition ${
            previewMode === 'mobile' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          📱 Mobile
        </button>
      </div>
    </div>

    {/* Email client simulation */}
    <div className="flex justify-center">
      <div
        className="transition-all"
        style={{ width: previewMode === 'desktop' ? 720 : 400 }}
      >
        {/* Email client chrome - inbox header */}
        <div className="bg-white rounded-t-2xl border border-gray-200 border-b-0 px-5 py-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-red-400" />
              <div className="w-3 h-3 rounded-full bg-yellow-400" />
              <div className="w-3 h-3 rounded-full bg-green-400" />
            </div>
            <div className="flex-1 bg-gray-100 rounded-lg px-3 py-1.5 text-[11px] text-gray-400 text-center">
              mail.google.com
            </div>
          </div>
          <div className="space-y-2 pl-1">
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-gray-400 w-8">De:</span>
              <span className="text-[12px] text-gray-700 font-medium">marketing@{style.fontTitle?.toLowerCase().replace(/\s/g, '') || 'empresa'}.com</span>
            </div>
            {subject && (
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-gray-400 w-8">Asunto:</span>
                <span className="text-[13px] text-gray-900 font-bold">{subject}</span>
              </div>
            )}
          </div>
        </div>

        {/* Email body */}
        <div className="bg-[#f0f2f5] border border-gray-200 rounded-b-2xl p-6 overflow-hidden">
          <div
            className="mx-auto bg-white rounded-lg shadow-xl overflow-hidden transition-all"
            style={{ maxWidth: previewMode === 'desktop' ? 600 : 340 }}
          >
            <EmailVisualPreview blocks={blocks} style={style} />
          </div>
        </div>
      </div>
    </div>
  </div>
);
