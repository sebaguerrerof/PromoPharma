import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/useToast';
import { useAuth } from '@/hooks/useAuth';
import { useTenant } from '@/hooks/useTenant';
import { getAllSavedSessions, deleteSession, renameSession, createSession, createKit, generatePromptSuggestion } from '@/services/generationService';
import { getBrands } from '@/services/brandService';
import { getMolecule, getIndications } from '@/services/moleculeService';
import { getTemplates, seedTemplates } from '@/services/templateService';
import { analyzeBrochureDesign, isSupportedDesignFile } from '@/services/designAnalysisService';
import { deleteFileByUrl, uploadFile } from '@/services/uploadService';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import type { GenerationSession, Brand, Template, TemplateSlot, Indication, Molecule, BrochureLayoutSpec } from '@/types';

function inferSlotPage(slot: TemplateSlot, pageCount: number, index: number, totalSlots: number): number {
  const match = slot.id.match(/(?:page|pagina|slide|p)(\d+)/i) ?? slot.name.match(/p[aá]gina\s*(\d+)/i);
  if (match) {
    const p = parseInt(match[1], 10);
    if (Number.isFinite(p) && p >= 1) return Math.min(p, pageCount);
  }

  const perPage = Math.max(1, Math.ceil(totalSlots / pageCount));
  return Math.min(pageCount, Math.floor(index / perPage) + 1);
}

function buildBrochureLayoutSpec(
  slots: TemplateSlot[],
  pageCount: number,
  brochureSourceUrl: string,
  brochureMimeType: string,
): BrochureLayoutSpec {
  const pages = Array.from({ length: pageCount }, (_, i) => ({
    pageNumber: i + 1,
    ...(brochureMimeType.startsWith('image/') ? { backgroundImageUrl: brochureSourceUrl } : {}),
    zones: [] as BrochureLayoutSpec['pages'][number]['zones'],
  }));

  const counters = new Map<number, Record<string, number>>();
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    const page = inferSlotPage(slot, pageCount, i, slots.length);
    const pageIdx = page - 1;
    const stat = counters.get(pageIdx) ?? { title: 0, subtitle: 0, image: 0, body: 0, bullets: 0, callout: 0, disclaimer: 0 };
    counters.set(pageIdx, stat);

    const slotTypeMap: Record<string, { x: number; y: number; w: number; h: number; step: number }> = {
      title: { x: 8, y: 10, w: 84, h: 10, step: 10 },
      subtitle: { x: 8, y: 22, w: 84, h: 8, step: 8 },
      image: { x: 8, y: 34, w: 84, h: 34, step: 32 },
      body: { x: 8, y: 70, w: 84, h: 16, step: 14 },
      bullets: { x: 8, y: 70, w: 84, h: 18, step: 16 },
      callout: { x: 8, y: 70, w: 84, h: 12, step: 12 },
      disclaimer: { x: 6, y: 90, w: 88, h: 7, step: 3 },
    };
    const base = slotTypeMap[slot.type] ?? slotTypeMap['body'];

    const offset = stat[slot.type] ?? 0;
    stat[slot.type] = offset + 1;

    const y = Math.min(base.y + offset * base.step, 96 - base.h);

    pages[pageIdx].zones.push({
      id: `${slot.id}_zone`,
      slotId: slot.id,
      slotType: slot.type,
      x: base.x,
      y,
      w: base.w,
      h: base.h,
    });
  }

  return {
    version: 1,
    width: 100,
    height: 100,
    pages,
  };
}

