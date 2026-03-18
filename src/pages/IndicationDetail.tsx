import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useTenant } from '@/hooks/useTenant';
import { useToast } from '@/hooks/useToast';
import { getMolecule, getIndications, updateIndication } from '@/services/moleculeService';
import {
  getDocuments,
  uploadDocument,
  deleteDocument,
  type UploadProgress,
} from '@/services/documentService';
import {
  getInsights,
  createInsight,
  approveInsight,
  rejectInsight,
  deleteInsight,
  extractInsightsFromPDF,
  saveExtractedInsights,
  batchUpdateInsightStatus,
} from '@/services/insightService';
import type { ExtractedInsight } from '@/services/insightService';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import type {
  Molecule,
  Indication,
  ScientificDocument,
  Insight,
  InsightCategory,
  InsightReference,
} from '@/types';
import { INSIGHT_CATEGORY_LABELS } from '@/types';

// ── Helpers ─────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

const STATUS_BADGE: Record<string, string> = {
  uploading: 'bg-yellow-100 text-yellow-800',
  processing: 'bg-blue-100 text-blue-800',
  processed: 'bg-green-100 text-green-800',
  error: 'bg-red-100 text-red-800',
  pending: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
};

const STATUS_LABEL: Record<string, string> = {
  uploading: 'Subiendo',
  processing: 'Procesando',
  processed: 'Listo',
  error: 'Error',
  pending: 'Pendiente',
  approved: 'Aprobado',
  rejected: 'Rechazado',
};

const CATEGORY_COLORS: Record<InsightCategory, string> = {
  benefit: 'bg-emerald-100 text-emerald-800',
  primary_use: 'bg-blue-100 text-blue-800',
  key_message: 'bg-purple-100 text-purple-800',
  contraindication: 'bg-orange-100 text-orange-800',
  other: 'bg-gray-100 text-gray-800',
};

// ── Component ───────────────────────────────────────────

