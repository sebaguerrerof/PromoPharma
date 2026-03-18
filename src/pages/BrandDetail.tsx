import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useTenant } from '../hooks/useTenant';
import { useToast } from '../hooks/useToast';
import { getBrand, updateBrand, extractBrandDNA } from '../services/brandService';
import { getMolecules, getIndications } from '../services/moleculeService';
import { getSavedSessionsByBrand, getDraftSessionsByBrand, deleteSession } from '../services/generationService';
import { uploadBrandLogo, uploadBrandAsset, uploadFile, uploadBlob } from '../services/uploadService';
import { loadGoogleFonts, AVAILABLE_FONTS } from '../services/fontService';
import QRCode from 'qrcode';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import type { Brand, BrandParams, BrandClaim, Molecule, Indication, GenerationSession } from '../types';

type IdentityTab = 'brand' | 'typography' | 'colors' | 'logos' | 'images' | 'claims';

const BrandDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const tenantId = useTenant();
  const { toast } = useToast();
  const [brand, setBrand] = useState<Brand | null>(null);
  const [molecules, setMolecules] = useState<Molecule[]>([]);
  const [publications, setPublications] = useState<GenerationSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingAsset, setUploadingAsset] = useState(false);
  const [uploadingQr, setUploadingQr] = useState(false);
  const [generatingQr, setGeneratingQr] = useState(false);
  const [activeTab, setActiveTab] = useState<IdentityTab>('brand');
  const [indications, setIndications] = useState<Indication[]>([]);
  const [dnaUrl, setDnaUrl] = useState('');
  const [extractingDna, setExtractingDna] = useState(false);

  // Formulario de parámetros
  const [params, setParams] = useState<BrandParams>({
    fontTitle: '',
    fontBody: '',
    colorPrimary: '#2563EB',
    colorSecondary: '#1E40AF',
    qrUrl: '',
    logoUrl: '',
    assets: [],
  });
  const [brandName, setBrandName] = useState('');
  const [moleculeId, setMoleculeId] = useState('');

  // ── Unsaved changes detection ──
  interface SavedSnapshot {
    name: string;
    moleculeId: string;
    params: BrandParams;
  }
  const savedSnapshot = useRef<SavedSnapshot | null>(null);

  const isDirty = useCallback((): boolean => {
    if (!savedSnapshot.current) return false;
    const s = savedSnapshot.current;
    if (brandName !== s.name) return true;
    if (moleculeId !== s.moleculeId) return true;
    // Deep compare params (simple JSON comparison)
    try {
      if (JSON.stringify(params) !== JSON.stringify(s.params)) return true;
    } catch {
      return true;
    }
    return false;
  }, [brandName, moleculeId, params]);

  // Track unsaved changes modal state
  const [showUnsavedModal, setShowUnsavedModal] = useState(false);
  const pendingNavigation = useRef<string | null>(null);
  const navigate = useNavigate();

  // Block browser close/refresh when dirty
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty()) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  const load = async () => {
    if (!id) return;
    try {
      setLoading(true);
      const [b, mols] = await Promise.all([getBrand(id), getMolecules(tenantId)]);
      setBrand(b);
      setMolecules(mols);
      if (b) {
        setBrandName(b.name);
        setMoleculeId(b.moleculeId ?? '');
        const normalizedParams: BrandParams = {
          ...b.params,
          qrUrl: b.params.qrUrl ?? '',
          qrImageUrl: b.params.qrImageUrl ?? '',
          logoUrl: b.params.logoUrl ?? '',
          logos: b.params.logos ?? [],
          assets: b.params.assets ?? [],
        };
        setParams(normalizedParams);
        // Store snapshot for dirty-checking
        savedSnapshot.current = {
          name: b.name,
          moleculeId: b.moleculeId ?? '',
          params: JSON.parse(JSON.stringify(normalizedParams)),
        };
        // Cargar fuentes de Google
        loadGoogleFonts([b.params.fontTitle, b.params.fontBody]);
        // Cargar indicaciones de la molécula
        if (b.moleculeId) {
          try {
            const inds = await getIndications(b.moleculeId);
            setIndications(inds);
          } catch { /* sin indicaciones */ }
        }
        // Cargar publicaciones guardadas + borradores
        const [pubs, drafts] = await Promise.all([
          getSavedSessionsByBrand(b.id),
          getDraftSessionsByBrand(b.id),
        ]);
        setPublications([...pubs, ...drafts].sort(
          (a, c) => (c.updatedAt?.seconds ?? 0) - (a.updatedAt?.seconds ?? 0)
        ));
      }
    } catch {
      toast('Error al cargar marca', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // Pre-cargar todas las fuentes de Google para preview en selector
    loadGoogleFonts([...AVAILABLE_FONTS]);
  }, [id]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    try {
      setSaving(true);
      await updateBrand(id, {
        name: brandName.trim(),
        moleculeId: moleculeId || undefined,
        params,
      });
      toast('Marca actualizada');
      await load();
    } catch {
      toast('Error al guardar marca', 'error');
    } finally {
      setSaving(false);
    }
  };

  const updateParam = <K extends keyof BrandParams>(key: K, value: BrandParams[K]) => {
    setParams((prev) => ({ ...prev, [key]: value }));
    // Cargar fuente si es un campo de tipografía
    if ((key === 'fontTitle' || key === 'fontBody') && typeof value === 'string') {
      loadGoogleFonts([value]);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !id) return;
    setUploadingLogo(true);
    try {
      const url = await uploadBrandLogo(id, file);
      setParams((prev) => ({ ...prev, logoUrl: url }));
      await updateBrand(id, { params: { ...params, logoUrl: url } });
      toast('Logo subido');
    } catch {
      toast('Error al subir logo', 'error');
    } finally {
      setUploadingLogo(false);
      e.target.value = '';
    }
  };

  const handleAssetUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !id) return;
    setUploadingAsset(true);
    try {
      const newUrls: string[] = [];
      for (const file of Array.from(files)) {
        const url = await uploadBrandAsset(id, file);
        newUrls.push(url);
      }
      const updatedAssets = [...(params.assets ?? []), ...newUrls];
      setParams((prev) => ({ ...prev, assets: updatedAssets }));
      await updateBrand(id, { params: { ...params, assets: updatedAssets } });
      toast(`${newUrls.length} imagen(es) subida(s)`);
    } catch {
      toast('Error al subir imágenes', 'error');
    } finally {
      setUploadingAsset(false);
      e.target.value = '';
    }
  };

  const handleRemoveAsset = async (url: string) => {
    if (!id) return;
    const updatedAssets = (params.assets ?? []).filter((a) => a !== url);
    setParams((prev) => ({ ...prev, assets: updatedAssets }));
    await updateBrand(id, { params: { ...params, assets: updatedAssets } }).catch(() => {});
  };

  if (loading) {
    return <LoadingSpinner />;
  }

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

  return (
    <div className="max-w-5xl">
      {/* Breadcrumb */}
      <nav className="text-xs text-gray-400 mb-4 flex items-center gap-1">
        <Link to="/marcas" className="hover:text-gray-600 transition-colors">
          Marcas
        </Link>
        <span>/</span>
        <span className="text-gray-600 font-medium">{brand.name}</span>
      </nav>

      {/* CTA Generar material */}
      <div className="relative overflow-hidden bg-linear-to-br from-[#0f172a] via-[#1e3a5f] to-[#0c4a6e] rounded-3xl p-6 mb-8 flex items-center justify-between">
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 80% 50%, rgba(56,189,248,0.4) 0%, transparent 50%)' }} />
        <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="relative flex items-center gap-4">
          {params.logoUrl && (
            <img src={params.logoUrl} alt="Logo" className="h-12 w-12 rounded-xl object-contain bg-white p-1.5 shadow-lg" />
          )}
          <div>
            <h2 className="text-base font-bold text-white">Generar material promocional</h2>
            <p className="text-xs text-blue-200/80 mt-0.5">
              Crea contenido con IA basado en los insights validados de esta marca.
            </p>
          </div>
        </div>
        <Link
          to={`/marcas/${brand.id}/generar`}
          className="relative shrink-0 rounded-xl bg-linear-to-r from-blue-500 to-cyan-500 px-6 py-3 text-sm font-bold text-white
                     hover:from-blue-400 hover:to-cyan-400 transition-all shadow-lg shadow-blue-500/25"
        >
          ✨ Iniciar chat AI →
        </Link>
      </div>

      {/* Publicaciones guardadas */}
      {publications.length > 0 && (
        <div className="bg-white border border-gray-200/80 rounded-xl p-5 mb-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
            Publicaciones guardadas
            <span className="text-[11px] font-normal text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">{publications.length}</span>
          </h2>
          <div className="grid gap-2">
            {publications.map((pub) => (
              <div
                key={pub.id}
                className="group flex items-center justify-between border border-gray-200/80 rounded-xl p-4 hover:border-gray-300 hover:shadow-sm transition-all"
              >
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-medium text-gray-900 truncate">{pub.templateName}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {pub.moleculeName && `${pub.moleculeName} · `}
                    {pub.indicationNames.length > 0 ? pub.indicationNames.join(', ') : 'Sin indicaciones'}
                  </p>
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    {Object.keys(pub.slotValues).length} slots ·{' '}
                    {pub.updatedAt?.toDate?.()?.toLocaleDateString('es-CL') ?? 'Sin fecha'}
                  </p>
                </div>
                <div className="flex items-center gap-2 ml-3">
                  <Link
                    to={`/publicaciones/${pub.id}`}
                    className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600
                               hover:bg-gray-100 transition-colors"
                  >
                    Ver
                  </Link>
                  <Link
                    to={`/marcas/${brand.id}/generar?session=${pub.id}`}
                    className="rounded-lg border border-blue-200 px-3 py-1.5 text-xs font-medium text-blue-600
                               hover:bg-blue-50 transition-colors"
                  >
                    Editar
                  </Link>
                  <button
                    onClick={async () => {
                      if (!confirm('¿Eliminar esta publicación? Esta acción no se puede deshacer.')) return;
                      try {
                        setDeletingId(pub.id);
                        await deleteSession(pub.id);
                        setPublications((prev) => prev.filter((p) => p.id !== pub.id));
                        toast('Publicación eliminada');
                      } catch {
                        toast('Error al eliminar', 'error');
                      } finally {
                        setDeletingId(null);
                      }
                    }}
                    disabled={deletingId === pub.id}
                    className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600
                               hover:bg-red-50 transition-colors disabled:opacity-50"
                  >
                    {deletingId === pub.id ? '...' : 'Eliminar'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        {/* ── Identidad de Marca — Brandbook ── */}
        <div className="bg-white border border-gray-200/80 rounded-xl overflow-hidden">
          {/* Header */}
          <div className="px-5 py-4 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-50 rounded-lg">
                <svg className="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                </svg>
              </div>
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Identidad de marca</h2>
                <p className="text-xs text-gray-400">Tipografías, colores, logos e imágenes</p>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-gray-100 px-5 overflow-x-auto">
            {([
              { id: 'brand' as const, label: 'General', icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
              { id: 'logos' as const, label: 'Logos', icon: 'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z' },
              { id: 'typography' as const, label: 'Tipografía', icon: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z' },
              { id: 'colors' as const, label: 'Colores', icon: 'M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01' },
              { id: 'images' as const, label: 'Imágenes', icon: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10' },
              { id: 'claims' as const, label: 'Claims', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
            ]).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors
                  ${activeTab === tab.id
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-400 hover:text-gray-600 hover:border-gray-200'
                  }`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={tab.icon} />
                </svg>
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="p-5">
            {/* ── Tab: General ── */}
            {activeTab === 'brand' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Nombre de la marca
                    </label>
                    <input
                      type="text"
                      required
                      value={brandName}
                      onChange={(e) => setBrandName(e.target.value)}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm
                                 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Molécula asociada *
                    </label>
                    <select
                      value={moleculeId}
                      onChange={(e) => setMoleculeId(e.target.value)}
                      required
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm
                                 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400 transition-colors"
                    >
                      <option value="">— Selecciona una molécula —</option>
                      {molecules.map((mol) => (
                        <option key={mol.id} value={mol.id}>
                          {mol.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Auto Brand DNA */}
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      🧬 Importar Brand DNA desde URL
                    </label>
                    <p className="text-xs text-gray-500 mb-2">
                      Pega la URL del sitio web del producto y la IA extraerá colores, tipografías y tono automáticamente.
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="url"
                        value={dnaUrl}
                        onChange={(e) => setDnaUrl(e.target.value)}
                        placeholder="https://producto.ejemplo.com"
                        className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm
                                   focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-400 transition-colors"
                      />
                      <button
                        type="button"
                        disabled={extractingDna || !dnaUrl.trim()}
                        onClick={async () => {
                          try {
                            setExtractingDna(true);
                            const dna = await extractBrandDNA(dnaUrl.trim());
                            setParams((prev) => ({
                              ...prev,
                              colorPrimary: dna.colorPrimary,
                              colorSecondary: dna.colorSecondary,
                              fontTitle: dna.fontTitle,
                              fontBody: dna.fontBody,
                              disclaimerBadge: dna.disclaimerBadge,
                            }));
                            toast(`Brand DNA extraído: ${dna.tone}`);
                          } catch (err) {
                            toast(err instanceof Error ? err.message : 'Error al extraer Brand DNA', 'error');
                          } finally {
                            setExtractingDna(false);
                          }
                        }}
                        className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white
                                   hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed
                                   flex items-center gap-2 whitespace-nowrap"
                      >
                        {extractingDna ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            Analizando...
                          </>
                        ) : (
                          '🔗 Extraer DNA'
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Código QR
                    </label>
                    <p className="text-xs text-gray-500 mb-3">
                      Sube una imagen de QR, o genera uno automáticamente desde una URL.
                    </p>

                    <div className="flex flex-col md:flex-row gap-4">
                      {/* QR preview */}
                      <div className="shrink-0">
                        {params.qrImageUrl ? (
                          <div className="relative group">
                            <div className="h-32 w-32 rounded-xl border border-gray-200 bg-white p-2 flex items-center justify-center">
                              <img
                                src={params.qrImageUrl}
                                alt="QR"
                                className="max-h-full max-w-full object-contain"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setParams((prev) => ({ ...prev, qrImageUrl: '' }));
                                if (id) updateBrand(id, { params: { ...params, qrImageUrl: '' } }).catch(() => {});
                              }}
                              className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 text-xs
                                         flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                              title="Eliminar QR"
                            >
                              ×
                            </button>
                          </div>
                        ) : (
                          <div className="h-32 w-32 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50
                                          flex items-center justify-center">
                            <svg className="w-10 h-10 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                                d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                                d="M13.5 14.625v1.875M17.25 13.5h1.875M13.5 18.375h1.875M17.25 18.375h1.875M17.25 15.75h1.875" />
                            </svg>
                          </div>
                        )}
                      </div>

                      {/* QR controls */}
                      <div className="flex-1 space-y-3">
                        {/* URL destino */}
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            URL destino del QR
                          </label>
                          <input
                            type="text"
                            value={params.qrUrl ?? ''}
                            onChange={(e) => updateParam('qrUrl', e.target.value)}
                            placeholder="https://www.ejemplo.com/producto"
                            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm
                                       placeholder-gray-300 focus:outline-none focus:ring-2
                                       focus:ring-blue-500/40 focus:border-blue-400 transition-colors"
                          />
                        </div>

                        {/* Botones */}
                        <div className="flex flex-wrap gap-2">
                          {/* Generar QR desde URL */}
                          <button
                            type="button"
                            disabled={generatingQr || !params.qrUrl?.trim()}
                            onClick={async () => {
                              if (!id || !params.qrUrl?.trim()) return;
                              try {
                                setGeneratingQr(true);
                                const dataUrl = await QRCode.toDataURL(params.qrUrl.trim(), {
                                  width: 512,
                                  margin: 2,
                                  color: { dark: '#000000', light: '#FFFFFF' },
                                });
                                // Convertir a blob y subir
                                const res = await fetch(dataUrl);
                                const blob = await res.blob();
                                const url = await uploadBlob(blob, `brands/${id}/qr_${Date.now()}.png`);
                                const newParams = { ...params, qrImageUrl: url };
                                setParams(newParams);
                                await updateBrand(id, { params: newParams });
                                toast('QR generado y guardado');
                              } catch {
                                toast('Error al generar QR', 'error');
                              } finally {
                                setGeneratingQr(false);
                              }
                            }}
                            className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white
                                       hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm shadow-blue-600/20"
                          >
                            {generatingQr ? 'Generando...' : '⚡ Generar QR'}
                          </button>

                          {/* Subir imagen QR */}
                          <label className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium
                                            text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer inline-flex items-center gap-1">
                            📤 Subir imagen QR
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (!file || !id) return;
                                try {
                                  setUploadingQr(true);
                                  const url = await uploadFile(file, `brands/${id}/qr_${Date.now()}.${file.name.split('.').pop() ?? 'png'}`);
                                  const newParams = { ...params, qrImageUrl: url };
                                  setParams(newParams);
                                  await updateBrand(id, { params: newParams });
                                  toast('Imagen QR subida');
                                } catch {
                                  toast('Error al subir QR', 'error');
                                } finally {
                                  setUploadingQr(false);
                                  e.target.value = '';
                                }
                              }}
                              disabled={uploadingQr}
                            />
                          </label>
                        </div>

                        {(generatingQr || uploadingQr) && (
                          <p className="text-xs text-blue-600 animate-pulse">
                            {generatingQr ? 'Generando código QR...' : 'Subiendo imagen...'}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Sello farmacéutico */}
                <div className="mt-6">
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Sello farmacéutico
                  </label>
                  <p className="text-xs text-gray-400 mb-2">
                    Texto legal visible en el pie de todos los materiales generados.
                  </p>
                  <input
                    type="text"
                    value={params.disclaimerBadge ?? ''}
                    onChange={(e) => updateParam('disclaimerBadge', e.target.value)}
                    placeholder='Ej: "Material exclusivo para profesionales de la salud"'
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm
                               placeholder-gray-300 focus:outline-none focus:ring-2
                               focus:ring-blue-500/40 focus:border-blue-400 transition-colors"
                  />
                  {params.disclaimerBadge && (
                    <div className="mt-2 flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 rounded-lg border border-gray-100">
                      <svg className="w-3 h-3 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                      <p className="text-[8px] text-gray-500 uppercase tracking-wider font-medium">{params.disclaimerBadge}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Tab: Logos ── */}
            {activeTab === 'logos' && (
              <div className="space-y-6">
                {/* Logo principal */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-800 mb-1">Logo principal</h3>
                  <p className="text-xs text-gray-500 mb-4">
                    Logo por defecto para los materiales generados.
                  </p>
                  <div className="flex items-start gap-6">
                    <div className="shrink-0">
                      {params.logoUrl ? (
                        <div className="relative group">
                          <div className="h-32 w-32 rounded-xl border border-gray-200 bg-gray-50 p-3 flex items-center justify-center">
                            <img src={params.logoUrl} alt="Logo" className="max-h-full max-w-full object-contain" />
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setParams((prev) => ({ ...prev, logoUrl: '' }));
                              if (id) updateBrand(id, { params: { ...params, logoUrl: '' } }).catch(() => {});
                            }}
                            className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 text-xs
                                       flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                            title="Eliminar logo"
                          >
                            ×
                          </button>
                        </div>
                      ) : (
                        <div className="h-32 w-32 rounded-xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center bg-gray-50">
                          <svg className="w-10 h-10 text-gray-300 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          <span className="text-[10px] text-gray-400">Sin logo</span>
                        </div>
                      )}
                    </div>
                    <div className="flex-1 pt-2">
                      <label
                        className={`inline-flex items-center gap-2 rounded-lg border border-gray-200 px-5 py-2.5 text-sm font-medium
                                    text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer shadow-sm ${
                                      uploadingLogo ? 'opacity-50 pointer-events-none' : ''
                                    }`}
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                        </svg>
                        {uploadingLogo ? 'Subiendo...' : 'Subir logo principal'}
                        <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} disabled={uploadingLogo} />
                      </label>
                      <p className="text-xs text-gray-400 mt-2">PNG, SVG o JPG. Recomendado: fondo transparente.</p>
                    </div>
                  </div>
                </div>

                {/* Logos por tipo de fondo */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="text-sm font-semibold text-gray-800">Logos por tipo de fondo</h3>
                  </div>
                  <p className="text-xs text-gray-500 mb-4">
                    Sube versiones del logo optimizadas para distintos fondos. La IA seleccionará el más adecuado según el diseño.
                  </p>

                  {/* Lista de logos existentes */}
                  <div className="grid gap-3 mb-4">
                    {(params.logos ?? []).map((logo, idx) => (
                      <div key={idx} className="flex items-center gap-4 bg-gray-50 rounded-lg border border-gray-200 p-3">
                        <div className="shrink-0">
                          <div className="relative group">
                            <div className="h-20 w-20 rounded-lg border border-gray-200 bg-white p-2 flex items-center justify-center">
                              <img src={logo.url} alt={logo.label} className="max-h-full max-w-full object-contain" />
                            </div>
                            <button
                              type="button"
                              onClick={async () => {
                                const updated = (params.logos ?? []).filter((_, i) => i !== idx);
                                const newParams = { ...params, logos: updated };
                                setParams(newParams);
                                if (id) {
                                  await updateBrand(id, { params: newParams }).catch(() => {});
                                  toast('Logo eliminado');
                                }
                              }}
                              className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 text-[10px]
                                         flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                            >
                              ×
                            </button>
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-700 truncate">{logo.label}</p>
                          {/* Preview en mini fondos */}
                          <div className="flex gap-1.5 mt-2">
                            <div className="h-8 w-8 rounded border bg-white flex items-center justify-center p-0.5">
                              <img src={logo.url} alt="" className="max-h-full max-w-full object-contain" />
                            </div>
                            <div className="h-8 w-8 rounded border bg-gray-900 flex items-center justify-center p-0.5">
                              <img src={logo.url} alt="" className="max-h-full max-w-full object-contain" />
                            </div>
                            <div className="h-8 w-8 rounded border flex items-center justify-center p-0.5"
                              style={{ backgroundColor: params.colorPrimary }}>
                              <img src={logo.url} alt="" className="max-h-full max-w-full object-contain" />
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Agregar nuevo logo */}
                  <div className="border-2 border-dashed border-gray-200 rounded-xl p-4 bg-gray-50/80">
                    <div className="flex items-center gap-3">
                      <input
                        type="text"
                        placeholder='Etiqueta: Ej. "Logo fondo blanco", "Logo fondo oscuro"'
                        id="new-logo-label"
                        className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm
                                   placeholder-gray-300 focus:outline-none focus:ring-2
                                   focus:ring-blue-500/40 focus:border-blue-400 transition-colors"
                      />
                      <label className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white
                                        hover:bg-blue-700 transition-colors cursor-pointer shrink-0 inline-flex items-center gap-1
                                        shadow-sm shadow-blue-600/20">
                        📤 Subir logo
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            const labelInput = document.getElementById('new-logo-label') as HTMLInputElement;
                            const label = labelInput?.value.trim();
                            if (!file || !id) return;
                            if (!label) {
                              toast('Ingresa una etiqueta para el logo', 'error');
                              e.target.value = '';
                              return;
                            }
                            try {
                              setUploadingLogo(true);
                              const ext = file.name.split('.').pop() ?? 'png';
                              const url = await uploadFile(file, `brands/${id}/logos/${Date.now()}_${ext}`);
                              const newLogos = [...(params.logos ?? []), { label, url }];
                              const newParams = { ...params, logos: newLogos };
                              setParams(newParams);
                              await updateBrand(id, { params: newParams });
                              toast('Logo agregado');
                              labelInput.value = '';
                            } catch {
                              toast('Error al subir logo', 'error');
                            } finally {
                              setUploadingLogo(false);
                              e.target.value = '';
                            }
                          }}
                        />
                      </label>
                    </div>
                    <p className="text-xs text-gray-400 mt-2">
                      Primero escribe la etiqueta, luego sube la imagen.
                    </p>
                  </div>
                </div>

                {/* Preview del logo principal sobre fondos */}
                {params.logoUrl && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-800 mb-3">Preview: logo principal sobre fondos</h3>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="rounded-lg p-6 flex items-center justify-center bg-white border border-gray-200">
                        <img src={params.logoUrl} alt="Logo light" className="h-12 object-contain" />
                      </div>
                      <div className="rounded-lg p-6 flex items-center justify-center bg-gray-900">
                        <img src={params.logoUrl} alt="Logo dark" className="h-12 object-contain" />
                      </div>
                      <div className="rounded-lg p-6 flex items-center justify-center"
                        style={{ backgroundColor: params.colorPrimary }}>
                        <img src={params.logoUrl} alt="Logo brand" className="h-12 object-contain" />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Tab: Tipografía ── */}
            {activeTab === 'typography' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Fuente títulos */}
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Fuente de títulos
                    </label>
                    <select
                      value={params.fontTitle}
                      onChange={(e) => updateParam('fontTitle', e.target.value)}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm
                                 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400 transition-colors"
                    >
                      <option value="">— Seleccionar fuente —</option>
                      {AVAILABLE_FONTS.map((f) => (
                        <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>
                      ))}
                    </select>
                    {params.fontTitle && (
                      <div className="mt-3 p-4 rounded-lg border border-gray-200 bg-gray-50">
                        <p className="text-2xl font-bold" style={{ fontFamily: params.fontTitle, color: params.colorPrimary }}>
                          Título de ejemplo
                        </p>
                        <p className="text-lg font-semibold mt-1" style={{ fontFamily: params.fontTitle, color: params.colorSecondary }}>
                          Subtítulo ABCdef 123
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Fuente cuerpo */}
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Fuente de cuerpo
                    </label>
                    <select
                      value={params.fontBody}
                      onChange={(e) => updateParam('fontBody', e.target.value)}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm
                                 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400 transition-colors"
                    >
                      <option value="">— Seleccionar fuente —</option>
                      {AVAILABLE_FONTS.map((f) => (
                        <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>
                      ))}
                    </select>
                    {params.fontBody && (
                      <div className="mt-3 p-4 rounded-lg border border-gray-200 bg-gray-50">
                        <p className="text-sm leading-relaxed" style={{ fontFamily: params.fontBody }}>
                          Lorem ipsum dolor sit amet, consectetur adipiscing elit.
                          Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
                        </p>
                        <p className="text-xs mt-2 text-gray-400" style={{ fontFamily: params.fontBody }}>
                          ABCDEFGHIJKLM abcdefghijklm 0123456789 !@#$%
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Typography preview card */}
                {(params.fontTitle || params.fontBody) && (
                  <div className="rounded-xl border border-gray-200 overflow-hidden">
                    <div className="h-2" style={{ background: `linear-gradient(90deg, ${params.colorPrimary}, ${params.colorSecondary})` }} />
                    <div className="p-6 bg-white">
                      <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">
                        Vista previa tipográfica
                      </h3>
                      <h4
                        className="text-xl font-bold mb-2"
                        style={{ fontFamily: params.fontTitle || 'inherit', color: params.colorPrimary }}
                      >
                        {brandName || 'Nombre de Marca'}
                      </h4>
                      <p
                        className="text-sm text-gray-700 leading-relaxed"
                        style={{ fontFamily: params.fontBody || 'inherit' }}
                      >
                        Este es un texto de ejemplo que muestra cómo se verá el contenido
                        generado por la IA con la configuración actual de tu marca.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Tab: Colores ── */}
            {activeTab === 'colors' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Color primario */}
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-2">
                      Color primario
                    </label>
                    <div className="flex items-center gap-3 mb-3">
                      <input
                        type="color"
                        value={params.colorPrimary}
                        onChange={(e) => updateParam('colorPrimary', e.target.value)}
                        className="h-12 w-14 rounded-lg border border-gray-200 cursor-pointer"
                      />
                      <input
                        type="text"
                        value={params.colorPrimary}
                        onChange={(e) => updateParam('colorPrimary', e.target.value)}
                        className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono
                                   focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400 transition-colors"
                      />
                    </div>
                    {/* Primary color swatches */}
                    <div className="flex gap-1.5">
                      {[100, 80, 60, 40, 20].map((opacity) => (
                        <div
                          key={opacity}
                          className="h-8 flex-1 rounded"
                          style={{ backgroundColor: params.colorPrimary, opacity: opacity / 100 }}
                          title={`${opacity}%`}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Color secundario */}
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-2">
                      Color secundario
                    </label>
                    <div className="flex items-center gap-3 mb-3">
                      <input
                        type="color"
                        value={params.colorSecondary}
                        onChange={(e) => updateParam('colorSecondary', e.target.value)}
                        className="h-12 w-14 rounded-lg border border-gray-200 cursor-pointer"
                      />
                      <input
                        type="text"
                        value={params.colorSecondary}
                        onChange={(e) => updateParam('colorSecondary', e.target.value)}
                        className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono
                                   focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400 transition-colors"
                      />
                    </div>
                    {/* Secondary color swatches */}
                    <div className="flex gap-1.5">
                      {[100, 80, 60, 40, 20].map((opacity) => (
                        <div
                          key={opacity}
                          className="h-8 flex-1 rounded"
                          style={{ backgroundColor: params.colorSecondary, opacity: opacity / 100 }}
                          title={`${opacity}%`}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Color usage preview */}
                <div>
                  <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">
                    Vista previa de colores
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {/* Gradient */}
                    <div className="rounded-xl h-28 flex items-end p-4"
                      style={{ background: `linear-gradient(135deg, ${params.colorPrimary}, ${params.colorSecondary})` }}>
                      <span className="text-white text-xs font-medium drop-shadow">Degradado</span>
                    </div>
                    {/* Primary bg */}
                    <div className="rounded-xl h-28 flex flex-col items-center justify-center p-4"
                      style={{ backgroundColor: params.colorPrimary }}>
                      <span className="text-white text-sm font-bold" style={{ fontFamily: params.fontTitle || 'inherit' }}>
                        {brandName || 'Marca'}
                      </span>
                      <span className="text-white/80 text-xs mt-1">Sobre primario</span>
                    </div>
                    {/* White bg with colored text */}
                    <div className="rounded-xl h-28 flex flex-col items-center justify-center p-4 border border-gray-200 bg-white">
                      <span className="text-sm font-bold" style={{ color: params.colorPrimary, fontFamily: params.fontTitle || 'inherit' }}>
                        {brandName || 'Marca'}
                      </span>
                      <span className="text-xs mt-1" style={{ color: params.colorSecondary }}>
                        Texto sobre blanco
                      </span>
                    </div>
                  </div>
                </div>

                {/* Combination */}
                <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 rounded-lg">
                  <div className="h-10 w-10 rounded-full shadow-sm" style={{ backgroundColor: params.colorPrimary }} />
                  <div className="h-1 w-6 rounded" style={{ background: `linear-gradient(90deg, ${params.colorPrimary}, ${params.colorSecondary})` }} />
                  <div className="h-10 w-10 rounded-full shadow-sm" style={{ backgroundColor: params.colorSecondary }} />
                  <span className="text-xs text-gray-500 ml-2">Paleta de marca</span>
                </div>
              </div>
            )}

            {/* ── Tab: Imágenes ── */}
            {activeTab === 'images' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-800">Biblioteca de imágenes</h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Fotos de productos, iconos, gráficos o cualquier imagen de la marca.
                      {(params.assets ?? []).length > 0 && (
                        <span className="ml-1 text-blue-600 font-medium">
                          ({(params.assets ?? []).length} archivo{(params.assets ?? []).length !== 1 ? 's' : ''})
                        </span>
                      )}
                    </p>
                  </div>
                  <label
                    className={`inline-flex items-center gap-1.5 rounded-lg border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-medium
                                text-blue-700 hover:bg-blue-100 transition-colors cursor-pointer shadow-sm ${
                                  uploadingAsset ? 'opacity-50 pointer-events-none' : ''
                                }`}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    {uploadingAsset ? 'Subiendo...' : 'Agregar imágenes'}
                    <input type="file" accept="image/*" multiple className="hidden" onChange={handleAssetUpload} disabled={uploadingAsset} />
                  </label>
                </div>

                {(params.assets ?? []).length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {(params.assets ?? []).map((url, idx) => (
                      <div key={idx} className="relative group rounded-xl overflow-hidden border border-gray-200 bg-gray-50">
                        <img
                          src={url}
                          alt={`Asset ${idx + 1}`}
                          className="w-full aspect-square object-cover"
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveAsset(url)}
                            className="bg-white/90 text-red-600 rounded-full w-8 h-8 text-sm font-bold
                                       flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg
                                       hover:bg-red-50"
                            title="Eliminar imagen"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="border-2 border-dashed border-gray-200 rounded-xl p-10 text-center">
                    <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <p className="text-sm text-gray-500 mb-1">No hay imágenes aún</p>
                    <p className="text-xs text-gray-400">Sube fotos de productos, packshots, iconografía, etc.</p>
                  </div>
                )}
              </div>
            )}

            {/* ── Tab: Claims ── */}
            {activeTab === 'claims' && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-sm font-semibold text-gray-800">Claims aprobados</h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Frases estáticas aprobadas que la IA puede utilizar textualmente en los materiales.
                    Cada claim se asocia a una indicación terapéutica.
                  </p>
                </div>

                {/* Formulario de nuevo claim */}
                <div className="bg-gray-50/60 border border-gray-100 rounded-xl p-4 space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Indicación</label>
                    <select
                      id="claimIndicationSelect"
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white
                                 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400 transition-colors"
                      defaultValue=""
                    >
                      <option value="" disabled>Selecciona una indicación…</option>
                      {indications.map((ind) => (
                        <option key={ind.id} value={ind.id}>{ind.name}</option>
                      ))}
                    </select>
                    {indications.length === 0 && (
                      <p className="text-[10px] text-amber-500 mt-1">
                        No hay indicaciones registradas para la molécula de esta marca.
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Claim</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        id="newClaimInput"
                        placeholder='Ej: "Reducción del 40% del dolor articular"'
                        className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm
                                   placeholder-gray-300 focus:outline-none focus:ring-2
                                   focus:ring-blue-500/40 focus:border-blue-400 transition-colors"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            const select = document.getElementById('claimIndicationSelect') as HTMLSelectElement;
                            const input = e.currentTarget;
                            const indId = select?.value;
                            const val = input.value.trim();
                            if (!indId) { select?.focus(); return; }
                            if (!val) return;
                            const ind = indications.find(i => i.id === indId);
                            const newClaim: BrandClaim = { indicationId: indId, indicationName: ind?.name ?? '', text: val };
                            updateParam('claims', [...(params.claims ?? []), newClaim]);
                            input.value = '';
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const select = document.getElementById('claimIndicationSelect') as HTMLSelectElement;
                          const input = document.getElementById('newClaimInput') as HTMLInputElement;
                          const indId = select?.value;
                          const val = input?.value.trim();
                          if (!indId) { select?.focus(); return; }
                          if (!val) { input?.focus(); return; }
                          const ind = indications.find(i => i.id === indId);
                          const newClaim: BrandClaim = { indicationId: indId, indicationName: ind?.name ?? '', text: val };
                          updateParam('claims', [...(params.claims ?? []), newClaim]);
                          input.value = '';
                        }}
                        className="rounded-lg bg-blue-600 text-white px-4 py-2 text-sm font-medium
                                   hover:bg-blue-700 shadow-sm shadow-blue-600/20 transition-colors"
                      >
                        Añadir
                      </button>
                    </div>
                  </div>
                </div>

                {/* Lista de claims agrupados por indicación */}
                {(() => {
                  const claims = params.claims ?? [];
                  if (claims.length === 0) {
                    return (
                      <div className="border-2 border-dashed border-gray-200 rounded-xl p-10 text-center">
                        <svg className="w-10 h-10 text-gray-300 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <p className="text-sm text-gray-500">No hay claims aún</p>
                        <p className="text-xs text-gray-400 mt-0.5">Selecciona una indicación y añade frases aprobadas.</p>
                      </div>
                    );
                  }
                  // Group by indicationName
                  const grouped = claims.reduce<Record<string, { indicationId: string; items: { text: string; globalIdx: number }[] }>>(
                    (acc, c, idx) => {
                      const key = c.indicationName || 'Sin indicación';
                      if (!acc[key]) acc[key] = { indicationId: c.indicationId, items: [] };
                      acc[key].items.push({ text: c.text, globalIdx: idx });
                      return acc;
                    },
                    {},
                  );
                  return (
                    <div className="space-y-4">
                      {Object.entries(grouped).map(([indName, { items }]) => (
                        <div key={indName} className="rounded-xl border border-gray-200/80 overflow-hidden">
                          <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[10px] font-semibold uppercase tracking-wide">
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z" />
                              </svg>
                              {indName}
                            </span>
                            <span className="text-[10px] text-gray-400">{items.length} claim{items.length !== 1 ? 's' : ''}</span>
                          </div>
                          <ul className="divide-y divide-gray-50">
                            {items.map(({ text, globalIdx }) => (
                              <li key={globalIdx} className="group flex items-start gap-2 px-4 py-2.5 hover:bg-gray-50/50 transition-colors">
                                <svg className="w-4 h-4 text-green-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4" />
                                </svg>
                                <span className="text-sm text-gray-700 flex-1">{text}</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updated = (params.claims ?? []).filter((_, j) => j !== globalIdx);
                                    updateParam('claims', updated);
                                  }}
                                  className="text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                                >
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                </button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>

          {/* Save bar */}
          <div className="px-5 py-3 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
            <p className="text-xs text-gray-400">
              Los logos e imágenes se guardan automáticamente al subirlos.
            </p>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white
                         hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm shadow-blue-600/20"
            >
              {saving ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </div>
        </div>
      </form>

      {/* Unsaved changes modal */}
      <ConfirmDialog
        open={showUnsavedModal}
        title="Cambios sin guardar"
        message="Tienes cambios que no has guardado. ¿Deseas salir sin guardar?"
        confirmLabel="Salir sin guardar"
        cancelLabel="Quedarse"
        variant="danger"
        onConfirm={() => {
          setShowUnsavedModal(false);
          if (pendingNavigation.current) {
            navigate(pendingNavigation.current);
            pendingNavigation.current = null;
          }
        }}
        onCancel={() => {
          setShowUnsavedModal(false);
          pendingNavigation.current = null;
        }}
      />
    </div>
  );
};

export default BrandDetailPage;