const CampaignsPage: React.FC = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const tenantId = useTenant();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<GenerationSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  // Filtros
  const [filterBrand, setFilterBrand] = useState('');
  const [filterTemplate, setFilterTemplate] = useState('');

  // New campaign modal state
  const [showNewModal, setShowNewModal] = useState(false);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedBrandId, setSelectedBrandId] = useState('');
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [indications, setIndications] = useState<Indication[]>([]);
  const [selectedIndications, setSelectedIndications] = useState<string[]>([]);
  const [molecule, setMolecule] = useState<Molecule | null>(null);
  const [loadingIndications, setLoadingIndications] = useState(false);
  const [pageCount, setPageCount] = useState(2);
  const [newCampaignName, setNewCampaignName] = useState('');
  const [initialPrompt, setInitialPrompt] = useState('');
  const [generatingPrompt, setGeneratingPrompt] = useState(false);
  const [createFromBrochure, setCreateFromBrochure] = useState(false);
  const [brochureFile, setBrochureFile] = useState<File | null>(null);
  const [analyzingBrochure, setAnalyzingBrochure] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      const [data, b] = await Promise.all([getAllSavedSessions(), getBrands(tenantId)]);
      setSessions(data);
      setBrands(b);
    } catch {
      toast('Error al cargar campañas', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar esta campaña? Esta acción no se puede deshacer.')) return;
    try {
      setDeletingId(id);
      await deleteSession(id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
      toast('Campaña eliminada');
    } catch {
      toast('Error al eliminar', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  const handleRename = async (id: string) => {
    const trimmed = editName.trim();
    if (!trimmed) {
      setEditingId(null);
      return;
    }
    try {
      await renameSession(id, trimmed);
      setSessions((prev) =>
        prev.map((s) => (s.id === id ? { ...s, campaignName: trimmed } : s)),
      );
      toast('Nombre actualizado');
    } catch {
      toast('Error al renombrar', 'error');
    } finally {
      setEditingId(null);
    }
  };

  if (loading) return <LoadingSpinner />;

  const handleOpenNewModal = async () => {
    setShowNewModal(true);
    setSelectedBrandId('');
    setSelectedTemplateIds([]);
    setSelectedIndications([]);
    setIndications([]);
    setMolecule(null);
    setPageCount(2);
    setNewCampaignName('');
    setInitialPrompt('');
    setCreateFromBrochure(false);
    setBrochureFile(null);
    setAnalyzingBrochure(false);
    try {
      await seedTemplates(tenantId);
      const [b, t] = await Promise.all([getBrands(tenantId), getTemplates()]);
      setBrands(b);
      setTemplates(t);
    } catch {
      toast('Error al cargar marcas/plantillas', 'error');
    }
  };

  // Cargar indicaciones cuando cambia la marca seleccionada
  const handleBrandChange = async (brandId: string) => {
    setSelectedBrandId(brandId);
    setSelectedIndications([]);
    setIndications([]);
    setMolecule(null);

    const brand = brands.find((b) => b.id === brandId);
    if (!brand?.moleculeId) return;

    setLoadingIndications(true);
    try {
      const [mol, inds] = await Promise.all([
        getMolecule(brand.moleculeId),
        getIndications(brand.moleculeId),
      ]);
      setMolecule(mol);
      setIndications(inds);
      // Pre-seleccionar todas las indicaciones
      setSelectedIndications(inds.map((i) => i.id));
    } catch {
      toast('Error al cargar indicaciones', 'error');
    } finally {
      setLoadingIndications(false);
    }
  };

  const toggleIndication = (id: string) => {
    setSelectedIndications((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleBrochureUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!isSupportedDesignFile(file)) {
      toast('Formato no soportado. Usa PDF, JPEG, PNG, WebP o GIF.', 'error');
      return;
    }

    if (file.size > 10 * 1024 * 1024) { // 10MB
      toast('Archivo demasiado grande. Máximo 10MB.', 'error');
      return;
    }

    setBrochureFile(file);
  };

  const toggleTemplate = (id: string) => {
    setSelectedTemplateIds((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
  };

  const handleCreateCampaign = async () => {
    if (!selectedBrandId) {
      toast('Selecciona una marca', 'error');
      return;
    }
    if (selectedTemplateIds.length === 0) {
      toast('Selecciona al menos una plantilla', 'error');
      return;
    }
    if (createFromBrochure && !brochureFile) {
      toast('Sube un folleto existente', 'error');
      return;
    }
    const brand = brands.find((b) => b.id === selectedBrandId);
    if (!brand || !user) return;

    try {
      setCreating(true);

      const indicationNames = selectedIndications
        .map((id) => indications.find((i) => i.id === id)?.name ?? '')
        .filter(Boolean);

      const campaignName = newCampaignName.trim() || `${brand.name} – ${new Date().toLocaleDateString('es-ES')}`;

      if (createFromBrochure) {
        // Modo brochure: analizar diseño y usar template estable de folleto
        setAnalyzingBrochure(true);
        let uploadedBrochureUrl: string | null = null;
        try {
          console.log('[Brochure] Paso 1: Analizando diseño...');
          const extractedDesign = await analyzeBrochureDesign(brochureFile!, brand.name, molecule?.name);
          console.log('[Brochure] Paso 1 OK. Páginas:', extractedDesign.layout.pages);
          console.log('[Brochure] Paso 2: Subiendo archivo a Storage...');
          const safeName = brochureFile!.name.replace(/[^a-zA-Z0-9._-]/g, '_');
          const brochurePath = `tenants/${tenantId}/brochures/${brand.id}/${Date.now()}_${safeName}`;
          uploadedBrochureUrl = await uploadFile(brochureFile!, brochurePath);
          console.log('[Brochure] Paso 2 OK. URL:', uploadedBrochureUrl?.slice(0, 80));
          console.log('[Brochure] Paso 3: Buscando plantilla...', selectedTemplateIds[0]);
          const brochureTemplate = templates.find((t) => t.id === selectedTemplateIds[0])
            ?? templates.find((t) => t.id === 'folleto-2p')
            ?? templates.find((t) => t.format === 'pdf');

          if (!brochureTemplate) {
            toast('No hay plantilla disponible.', 'error');
            return;
          }
          console.log('[Brochure] Paso 3 OK. Template:', brochureTemplate.id, 'Slots:', brochureTemplate.slots.length);

          const initialSlotValues: Record<string, string> = {};
          if (brochureTemplate.format === 'pdf') {
            initialSlotValues['__page_count'] = String(extractedDesign.layout.pages || 2);
          }
          const brochurePageCount = Math.max(1, extractedDesign.layout.pages || 2);
          const brochureLayoutSpec = buildBrochureLayoutSpec(
            brochureTemplate.slots.filter((s) => !s.id.startsWith('__')),
            brochurePageCount,
            uploadedBrochureUrl,
            brochureFile!.type,
          );
          initialSlotValues['__design_mode'] = 'brochure_locked';
          initialSlotValues['__brochure_source_url'] = uploadedBrochureUrl;
          initialSlotValues['__brochure_source_name'] = brochureFile!.name;
          initialSlotValues['__brochure_style'] = extractedDesign.style;
          initialSlotValues['__brochure_colors'] = JSON.stringify(extractedDesign.colors ?? []);
          initialSlotValues['__brochure_fonts'] = JSON.stringify(extractedDesign.fonts ?? []);
          initialSlotValues['__layout_spec'] = JSON.stringify(brochureLayoutSpec);

          console.log('[Brochure] Paso 4: Creando sesión en Firestore...');
          const sessionId = await createSession({
            brandId: brand.id,
            brandName: brand.name,
            campaignName,
            templateId: brochureTemplate.id,
            templateName: brochureTemplate.name,
            moleculeId: brand.moleculeId ?? null,
            moleculeName: molecule?.name ?? null,
            indicationIds: selectedIndications,
            indicationNames,
            tenantId,
            createdBy: user.email ?? user.uid,
            initialSlotValues,
            brochureSourceUrl: uploadedBrochureUrl,
            brochureSourceName: brochureFile!.name,
            brochureSourceMimeType: brochureFile!.type,
            brochureSourceSizeBytes: brochureFile!.size,
            brochureDesignSnapshot: {
              layoutPages: extractedDesign.layout.pages,
              style: extractedDesign.style,
              colors: extractedDesign.colors,
              fonts: extractedDesign.fonts,
            },
            brochureLayoutSpec,
          });
          console.log('[Brochure] Paso 4 OK. Session:', sessionId);
          toast('Campaña creada desde folleto — redirigiendo al chat IA');
          const brochurePrompt = `Usa como referencia el folleto "${brochureFile!.name}" para mantener estilo visual, jerarquía y tono. Actualiza solo el contenido para ${brand.name} sin inventar claims.`;
          const finalPrompt = initialPrompt.trim() || brochurePrompt;
          const promptParam = `&prompt=${encodeURIComponent(finalPrompt)}`;
          navigate(`/marcas/${brand.id}/generar?session=${sessionId}${promptParam}`);
        } catch (error) {
          console.error('[Brochure] Error en flujo de creación:', error);
          if (uploadedBrochureUrl) {
            await deleteFileByUrl(uploadedBrochureUrl).catch(() => {});
          }
          toast('Error al analizar el folleto. Intenta de nuevo.', 'error');
        } finally {
          setAnalyzingBrochure(false);
        }
        return;
      }

      // Modo normal con templates
      const selectedTemplates = selectedTemplateIds
        .map((id) => templates.find((t) => t.id === id))
        .filter(Boolean) as Template[];

      if (selectedTemplates.length === 0) return;

      if (selectedTemplates.length === 1) {
        // Modo single: crear 1 sesión
        const template = selectedTemplates[0];
        const initialSlotValues: Record<string, string> = {};
        if (template.format === 'pdf' && template.id === 'folleto-2p') {
          initialSlotValues['__page_count'] = String(pageCount);
        }

        const sessionId = await createSession({
          brandId: brand.id,
          brandName: brand.name,
          campaignName,
          templateId: template.id,
          templateName: template.name,
          moleculeId: brand.moleculeId ?? null,
          moleculeName: molecule?.name ?? null,
          indicationIds: selectedIndications,
          indicationNames,
          tenantId,
          createdBy: user.email ?? user.uid,
          initialSlotValues,
        });
        toast('Campaña creada — redirigiendo al chat IA');
        const promptParam = initialPrompt.trim() ? `&prompt=${encodeURIComponent(initialPrompt.trim())}` : '';
        navigate(`/marcas/${brand.id}/generar?session=${sessionId}${promptParam}`);
      } else {
        // Modo kit: crear múltiples sesiones agrupadas
        const { sessionIds } = await createKit({
          brandId: brand.id,
          brandName: brand.name,
          campaignName,
          templates: selectedTemplates.map((t) => ({ id: t.id, name: t.name })),
          moleculeId: brand.moleculeId ?? null,
          moleculeName: molecule?.name ?? null,
          indicationIds: selectedIndications,
          indicationNames,
          tenantId,
          createdBy: user.email ?? user.uid,
          pageCount,
        });
        toast(`Kit de ${sessionIds.length} piezas creado — redirigiendo a la primera`);
        const promptParam = initialPrompt.trim() ? `&prompt=${encodeURIComponent(initialPrompt.trim())}` : '';
        navigate(`/marcas/${brand.id}/generar?session=${sessionIds[0]}${promptParam}`);
      }
    } catch {
      toast('Error al crear campaña', 'error');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="max-w-6xl">
      {/* Hero header */}
      <div className="relative overflow-hidden rounded-3xl bg-linear-to-br from-[#0f172a] via-[#1e3a5f] to-[#0c4a6e] p-8 mb-8">
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 30% 50%, rgba(56,189,248,0.3) 0%, transparent 50%), radial-gradient(circle at 70% 30%, rgba(168,85,247,0.2) 0%, transparent 50%)' }} />
        <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="relative flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-bold text-blue-400 uppercase tracking-[0.2em] bg-blue-400/10 px-3 py-1 rounded-full">
                Campañas
              </span>
              <span className="text-[10px] font-medium text-slate-400 bg-white/5 px-2.5 py-1 rounded-full">
                {sessions.length} guardadas
              </span>
            </div>
            <h1 className="text-xl font-bold text-white mb-1">Campañas guardadas</h1>
            <p className="text-sm text-blue-200/70">
              Todas las publicaciones generadas con inteligencia artificial
            </p>
          </div>
          <button
            onClick={handleOpenNewModal}
            className="rounded-xl bg-linear-to-r from-blue-500 to-cyan-500 px-5 py-3 text-sm font-semibold text-white
                       hover:from-blue-400 hover:to-cyan-400 transition-all shadow-lg shadow-blue-500/25 flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Nueva Campaña
          </button>
        </div>
      </div>

      {/* New campaign modal */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg mx-4 p-7 max-h-[85vh] overflow-y-auto border border-gray-100">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Nueva Campaña</h2>
                <p className="text-xs text-gray-400 mt-0.5">Configura tu campaña y abre el chat IA</p>
              </div>
              <button
                onClick={() => setShowNewModal(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-5">
              {/* Nombre de la campaña */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  Nombre de la campaña
                </label>
                <input
                  type="text"
                  value={newCampaignName}
                  onChange={(e) => setNewCampaignName(e.target.value)}
                  placeholder="Ej: Lanzamiento Q1 2026"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm
                             placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400 transition-colors"
                />
              </div>

              {/* Opción de crear desde folleto */}
              <div>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={createFromBrochure}
                    onChange={(e) => {
                      setCreateFromBrochure(e.target.checked);
                      if (e.target.checked) {
                        setSelectedTemplateIds([]);
                      }
                    }}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm font-semibold text-gray-700">
                    Crear campaña desde folleto existente
                  </span>
                </label>
                <p className="text-xs text-gray-500 mt-1 ml-6">
                  Sube un PDF o imagen de folleto para mantener el diseño y actualizar solo el contenido
                </p>
              </div>

              {/* 1. Marca */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 text-xs font-bold flex items-center justify-center">1</span>
                    Marca
                  </span>
                </label>
                {brands.length === 0 ? (
                  <p className="text-sm text-amber-600">
                    No hay marcas. <Link to="/marcas" className="underline font-medium">Crea una primero</Link>.
                  </p>
                ) : (
                  <select
                    value={selectedBrandId}
                    onChange={(e) => handleBrandChange(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm
                               focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400 transition-colors"
                  >
                    <option value="">— Selecciona una marca —</option>
                    {brands.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                )}

                {/* Info de molécula */}
                {selectedBrandId && molecule && (
                  <div className="mt-2 px-3 py-2 bg-blue-50 rounded-lg border border-blue-100">
                    <p className="text-xs text-blue-700">
                      <span className="font-medium">Molécula:</span> {molecule.name}
                    </p>
                  </div>
                )}
              </div>

              {/* 2a. Upload de folleto (solo visible en modo brochure) */}
              {createFromBrochure && (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 text-xs font-bold flex items-center justify-center">2</span>
                      Folleto existente
                    </span>
                  </label>
                  <div className="border-2 border-dashed border-blue-300 rounded-2xl p-5 bg-blue-50 hover:bg-blue-100 transition-all group">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-blue-200 flex items-center justify-center text-lg group-hover:bg-blue-300 transition-colors">
                        📄
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-gray-700">
                          {brochureFile ? `📎 ${brochureFile.name}` : 'Subir folleto existente'}
                        </p>
                        <p className="text-xs text-gray-500">
                          {brochureFile
                            ? 'Folleto listo para análisis de diseño'
                            : 'PDF, JPEG, PNG, WebP o GIF (máx. 10MB)'
                          }
                        </p>
                      </div>
                      {brochureFile && (
                        <button
                          onClick={() => setBrochureFile(null)}
                          className="text-xs text-red-500 hover:text-red-700"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                    {!brochureFile && (
                      <input
                        type="file"
                        accept=".pdf,image/*"
                        onChange={handleBrochureUpload}
                        className="hidden"
                        id="brochure-upload"
                      />
                    )}
                    <label
                      htmlFor="brochure-upload"
                      className="block mt-3 text-center text-xs text-blue-600 hover:text-blue-800 cursor-pointer font-medium"
                    >
                      {brochureFile ? 'Cambiar archivo' : 'Seleccionar archivo'}
                    </label>
                  </div>
                  {brochureFile && (
                    <p className="text-xs text-blue-600 mt-2 ml-1">
                      El diseño del folleto se aplicará a la plantilla que elijas abajo.
                    </p>
                  )}
                </div>
              )}

              {/* 2b. Plantillas (siempre visibles) */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 text-xs font-bold flex items-center justify-center">{createFromBrochure ? '3' : '2'}</span>
                    Plantilla{selectedTemplateIds.length > 1 ? 's' : ''}
                  </span>
                  {!createFromBrochure && (
                    <span className="text-xs font-normal text-gray-400 ml-2">
                      Selecciona varias para crear un Kit
                    </span>
                  )}
                  {createFromBrochure && (
                    <span className="text-xs font-normal text-gray-400 ml-2">
                      Elige qué tipo de pieza generar con el diseño del folleto
                    </span>
                  )}
                </label>

                {!createFromBrochure && selectedTemplateIds.length > 1 && (
                  <div className="mb-2 px-3 py-2 bg-purple-50 border border-purple-200 rounded-lg flex items-center gap-2">
                    <span className="text-sm">📦</span>
                    <span className="text-xs font-medium text-purple-700">
                      Kit de campaña — {selectedTemplateIds.length} piezas se generarán con el mismo mensaje
                    </span>
                  </div>
                )}

                {templates.length === 0 ? (
                  <p className="text-sm text-gray-400">No hay plantillas disponibles.</p>
                ) : (
                  <div className="grid gap-2">
                    {templates.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => createFromBrochure ? setSelectedTemplateIds([t.id]) : toggleTemplate(t.id)}
                        className={`text-left border rounded-lg p-3 transition-colors ${
                          selectedTemplateIds.includes(t.id)
                            ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                            : t.featured
                              ? 'border-purple-200 bg-purple-50/30 hover:border-purple-300'
                              : 'border-gray-200 hover:border-gray-300 bg-white'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {createFromBrochure ? (
                              <input
                                type="radio"
                                name="brochure-template"
                                checked={selectedTemplateIds.includes(t.id)}
                                onChange={() => setSelectedTemplateIds([t.id])}
                                className="border-gray-300 text-blue-600 focus:ring-blue-500"
                              />
                            ) : (
                              <input
                                type="checkbox"
                                checked={selectedTemplateIds.includes(t.id)}
                                onChange={() => toggleTemplate(t.id)}
                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                              />
                            )}
                            <h3 className="text-sm font-medium text-gray-900">{t.name}</h3>
                            {t.featured && (
                              <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-600 tracking-wider">
                                Recomendado
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] uppercase text-gray-400 font-medium px-1.5 py-0.5 bg-gray-100 rounded">
                            {t.format}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5 ml-6">{t.description}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Número de páginas (solo para folletos) */}

              {/* Número de páginas (solo para folletos) */}
              {selectedTemplateIds.includes('folleto-2p') && (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                    <span className="inline-flex items-center gap-1.5">
                      <svg className="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      Número de páginas
                    </span>
                  </label>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5, 6, 8, 10].map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setPageCount(n)}
                          className={`w-9 h-9 rounded-lg text-sm font-medium transition-colors ${
                            pageCount === n
                              ? 'bg-blue-600 text-white shadow-sm'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                    <span className="text-xs text-gray-400">
                      {pageCount === 1 ? 'página' : 'páginas'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1.5">
                    Puedes cambiar esto después en el editor visual
                  </p>
                </div>
              )}

              {/* 3. Indicaciones */}
              {selectedBrandId && (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 text-xs font-bold flex items-center justify-center">3</span>
                      Indicaciones
                    </span>
                    <span className="text-xs font-normal text-gray-400 ml-2">
                      La IA usará los insights aprobados de las indicaciones seleccionadas
                    </span>
                  </label>

                  {loadingIndications ? (
                    <div className="flex items-center gap-2 py-3">
                      <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                      <span className="text-xs text-gray-400">Cargando indicaciones...</span>
                    </div>
                  ) : indications.length === 0 ? (
                    <div className="py-3 px-3 bg-amber-50 border border-amber-100 rounded-lg">
                      <p className="text-xs text-amber-700">
                        Esta marca no tiene indicaciones configuradas.
                        <Link to={`/moleculas`} className="underline ml-1 font-medium">Agregar indicaciones</Link>
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {/* Select/deselect all */}
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-400">
                          {selectedIndications.length} de {indications.length} seleccionadas
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedIndications(
                              selectedIndications.length === indications.length
                                ? []
                                : indications.map((i) => i.id)
                            )
                          }
                          className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                        >
                          {selectedIndications.length === indications.length
                            ? 'Deseleccionar todas'
                            : 'Seleccionar todas'}
                        </button>
                      </div>

                      <div className="grid gap-1.5">
                        {indications.map((ind) => (
                          <label
                            key={ind.id}
                            className={`flex items-center gap-3 border rounded-lg p-3 cursor-pointer transition-colors ${
                              selectedIndications.includes(ind.id)
                                ? 'border-blue-500 bg-blue-50'
                                : 'border-gray-200 hover:border-gray-300 bg-white'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={selectedIndications.includes(ind.id)}
                              onChange={() => toggleIndication(ind.id)}
                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-sm text-gray-800">{ind.name}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Prompt inicial */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                Prompt inicial <span className="text-xs font-normal text-gray-400">(opcional)</span>
              </label>
              <div className="relative">
                <textarea
                  value={initialPrompt}
                  onChange={(e) => setInitialPrompt(e.target.value)}
                  placeholder="Describe qué quieres generar... o usa el botón de IA para obtener una sugerencia"
                  rows={3}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-800
                             placeholder:text-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500
                             resize-none"
                />
                <button
                  type="button"
                  onClick={async () => {
                    if (!selectedBrandId || selectedTemplateIds.length === 0) {
                      toast('Selecciona marca y plantilla primero', 'error');
                      return;
                    }
                    try {
                      setGeneratingPrompt(true);
                      const selectedTemplateNames = createFromBrochure
                        ? ['Folleto personalizado']
                        : selectedTemplateIds
                          .map((id) => templates.find((t) => t.id === id)?.name ?? '')
                          .filter(Boolean);
                      const indicationNames = selectedIndications
                        .map((id) => indications.find((i) => i.id === id)?.name ?? '')
                        .filter(Boolean);
                      const suggestion = await generatePromptSuggestion(
                        brands.find((b) => b.id === selectedBrandId)?.name ?? '',
                        molecule?.name ?? null,
                        indicationNames,
                        selectedTemplateNames,
                      );
                      setInitialPrompt(suggestion);
                    } catch {
                      toast('Error al generar prompt con IA', 'error');
                    } finally {
                      setGeneratingPrompt(false);
                    }
                  }}
                  disabled={generatingPrompt || !selectedBrandId || selectedTemplateIds.length === 0}
                  className="absolute bottom-2 right-2 flex items-center gap-1.5 rounded-md bg-linear-to-r
                             from-blue-500 to-cyan-500 px-3 py-1.5 text-xs font-medium text-white
                             hover:from-blue-600 hover:to-cyan-600 transition-all
                             disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                >
                  {generatingPrompt ? (
                    <>
                      <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Generando…
                    </>
                  ) : (
                    <>✨ Generar con IA</>
                  )}
                </button>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-100">
              <button
                onClick={() => setShowNewModal(false)}
                className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600
                           hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreateCampaign}
                disabled={creating || analyzingBrochure || !selectedBrandId || selectedTemplateIds.length === 0 || (createFromBrochure && !brochureFile)}
                className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white
                           hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed
                           flex items-center gap-2"
              >
                {(creating || analyzingBrochure) ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    {analyzingBrochure ? 'Analizando folleto...' : 'Creando...'}
                  </>
                ) : createFromBrochure ? (
                  <>
                    <span>📄</span>
                    Crear desde folleto
                  </>
                ) : selectedTemplateIds.length > 1 ? (
                  <>
                    <span>📦</span>
                    Crear kit ({selectedTemplateIds.length} piezas)
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                    </svg>
                    Crear y abrir chat IA
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filtros */}
      {sessions.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <select
            value={filterBrand}
            onChange={(e) => setFilterBrand(e.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm
                       focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400 transition-colors"
          >
            <option value="">Todas las marcas</option>
            {[...new Set(sessions.map((s) => s.brandName))].sort().map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          <select
            value={filterTemplate}
            onChange={(e) => setFilterTemplate(e.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm
                       focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400 transition-colors"
          >
            <option value="">Todos los tipos</option>
            {[...new Set(sessions.map((s) => s.templateName))].sort().map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          {(filterBrand || filterTemplate) && (
            <button
              onClick={() => { setFilterBrand(''); setFilterTemplate(''); }}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium"
            >
              Limpiar filtros
            </button>
          )}
        </div>
      )}

      {(() => {
        const filtered = sessions.filter((s) => {
          if (filterBrand && s.brandName !== filterBrand) return false;
          if (filterTemplate && s.templateName !== filterTemplate) return false;
          return true;
        });

        // Agrupar por marca
        const grouped = filtered.reduce<Record<string, GenerationSession[]>>((acc, s) => {
          const key = s.brandName || 'Sin marca';
          if (!acc[key]) acc[key] = [];
          acc[key].push(s);
          return acc;
        }, {});

        if (sessions.length === 0) {
          return (
          <div className="text-center py-20 px-4">
            <div className="mx-auto w-16 h-16 rounded-3xl bg-linear-to-br from-blue-100 to-cyan-100 flex items-center justify-center mb-5 shadow-md shadow-blue-100">
              <svg
                className="w-7 h-7 text-blue-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
              />
            </svg>
          </div>
          <p className="text-sm font-semibold text-gray-700">No hay campañas guardadas aún</p>
          <p className="text-xs text-gray-400 mt-2 max-w-xs mx-auto leading-relaxed">
            Genera contenido desde una marca y guárdalo como publicación.
          </p>
          <button
            onClick={handleOpenNewModal}
            className="mt-5 rounded-xl bg-linear-to-r from-blue-500 to-cyan-500 px-6 py-2.5 text-sm font-semibold text-white
                       hover:from-blue-400 hover:to-cyan-400 transition-all shadow-lg shadow-blue-500/25"
          >
            Crear primera campaña
          </button>
        </div>
          );
        }

        if (filtered.length === 0) {
          return (
            <div className="text-center py-12">
              <p className="text-sm text-gray-500">No hay campañas que coincidan con los filtros.</p>
              <button
                onClick={() => { setFilterBrand(''); setFilterTemplate(''); }}
                className="mt-2 text-sm text-blue-600 hover:text-blue-800 font-medium"
              >
                Limpiar filtros
              </button>
            </div>
          );
        }

        const brandNames = Object.keys(grouped).sort();

        return (
          <div className="space-y-6">
            {brandNames.map((brandName) => {
              const brandSessions = grouped[brandName];
              const brandObj = brands.find((b) => b.name === brandName);

              // Separar kits de sesiones sueltas
              const kitMap = new Map<string, GenerationSession[]>();
              const standalone: GenerationSession[] = [];
              for (const s of brandSessions) {
                if (s.kitId) {
                  const arr = kitMap.get(s.kitId) ?? [];
                  arr.push(s);
                  kitMap.set(s.kitId, arr);
                } else {
                  standalone.push(s);
                }
              }

              return (
                <div key={brandName}>
                  {/* Brand header */}
                  <div className="flex items-center gap-3 mb-4 bg-white rounded-2xl px-5 py-3 border border-gray-100 shadow-sm">
                    {brandObj?.params?.colorPrimary ? (
                      <div
                        className="h-8 w-8 rounded-xl shrink-0 shadow-md"
                        style={{ backgroundColor: brandObj.params.colorPrimary }}
                      />
                    ) : (
                      <div className="h-8 w-8 rounded-xl shrink-0 bg-linear-to-br from-gray-400 to-gray-500 shadow-md" />
                    )}
                    <div>
                      <h2 className="text-sm font-bold text-gray-900">{brandName}</h2>
                      <span className="text-[10px] text-gray-400">{brandSessions.length} campaña{brandSessions.length !== 1 ? 's' : ''}</span>
                    </div>
                  </div>

                  <div className="space-y-2 pl-1">
                    {/* Kits agrupados */}
                    {[...kitMap.entries()].map(([kitId, kitSessions]) => (
                      <div
                        key={kitId}
                        className="border border-purple-100 rounded-2xl overflow-hidden bg-white shadow-sm hover:shadow-md transition-all duration-300"
                      >
                        <div className="flex items-center gap-2 px-5 py-3 bg-linear-to-r from-purple-50 to-blue-50 border-b border-purple-100">
                          <span className="text-sm">📦</span>
                          <span className="text-xs font-bold text-purple-700">
                            Kit de campaña
                          </span>
                          <span className="text-[10px] bg-purple-200 text-purple-700 rounded-full px-2 py-0.5 font-semibold">
                            {kitSessions.length} piezas
                          </span>
                          <span className="text-[11px] text-purple-500 ml-auto font-medium">
                            {kitSessions[0]?.campaignName}
                          </span>
                        </div>
                        <div className="divide-y divide-gray-100">
                          {kitSessions.map((session) => renderSessionCard(session))}
                        </div>
                      </div>
                    ))}

                    {/* Sesiones sueltas */}
                    {standalone.map((session) => (
                      <div
                        key={session.id}
                        className="border border-gray-100 rounded-2xl overflow-hidden hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 bg-white"
                      >
                        {renderSessionCard(session)}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })()}
    </div>
  );

  function renderSessionCard(session: GenerationSession) {
    return (
      <div className="group bg-white p-5 transition-all hover:bg-blue-50/30">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            {editingId === session.id ? (
              <div className="flex items-center gap-2 mb-1">
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleRename(session.id);
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                  autoFocus
                  className="flex-1 rounded-lg border border-blue-200 px-2 py-1 text-sm
                             focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                />
                <button
                  onClick={() => handleRename(session.id)}
                  className="text-xs text-blue-600 font-medium hover:text-blue-800"
                >
                  Guardar
                </button>
                <button
                  onClick={() => setEditingId(null)}
                  className="text-xs text-gray-400 hover:text-gray-600"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <h3 className="text-sm font-bold text-gray-900 truncate">
                {session.campaignName || session.templateName}
                <button
                  onClick={() => {
                    setEditingId(session.id);
                    setEditName(session.campaignName || session.templateName);
                  }}
                  className="ml-2 text-gray-400 hover:text-gray-600 inline-flex"
                  title="Renombrar"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                    />
                  </svg>
                </button>
              </h3>
            )}

            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className="text-xs text-gray-500">{session.templateName}</span>
              {session.moleculeName && (
                <span className="text-xs text-gray-400">· {session.moleculeName}</span>
              )}
              {session.indicationNames.length > 0 && (
                <span className="text-xs text-gray-400">
                  · {session.indicationNames.join(', ')}
                </span>
              )}
            </div>

            <p className="text-[10px] text-gray-400 mt-1">
              {Object.values(session.slotValues).filter((v) => v?.trim()).length} slots
              completados ·{' '}
              {session.updatedAt?.toDate?.()?.toLocaleDateString('es-CL', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              }) ?? 'Sin fecha'}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Link
              to={`/publicaciones/${session.id}`}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600
                         hover:bg-gray-100 transition-colors"
            >
              Ver
            </Link>
            <Link
              to={`/marcas/${session.brandId}/generar?session=${session.id}`}
              className="rounded-lg border border-blue-200 px-3 py-1.5 text-xs font-medium text-blue-600
                         hover:bg-blue-50 transition-colors"
            >
              Editar
            </Link>
            <button
              onClick={() => handleDelete(session.id)}
              disabled={deletingId === session.id}
              className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600
                         hover:bg-red-50 transition-colors disabled:opacity-50"
            >
              {deletingId === session.id ? '...' : 'Eliminar'}
            </button>
          </div>
        </div>
      </div>
    );
  }
};

export default CampaignsPage;