const IndicationDetailPage: React.FC = () => {
  const { molId, indId } = useParams<{ molId: string; indId: string }>();
  const { user } = useAuth();
  const tenantId = useTenant();
  const { toast } = useToast();

  // Data
  const [molecule, setMolecule] = useState<Molecule | null>(null);
  const [indication, setIndication] = useState<Indication | null>(null);
  const [documents, setDocuments] = useState<ScientificDocument[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);

  // Upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // New insight form
  const [showInsightForm, setShowInsightForm] = useState(false);
  const [insightText, setInsightText] = useState('');
  const [insightCategory, setInsightCategory] = useState<InsightCategory>('key_message');
  // Multiple references
  const [insightRefs, setInsightRefs] = useState<{
    docId: string;
    page: string;
    section: string;
    quote: string;
  }[]>([]);
  const [savingInsight, setSavingInsight] = useState(false);

  const addInsightRef = () => setInsightRefs(prev => [...prev, { docId: '', page: '', section: '', quote: '' }]);
  const removeInsightRef = (idx: number) => setInsightRefs(prev => prev.filter((_, i) => i !== idx));
  const updateInsightRef = (idx: number, field: string, value: string) =>
    setInsightRefs(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));

  // Confirm delete
  const [deleteDocTarget, setDeleteDocTarget] = useState<ScientificDocument | null>(null);
  const [deleteInsightTarget, setDeleteInsightTarget] = useState<Insight | null>(null);

  // AI extraction
  const [extractingDoc, setExtractingDoc] = useState<string | null>(null); // doc id being extracted
  const [extractedInsights, setExtractedInsights] = useState<ExtractedInsight[]>([]);
  const [extractedFromDoc, setExtractedFromDoc] = useState<ScientificDocument | null>(null);
  const [selectedExtracted, setSelectedExtracted] = useState<Set<number>>(new Set());
  const [savingExtracted, setSavingExtracted] = useState(false);

  // Batch approve/reject
  const [batchSelected, setBatchSelected] = useState<Set<string>>(new Set());
  const [batchProcessing, setBatchProcessing] = useState(false);

  // Active tab
  const [activeTab, setActiveTab] = useState<'documents' | 'insights' | 'benefits'>('documents');

  // Benefits
  const [newBenefit, setNewBenefit] = useState('');
  const [savingBenefits, setSavingBenefits] = useState(false);

  // ── Load data ───────────────────────────────────

  const loadData = useCallback(async () => {
    if (!molId || !indId) return;
    try {
      setLoading(true);
      const [mol, inds, docs, ins] = await Promise.all([
        getMolecule(molId),
        getIndications(molId),
        getDocuments(indId),
        getInsights(indId),
      ]);
      setMolecule(mol);
      setIndication(inds.find((i) => i.id === indId) ?? null);
      setDocuments(docs);
      setInsights(ins);
    } catch {
      toast('Error al cargar datos', 'error');
    } finally {
      setLoading(false);
    }
  }, [molId, indId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Document upload ─────────────────────────────

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0 || !molId || !indId || !user) return;
    const file = files[0];

    // Validar tipo
    const allowed = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!allowed.includes(file.type) && !file.name.endsWith('.pdf') && !file.name.endsWith('.docx')) {
      toast('Solo se permiten archivos PDF o DOCX', 'error');
      return;
    }

    // Validar tamaño (50 MB)
    if (file.size > 50 * 1024 * 1024) {
      toast('El archivo supera los 50 MB', 'error');
      return;
    }

    try {
      setUploading(true);
      await uploadDocument(
        file,
        { indicationId: indId, moleculeId: molId, tenantId, createdBy: user.email! },
        (p) => setUploadProgress(p)
      );
      toast('Documento subido correctamente');
      setUploadProgress(null);
      await loadData();
    } catch {
      toast('Error al subir documento', 'error');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeleteDocument = async () => {
    if (!deleteDocTarget) return;
    try {
      await deleteDocument(deleteDocTarget);
      toast('Documento eliminado');
      setDeleteDocTarget(null);
      await loadData();
    } catch {
      toast('Error al eliminar documento', 'error');
    }
  };

  // ── Drag & Drop ─────────────────────────────────

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => setDragOver(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  };

  // ── Insight CRUD ────────────────────────────────

  const handleCreateInsight = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!molId || !indId || !user || !insightText.trim()) return;

    const references: InsightReference[] = insightRefs
      .filter(r => r.docId)
      .map(r => {
        const refDoc = documents.find(d => d.id === r.docId);
        return {
          documentId: r.docId,
          documentName: refDoc?.fileName ?? '',
          page: r.page ? parseInt(r.page, 10) : null,
          section: r.section,
          quote: r.quote,
        };
      });

    try {
      setSavingInsight(true);
      await createInsight({
        indicationId: indId,
        moleculeId: molId,
        tenantId,
        text: insightText.trim(),
        category: insightCategory,
        references,
        createdBy: user.email!,
      });
      toast('Insight creado');
      resetInsightForm();
      await loadData();
    } catch {
      toast('Error al crear insight', 'error');
    } finally {
      setSavingInsight(false);
    }
  };

  const resetInsightForm = () => {
    setShowInsightForm(false);
    setInsightText('');
    setInsightCategory('key_message');
    setInsightRefs([]);
  };

  const handleApprove = async (insight: Insight) => {
    if (!user) return;
    try {
      await approveInsight(insight.id, user.email!);
      toast('Insight aprobado');
      await loadData();
    } catch {
      toast('Error al aprobar', 'error');
    }
  };

  const handleReject = async (insight: Insight) => {
    if (!user) return;
    try {
      await rejectInsight(insight.id, user.email!);
      toast('Insight rechazado');
      await loadData();
    } catch {
      toast('Error al rechazar', 'error');
    }
  };

  const handleDeleteInsight = async () => {
    if (!deleteInsightTarget) return;
    try {
      await deleteInsight(deleteInsightTarget.id);
      toast('Insight eliminado');
      setDeleteInsightTarget(null);
      await loadData();
    } catch {
      toast('Error al eliminar insight', 'error');
    }
  };

  // ── Benefits CRUD ───────────────────────────────

  const handleAddBenefit = async () => {
    if (!indication || !indId || !newBenefit.trim()) return;
    try {
      setSavingBenefits(true);
      const current = indication.benefits ?? [];
      await updateIndication(indId, { benefits: [...current, newBenefit.trim()] });
      toast('Beneficio agregado');
      setNewBenefit('');
      await loadData();
    } catch {
      toast('Error al agregar beneficio', 'error');
    } finally {
      setSavingBenefits(false);
    }
  };

  const handleRemoveBenefit = async (index: number) => {
    if (!indication || !indId) return;
    try {
      setSavingBenefits(true);
      const current = [...(indication.benefits ?? [])];
      current.splice(index, 1);
      await updateIndication(indId, { benefits: current });
      toast('Beneficio eliminado');
      await loadData();
    } catch {
      toast('Error al eliminar beneficio', 'error');
    } finally {
      setSavingBenefits(false);
    }
  };

  // ── Render ──────────────────────────────────────

  // ── AI Extraction ───────────────────────────────

  const handleExtractFromPDF = async (document: ScientificDocument) => {
    try {
      setExtractingDoc(document.id);
      const results = await extractInsightsFromPDF(document);
      setExtractedInsights(results);
      setExtractedFromDoc(document);
      setSelectedExtracted(new Set(results.map((_, i) => i))); // select all by default
      setActiveTab('insights'); // switch to insights tab to show results
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Error extrayendo insights', 'error');
    } finally {
      setExtractingDoc(null);
    }
  };

  const handleSaveExtracted = async () => {
    if (!extractedFromDoc || !user || selectedExtracted.size === 0) return;
    try {
      setSavingExtracted(true);
      const toSave = extractedInsights.filter((_, i) => selectedExtracted.has(i));
      await saveExtractedInsights(toSave, extractedFromDoc, user.email!);
      toast(`${toSave.length} insights creados (pendientes de revisión)`);
      setExtractedInsights([]);
      setExtractedFromDoc(null);
      setSelectedExtracted(new Set());
      await loadData();
    } catch {
      toast('Error al guardar insights', 'error');
    } finally {
      setSavingExtracted(false);
    }
  };

  const toggleExtractedSelection = (idx: number) => {
    setSelectedExtracted(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  // ── Batch approve/reject ────────────────────────

  const toggleBatchSelection = (id: string) => {
    setBatchSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const pendingInsights = insights.filter(i => i.status === 'pending');

  const selectAllPending = () => {
    setBatchSelected(new Set(pendingInsights.map(i => i.id)));
  };

  const handleBatchAction = async (action: 'approved' | 'rejected') => {
    if (batchSelected.size === 0 || !user) return;
    try {
      setBatchProcessing(true);
      await batchUpdateInsightStatus([...batchSelected], action, user.email!);
      toast(`${batchSelected.size} insights ${action === 'approved' ? 'aprobados' : 'rechazados'}`);
      setBatchSelected(new Set());
      await loadData();
    } catch {
      toast('Error en operación batch', 'error');
    } finally {
      setBatchProcessing(false);
    }
  };

  // ── Render (cont.) ─────────────────────────────

  if (loading) return <LoadingSpinner />;

  if (!molecule || !indication) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-500">Indicación no encontrada.</p>
        <Link to="/moleculas" className="text-sm text-blue-600 hover:underline mt-2 inline-block">
          ← Volver a moléculas
        </Link>
      </div>
    );
  }

  const approvedCount = insights.filter((i) => i.status === 'approved').length;
  const pendingCount = insights.filter((i) => i.status === 'pending').length;

  return (
    <div className="max-w-4xl">
      {/* Breadcrumb */}
      <nav className="text-xs text-gray-400 mb-4 flex items-center gap-1">
        <Link to="/moleculas" className="hover:text-gray-600 transition-colors">Moléculas</Link>
        <span>/</span>
        <Link to={`/moleculas/${molId}`} className="hover:text-gray-600 transition-colors">{molecule.name}</Link>
        <span>/</span>
        <span className="text-gray-600 font-medium">{indication.name}</span>
      </nav>

      {/* Header */}
      <div className="bg-white border border-gray-200/80 rounded-xl p-5 mb-6">
        <h1 className="text-xl font-semibold text-gray-900">{indication.name}</h1>
        <p className="text-xs text-gray-400 mt-1">
          Molécula: {molecule.name} · {documents.length} documentos · {approvedCount} insights aprobados · {pendingCount} pendientes
        </p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200/80 mb-6 gap-1">
        <button
          onClick={() => setActiveTab('documents')}
          className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
            activeTab === 'documents'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'border-b-2 border-transparent text-gray-400 hover:text-gray-600'
          }`}
        >
          Documentos ({documents.length})
        </button>
        <button
          onClick={() => setActiveTab('insights')}
          className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
            activeTab === 'insights'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'border-b-2 border-transparent text-gray-400 hover:text-gray-600'
          }`}
        >
          Insights ({insights.length})
        </button>
        <button
          onClick={() => setActiveTab('benefits')}
          className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
            activeTab === 'benefits'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'border-b-2 border-transparent text-gray-400 hover:text-gray-600'
          }`}
        >
          Beneficios ({(indication.benefits ?? []).length})
        </button>
      </div>

      {/* ═══════ TAB: DOCUMENTS ═══════ */}
      {activeTab === 'documents' && (
        <div>
          {/* Dropzone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer
                        transition-all mb-6
                        ${dragOver ? 'border-blue-400 bg-blue-50/50 scale-[1.01]' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50/50'}`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx"
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
            {uploading ? (
              <div>
                <p className="text-sm text-gray-600">Subiendo documento...</p>
                {uploadProgress && (
                  <div className="mt-3 max-w-xs mx-auto">
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full transition-all"
                        style={{ width: `${uploadProgress.percent}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-400 mt-1">{uploadProgress.percent}%</p>
                  </div>
                )}
              </div>
            ) : (
              <>
                <svg className="mx-auto h-10 w-10 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M12 16v-8m0 0-3 3m3-3 3 3M4.5 19.5h15a1.5 1.5 0 001.5-1.5v-9a1.5 1.5 0 00-1.5-1.5h-4.172a1.5 1.5 0 01-1.06-.44l-1.767-1.768a1.5 1.5 0 00-1.061-.44H6A1.5 1.5 0 004.5 6.353V18a1.5 1.5 0 001.5 1.5z" />
                </svg>
                <p className="text-sm text-gray-600 mt-2">
                  Arrastra un archivo aquí o <span className="text-blue-600 font-medium">haz clic para seleccionar</span>
                </p>
                <p className="text-xs text-gray-400 mt-1">PDF o DOCX · Máx. 50 MB</p>
              </>
            )}
          </div>

          {/* Lista de documentos */}
          {documents.length === 0 ? (
            <EmptyState
              title="Sin documentos"
              description="Sube documentos científicos para esta indicación."
            />
          ) : (
            <div className="grid gap-2">
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className="group bg-white border border-gray-200/80 rounded-xl px-5 py-3.5
                             flex items-center justify-between hover:border-gray-300 hover:shadow-sm transition-all"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Icon */}
                    <div className="shrink-0 w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center">
                      <span className="text-[10px] font-bold text-red-500">
                        {doc.fileName.split('.').pop()?.toUpperCase() ?? 'DOC'}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <a
                        href={doc.downloadUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-medium text-gray-900 hover:text-blue-600 truncate block"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {doc.fileName}
                      </a>
                      <p className="text-xs text-gray-400">{formatBytes(doc.sizeBytes)}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE[doc.status]}`}>
                      {STATUS_LABEL[doc.status]}
                    </span>
                    {(doc.mimeType === 'application/pdf' || doc.fileName.endsWith('.pdf')) && (
                      <button
                        onClick={() => handleExtractFromPDF(doc)}
                        disabled={!!extractingDoc}
                        className="text-xs font-medium text-purple-600 hover:text-purple-800 px-2 py-1
                                   rounded hover:bg-purple-50 transition-colors disabled:opacity-50 flex items-center gap-1"
                      >
                        {extractingDoc === doc.id ? (
                          <>
                            <div className="w-3 h-3 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
                            Extrayendo...
                          </>
                        ) : (
                          <>🤖 Extraer insights</>
                        )}
                      </button>
                    )}
                    <button
                      onClick={() => setDeleteDocTarget(doc)}
                      className="text-xs text-gray-300 hover:text-red-500 transition-colors"
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══════ TAB: INSIGHTS ═══════ */}
      {activeTab === 'insights' && (
        <div>
          {/* Toolbar */}
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-500">
              {approvedCount} aprobados · {pendingCount} pendientes
            </p>
            <button
              onClick={() => setShowInsightForm(true)}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white
                         hover:bg-blue-700 transition-colors shadow-sm shadow-blue-600/20"
            >
              + Insight manual
            </button>
          </div>

          {/* Batch action bar */}
          {pendingInsights.length > 0 && (
            <div className="flex items-center gap-2 mb-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
              <span className="text-xs text-amber-700 font-medium">{pendingInsights.length} pendientes</span>
              <button
                onClick={selectAllPending}
                className="text-xs text-amber-600 hover:text-amber-800 font-medium ml-auto"
              >
                {batchSelected.size === pendingInsights.length ? 'Deseleccionar todos' : 'Seleccionar todos'}
              </button>
              {batchSelected.size > 0 && (
                <>
                  <span className="text-xs text-gray-400">|</span>
                  <span className="text-xs text-gray-500">{batchSelected.size} seleccionados</span>
                  <button
                    onClick={() => handleBatchAction('approved')}
                    disabled={batchProcessing}
                    className="text-xs font-medium text-green-600 hover:text-green-800 px-2 py-1
                               rounded hover:bg-green-50 transition-colors disabled:opacity-50"
                  >
                    ✓ Aprobar
                  </button>
                  <button
                    onClick={() => handleBatchAction('rejected')}
                    disabled={batchProcessing}
                    className="text-xs font-medium text-red-600 hover:text-red-800 px-2 py-1
                               rounded hover:bg-red-50 transition-colors disabled:opacity-50"
                  >
                    ✗ Rechazar
                  </button>
                </>
              )}
            </div>
          )}

          {/* AI-extracted insights preview (before saving) */}
          {extractedInsights.length > 0 && extractedFromDoc && (
            <div className="mb-6 bg-purple-50 border border-purple-200 rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-sm font-semibold text-purple-900">
                    🤖 {extractedInsights.length} insights extraídos de "{extractedFromDoc.fileName}"
                  </h3>
                  <p className="text-xs text-purple-600 mt-0.5">
                    Revisa y selecciona los que quieres guardar. Se crearán como pendientes de aprobación.
                  </p>
                </div>
                <button
                  onClick={() => { setExtractedInsights([]); setExtractedFromDoc(null); }}
                  className="text-xs text-purple-400 hover:text-purple-600"
                >
                  Descartar
                </button>
              </div>

              <div className="space-y-2 max-h-96 overflow-y-auto">
                {extractedInsights.map((ei, idx) => (
                  <label
                    key={idx}
                    className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-all ${
                      selectedExtracted.has(idx)
                        ? 'bg-white border border-purple-300 shadow-sm'
                        : 'bg-purple-50/50 border border-transparent opacity-60'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedExtracted.has(idx)}
                      onChange={() => toggleExtractedSelection(idx)}
                      className="mt-0.5 shrink-0 accent-purple-600"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[ei.category]}`}>
                          {INSIGHT_CATEGORY_LABELS[ei.category]}
                        </span>
                        {ei.page && <span className="text-[10px] text-gray-400">p. {ei.page}</span>}
                        {ei.section && <span className="text-[10px] text-gray-400">· {ei.section}</span>}
                      </div>
                      <p className="text-sm text-gray-800">{ei.text}</p>
                      {ei.quote && (
                        <p className="text-xs text-gray-400 italic mt-1">"{ei.quote}"</p>
                      )}
                    </div>
                  </label>
                ))}
              </div>

              <div className="flex justify-between items-center mt-4 pt-3 border-t border-purple-200">
                <span className="text-xs text-purple-600">
                  {selectedExtracted.size} de {extractedInsights.length} seleccionados
                </span>
                <button
                  onClick={handleSaveExtracted}
                  disabled={savingExtracted || selectedExtracted.size === 0}
                  className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white
                             hover:bg-purple-700 disabled:opacity-50 transition-colors shadow-sm"
                >
                  {savingExtracted ? 'Guardando...' : `Guardar ${selectedExtracted.size} insights`}
                </button>
              </div>
            </div>
          )}

          {/* Form nuevo insight */}
          {showInsightForm && (
            <form
              onSubmit={handleCreateInsight}
              className="mb-6 bg-white border border-gray-200/80 rounded-xl p-5 space-y-4 shadow-sm"
            >
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Texto del insight</label>
                <textarea
                  required
                  rows={3}
                  value={insightText}
                  onChange={(e) => setInsightText(e.target.value)}
                  placeholder="Ej: Reduce la inflamación en un 40% después de 4 semanas de tratamiento."
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm
                             placeholder-gray-300 focus:outline-none focus:ring-2
                             focus:ring-blue-500/40 focus:border-blue-400 transition-colors"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Categoría</label>
                  <select
                    value={insightCategory}
                    onChange={(e) => setInsightCategory(e.target.value as InsightCategory)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm
                               focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400 transition-colors"
                  >
                    {(Object.keys(INSIGHT_CATEGORY_LABELS) as InsightCategory[]).map((cat) => (
                      <option key={cat} value={cat}>
                        {INSIGHT_CATEGORY_LABELS[cat]}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-medium text-gray-500">Documentos de referencia</label>
                    <button
                      type="button"
                      onClick={addInsightRef}
                      disabled={documents.length === 0}
                      className="text-[10px] font-medium text-blue-600 hover:text-blue-800 disabled:text-gray-300 transition-colors"
                    >
                      + Agregar referencia
                    </button>
                  </div>
                  {insightRefs.length === 0 && (
                    <p className="text-[10px] text-gray-400 italic">Sin referencias. Haz clic en "+ Agregar referencia" para asociar documentos.</p>
                  )}
                </div>
              </div>

              {/* Reference entries */}
              {insightRefs.map((refItem, idx) => (
                <div key={idx} className="p-3 bg-gray-50/80 rounded-lg space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Referencia {idx + 1}</span>
                    <button
                      type="button"
                      onClick={() => removeInsightRef(idx)}
                      className="text-[10px] text-gray-400 hover:text-red-500 transition-colors"
                    >
                      Quitar
                    </button>
                  </div>
                  <select
                    value={refItem.docId}
                    onChange={(e) => updateInsightRef(idx, 'docId', e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm
                               focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400 transition-colors"
                  >
                    <option value="">— Selecciona un documento —</option>
                    {documents.map((d) => (
                      <option key={d.id} value={d.id}>{d.fileName}</option>
                    ))}
                  </select>
                  {refItem.docId && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Página</label>
                        <input
                          type="number"
                          min={1}
                          value={refItem.page}
                          onChange={(e) => updateInsightRef(idx, 'page', e.target.value)}
                          placeholder="Ej: 12"
                          className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm
                                     focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400 transition-colors"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Sección</label>
                        <input
                          type="text"
                          value={refItem.section}
                          onChange={(e) => updateInsightRef(idx, 'section', e.target.value)}
                          placeholder="Ej: Resultados"
                          className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm
                                     focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400 transition-colors"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Cita textual</label>
                        <input
                          type="text"
                          value={refItem.quote}
                          onChange={(e) => updateInsightRef(idx, 'quote', e.target.value)}
                          placeholder="Texto exacto del documento"
                          className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm
                                     focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400 transition-colors"
                        />
                      </div>
                    </div>
                  )}
                </div>
              ))}

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={resetInsightForm}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium
                             text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingInsight}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white
                             hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm shadow-blue-600/20"
                >
                  {savingInsight ? 'Guardando...' : 'Crear insight'}
                </button>
              </div>
            </form>
          )}

          {/* Lista de insights */}
          {insights.length === 0 ? (
            <EmptyState
              title="Sin insights aún"
              description="Agrega insights manualmente o espera a que el servicio de IA los extraiga de los documentos."
            />
          ) : (
            <div className="grid gap-2.5">
              {insights.map((insight) => (
                <div
                  key={insight.id}
                  className="group bg-white border border-gray-200/80 rounded-xl p-4 hover:border-gray-300 hover:shadow-sm transition-all"
                >
                  {/* Header row */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      {insight.status === 'pending' && (
                        <input
                          type="checkbox"
                          checked={batchSelected.has(insight.id)}
                          onChange={() => toggleBatchSelection(insight.id)}
                          className="shrink-0 accent-blue-600"
                        />
                      )}
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[insight.category]}`}>
                        {INSIGHT_CATEGORY_LABELS[insight.category]}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE[insight.status]}`}>
                        {STATUS_LABEL[insight.status]}
                      </span>
                    </div>
                    <button
                      onClick={() => setDeleteInsightTarget(insight)}
                      className="text-xs text-gray-300 hover:text-red-500 shrink-0 transition-colors"
                    >
                      Eliminar
                    </button>
                  </div>

                  {/* Texto del insight */}
                  <p className="text-sm text-gray-800 mt-2 leading-relaxed">{insight.text}</p>

                  {/* Referencias */}
                  {insight.references.length > 0 && (
                    <div className="mt-3 space-y-1">
                      {insight.references.map((ref, idx) => (
                        <div key={idx} className="text-xs text-gray-500 bg-gray-50 rounded px-3 py-1.5">
                          <span className="font-medium">📄 {ref.documentName}</span>
                          {ref.page && <span className="ml-2">p. {ref.page}</span>}
                          {ref.section && <span className="ml-2">· {ref.section}</span>}
                          {ref.quote && (
                            <span className="block mt-0.5 italic text-gray-400">"{ref.quote}"</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Actions */}
                  {insight.status === 'pending' && (
                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
                      <button
                        onClick={() => handleApprove(insight)}
                        className="text-xs font-medium text-green-600 hover:text-green-800 px-2 py-1
                                   rounded hover:bg-green-50 transition-colors"
                      >
                        ✓ Aprobar
                      </button>
                      <button
                        onClick={() => handleReject(insight)}
                        className="text-xs font-medium text-red-600 hover:text-red-800 px-2 py-1
                                   rounded hover:bg-red-50 transition-colors"
                      >
                        ✗ Rechazar
                      </button>
                    </div>
                  )}

                  {/* Validation info */}
                  {insight.validatedBy && (
                    <p className="text-xs text-gray-400 mt-2">
                      {insight.status === 'approved' ? 'Aprobado' : 'Rechazado'} por {insight.validatedBy}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══════ TAB: BENEFITS ═══════ */}
      {activeTab === 'benefits' && (
        <div>
          <p className="text-sm text-gray-500 mb-4">
            Beneficios que la marca ofrece para esta indicación. Se incluirán como contexto en la generación de materiales.
          </p>

          {/* Agregar beneficio */}
          <div className="flex items-center gap-2 mb-4">
            <input
              type="text"
              value={newBenefit}
              onChange={(e) => setNewBenefit(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddBenefit(); } }}
              placeholder='Ej: "Rápido alivio del dolor neuropático"'
              className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm
                         placeholder-gray-300 focus:outline-none focus:ring-2
                         focus:ring-blue-500/40 focus:border-blue-400 transition-colors"
            />
            <button
              onClick={handleAddBenefit}
              disabled={savingBenefits || !newBenefit.trim()}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white
                         hover:bg-blue-700 disabled:opacity-50 transition-colors shrink-0"
            >
              + Agregar
            </button>
          </div>

          {/* Lista de beneficios */}
          {(indication.benefits ?? []).length === 0 ? (
            <EmptyState
              title="Sin beneficios aún"
              description="Agrega los beneficios que la marca ofrece para esta indicación."
            />
          ) : (
            <div className="grid gap-2">
              {(indication.benefits ?? []).map((benefit, idx) => (
                <div
                  key={idx}
                  className="group bg-white border border-gray-200/80 rounded-xl px-4 py-3
                             flex items-center justify-between hover:border-gray-300 hover:shadow-sm transition-all"
                >
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <span className="text-emerald-500 mt-0.5 shrink-0">✓</span>
                    <p className="text-sm text-gray-800">{benefit}</p>
                  </div>
                  <button
                    onClick={() => handleRemoveBenefit(idx)}
                    disabled={savingBenefits}
                    className="text-xs text-gray-300 hover:text-red-500 ml-3 shrink-0 disabled:opacity-50 transition-colors"
                  >
                    Eliminar
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Confirm dialogs ── */}
      <ConfirmDialog
        open={!!deleteDocTarget}
        title="Eliminar documento"
        message={`¿Eliminar "${deleteDocTarget?.fileName}"? Se borrará del almacenamiento.`}
        confirmLabel="Eliminar"
        variant="danger"
        onConfirm={handleDeleteDocument}
        onCancel={() => setDeleteDocTarget(null)}
      />

      <ConfirmDialog
        open={!!deleteInsightTarget}
        title="Eliminar insight"
        message="¿Estás seguro de eliminar este insight?"
        confirmLabel="Eliminar"
        variant="danger"
        onConfirm={handleDeleteInsight}
        onCancel={() => setDeleteInsightTarget(null)}
      />
    </div>
  );
};

export default IndicationDetailPage;
