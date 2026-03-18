import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useTenant } from '../hooks/useTenant';
import { useToast } from '../hooks/useToast';
import {
  getMolecule,
  updateMolecule,
  getIndications,
  createIndication,
  updateIndication,
  deleteIndication,
} from '../services/moleculeService';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import EmptyState from '../components/ui/EmptyState';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import type { Molecule, Indication } from '../types';

const MoleculeDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const tenantId = useTenant();
  const { toast } = useToast();
  const [molecule, setMolecule] = useState<Molecule | null>(null);
  const [indications, setIndications] = useState<Indication[]>([]);
  const [loading, setLoading] = useState(true);

  // Edición nombre
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [savingName, setSavingName] = useState(false);

  // Nueva indicación
  const [showAddInd, setShowAddInd] = useState(false);
  const [indName, setIndName] = useState('');
  const [savingInd, setSavingInd] = useState(false);

  // Confirm delete
  const [deleteTarget, setDeleteTarget] = useState<Indication | null>(null);

  // Edición indicación
  const [editingInd, setEditingInd] = useState<string | null>(null);
  const [editIndName, setEditIndName] = useState('');
  const [savingEditInd, setSavingEditInd] = useState(false);

  const load = async () => {
    if (!id) return;
    try {
      setLoading(true);
      const [mol, inds] = await Promise.all([getMolecule(id), getIndications(id)]);
      setMolecule(mol);
      setIndications(inds);
    } catch {
      toast('Error al cargar molécula', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [id]);

  const handleUpdateName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !editName.trim()) return;
    try {
      setSavingName(true);
      await updateMolecule(id, { name: editName.trim() });
      toast('Nombre actualizado');
      setEditing(false);
      await load();
    } catch {
      toast('Error al actualizar nombre', 'error');
    } finally {
      setSavingName(false);
    }
  };

  const handleAddIndication = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !indName.trim() || !user) return;
    try {
      setSavingInd(true);
      await createIndication({
        moleculeId: id,
        name: indName.trim(),
        tenantId,
        createdBy: user.email!,
      });
      toast('Indicación creada');
      setIndName('');
      setShowAddInd(false);
      await load();
    } catch {
      toast('Error al crear indicación', 'error');
    } finally {
      setSavingInd(false);
    }
  };

  const handleDeleteIndication = async () => {
    if (!deleteTarget) return;
    try {
      await deleteIndication(deleteTarget.id);
      toast('Indicación eliminada');
      setDeleteTarget(null);
      await load();
    } catch {
      toast('Error al eliminar indicación', 'error');
    }
  };

  const handleUpdateIndication = async (indId: string) => {
    if (!editIndName.trim()) return;
    try {
      setSavingEditInd(true);
      await updateIndication(indId, { name: editIndName.trim() });
      toast('Indicación actualizada');
      setEditingInd(null);
      setEditIndName('');
      await load();
    } catch {
      toast('Error al actualizar indicación', 'error');
    } finally {
      setSavingEditInd(false);
    }
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  if (!molecule) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-500">Molécula no encontrada.</p>
        <Link to="/moleculas" className="text-sm text-blue-600 hover:underline mt-2 inline-block">
          ← Volver a moléculas
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl">
      {/* Breadcrumb */}
      <nav className="text-xs text-gray-400 mb-4 flex items-center gap-1">
        <Link to="/moleculas" className="hover:text-gray-600 transition-colors">
          Moléculas
        </Link>
        <span>/</span>
        <span className="text-gray-600 font-medium">{molecule.name}</span>
      </nav>

      {/* Header molécula */}
      <div className="bg-white border border-gray-200/80 rounded-xl p-5 mb-6">
        {editing ? (
          <form onSubmit={handleUpdateName} className="flex items-end gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Nombre</label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm
                           focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400 transition-colors"
                autoFocus
              />
            </div>
            <button
              type="submit"
              disabled={savingName}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white
                         hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              Guardar
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium
                         text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
          </form>
        ) : (
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold text-gray-900">{molecule.name}</h1>
              <p className="text-xs text-gray-400 mt-1">
                Creada por {molecule.createdBy}
              </p>
            </div>
            <button
              onClick={() => {
                setEditName(molecule.name);
                setEditing(true);
              }}
              className="text-sm text-blue-600 hover:text-blue-800 font-medium"
            >
              Editar nombre
            </button>
          </div>
        )}
      </div>

      {/* Sección indicaciones */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          Indicaciones
          <span className="text-[11px] font-normal text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">
            {indications.length}
          </span>
        </h2>
        <button
          onClick={() => setShowAddInd(true)}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white
                     hover:bg-blue-700 transition-colors shadow-sm shadow-blue-600/20"
        >
          + Indicación
        </button>
      </div>

      {/* Form nueva indicación */}
      {showAddInd && (
        <form
          onSubmit={handleAddIndication}
          className="mb-4 bg-white border border-gray-200/80 rounded-xl p-5 flex items-end gap-3 shadow-sm"
        >
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-500 mb-1.5">
              Nombre de la indicación
            </label>
            <input
              type="text"
              required
              value={indName}
              onChange={(e) => setIndName(e.target.value)}
              placeholder='Ej: "Dolor neuropático"'
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm
                         placeholder-gray-300 focus:outline-none focus:ring-2
                         focus:ring-blue-500/40 focus:border-blue-400 transition-colors"
              autoFocus
            />
          </div>
          <button
            type="submit"
            disabled={savingInd}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white
                       hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {savingInd ? 'Guardando...' : 'Crear'}
          </button>
          <button
            type="button"
            onClick={() => {
              setShowAddInd(false);
              setIndName('');
            }}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium
                       text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
        </form>
      )}

      {/* Lista indicaciones */}
      {indications.length === 0 ? (
        <EmptyState
          title="Sin indicaciones aún"
          description="Agrega las indicaciones aprobadas para esta molécula."
        />
      ) : (
        <div className="grid gap-2">
          {indications.map((ind) => (
            <div
              key={ind.id}
              className="group bg-white border border-gray-200/80 rounded-xl px-5 py-3.5
                         flex items-center justify-between hover:border-gray-300 hover:shadow-sm transition-all"
            >
              {editingInd === ind.id ? (
                <div className="flex items-center gap-2 flex-1 mr-3">
                  <input
                    type="text"
                    value={editIndName}
                    onChange={(e) => setEditIndName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); handleUpdateIndication(ind.id); }
                      if (e.key === 'Escape') { setEditingInd(null); setEditIndName(''); }
                    }}
                    className="flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm
                               focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400 transition-colors"
                    autoFocus
                  />
                  <button
                    onClick={() => handleUpdateIndication(ind.id)}
                    disabled={savingEditInd || !editIndName.trim()}
                    className="text-xs text-white bg-blue-600 rounded-lg px-3 py-1.5 hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    {savingEditInd ? '...' : 'Guardar'}
                  </button>
                  <button
                    onClick={() => { setEditingInd(null); setEditIndName(''); }}
                    className="text-xs text-gray-600 hover:text-gray-800"
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <Link
                  to={`/moleculas/${id}/indicaciones/${ind.id}`}
                  className="flex-1 min-w-0"
                >
                  <h3 className="text-sm font-medium text-gray-900 hover:text-blue-600 transition-colors">
                    {ind.name}
                  </h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Creada por {ind.createdBy} · Ver documentos e insights →
                  </p>
                </Link>
              )}
              {editingInd !== ind.id && (
                <div className="flex items-center gap-2 ml-3 shrink-0">
                  <button
                    onClick={() => { setEditingInd(ind.id); setEditIndName(ind.name); }}
                    className="text-xs text-blue-500 hover:text-blue-700 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => setDeleteTarget(ind)}
                    className="text-xs text-gray-300 hover:text-red-500 transition-colors"
                  >
                    Eliminar
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Confirm delete */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Eliminar indicación"
        message={`¿Estás seguro de eliminar "${deleteTarget?.name}"?`}
        confirmLabel="Eliminar"
        variant="danger"
        onConfirm={handleDeleteIndication}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};

export default MoleculeDetailPage;
