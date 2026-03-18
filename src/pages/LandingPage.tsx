import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const handleLogin = () => {
    if (user) {
      navigate('/dashboard');
    } else {
      navigate('/login');
    }
  };

  const handleCTA = () => {
    if (user) {
      navigate('/dashboard');
    } else {
      navigate('/login');
    }
  };

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="w-full min-h-screen bg-white text-[#2D3748] font-[Montserrat]">
      {/* ── Navigation ── */}
      <nav className="fixed top-0 left-0 right-0 bg-white/95 backdrop-blur-sm z-50 border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#0066CC] to-[#003A8F] flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
              </svg>
            </div>
            <span className="text-xl font-semibold text-[#003A8F]">PharmaDesign AI</span>
          </div>
          <div className="hidden md:flex items-center gap-8">
            <button onClick={() => scrollTo('how-it-works')} className="text-sm text-gray-600 hover:text-[#0066CC] transition-colors">Cómo Funciona</button>
            <button onClick={() => scrollTo('features')} className="text-sm text-gray-600 hover:text-[#0066CC] transition-colors">Características</button>
            <button onClick={() => scrollTo('gallery')} className="text-sm text-gray-600 hover:text-[#0066CC] transition-colors">Galería</button>
            <button onClick={() => scrollTo('security')} className="text-sm text-gray-600 hover:text-[#0066CC] transition-colors">Compliance</button>
          </div>
          <button
            onClick={handleLogin}
            className="px-5 py-2.5 bg-[#0066CC] text-white text-sm font-medium rounded-lg hover:bg-[#003A8F] transition-colors"
          >
            {user ? 'Ir al Dashboard' : 'Iniciar Sesión'}
          </button>
        </div>
      </nav>

      {/* ── Hero Section ── */}
      <section className="pt-32 pb-20 px-6 bg-gradient-to-b from-[#F7F9FC] to-white">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div className="landing-fade-in">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#E8F4FC] rounded-full mb-6">
                <span className="w-2 h-2 bg-[#0066CC] rounded-full animate-pulse" />
                <span className="text-sm text-[#0066CC] font-medium">Potenciado por Inteligencia Artificial</span>
              </div>
              <h1 className="text-4xl md:text-5xl lg:text-5xl font-bold text-[#003A8F] leading-tight mb-6">
                Diseña material farmacéutico en minutos con IA
              </h1>
              <p className="text-lg text-gray-600 leading-relaxed mb-8 max-w-lg">
                Posters, presentaciones e infografías científicas adaptadas a cada molécula y marca.
                Precisión regulatoria y diseño profesional en un solo click.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <button
                  onClick={handleCTA}
                  className="px-8 py-4 bg-[#0066CC] text-white font-semibold rounded-xl hover:bg-[#003A8F] transition-all hover:shadow-lg hover:shadow-[#0066CC]/25"
                >
                  Probar Chat IA
                </button>
                <button
                  onClick={() => scrollTo('gallery')}
                  className="px-8 py-4 border-2 border-gray-200 text-gray-700 font-medium rounded-xl hover:border-[#0066CC] hover:text-[#0066CC] transition-colors"
                >
                  Ver Demo
                </button>
              </div>
            </div>

            {/* Hero Visual */}
            <div className="landing-fade-in stagger-2 relative">
              <div className="bg-white rounded-2xl shadow-2xl shadow-[#0066CC]/10 p-6 border border-gray-100">
                <div className="flex gap-4">
                  {/* Chat Interface */}
                  <div className="flex-1 bg-[#F7F9FC] rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-200">
                      <div className="w-8 h-8 rounded-full bg-[#0066CC] flex items-center justify-center">
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                        </svg>
                      </div>
                      <span className="text-sm font-medium text-[#003A8F]">Chat IA</span>
                    </div>
                    <div className="space-y-3">
                      <div className="bg-white rounded-lg p-3 text-xs text-gray-600">
                        <span className="text-[#0066CC] font-medium">Usuario:</span> Crear poster para Semaglutida, indicación diabetes T2, target HCP...
                      </div>
                      <div className="bg-[#0066CC]/10 rounded-lg p-3 text-xs text-gray-700">
                        <span className="text-[#0066CC] font-medium">IA:</span> Generando diseño con paleta corporativa azul, tipografía médica...
                      </div>
                    </div>
                  </div>

                  {/* Generated Design Preview */}
                  <div className="flex-1 bg-gradient-to-br from-[#0066CC]/5 to-[#003A8F]/5 rounded-xl p-4 border border-[#0066CC]/20">
                    <div className="h-full flex flex-col">
                      <div className="text-center mb-3">
                        <div className="w-12 h-12 mx-auto bg-[#0066CC]/10 rounded-lg flex items-center justify-center mb-2">
                          <svg className="w-6 h-6 text-[#0066CC]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </div>
                        <span className="text-xs font-semibold text-[#003A8F]">Poster A3</span>
                      </div>
                      <div className="flex-1 bg-white rounded-lg p-2 shadow-sm">
                        <div className="h-2 bg-[#0066CC] rounded mb-2" />
                        <div className="h-1.5 bg-gray-200 rounded w-3/4 mb-1" />
                        <div className="h-1.5 bg-gray-200 rounded w-1/2 mb-3" />
                        <div className="grid grid-cols-2 gap-1 mb-2">
                          <div className="h-8 bg-[#E8F4FC] rounded" />
                          <div className="h-8 bg-[#E8F4FC] rounded" />
                        </div>
                        <div className="h-1 bg-gray-100 rounded w-full" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Floating Element */}
              <div className="absolute -top-4 -right-4 bg-white rounded-xl shadow-lg p-3 border border-gray-100">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                    <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <span className="text-xs font-medium text-gray-700">Compliance Ready</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section id="how-it-works" className="py-24 px-6 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <span className="text-sm font-semibold text-[#0066CC] uppercase tracking-wider">Proceso Simple</span>
            <h2 className="text-3xl md:text-4xl font-bold text-[#003A8F] mt-3">Cómo funciona</h2>
            <div className="w-20 h-1 bg-gradient-to-r from-[#0066CC] to-[#003A8F] mx-auto mt-4 rounded-full" />
          </div>

          {/* Steps */}
          <div className="grid md:grid-cols-3 gap-8 mb-16">
            {/* Step 1 */}
            <div className="landing-card-hover bg-[#F7F9FC] rounded-2xl p-8 relative">
              <div className="absolute -top-4 left-8 w-8 h-8 bg-[#0066CC] rounded-full flex items-center justify-center text-white font-bold text-sm">1</div>
              <div className="w-14 h-14 bg-[#0066CC]/10 rounded-xl flex items-center justify-center mb-6">
                <svg className="w-7 h-7 text-[#0066CC]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-[#003A8F] mb-3">Escribe en el chat</h3>
              <ul className="space-y-2 text-sm text-gray-600">
                <li className="flex items-start gap-2"><span className="w-1.5 h-1.5 bg-[#0066CC] rounded-full mt-2 flex-shrink-0" /> Molécula / Principio activo</li>
                <li className="flex items-start gap-2"><span className="w-1.5 h-1.5 bg-[#0066CC] rounded-full mt-2 flex-shrink-0" /> Indicación terapéutica</li>
                <li className="flex items-start gap-2"><span className="w-1.5 h-1.5 bg-[#0066CC] rounded-full mt-2 flex-shrink-0" /> Target (HCP o paciente)</li>
                <li className="flex items-start gap-2"><span className="w-1.5 h-1.5 bg-[#0066CC] rounded-full mt-2 flex-shrink-0" /> Tono (científico, comercial)</li>
              </ul>
            </div>

            {/* Step 2 */}
            <div className="landing-card-hover bg-[#F7F9FC] rounded-2xl p-8 relative">
              <div className="absolute -top-4 left-8 w-8 h-8 bg-[#0066CC] rounded-full flex items-center justify-center text-white font-bold text-sm">2</div>
              <div className="w-14 h-14 bg-[#0066CC]/10 rounded-xl flex items-center justify-center mb-6">
                <svg className="w-7 h-7 text-[#0066CC]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-[#003A8F] mb-3">La IA propone</h3>
              <ul className="space-y-2 text-sm text-gray-600">
                <li className="flex items-start gap-2"><span className="w-1.5 h-1.5 bg-[#0066CC] rounded-full mt-2 flex-shrink-0" /> Paleta de colores corporativa</li>
                <li className="flex items-start gap-2"><span className="w-1.5 h-1.5 bg-[#0066CC] rounded-full mt-2 flex-shrink-0" /> Tipografía alineada a marca</li>
                <li className="flex items-start gap-2"><span className="w-1.5 h-1.5 bg-[#0066CC] rounded-full mt-2 flex-shrink-0" /> Estructura del material</li>
                <li className="flex items-start gap-2"><span className="w-1.5 h-1.5 bg-[#0066CC] rounded-full mt-2 flex-shrink-0" /> Gráficos clínicos estilizados</li>
              </ul>
            </div>

            {/* Step 3 */}
            <div className="landing-card-hover bg-[#F7F9FC] rounded-2xl p-8 relative">
              <div className="absolute -top-4 left-8 w-8 h-8 bg-[#0066CC] rounded-full flex items-center justify-center text-white font-bold text-sm">3</div>
              <div className="w-14 h-14 bg-[#0066CC]/10 rounded-xl flex items-center justify-center mb-6">
                <svg className="w-7 h-7 text-[#0066CC]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-[#003A8F] mb-3">Descarga</h3>
              <ul className="space-y-2 text-sm text-gray-600">
                <li className="flex items-start gap-2"><span className="w-1.5 h-1.5 bg-[#0066CC] rounded-full mt-2 flex-shrink-0" /> PDF alta resolución</li>
                <li className="flex items-start gap-2"><span className="w-1.5 h-1.5 bg-[#0066CC] rounded-full mt-2 flex-shrink-0" /> PowerPoint editable</li>
                <li className="flex items-start gap-2"><span className="w-1.5 h-1.5 bg-[#0066CC] rounded-full mt-2 flex-shrink-0" /> Poster A3 / A0</li>
                <li className="flex items-start gap-2"><span className="w-1.5 h-1.5 bg-[#0066CC] rounded-full mt-2 flex-shrink-0" /> Infografía digital</li>
              </ul>
            </div>
          </div>

          {/* Flow Diagram */}
          <div className="bg-gradient-to-r from-[#F7F9FC] to-white rounded-2xl p-8 border border-gray-100">
            <div className="flex flex-col md:flex-row items-center justify-center gap-4 md:gap-8">
              <FlowStep icon="chat" label="Chat IA" />
              <ArrowIcon />
              <FlowStep icon="engine" label="Motor de Diseño Farmacéutico" highlight />
              <ArrowIcon />
              <FlowStep icon="check" label="Listo para Aprobación" green />
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="py-24 px-6 bg-[#F7F9FC]">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <span className="text-sm font-semibold text-[#0066CC] uppercase tracking-wider">Funcionalidades</span>
            <h2 className="text-3xl md:text-4xl font-bold text-[#003A8F] mt-3">Personalización inteligente para cada laboratorio</h2>
            <div className="w-20 h-1 bg-gradient-to-r from-[#0066CC] to-[#003A8F] mx-auto mt-4 rounded-full" />
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <FeatureCard
              icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />}
              title="Guidelines Regulatorias"
              desc="Adaptación automática a normativas FDA, EMA y agencias locales para cada mercado."
            />
            <FeatureCard
              icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />}
              title="Versión HCP vs Paciente"
              desc="Generación automática de versiones diferenciadas según el público objetivo."
            />
            <FeatureCard
              icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />}
              title="Disclaimers Automáticos"
              desc="Inclusión inteligente de textos legales y advertencias según regulación vigente."
            />
            <FeatureCard
              icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />}
              title="Códigos QR Integrados"
              desc="Generación de QR para fichas técnicas, estudios clínicos y recursos adicionales."
            />
            <FeatureCard
              icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />}
              title="Compatibilidad Brandbook"
              desc="Sincronización total con los manuales de marca de cada laboratorio."
            />
            <FeatureCard
              icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />}
              title="Multi-idioma"
              desc="Generación de materiales en múltiples idiomas manteniendo coherencia visual."
            />
          </div>
        </div>
      </section>

      {/* ── Gallery ── */}
      <section id="gallery" className="py-24 px-6 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <span className="text-sm font-semibold text-[#0066CC] uppercase tracking-wider">Portfolio</span>
            <h2 className="text-3xl md:text-4xl font-bold text-[#003A8F] mt-3">Galería de ejemplos</h2>
            <div className="w-20 h-1 bg-gradient-to-r from-[#0066CC] to-[#003A8F] mx-auto mt-4 rounded-full" />
            <p className="text-gray-600 mt-4 max-w-2xl mx-auto">Materiales científicos generados con PharmaDesign AI, listos para aprobación médica.</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            <GalleryCard
              color="blue"
              title="Retinopatía Diabética"
              subtitle="Poster A3 · Oftalmología"
              visual={
                <>
                  <div className="h-20 bg-[#E8F4FC] rounded-lg mb-3 flex items-center justify-center">
                    <svg className="w-8 h-8 text-[#0066CC]/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  </div>
                </>
              }
              accentColor="#0066CC"
              bgGradient="from-[#E8F4FC] to-white"
            />
            <GalleryCard
              color="red"
              title="Infografía Cardiovascular"
              subtitle="Digital · Cardiología"
              visual={
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div className="h-12 bg-red-50 rounded flex items-center justify-center">
                    <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                    </svg>
                  </div>
                  <div className="h-12 bg-red-50 rounded flex items-center justify-center">
                    <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </div>
                </div>
              }
              accentColor="#EF4444"
              bgGradient="from-red-50 to-white"
            />
            <GalleryCard
              color="purple"
              title="Presentación Oncológica"
              subtitle="PowerPoint · Oncología"
              visual={
                <div className="h-16 bg-purple-50 rounded-lg mb-3 flex items-center justify-center">
                  <div className="flex gap-1">
                    <div className="w-4 h-8 bg-purple-200 rounded-sm" />
                    <div className="w-4 h-12 bg-purple-300 rounded-sm" />
                    <div className="w-4 h-6 bg-purple-200 rounded-sm" />
                    <div className="w-4 h-10 bg-purple-400 rounded-sm" />
                  </div>
                </div>
              }
              accentColor="#9333EA"
              bgGradient="from-purple-50 to-white"
            />
            <GalleryCard
              color="teal"
              title="Ficha Técnica Visual"
              subtitle="PDF · Multi-área"
              visual={
                <div className="border border-teal-200 rounded-lg p-2 mb-3">
                  <div className="grid grid-cols-2 gap-1 text-xs">
                    <div className="h-6 bg-teal-50 rounded flex items-center justify-center text-teal-600 font-medium">Dosis</div>
                    <div className="h-6 bg-gray-50 rounded" />
                    <div className="h-6 bg-teal-50 rounded flex items-center justify-center text-teal-600 font-medium">Vía</div>
                    <div className="h-6 bg-gray-50 rounded" />
                  </div>
                </div>
              }
              accentColor="#0D9488"
              bgGradient="from-teal-50 to-white"
            />
          </div>
        </div>
      </section>

      {/* ── Security & Compliance ── */}
      <section id="security" className="py-24 px-6 bg-[#003A8F]">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <span className="text-sm font-semibold text-[#0066CC] uppercase tracking-wider">Seguridad</span>
              <h2 className="text-3xl md:text-4xl font-bold text-white mt-3 mb-6">
                Diseñado para entornos regulados
              </h2>
              <p className="text-gray-300 mb-8 leading-relaxed">
                Cada material generado cumple con los más altos estándares de la industria farmacéutica,
                garantizando trazabilidad y cumplimiento normativo.
              </p>
              <div className="space-y-4">
                <SecurityItem icon="book" title="Referencias Bibliográficas" desc="Espacio dedicado para citas científicas y fuentes validadas." />
                <SecurityItem icon="shield" title="Aprobación Médica" desc="Área integrada para validación y firma de profesionales médicos." />
                <SecurityItem icon="clock" title="Versionado de Documentos" desc="Historial completo de cambios con trazabilidad total." />
                <SecurityItem icon="lock" title="Protección de Datos" desc="Encriptación end-to-end y cumplimiento GDPR/HIPAA." />
              </div>
            </div>
            <div className="relative">
              <div className="bg-white/5 backdrop-blur rounded-2xl p-8 border border-white/10">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-16 h-16 bg-gradient-to-br from-[#0066CC] to-[#003A8F] rounded-xl flex items-center justify-center">
                    <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="font-semibold text-white text-lg">Certificaciones</h4>
                    <p className="text-sm text-gray-400">Estándares de industria</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  {['ISO 27001', 'SOC 2', 'GDPR', 'HIPAA', '21 CFR', 'GxP'].map(cert => (
                    <div key={cert} className="bg-white/10 rounded-lg p-3 text-center">
                      <span className="text-xs font-semibold text-white">{cert}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="py-24 px-6 bg-gradient-to-b from-white to-[#F7F9FC]">
        <div className="max-w-4xl mx-auto text-center">
          <div className="w-16 h-16 bg-gradient-to-br from-[#0066CC] to-[#003A8F] rounded-2xl flex items-center justify-center mx-auto mb-8">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-[#003A8F] mb-4">
            Eleva el estándar visual de tu marca farmacéutica
          </h2>
          <p className="text-lg text-gray-600 mb-8 max-w-2xl mx-auto">
            Únete a los equipos de marketing que ya están creando materiales científicos
            de clase mundial con inteligencia artificial.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={handleCTA}
              className="px-10 py-4 bg-[#0066CC] text-white font-semibold rounded-xl hover:bg-[#003A8F] transition-all hover:shadow-lg hover:shadow-[#0066CC]/25"
            >
              Crear mi primer diseño con IA
            </button>
            <button
              onClick={() => scrollTo('how-it-works')}
              className="px-10 py-4 border-2 border-gray-200 text-gray-700 font-medium rounded-xl hover:border-[#0066CC] hover:text-[#0066CC] transition-colors"
            >
              Solicitar Demo
            </button>
          </div>
          <p className="text-sm text-gray-500 mt-6">Sin tarjeta de crédito · Prueba gratuita de 14 días</p>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="py-12 px-6 bg-[#003A8F] border-t border-white/10">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-4 gap-8 mb-12">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#0066CC] to-white/20 flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                  </svg>
                </div>
                <span className="text-lg font-semibold text-white">PharmaDesign AI</span>
              </div>
              <p className="text-sm text-gray-400 leading-relaxed">
                Diseño farmacéutico inteligente para equipos de marketing que exigen excelencia.
              </p>
            </div>
            <FooterColumn title="Producto" links={['Características', 'Precios', 'Integraciones', 'API']} />
            <FooterColumn title="Recursos" links={['Documentación', 'Blog', 'Casos de éxito', 'Webinars']} />
            <FooterColumn title="Legal" links={['Privacidad', 'Términos', 'Compliance', 'Seguridad']} />
          </div>
          <div className="border-t border-white/10 pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-sm text-gray-400">© 2026 PharmaDesign AI. Todos los derechos reservados.</p>
            <div className="flex items-center gap-4">
              <a href="#" className="w-10 h-10 bg-white/10 rounded-lg flex items-center justify-center hover:bg-white/20 transition-colors">
                <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M24 4.557c-.883.392-1.832.656-2.828.775 1.017-.609 1.798-1.574 2.165-2.724-.951.564-2.005.974-3.127 1.195-.897-.957-2.178-1.555-3.594-1.555-3.179 0-5.515 2.966-4.797 6.045-4.091-.205-7.719-2.165-10.148-5.144-1.29 2.213-.669 5.108 1.523 6.574-.806-.026-1.566-.247-2.229-.616-.054 2.281 1.581 4.415 3.949 4.89-.693.188-1.452.232-2.224.084.626 1.956 2.444 3.379 4.6 3.419-2.07 1.623-4.678 2.348-7.29 2.04 2.179 1.397 4.768 2.212 7.548 2.212 9.142 0 14.307-7.721 13.995-14.646.962-.695 1.797-1.562 2.457-2.549z" />
                </svg>
              </a>
              <a href="#" className="w-10 h-10 bg-white/10 rounded-lg flex items-center justify-center hover:bg-white/20 transition-colors">
                <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                </svg>
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;

/* ───── Sub-components ───── */

const FeatureCard: React.FC<{ icon: React.ReactNode; title: string; desc: string }> = ({ icon, title, desc }) => (
  <div className="landing-card-hover bg-white rounded-2xl p-6 border border-gray-100">
    <div className="w-12 h-12 bg-[#E8F4FC] rounded-xl flex items-center justify-center mb-4">
      <svg className="w-6 h-6 text-[#0066CC]" fill="none" stroke="currentColor" viewBox="0 0 24 24">{icon}</svg>
    </div>
    <h3 className="text-lg font-semibold text-[#003A8F] mb-2">{title}</h3>
    <p className="text-sm text-gray-600 leading-relaxed">{desc}</p>
  </div>
);

const GalleryCard: React.FC<{
  color: string; title: string; subtitle: string;
  visual: React.ReactNode; accentColor: string; bgGradient: string;
}> = ({ title, subtitle, visual, accentColor, bgGradient }) => (
  <div className="landing-card-hover group">
    <div className={`bg-gradient-to-br ${bgGradient} rounded-2xl p-4 border border-gray-100 overflow-hidden`}>
      <div className="aspect-[3/4] bg-white rounded-xl shadow-sm p-4 relative">
        <div className="h-3 rounded mb-3" style={{ backgroundColor: accentColor }} />
        <div className="h-2 bg-gray-200 rounded w-3/4 mb-2" />
        <div className="h-2 bg-gray-200 rounded w-1/2 mb-4" />
        {visual}
        <div className="space-y-1.5">
          <div className="h-1.5 bg-gray-100 rounded" />
          <div className="h-1.5 bg-gray-100 rounded w-5/6" />
          <div className="h-1.5 bg-gray-100 rounded w-4/6" />
        </div>
        <div className="absolute bottom-2 left-2 right-2 h-1 rounded" style={{ backgroundColor: `${accentColor}33` }} />
      </div>
      <div className="mt-4 text-center">
        <h4 className="font-semibold text-[#003A8F] text-sm">{title}</h4>
        <span className="text-xs text-gray-500">{subtitle}</span>
      </div>
    </div>
  </div>
);

const securityIcons: Record<string, React.ReactNode> = {
  book: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />,
  shield: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />,
  clock: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />,
  lock: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />,
};

const SecurityItem: React.FC<{ icon: string; title: string; desc: string }> = ({ icon, title, desc }) => (
  <div className="flex items-start gap-4 bg-white/5 rounded-xl p-4 border border-white/10">
    <div className="w-10 h-10 bg-[#0066CC] rounded-lg flex items-center justify-center flex-shrink-0">
      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        {securityIcons[icon]}
      </svg>
    </div>
    <div>
      <h4 className="font-semibold text-white mb-1">{title}</h4>
      <p className="text-sm text-gray-400">{desc}</p>
    </div>
  </div>
);

const FlowStep: React.FC<{ icon: string; label: string; highlight?: boolean; green?: boolean }> = ({ icon, label, highlight, green }) => {
  const bgClass = green ? 'bg-green-500' : highlight ? 'bg-gradient-to-br from-[#0066CC] to-[#003A8F]' : 'bg-[#0066CC]';
  const borderClass = green ? 'border-green-200' : highlight ? 'border-[#0066CC]/20' : 'border-gray-100';

  const icons: Record<string, React.ReactNode> = {
    chat: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />,
    engine: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />,
    check: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />,
  };

  return (
    <div className={`flex items-center gap-3 bg-white rounded-xl px-6 py-4 shadow-sm border ${borderClass}`}>
      <div className={`w-10 h-10 ${bgClass} rounded-lg flex items-center justify-center`}>
        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">{icons[icon]}</svg>
      </div>
      <span className="font-semibold text-[#003A8F]">{label}</span>
    </div>
  );
};

const ArrowIcon: React.FC = () => (
  <svg className="w-8 h-8 text-[#0066CC] transform rotate-90 md:rotate-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
  </svg>
);

const FooterColumn: React.FC<{ title: string; links: string[] }> = ({ title, links }) => (
  <div>
    <h5 className="font-semibold text-white mb-4">{title}</h5>
    <ul className="space-y-2 text-sm text-gray-400">
      {links.map(l => (
        <li key={l}><a href="#" className="hover:text-white transition-colors">{l}</a></li>
      ))}
    </ul>
  </div>
);
