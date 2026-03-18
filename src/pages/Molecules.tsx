import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useTenant } from '../hooks/useTenant';
import { useToast } from '../hooks/useToast';
import { getMolecules, createMolecule, deleteMolecule } from '../services/moleculeService';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import EmptyState from '../components/ui/EmptyState';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import type { Molecule } from '../types';

const MoleculesPage: React.FC = () => {
  const { user } = useAuth();
  const tenantId = useTenant();
  const { toast } = useToast();
  const [molecules, setMolecules] = useState<Molecule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Molecule | null>(null);

  const load = async () => {
    try {
      setLoading(true);
      const data = await getMolecules(tenantId);
      setMolecules(data);
    } catch {
      toast('Error al cargar moléculas', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [tenantId]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !user) return;
    try {
      setSaving(true);
      await createMolecule({ name: name.trim(), tenantId, createdBy: user.email! });
      toast('Molécula creada');
      setName('');
      setShowForm(false);
      await load();
    } catch {
      toast('Error al crear molécula', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMolecule(deleteTarget.id);
      toast('Molécula eliminada');
      setDeleteTarget(null);
      await load();
    } catch {
      toast('Error al eliminar molécula', 'error');
    }
  };

  return (
    <div className="max-w-5xl">
      <div className="relative overflow-hidden rounded-3xl bg-linear-to-br from-[#0f172a] via-[#1e3a5f] to-[#0c4a6e] p-8 mb-8">
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 30% 60%, rgba(56,189,248,0.3) 0%, transparent 50%)' }} />
        <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="relative flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-[0.2em] bg-cyan-400/10 px-3 py-1 rounded-full mb-3 inline-block">Ciencia</span>
            <h1 className="text-xl font-bold text-white">Moléculas</h1>
            <p className="mt-1 text-sm text-blue-200/70">
              Molécula → Indicaciones → Documentos → Insights
            </p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="rounded-xl bg-linear-to-r from-blue-500 to-cyan-500 px-5 py-3 text-sm font-semibold text-white
                       hover:from-blue-400 hover:to-cyan-400 transition-all shadow-lg shadow-blue-500/25"
          >
            + Nueva molécula
          </button>
        </div>
      </div>

      {/* Formulario de creación */}
      {showForm && (
        <form
          onSubmit={handleCreate}
          className="mb-6 bg-white border border-gray-200/80 rounded-xl p-5 flex items-end gap-3 shadow-sm"
        >
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-500 mb-1.5">
              Nombre de la molécula
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder='Ej: "Pregabalina"'
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm
                         placeholder-gray-300 focus:outline-none focus:ring-2
                         focus:ring-blue-500/40 focus:border-blue-400 transition-colors"
              autoFocus
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white
                       hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Guardando...' : 'Crear'}
          </button>
          <button
            type="button"
            onClick={() => {
              setShowForm(false);
              setName('');
            }}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium
                       text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
        </form>
      )}

      {/* Lista */}
      {loading ? (
        <LoadingSpinner />
      ) : molecules.length === 0 ? (
        <EmptyState
          title="No hay moléculas registradas"
          description="Crea tu primera molécula para empezar a cargar contenido científico."
        />
      ) : (
        <div className="grid gap-3">
          {molecules.map((mol) => (
            <div
              key={mol.id}
              className="group bg-white border border-gray-100 rounded-2xl px-5 py-4 flex items-center justify-between
                         hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300"
            >
              <Link
                to={`/moleculas/${mol.id}`}
                className="flex-1 min-w-0 flex items-center gap-3"
              >
                <div className="w-10 h-10 rounded-xl bg-linear-to-br from-blue-500 to-cyan-500 flex items-center justify-center shrink-0 shadow-md shadow-blue-500/20">
                  <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900">{mol.name}</h3>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    Creada por {mol.createdBy}
                  </p>
                </div>
              </Link>
              <div className="flex items-center gap-3 ml-4">
                <Link
                  to={`/moleculas/${mol.id}`}
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  Ver indicaciones →
                </Link>
                <button
                  onClick={() => setDeleteTarget(mol)}
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
        title="Eliminar molécula"
        message={`¿Estás seguro de eliminar "${deleteTarget?.name}"? Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};

export default MoleculesPage;
