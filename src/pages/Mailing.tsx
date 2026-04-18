import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTenant } from '@/hooks/useTenant';
import { useToast } from '@/hooks/useToast';
import { getMailingProjects, deleteMailingProject } from '@/services/mailingService';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import type { MailingProject, MailingStatus } from '@/types';

const STATUS_BADGE: Record<MailingStatus, { label: string; cls: string }> = {
  draft: { label: 'Borrador', cls: 'bg-amber-100 text-amber-700' },
  ready: { label: 'Listo', cls: 'bg-green-100 text-green-700' },
  sent: { label: 'Enviado', cls: 'bg-blue-100 text-blue-700' },
};

const Mailing: React.FC = () => {
  const tenantId = useTenant();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<MailingProject[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<MailingProject | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getMailingProjects(tenantId);
      setProjects(data);
    } catch (err) {
      console.error('Error al cargar emails:', err);
      toast('Error al cargar emails', 'error');
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMailingProject(deleteTarget.id);
      toast('Email eliminado', 'success');
      setDeleteTarget(null);
      load();
    } catch {
      toast('Error al eliminar', 'error');
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Mailing</h1>
          <p className="text-sm text-gray-500 mt-1">Crea y gestiona emails de marca con tus diseños</p>
        </div>
        <Link
          to="/mailing/new"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-linear-to-r from-blue-600 to-cyan-500 text-white text-sm font-semibold rounded-xl shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all hover:scale-[1.02]"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Nuevo Email
        </Link>
      </div>

      {projects.length === 0 ? (
        <EmptyState
          title="No hay emails aún"
          description="Crea tu primer email de marca eligiendo un diseño y editando el contenido bloque por bloque."
          action={
            <Link
              to="/mailing/new"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition"
            >
              Crear primer email
            </Link>
          }
        />
      ) : (
        (() => {
          // Agrupar proyectos por marca
          const grouped = projects.reduce<Record<string, MailingProject[]>>((acc, p) => {
            const key = p.brandName || 'Sin marca';
            if (!acc[key]) acc[key] = [];
            acc[key].push(p);
            return acc;
          }, {});
          const brandNames = Object.keys(grouped).sort();

          return (
            <div className="space-y-8">
              {brandNames.map((brandName) => {
                const brandProjects = grouped[brandName];
                const firstProject = brandProjects[0];
                return (
                  <div key={brandName}>
                    {/* Brand header */}
                    <div className="flex items-center gap-3 mb-4">
                      <div
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: firstProject.style.colorPrimary }}
                      />
                      <h2 className="text-lg font-semibold text-gray-800">{brandName}</h2>
                      <span className="text-xs text-gray-400">{brandProjects.length} {brandProjects.length === 1 ? 'email' : 'emails'}</span>
                    </div>
                    {/* Project cards */}
                    <div className="space-y-3 pl-6">
                      {brandProjects.map((p) => {
                        const badge = STATUS_BADGE[p.status];
                        return (
                          <div
                            key={p.id}
                            className="group bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-lg hover:border-blue-200 transition-all cursor-pointer overflow-hidden flex"
                            onClick={() => navigate(`/mailing/${p.id}`)}
                          >
                            {/* Color accent */}
                            <div
                              className="w-1.5 shrink-0"
                              style={{ background: `linear-gradient(180deg, ${p.style.colorPrimary}, ${p.style.colorSecondary})` }}
                            />
                            <div className="flex-1 p-4 flex items-center gap-4">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <h3 className="text-sm font-semibold text-gray-900 truncate group-hover:text-blue-600 transition-colors">
                                    {p.name}
                                  </h3>
                                  <span className={`shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-full ${badge.cls}`}>
                                    {badge.label}
                                  </span>
                                </div>
                                <p className="text-xs text-gray-400 truncate mt-0.5">{p.subject}</p>
                              </div>
                              <span className="text-xs text-gray-400 shrink-0 hidden sm:block">{p.designTemplateName}</span>
                              <div className="flex items-center gap-2 shrink-0">
                                <button
                                  onClick={(e) => { e.stopPropagation(); navigate(`/mailing/${p.id}`); }}
                                  className="text-xs font-medium text-blue-600 hover:text-blue-800 transition"
                                >
                                  Editar
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); setDeleteTarget(p); }}
                                  className="text-xs font-medium text-red-500 hover:text-red-700 transition"
                                >
                                  Eliminar
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Eliminar email"
        message={`¿Seguro que quieres eliminar "${deleteTarget?.name}"? Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};

export default Mailing;
