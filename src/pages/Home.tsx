import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useTenant } from '@/hooks/useTenant';
import { useToast } from '@/hooks/useToast';
import { seedDemoData } from '@/services/seedService';

const Home: React.FC = () => {
  const { user } = useAuth();
  const tenantId = useTenant();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [seeding, setSeeding] = useState(false);

  const handleSeed = async () => {
    if (!user) return;
    try {
      setSeeding(true);
      const { brandId } = await seedDemoData(tenantId, user.email!);
      toast('Datos demo creados: Pregabalina + Lyrica® + 6 insights + plantillas');
      navigate(`/marcas/${brandId}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      toast(`Error al crear datos demo: ${msg}`, 'error');
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div className="max-w-6xl">
      {/* Hero header with gradient background */}
      <div className="relative overflow-hidden rounded-3xl bg-linear-to-br from-[#0f172a] via-[#1e3a5f] to-[#0c4a6e] p-8 mb-8">
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, rgba(56,189,248,0.3) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(139,92,246,0.3) 0%, transparent 50%), radial-gradient(circle at 60% 80%, rgba(6,182,212,0.2) 0%, transparent 50%)' }} />
        <div className="absolute -top-20 -right-20 w-80 h-80 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="absolute -bottom-20 -left-10 w-60 h-60 rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="relative flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-linear-to-br from-blue-400 to-cyan-400 flex items-center justify-center shadow-lg shadow-blue-500/30">
                <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2L2 7l10 5 10-5-10-5z" />
                  <path d="M2 17l10 5 10-5" />
                  <path d="M2 12l10 5 10-5" />
                </svg>
              </div>
              <span className="text-[10px] font-bold text-blue-400 uppercase tracking-[0.2em] bg-blue-400/10 px-3 py-1 rounded-full">
                AI Studio
              </span>
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">PharmaDesign AI</h1>
            <p className="text-sm text-blue-200/80 max-w-lg leading-relaxed">
              Generador de materiales promocionales farmacéuticos con inteligencia artificial.
              Desde insights científicos hasta material listo para imprimir.
            </p>
            <button
              onClick={handleSeed}
              disabled={seeding}
              className="mt-5 rounded-xl bg-linear-to-r from-blue-500 to-cyan-500 px-6 py-2.5 text-sm font-semibold text-white
                         hover:from-blue-400 hover:to-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all
                         shadow-lg shadow-blue-500/25"
            >
              {seeding ? 'Creando datos...' : '✨ Crear datos demo y empezar'}
            </button>
          </div>
          <div className="hidden lg:block">
            <div className="grid grid-cols-2 gap-3 opacity-40">
              {[1,2,3,4].map(n => (
                <div key={n} className="w-20 h-14 rounded-lg bg-white/5 border border-white/10 backdrop-blur-sm" />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Flujo visual */}
      <div className="mb-3">
        <h2 className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.15em]">Flujo de trabajo</h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { n: '1', gradient: 'from-blue-500 to-blue-600', bg: 'bg-blue-50', title: 'Molécula', desc: 'Crea la molécula y sus indicaciones terapéuticas.', icon: '🧬' },
          { n: '2', gradient: 'from-emerald-500 to-emerald-600', bg: 'bg-emerald-50', title: 'Insights', desc: 'Sube documentos y valida los insights científicos.', icon: '📊' },
          { n: '3', gradient: 'from-violet-500 to-violet-600', bg: 'bg-violet-50', title: 'Marca', desc: 'Configura colores, tipografías y asocia una molécula.', icon: '🎨' },
          { n: '4', gradient: 'from-amber-500 to-amber-600', bg: 'bg-amber-50', title: 'Chat AI', desc: 'Genera material promocional con IA.', icon: '✨' },
        ].map((step, i) => (
          <div key={step.n} className={`group bg-white rounded-2xl p-5 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 relative border border-gray-100`}>
            <div className="flex items-center gap-3 mb-3">
              <div className={`w-9 h-9 rounded-xl bg-linear-to-br ${step.gradient} flex items-center justify-center text-white text-sm font-bold shadow-md`}>
                {step.n}
              </div>
              <span className="text-lg">{step.icon}</span>
            </div>
            <h3 className="text-sm font-bold text-gray-900 mb-1">{step.title}</h3>
            <p className="text-xs text-gray-500 leading-relaxed">{step.desc}</p>
            {i < 3 && <div className="hidden md:block absolute top-1/2 -right-3 text-gray-300 text-sm font-bold z-10">→</div>}
          </div>
        ))}
      </div>

      {/* Navigation cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mt-8">
        <Link
          to="/moleculas"
          className="group relative overflow-hidden bg-white rounded-2xl p-6 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 border border-gray-100"
        >
          <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-blue-50 -translate-y-8 translate-x-8 group-hover:scale-125 transition-transform duration-500" />
          <div className="relative">
            <div className="w-12 h-12 rounded-2xl bg-linear-to-br from-blue-500 to-blue-600 flex items-center justify-center mb-4 shadow-lg shadow-blue-500/20 group-hover:shadow-blue-500/40 transition-shadow">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
              </svg>
            </div>
            <h3 className="text-base font-bold text-gray-900 group-hover:text-blue-700 transition-colors mb-1">Moléculas</h3>
            <p className="text-xs text-gray-500 leading-relaxed">
              Gestiona moléculas, indicaciones, documentos e insights científicos.
            </p>
          </div>
        </Link>
        <Link
          to="/marcas"
          className="group relative overflow-hidden bg-white rounded-2xl p-6 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 border border-gray-100"
        >
          <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-violet-50 -translate-y-8 translate-x-8 group-hover:scale-125 transition-transform duration-500" />
          <div className="relative">
            <div className="w-12 h-12 rounded-2xl bg-linear-to-br from-violet-500 to-violet-600 flex items-center justify-center mb-4 shadow-lg shadow-violet-500/20 group-hover:shadow-violet-500/40 transition-shadow">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
              </svg>
            </div>
            <h3 className="text-base font-bold text-gray-900 group-hover:text-violet-700 transition-colors mb-1">Marcas</h3>
            <p className="text-xs text-gray-500 leading-relaxed">
              Configura parámetros visuales, materiales de referencia y genera materiales.
            </p>
          </div>
        </Link>
        <Link
          to="/campanas"
          className="group relative overflow-hidden bg-white rounded-2xl p-6 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 border border-gray-100"
        >
          <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-amber-50 -translate-y-8 translate-x-8 group-hover:scale-125 transition-transform duration-500" />
          <div className="relative">
            <div className="w-12 h-12 rounded-2xl bg-linear-to-br from-amber-500 to-amber-600 flex items-center justify-center mb-4 shadow-lg shadow-amber-500/20 group-hover:shadow-amber-500/40 transition-shadow">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
              </svg>
            </div>
            <h3 className="text-base font-bold text-gray-900 group-hover:text-amber-700 transition-colors mb-1">Campañas</h3>
            <p className="text-xs text-gray-500 leading-relaxed">
              Organiza publicaciones en campañas con fechas de inicio y fin.
            </p>
          </div>
        </Link>
      </div>
    </div>
  );
};

export default Home;
