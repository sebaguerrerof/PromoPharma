import { useCallback, useEffect, useState, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useTenant } from '@/hooks/useTenant';
import { useToast } from '@/hooks/useToast';
import { getBrands } from '@/services/brandService';
import { getMolecules } from '@/services/moleculeService';
import {
  getAllKnowledge,
  createKnowledgeItem,
  updateKnowledgeItem,
  deleteKnowledgeItem,
} from '@/services/knowledgeService';
import { uploadFile } from '@/services/uploadService';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import type { KnowledgeItem, KnowledgeItemType, Brand, Molecule } from '@/types';
import { KNOWLEDGE_ITEM_TYPE_LABELS } from '@/types';

const TYPE_ICONS: Record<KnowledgeItemType, string> = {
  reference_material: '📄',
  style_guide: '🎨',
  approved_text: '✅',
  design_asset: '🖼️',
};

/** Returns true if a filename looks like an image */
function isImageFile(name: string): boolean {
  return /\.(png|jpe?g|gif|svg|webp|bmp|ico)$/i.test(name);
}

const KnowledgeBank: React.FC = () => {
  const { user } = useAuth();
  const tenantId = useTenant();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [molecules, setMolecules] = useState<Molecule[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<KnowledgeItem | null>(null);

  // Filters
  const [filterType, setFilterType] = useState<'' | KnowledgeItemType>('');
  const [filterBrand, setFilterBrand] = useState('');

  // Form fields — Step 1: Brand & Molecule
  const [formBrandId, setFormBrandId] = useState('');
  const [formMoleculeId, setFormMoleculeId] = useState('');
  // Step 2: Content details
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formType, setFormType] = useState<KnowledgeItemType>('reference_material');
  const [formContent, setFormContent] = useState('');
  const [formTags, setFormTags] = useState('');
  const [formFiles, setFormFiles] = useState<File[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      // Load brands & molecules first (these always work)
      const [allBrands, allMolecules] = await Promise.all([
        getBrands(tenantId),
        getMolecules(tenantId),
      ]);
      setBrands(allBrands);
      setMolecules(allMolecules);

      // Load knowledge items separately (collection may not exist yet)
      try {
        const allItems = await getAllKnowledge(tenantId);
        setItems(allItems);
      } catch {
        // Collection doesn't exist yet or index missing — that's fine
        setItems([]);
      }
    } catch {
      toast('Error al cargar datos', 'error');
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { load(); }, [load]);

  // Derived: selected brand & molecule objects
  const selectedBrand = brands.find(b => b.id === formBrandId);
  const selectedMolecule = selectedBrand
    ? molecules.find(m => m.id === selectedBrand.moleculeId)
    : null;

  const resetForm = () => {
    setFormBrandId('');
    setFormMoleculeId('');
    setFormTitle('');
    setFormDescription('');
    setFormType('reference_material');
    setFormContent('');
    setFormTags('');
    setFormFiles([]);
    setEditingId(null);
    setShowForm(false);
  };

  const handleEdit = (item: KnowledgeItem) => {
    setFormBrandId(item.brandId ?? '');
    setFormMoleculeId(item.moleculeId ?? '');
    setFormTitle(item.title);
    setFormDescription(item.description);
    setFormType(item.type);
    setFormContent(item.content);
    setFormTags(item.tags.join(', '));
    setFormFiles([]);
    setEditingId(item.id);
    setShowForm(true);
  };

  // When brand changes, auto-set molecule
  const handleBrandChange = (brandId: string) => {
    setFormBrandId(brandId);
    if (brandId) {
      const brand = brands.find(b => b.id === brandId);
      if (brand) setFormMoleculeId(brand.moleculeId);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formBrandId) return;

    try {
      setSaving(true);

      // Upload any new files
      const uploadedUrls: string[] = [];
      const uploadedNames: string[] = [];
      for (const file of formFiles) {
        const url = await uploadFile(file, `knowledge/${tenantId}/${Date.now()}_${file.name}`);
        uploadedUrls.push(url);
        uploadedNames.push(file.name);
      }

      // Auto-generate title from file names if not provided
      const autoTitle = formTitle.trim()
        || uploadedNames.map(n => n.replace(/\.[^.]+$/, '')).join(', ')
        || 'Material sin título';

      const tags = formTags.split(',').map(t => t.trim()).filter(Boolean);

      if (editingId) {
        const existing = items.find(i => i.id === editingId);
        await updateKnowledgeItem(editingId, {
          title: autoTitle,
          description: formDescription.trim(),
          type: formType,
          content: formContent.trim(),
          tags,
          fileUrls: [...(existing?.fileUrls ?? []), ...uploadedUrls],
          fileNames: [...(existing?.fileNames ?? []), ...uploadedNames],
        });
        toast('Material actualizado');
      } else {
        await createKnowledgeItem({
          title: autoTitle,
          description: formDescription.trim(),
          type: formType,
          scope: 'brand',
          brandId: formBrandId,
          brandName: selectedBrand?.name ?? null,
          moleculeId: selectedMolecule?.id ?? null,
          moleculeName: selectedMolecule?.name ?? null,
          fileUrls: uploadedUrls,
          fileNames: uploadedNames,
          content: formContent.trim(),
          tags,
          tenantId,
          createdBy: user?.uid ?? '',
        });
        toast('Material agregado al banco');
      }

      resetForm();
      load();
    } catch {
      toast('Error al guardar', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteKnowledgeItem(deleteTarget.id);
      setItems(prev => prev.filter(i => i.id !== deleteTarget.id));
      toast('Material eliminado');
    } catch {
      toast('Error al eliminar', 'error');
    } finally {
      setDeleteTarget(null);
    }
  };

  // Filtered list
  const filtered = items.filter(item => {
    if (filterType && item.type !== filterType) return false;
    if (filterBrand && item.brandId !== filterBrand) return false;
    return true;
  });

  if (loading) return <LoadingSpinner />;

  return (
    <div className="max-w-5xl">
      {/* Header */}
      <div className="relative overflow-hidden rounded-3xl bg-linear-to-br from-[#0f172a] via-[#1e3a5f] to-[#0c4a6e] p-8 mb-8">
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 60% 30%, rgba(52,211,153,0.3) 0%, transparent 50%)' }} />
        <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="relative flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-[0.2em] bg-emerald-400/10 px-3 py-1 rounded-full mb-3 inline-block">Knowledge Base</span>
            <h1 className="text-xl font-bold text-white">Banco de Conocimiento</h1>
            <p className="text-sm text-blue-200/70 mt-1">
              Materiales de referencia que la IA utiliza para generar diseños consistentes.
              {items.length > 0 && ` ${items.length} materiales registrados.`}
            </p>
          </div>
          <button
            onClick={() => { resetForm(); setShowForm(true); }}
            className="rounded-xl bg-linear-to-r from-blue-500 to-cyan-500 px-5 py-3 text-sm font-semibold text-white
                       hover:from-blue-400 hover:to-cyan-400 transition-all shadow-lg shadow-blue-500/25"
          >
            + Agregar material
          </button>
        </div>
      </div>

      {/* Filters */}
      {items.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 mb-5">
          {brands.length > 0 && (
            <select
              value={filterBrand}
              onChange={(e) => setFilterBrand(e.target.value)}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition-colors"
            >
              <option value="">Todas las marcas</option>
              {brands.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          )}
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as '' | KnowledgeItemType)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm
                       focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition-colors"
          >
            <option value="">Todos los tipos</option>
            {(Object.keys(KNOWLEDGE_ITEM_TYPE_LABELS) as KnowledgeItemType[]).map(t => (
              <option key={t} value={t}>{KNOWLEDGE_ITEM_TYPE_LABELS[t]}</option>
            ))}
          </select>
          {(filterType || filterBrand) && (
            <button
              onClick={() => { setFilterType(''); setFilterBrand(''); }}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium"
            >
              Limpiar filtros
            </button>
          )}
        </div>
      )}

      {/* Creation/Edit Form */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <form
            onSubmit={handleSubmit}
            className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto animate-in"
          >
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">
                {editingId ? 'Editar material' : 'Agregar material al banco'}
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                La IA usará esta información como contexto para generar materiales.
              </p>
            </div>

            <div className="px-6 py-5 space-y-4">

              {/* ─── PASO 1: Marca y Molécula (primero) ─── */}
              <div className="bg-blue-50/60 border border-blue-100 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-600 text-[10px] font-bold text-white">1</span>
                  <span className="text-xs font-semibold text-blue-800">Asociar a marca y molécula</span>
                </div>

                {/* Brand (first) */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Marca</label>
                  <select
                    required
                    value={formBrandId}
                    onChange={(e) => handleBrandChange(e.target.value)}
                    disabled={!!editingId}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm
                               focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition-colors
                               disabled:opacity-60"
                  >
                    <option value="">— Selecciona una marca —</option>
                    {brands.map(b => {
                      const mol = molecules.find(m => m.id === b.moleculeId);
                      return (
                        <option key={b.id} value={b.id}>
                          {b.name}{mol ? ` (${mol.name})` : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>

                {/* Selection summary (auto-resolved molecule) */}
                {selectedBrand && (
                  <div className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 border border-blue-200/60">
                    <div
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ background: selectedBrand.params.colorPrimary }}
                    />
                    <span className="text-xs font-medium text-gray-700">{selectedBrand.name}</span>
                    {selectedMolecule && (
                      <>
                        <span className="text-gray-300">·</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-50 text-sky-600 font-medium">{selectedMolecule.name}</span>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* ─── PASO 2: Archivo ─── */}
              <div className={`space-y-4 transition-opacity ${!formBrandId && !editingId ? 'opacity-40 pointer-events-none' : ''}`}>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-200 text-[10px] font-bold text-gray-600">2</span>
                  <span className="text-xs font-semibold text-gray-600">Subir archivo</span>
                </div>

                {/* File upload */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Archivos adjuntos
                  </label>
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-gray-200 rounded-xl p-4 text-center cursor-pointer
                               hover:border-gray-300 hover:bg-gray-50/50 transition-all"
                  >
                    <svg className="w-6 h-6 text-gray-300 mx-auto mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    <p className="text-xs text-gray-400">
                      Haz clic para subir PDFs, imágenes o cualquier archivo de referencia
                    </p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept=".pdf,.png,.jpg,.jpeg,.svg,.doc,.docx,.pptx,.xlsx"
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files) setFormFiles(prev => [...prev, ...Array.from(e.target.files!)]);
                        e.target.value = '';
                      }}
                    />
                  </div>
                  {/* New files to upload — with preview */}
                  {formFiles.length > 0 && (
                    <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {formFiles.map((f, i) => (
                        <div key={i} className="relative group rounded-xl border border-gray-200 bg-gray-50 overflow-hidden">
                          {isImageFile(f.name) ? (
                            <img
                              src={URL.createObjectURL(f)}
                              alt={f.name}
                              className="w-full h-28 object-cover"
                            />
                          ) : (
                            <div className="w-full h-28 flex flex-col items-center justify-center gap-1 px-2">
                              <svg className="w-8 h-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                              </svg>
                              <span className="text-[10px] text-gray-400 uppercase font-medium">
                                {f.name.split('.').pop()}
                              </span>
                            </div>
                          )}
                          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-2 py-1.5">
                            <p className="text-[10px] text-white truncate">{f.name}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setFormFiles(prev => prev.filter((_, j) => j !== i))}
                            className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 text-xs
                                       flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Existing files (editing) — with preview */}
                  {editingId && (() => {
                    const existing = items.find(i => i.id === editingId);
                    if (!existing?.fileNames?.length) return null;
                    return (
                      <div className="mt-3">
                        <p className="text-[10px] text-gray-400 font-medium mb-1.5">Archivos existentes:</p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {existing.fileNames.map((name, i) => (
                            <a
                              key={i}
                              href={existing.fileUrls[i]}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="relative rounded-xl border border-gray-200 bg-gray-50 overflow-hidden block hover:border-gray-300 transition-colors"
                            >
                              {isImageFile(name) ? (
                                <img
                                  src={existing.fileUrls[i]}
                                  alt={name}
                                  className="w-full h-28 object-cover"
                                />
                              ) : (
                                <div className="w-full h-28 flex flex-col items-center justify-center gap-1 px-2">
                                  <svg className="w-8 h-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                                  </svg>
                                  <span className="text-[10px] text-gray-400 uppercase font-medium">
                                    {name.split('.').pop()}
                                  </span>
                                </div>
                              )}
                              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-2 py-1.5">
                                <p className="text-[10px] text-white truncate">{name}</p>
                              </div>
                            </a>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
              <button
                type="button"
                onClick={resetForm}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600
                           hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving || !formBrandId || (formFiles.length === 0 && !editingId)}
                className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white
                           hover:bg-blue-700 disabled:opacity-50 transition-colors
                           shadow-sm shadow-blue-600/20"
              >
                {saving ? 'Guardando...' : editingId ? 'Actualizar' : 'Agregar'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Empty state */}
      {items.length === 0 && (
        <div className="text-center py-20 px-4">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-amber-50 flex items-center justify-center mb-4">
            <svg className="w-7 h-7 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
            </svg>
          </div>
          <p className="text-sm font-medium text-gray-500">No hay materiales de referencia aún</p>
          <p className="text-xs text-gray-400 mt-1.5 max-w-sm mx-auto leading-relaxed">
            Agrega materiales promocionales anteriores, guías de estilo o textos aprobados para que la IA los use como referencia al generar nuevo contenido.
          </p>
          <button
            onClick={() => { resetForm(); setShowForm(true); }}
            className="mt-5 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white
                       hover:bg-blue-700 transition-colors shadow-sm shadow-blue-600/20"
          >
            Agregar primer material
          </button>
        </div>
      )}

      {/* Items list */}
      {filtered.length > 0 && (
        <div className="grid gap-3">
          {filtered.map(item => {
            const itemBrand = brands.find(b => b.id === item.brandId);
            return (
              <div
                key={item.id}
                className="group bg-white border border-gray-200/80 rounded-xl p-4 hover:border-gray-300 hover:shadow-sm transition-all"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {/* Brand badge */}
                    {itemBrand && (
                      <span className="inline-flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded-full font-medium bg-violet-50 text-violet-600 shrink-0">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ background: itemBrand.params.colorPrimary }}
                        />
                        {item.brandName}
                      </span>
                    )}
                    {/* File info */}
                    {item.fileNames.length > 0 ? (
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[10px] text-gray-400 shrink-0">
                          📎 {item.fileNames.length} archivo{item.fileNames.length > 1 ? 's' : ''}
                        </span>
                        <span className="text-xs text-gray-500 truncate">
                          {item.fileNames.join(', ')}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400 italic">Sin archivos</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button
                      onClick={() => handleEdit(item)}
                      className="text-xs text-gray-400 hover:text-blue-600 transition-colors"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => setDeleteTarget(item)}
                      className="text-xs text-gray-300 hover:text-red-500 transition-colors"
                    >
                      Eliminar
                    </button>
                  </div>
                </div>

                {/* File thumbnails */}
                {item.fileNames.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {item.fileNames.map((name, i) => (
                      <a
                        key={i}
                        href={item.fileUrls[i]}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="relative rounded-xl border border-gray-100 bg-gray-50 overflow-hidden
                                   hover:border-gray-300 transition-colors block"
                      >
                        {isImageFile(name) ? (
                          <img
                            src={item.fileUrls[i]}
                            alt={name}
                            className="w-24 h-20 object-cover"
                          />
                        ) : (
                          <div className="w-24 h-20 flex flex-col items-center justify-center gap-0.5">
                            <svg className="w-6 h-6 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                            </svg>
                            <span className="text-[9px] text-gray-400 uppercase font-medium">
                              {name.split('.').pop()}
                            </span>
                          </div>
                        )}
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/50 to-transparent px-1.5 py-1">
                          <p className="text-[9px] text-white truncate">{name}</p>
                        </div>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {items.length > 0 && filtered.length === 0 && (
        <div className="text-center py-12">
          <p className="text-sm text-gray-500">No hay materiales que coincidan con los filtros.</p>
          <button
            onClick={() => { setFilterType(''); setFilterBrand(''); }}
            className="mt-2 text-sm text-blue-600 hover:text-blue-800 font-medium"
          >
            Limpiar filtros
          </button>
        </div>
      )}

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Eliminar material"
        message={`¿Eliminar "${deleteTarget?.title}"? Esta acción no se puede deshacer.`}
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};

export default KnowledgeBank;
