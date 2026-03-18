import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useTenant } from '../hooks/useTenant';
import { useToast } from '../hooks/useToast';
import { getBrands, createBrand, deleteBrand } from '../services/brandService';
import { getMolecules, createMolecule, createIndication } from '../services/moleculeService';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import EmptyState from '../components/ui/EmptyState';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import type { Brand, Molecule } from '../types';

const BrandsPage: React.FC = () => {
  const { user } = useAuth();
  const tenantId = useTenant();
  const { toast } = useToast();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [molecules, setMolecules] = useState<Molecule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Brand | null>(null);

  // Formulario
  const [name, setName] = useState('');
  const [moleculeId, setMoleculeId] = useState('');
  const [saving, setSaving] = useState(false);

  // Creación inline de molécula
  const [showNewMolecule, setShowNewMolecule] = useState(false);
  const [newMoleculeName, setNewMoleculeName] = useState('');
  const [savingMolecule, setSavingMolecule] = useState(false);

  // Indicaciones inline
  const [inlineIndications, setInlineIndications] = useState<string[]>([]);
  const [newIndicationName, setNewIndicationName] = useState('');
  const [createdMoleculeName, setCreatedMoleculeName] = useState('');

  const load = async () => {
    try {
      setLoading(true);
      const [b, m] = await Promise.all([getBrands(tenantId), getMolecules(tenantId)]);
      setBrands(b);
      setMolecules(m);
    } catch {
      toast('Error al cargar marcas', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [tenantId]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !moleculeId || !user) return;
    try {
      setSaving(true);
      // Crear indicaciones pendientes
      for (const indName of inlineIndications) {
        await createIndication({
          moleculeId,
          name: indName,
          tenantId,
          createdBy: user.email!,
        });
      }
      await createBrand({
        name: name.trim(),
        moleculeId,
        params: {
          fontTitle: '',
          fontBody: '',
          colorPrimary: '#2563EB',
          colorSecondary: '#1E40AF',
          qrUrl: '',
          logoUrl: '',
          assets: [],
        },
        tenantId,
        createdBy: user.email!,
      });
      toast(`Marca creada${inlineIndications.length ? ` con ${inlineIndications.length} indicación(es)` : ''}`);
      setName('');
      setMoleculeId('');
      setInlineIndications([]);
      setNewIndicationName('');
      setCreatedMoleculeName('');
      setShowForm(false);
      await load();
    } catch {
      toast('Error al crear marca', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteBrand(deleteTarget.id);
      toast('Marca eliminada');
      setDeleteTarget(null);
      await load();
    } catch {
      toast('Error al eliminar marca', 'error');
    }
  };

  const handleCreateMolecule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMoleculeName.trim() || !user) return;
    try {
      setSavingMolecule(true);
      const newId = await createMolecule({
        name: newMoleculeName.trim(),
        tenantId,
        createdBy: user.email!,
      });
      toast('Molécula creada');
      // Recargar moléculas y seleccionar la nueva
      const updated = await getMolecules(tenantId);
      setMolecules(updated);
      setMoleculeId(newId);
      setCreatedMoleculeName(newMoleculeName.trim());
      setInlineIndications([]);
      setNewMoleculeName('');
      setShowNewMolecule(false);
    } catch {
      toast('Error al crear molécula', 'error');
    } finally {
      setSavingMolecule(false);
    }
  };

  const moleculeName = (id: string | null) => {
    if (!id) return null;
    return molecules.find((m) => m.id === id)?.name ?? '—';
  };

  return (
    <div className="max-w-5xl">
      <div className="relative overflow-hidden rounded-3xl bg-linear-to-br from-[#0f172a] via-[#1e3a5f] to-[#0c4a6e] p-8 mb-8">
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 70% 40%, rgba(167,139,250,0.3) 0%, transparent 50%)' }} />
        <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full bg-violet-500/10 blur-3xl" />
        <div className="relative flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-violet-400 uppercase tracking-[0.2em] bg-violet-400/10 px-3 py-1 rounded-full mb-3 inline-block">Identidad</span>
            <h1 className="text-xl font-bold text-white">Marcas</h1>
            <p className="mt-1 text-sm text-blue-200/70">
              Configuración visual, parámetros de marca y materiales de referencia
            </p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="rounded-xl bg-linear-to-r from-blue-500 to-cyan-500 px-5 py-3 text-sm font-semibold text-white
                       hover:from-blue-400 hover:to-cyan-400 transition-all shadow-lg shadow-blue-500/25"
          >
            + Nueva marca
          </button>
        </div>
      </div>

      {/* Formulario de creación */}
      {showForm && (
        <form
          onSubmit={handleCreate}
          className="mb-6 bg-white border border-gray-200/80 rounded-xl p-5 space-y-4 shadow-sm"
        >
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nombre de la marca
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder='Ej: "Lyrica"'
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm
                         placeholder-gray-400 focus:outline-none focus:ring-2
                         focus:ring-blue-500 focus:border-transparent"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Molécula asociada *
            </label>
            {showNewMolecule ? (
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <input
                    type="text"
                    required
                    value={newMoleculeName}
                    onChange={(e) => setNewMoleculeName(e.target.value)}
                    placeholder='Ej: "Pregabalina"'
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm
                               placeholder-gray-400 focus:outline-none focus:ring-2
                               focus:ring-blue-500 focus:border-transparent"
                    autoFocus
                  />
                </div>
                <button
                  type="button"
                  onClick={handleCreateMolecule}
                  disabled={savingMolecule || !newMoleculeName.trim()}
                  className="rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white
                             hover:bg-green-700 disabled:opacity-50 transition-colors shrink-0"
                >
                  {savingMolecule ? '...' : 'Crear'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowNewMolecule(false); setNewMoleculeName(''); }}
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium
                             text-gray-700 hover:bg-gray-50 transition-colors shrink-0"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <select
                  value={moleculeId}
                  onChange={(e) => setMoleculeId(e.target.value)}
                  required
                  className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm
                             focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">— Selecciona una molécula —</option>
                  {molecules.map((mol) => (
                    <option key={mol.id} value={mol.id}>
                      {mol.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setShowNewMolecule(true)}
                  className="rounded-md border border-dashed border-gray-400 px-3 py-2 text-sm font-medium
                             text-gray-600 hover:border-blue-500 hover:text-blue-600 transition-colors shrink-0"
                  title="Crear nueva molécula"
                >
                  + Nueva
                </button>
              </div>
            )}
          </div>
          {/* Indicaciones inline */}
          {moleculeId && (
            <div className="border border-gray-200 rounded-lg p-3 bg-gray-50">
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">
                  Indicaciones{createdMoleculeName ? ` de ${createdMoleculeName}` : ''}
                </label>
                <span className="text-xs text-gray-400">{inlineIndications.length} agregada(s)</span>
              </div>
              <div className="flex items-center gap-2 mb-2">
                <input
                  type="text"
                  value={newIndicationName}
                  onChange={(e) => setNewIndicationName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (newIndicationName.trim()) {
                        setInlineIndications((prev) => [...prev, newIndicationName.trim()]);
                        setNewIndicationName('');
                      }
                    }
                  }}
                  placeholder='Ej: "Dolor neuropático"'
                  className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm
                             placeholder-gray-400 focus:outline-none focus:ring-2
                             focus:ring-blue-500 focus:border-transparent"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (newIndicationName.trim()) {
                      setInlineIndications((prev) => [...prev, newIndicationName.trim()]);
                      setNewIndicationName('');
                    }
                  }}
                  disabled={!newIndicationName.trim()}
                  className="rounded-md bg-gray-700 px-3 py-1.5 text-sm font-medium text-white
                             hover:bg-gray-800 disabled:opacity-40 transition-colors shrink-0"
                >
                  + Agregar
                </button>
              </div>
              {inlineIndications.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {inlineIndications.map((ind, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1 bg-white border border-gray-200 rounded-full
                                 px-3 py-1 text-xs font-medium text-gray-700"
                    >
                      {ind}
                      <button
                        type="button"
                        onClick={() => setInlineIndications((prev) => prev.filter((_, i) => i !== idx))}
                        className="text-gray-400 hover:text-red-500 transition-colors ml-0.5"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
              {inlineIndications.length === 0 && (
                <p className="text-xs text-gray-400 italic">Puedes agregar indicaciones ahora o después.</p>
              )}
            </div>
          )}

          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white
                         hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Guardando...' : 'Crear'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setName('');
                setMoleculeId('');
                setShowNewMolecule(false);
                setNewMoleculeName('');
                setInlineIndications([]);
                setNewIndicationName('');
                setCreatedMoleculeName('');
              }}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium
                         text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {/* Lista */}
      {loading ? (
        <LoadingSpinner />
      ) : brands.length === 0 ? (
        <EmptyState
          title="No hay marcas registradas."
          description="Crea tu primera marca para configurar parámetros visuales."
        />
      ) : (
        <div className="grid gap-3">
          {brands.map((brand) => (
            <div
              key={brand.id}
              className="group bg-white border border-gray-100 rounded-2xl px-5 py-4
                         flex items-center justify-between hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300"
            >
              <Link to={`/marcas/${brand.id}`} className="flex-1 min-w-0">
                <div className="flex items-center gap-3">
                  {/* Color swatch */}
                  <div
                    className="h-10 w-10 rounded-xl shrink-0 shadow-md"
                    style={{ backgroundColor: brand.params.colorPrimary || '#2563EB' }}
                  />
                  <div>
                    <h3 className="text-sm font-bold text-gray-900">{brand.name}</h3>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      Molécula: {moleculeName(brand.moleculeId) ?? '—'}
                    </p>
                  </div>
                </div>
              </Link>
              <div className="flex items-center gap-3 ml-4">
                <Link
                  to={`/marcas/${brand.id}`}
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  Configurar →
                </Link>
                <button
                  onClick={() => setDeleteTarget(brand)}
                  className="text-xs text-gray-300 hover:text-red-500 transition-colors"
                >
                  Eliminar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Confirm delete */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Eliminar marca"
        message={`¿Estás seguro de eliminar "${deleteTarget?.name}"? Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};

export default BrandsPage;
