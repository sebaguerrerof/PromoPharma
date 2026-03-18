import { useCallback, useEffect, useState, useRef, useMemo, lazy, Suspense } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/useToast';
import { getSession, deleteSession, updateSessionSlots } from '@/services/generationService';
import { getTemplate, expandTemplateForPages } from '@/services/templateService';
import { getBrand } from '@/services/brandService';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { loadGoogleFonts } from '@/services/fontService';
import { getVariantStyles, renderBulletMarker, type DesignVariant } from '@/lib/designVariants';
import type { GenerationSession, Template, Brand, TemplateSlot, BrochureLayoutSpec } from '@/types';

const CanvasEditor = lazy(() => import('@/components/CanvasEditor'));

// Lazy-load export functions only when needed
const loadExportService = () => import('@/services/exportService');

// ── Agrupación de slots para overlay de texto sobre imagen ─

type SlotGroup =
  | { kind: 'overlay'; textSlots: TemplateSlot[]; imageSlot: TemplateSlot }
  | { kind: 'normal'; slot: TemplateSlot };

/**
 * Agrupa slots consecutivos title/subtitle que preceden a un slot de imagen
 * para renderizarlos como texto superpuesto sobre la imagen.
 */
function groupSlots(
  slots: TemplateSlot[],
  values: Record<string, string>,
): SlotGroup[] {
  const groups: SlotGroup[] = [];
  let i = 0;

  while (i < slots.length) {
    const slot = slots[i];

    // ¿Es title/subtitle? Mirar hacia adelante buscando una imagen.
    if (['title', 'subtitle'].includes(slot.type) && values[slot.id]?.trim()) {
      const textSlots: TemplateSlot[] = [slot];
      let j = i + 1;
      while (j < slots.length && ['title', 'subtitle'].includes(slots[j].type)) {
        if (values[slots[j].id]?.trim()) textSlots.push(slots[j]);
        j++;
      }
      // ¿Sigue un slot de imagen con valor?
      if (j < slots.length && slots[j].type === 'image' && values[slots[j].id]?.trim()) {
        groups.push({ kind: 'overlay', textSlots, imageSlot: slots[j] });
        i = j + 1;
        continue;
      }
    }

    groups.push({ kind: 'normal', slot });
    i++;
  }

  return groups;
}

// ── Agrupación de slots por slide (para formato pptx) ─

interface SlideGroup {
  slideNumber: number;
  slots: TemplateSlot[];
}

/**
 * Agrupa slots en slides basándose en el prefijo del id:
 * - titulo_portada, subtitulo_portada, imagen_portada → slide 1
 * - slide2_* → slide 2
 * - slide3_* → slide 3, etc.
 */
function groupBySlide(slots: TemplateSlot[]): SlideGroup[] {
  const slideMap = new Map<number, TemplateSlot[]>();

  for (const slot of slots) {
    const match = slot.id.match(/^slide(\d+)_/);
    const slideNum = match ? parseInt(match[1], 10) : 1; // portada = slide 1
    if (!slideMap.has(slideNum)) slideMap.set(slideNum, []);
    slideMap.get(slideNum)!.push(slot);
  }

  return Array.from(slideMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([slideNumber, slots]) => ({ slideNumber, slots }));
}

// ── Componentes de renderizado por tipo de slot ─────────

const SlotRenderer: React.FC<{
  slot: TemplateSlot;
  value: string;
  brand: Brand;
  variant?: DesignVariant;
}> = ({ slot, value, brand, variant = 'moderna' }) => {
  if (!value) return null;
  const vs = getVariantStyles(variant).slots(brand.params.colorPrimary, brand.params.colorSecondary);

  switch (slot.type) {
    case 'image':
      return (
        <div className="my-5 relative group">
          <img
            src={value}
            alt={slot.name}
            className={vs.image.className}
            style={vs.image.style}
          />
          {/* Subtle gradient overlay at bottom of image for depth */}
          <div className="absolute bottom-0 left-0 right-0 h-8 rounded-b-xl pointer-events-none"
            style={{ background: 'linear-gradient(to top, rgba(0,0,0,.04), transparent)' }} />
        </div>
      );

    case 'title':
      return (
        <h1
          className={vs.title.className}
          style={{
            ...vs.title.style,
            fontFamily: brand.params.fontTitle || 'inherit',
          }}
        >
          {value}
        </h1>
      );

    case 'subtitle':
      return (
        <p
          className={vs.subtitle.className}
          style={{
            ...vs.subtitle.style,
            fontFamily: brand.params.fontTitle || 'inherit',
          }}
        >
          {value}
        </p>
      );

    case 'body':
      return (
        <p
          className={vs.body.className}
          style={{ ...vs.body.style, fontFamily: brand.params.fontBody || 'inherit' }}
        >
          {value}
        </p>
      );

    case 'bullets': {
      const items = value.split('\n').filter((l) => l.trim());
      return (
        <div className={vs.bullets.wrapper.className} style={vs.bullets.wrapper.style}>
          {items.map((item, i) => (
            <div key={i} className={vs.bullets.item.className} style={vs.bullets.item.style}>
              {renderBulletMarker(vs.bullets.markerStyle, i, brand.params.colorPrimary)}
              <span
                className="text-[13px] text-gray-600 leading-relaxed"
                style={{ fontFamily: brand.params.fontBody || 'inherit' }}
              >
                {item}
              </span>
            </div>
          ))}
        </div>
      );
    }

    case 'callout':
      return (
        <div
          className={vs.callout.className}
          style={vs.callout.style}
        >
          {variant !== 'vibrante' && variant !== 'impacto' && variant !== 'editorial' && (
            <div
              className="w-1.5 min-h-[28px] rounded-full shrink-0 self-stretch"
              style={{ background: `linear-gradient(180deg, ${brand.params.colorPrimary}, ${brand.params.colorSecondary})` }}
            />
          )}
          <p
            className="text-[13px] font-medium leading-[1.7]"
            style={{
              color: variant === 'vibrante' || variant === 'impacto' ? '#fff' : brand.params.colorPrimary,
              fontFamily: brand.params.fontBody || 'inherit',
            }}
          >
            {value}
          </p>
        </div>
      );

    case 'disclaimer':
      return (
        <p className={vs.disclaimer.className} style={vs.disclaimer.style}>
          {value}
        </p>
      );

    default:
      return <p className="text-sm text-gray-600 mb-2">{value}</p>;
  }
};

// ── Overlay: texto sobre imagen ─────────────────────────

const ImageOverlay: React.FC<{
  textSlots: TemplateSlot[];
  imageSlot: TemplateSlot;
  values: Record<string, string>;
  brand: Brand;
}> = ({ textSlots, imageSlot, values, brand }) => {
  return (
    <div className="relative my-5 rounded-xl overflow-hidden shadow-lg ring-1 ring-black/5">
      <img
        src={values[imageSlot.id]}
        alt={imageSlot.name}
        className="w-full object-cover"
        style={{ minHeight: '220px', maxHeight: '380px' }}
      />
      <div
        className="absolute inset-0 flex flex-col justify-end px-7 pb-6"
        style={{
          background: `linear-gradient(to top, ${brand.params.colorPrimary}e8 0%, ${brand.params.colorPrimary}60 35%, ${brand.params.colorPrimary}10 60%, transparent 80%)`,
        }}
      >
        {textSlots.map((ts) => {
          const val = values[ts.id];
          if (!val?.trim()) return null;
          if (ts.type === 'title') {
            return (
              <h1
                key={ts.id}
                className="text-xl md:text-2xl font-bold mb-1 tracking-tight drop-shadow-md"
                style={{
                  color: '#ffffff',
                  fontFamily: brand.params.fontTitle || 'inherit',
                  textShadow: '0 2px 8px rgba(0,0,0,.3)',
                }}
              >
                {val}
              </h1>
            );
          }
          return (
            <p
              key={ts.id}
              className="text-sm font-normal drop-shadow-sm"
              style={{
                color: '#ffffffcc',
                fontFamily: brand.params.fontTitle || 'inherit',
                textShadow: '0 1px 4px rgba(0,0,0,.2)',
              }}
            >
              {val}
            </p>
          );
        })}
      </div>
    </div>
  );
};

// ── Página de publicación ───────────────────────────────

const PublicationPage: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [session, setSession] = useState<GenerationSession | null>(null);
  const [baseTemplate, setBaseTemplate] = useState<Template | null>(null);
  const [brand, setBrand] = useState<Brand | null>(null);
  const [currentPubPage, setCurrentPubPage] = useState(1);
  const publicationRef = useRef<HTMLDivElement>(null);
  const slideRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  const load = useCallback(async () => {
    if (!sessionId) return;
    try {
      setLoading(true);
      const sess = await getSession(sessionId);
      if (!sess) return;
      setSession(sess);

      const [tpl, br] = await Promise.all([
        getTemplate(sess.templateId),
        getBrand(sess.brandId),
      ]);
      setBaseTemplate(tpl);
      setBrand(br);
      // Cargar fuentes de Google de la marca
      if (br) loadGoogleFonts([br.params.fontTitle, br.params.fontBody]);
    } catch {
      toast('Error al cargar publicación', 'error');
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => { load(); }, [load]);

  // Expand template slots based on page count stored in session
  const template = useMemo(() => {
    if (!baseTemplate || !session) return baseTemplate;
    const pc = parseInt(session.slotValues['__page_count'] || '0') || 0;
    return pc > 0 ? expandTemplateForPages(baseTemplate, pc) : baseTemplate;
  }, [baseTemplate, session]);

  const effectiveBrand = useMemo(() => {
    if (!brand || !session) return brand;

    const isBrochureLocked = session.slotValues['__design_mode'] === 'brochure_locked';
    if (!isBrochureLocked) return brand;

    const snapshot = session.brochureDesignSnapshot;

    let colors: string[] = snapshot?.colors ?? [];
    let fonts: string[] = snapshot?.fonts ?? [];

    try {
      const parsedColors = JSON.parse(session.slotValues['__brochure_colors'] ?? '[]') as string[];
      if (Array.isArray(parsedColors) && parsedColors.length > 0) colors = parsedColors;
    } catch {
      // noop
    }
    try {
      const parsedFonts = JSON.parse(session.slotValues['__brochure_fonts'] ?? '[]') as string[];
      if (Array.isArray(parsedFonts) && parsedFonts.length > 0) fonts = parsedFonts;
    } catch {
      // noop
    }

    const primary = colors[0] ?? brand.params.colorPrimary;
    const secondary = colors[1] ?? brand.params.colorSecondary;
    const fontTitle = fonts[0] ?? brand.params.fontTitle;
    const fontBody = fonts[1] ?? fonts[0] ?? brand.params.fontBody;

    return {
      ...brand,
      params: {
        ...brand.params,
        colorPrimary: primary,
        colorSecondary: secondary,
        fontTitle,
        fontBody,
      },
    };
  }, [brand, session]);

  const handlePrint = () => {
    if (!session) { window.print(); return; }

    // Determine page size from session
    const pageSize = session.slotValues['__page_size'] || 'letter';
    const margins = session.slotValues['__print_margins'] || '15';
    const marginMm = parseInt(margins) || 15;

    // Page CSS dimensions
    const pageSizeCss: Record<string, string> = {
      letter: 'letter portrait',
      a4: 'A4 portrait',
      a5: '148mm 210mm',
      legal: 'legal portrait',
      'half-letter': '140mm 216mm',
    };

    // Inject @page style
    const styleId = 'print-page-style';
    let styleEl = document.getElementById(styleId) as HTMLStyleElement | null;
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = styleId;
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = `
      @page {
        size: ${pageSizeCss[pageSize] || 'letter portrait'};
        margin: ${marginMm}mm;
      }
      @media print {
        .print-page > div {
          max-height: none !important;
          height: auto !important;
          aspect-ratio: unset !important;
          overflow: visible !important;
          border: none !important;
          box-shadow: none !important;
          border-radius: 0 !important;
        }
        .print-page > div > div {
          overflow: visible !important;
          max-height: none !important;
        }
      }
    `;

    window.print();
  };

  const handleEditorSave = async (updatedSlotValues: Record<string, string>) => {
    if (!session) return;
    try {
      await updateSessionSlots(session.id, updatedSlotValues);
      setSession({ ...session, slotValues: updatedSlotValues });
      setShowEditor(false);
      toast('Diseño guardado');
    } catch {
      toast('Error al guardar diseño', 'error');
    }
  };

  const handleDelete = async () => {
    if (!session) return;
    if (!confirm('¿Eliminar esta publicación? Esta acción no se puede deshacer.')) return;
    try {
      setDeleting(true);
      await deleteSession(session.id);
      toast('Publicación eliminada');
      navigate(session.brandId ? `/marcas/${session.brandId}` : '/marcas');
    } catch {
      toast('Error al eliminar', 'error');
      setDeleting(false);
    }
  };

  const handleDownload = async () => {
    if (!session || !template || !effectiveBrand) return;
    setExporting(true);
    try {
      const { exportToPptx, exportToPdf, exportSlidesToPdf } = await loadExportService();
      if (template.format === 'pptx') {
        await exportToPptx(session, template, effectiveBrand);
      } else if (slideRefs.current.size > 0) {
        const sorted = Array.from(slideRefs.current.entries())
          .sort(([a], [b]) => a - b)
          .map(([, el]) => el);
        if (sorted.length > 0) {
          await exportSlidesToPdf(sorted, effectiveBrand, template);
        } else if (publicationRef.current) {
          await exportToPdf(publicationRef.current, effectiveBrand, template);
        }
      } else if (publicationRef.current) {
        await exportToPdf(publicationRef.current, effectiveBrand, template);
      }
      toast('Archivo descargado');
    } catch (err) {
      console.error('Export error:', err);
      toast('Error al exportar', 'error');
    } finally {
      setExporting(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (!session || !template || !effectiveBrand) return;
    setExporting(true);
    try {
      const { exportToPdf, exportSlidesToPdf } = await loadExportService();
      if (template.format === 'pptx') {
        const sorted = Array.from(slideRefs.current.entries())
          .sort(([a], [b]) => a - b)
          .map(([, el]) => el);
        if (sorted.length > 0) {
          await exportSlidesToPdf(sorted, effectiveBrand, template);
        }
      } else if (publicationRef.current) {
        await exportToPdf(publicationRef.current, effectiveBrand, template);
      }
      toast('PDF descargado');
    } catch (err) {
      console.error('PDF export error:', err);
      toast('Error al exportar PDF', 'error');
    } finally {
      setExporting(false);
    }
  };

  if (loading) return <LoadingSpinner />;
  if (!session || !template || !brand) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-500">Publicación no encontrada.</p>
        <Link to="/marcas" className="text-sm text-blue-600 hover:underline mt-2 inline-block">
          ← Volver a marcas
        </Link>
      </div>
    );
  }

  const filledSlots = template.slots.filter((s) => session.slotValues[s.id]?.trim());
  const totalSlots = template.slots.length;

  // Logo visual params from session slotValues
  const pubLogoScale = parseFloat(session.slotValues['__logo_scale'] || '1') || 1;
  const pubLogoPosition = (session.slotValues['__logo_position'] || 'left') as 'left' | 'center' | 'right';
  const pubLogoSize = (baseRem: number) => `${baseRem * pubLogoScale}rem`;
  const pubLogoPosClass = pubLogoPosition === 'center' ? 'mx-auto' : pubLogoPosition === 'right' ? 'ml-auto' : '';
  const pubLogoPosFlexClass = pubLogoPosition === 'center' ? 'justify-center' : pubLogoPosition === 'right' ? 'justify-end' : 'justify-start';
  const renderBrand = effectiveBrand ?? brand;
  const isBrochureLocked = session.slotValues['__design_mode'] === 'brochure_locked';

  const brochureLayoutSpec = useMemo(() => {
    if (session.brochureLayoutSpec) return session.brochureLayoutSpec;
    const raw = session.slotValues['__layout_spec'];
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as BrochureLayoutSpec;
      if (!parsed?.pages || !Array.isArray(parsed.pages)) return null;
      return parsed;
    } catch {
      return null;
    }
  }, [session]);

  return (
    <div>
      {/* Editor visual de canvas */}
      {showEditor && (
        <Suspense fallback={
          <div className="fixed inset-0 z-50 bg-gray-900 flex items-center justify-center">
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-gray-400 text-sm">Cargando editor visual...</p>
            </div>
          </div>
        }>
          <CanvasEditor
            session={session}
            template={template}
            brand={effectiveBrand ?? brand}
            onSave={handleEditorSave}
            onClose={() => setShowEditor(false)}
          />
        </Suspense>
      )}

      {/* Header con acciones — se oculta al imprimir */}
      <div className="print:hidden mb-6">
        <nav className="text-sm text-gray-400 mb-4">
          <Link to="/marcas" className="hover:text-gray-600">Marcas</Link>
          <span className="mx-1">/</span>
          <Link to={`/marcas/${brand.id}`} className="hover:text-gray-600">{brand.name}</Link>
          <span className="mx-1">/</span>
          <span className="text-gray-700">Publicación</span>
        </nav>

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{session.templateName}</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {brand.name}
              {session.moleculeName && ` · ${session.moleculeName}`}
              {session.indicationNames.length > 0 && ` · ${session.indicationNames.join(', ')}`}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {filledSlots.length}/{totalSlots} slots completados
              {session.status === 'saved' && (
                <span className="ml-2 inline-flex items-center gap-1 text-green-600">
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  Guardada
                </span>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              to={`/marcas/${brand.id}/generar?session=${session.id}`}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700
                         hover:bg-gray-50 transition-colors"
            >
              Editar en chat
            </Link>
            <button
              onClick={() => setShowEditor(true)}
              className="rounded-md border border-purple-300 px-4 py-2 text-sm font-medium text-purple-700
                         hover:bg-purple-50 transition-colors flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 5a1 1 0 011-1h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V5z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16" />
              </svg>
              Editar diseño
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-600
                         hover:bg-red-50 transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              {deleting ? 'Eliminando...' : 'Eliminar'}
            </button>
            <button
              onClick={handlePrint}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700
                         hover:bg-gray-50 transition-colors flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              Imprimir
            </button>
            {template.format === 'pptx' && (
              <button
                onClick={handleDownload}
                disabled={exporting}
                className="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white
                           hover:bg-orange-700 transition-colors disabled:opacity-50 flex items-center gap-1.5"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                {exporting ? 'Exportando...' : 'Descargar PPTX'}
              </button>
            )}
            <button
              onClick={handleDownloadPdf}
              disabled={exporting}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white
                         hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              {exporting ? 'Exportando...' : 'Descargar PDF'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Publicación visual ── */}
      {template.format === 'pptx' ? (
        /* ── Renderizado como slides ── */
        <div className="space-y-6 print:space-y-0">
          {groupBySlide(template.slots).map((slideGroup) => {
            const hasContent = slideGroup.slots.some(
              (s) => session.slotValues[s.id]?.trim()
            );
            if (!hasContent) return null;

            const isPortada = slideGroup.slideNumber === 1;
            const groups = groupSlots(slideGroup.slots, session.slotValues);

            return (
              <div
                key={slideGroup.slideNumber}
                ref={(el) => {
                  if (el) slideRefs.current.set(slideGroup.slideNumber, el);
                }}
                className="bg-white border border-gray-100 rounded-2xl shadow-md overflow-hidden
                           print:border-none print:shadow-none print:rounded-none print:break-after-page"
                style={{ aspectRatio: '16 / 9' }}
              >
                {/* Barra de color superior del slide */}
                <div
                  className="h-0.5"
                  style={{
                    background: `linear-gradient(90deg, ${renderBrand.params.colorPrimary}, ${renderBrand.params.colorSecondary}, transparent)`,
                  }}
                />

                {isPortada ? (
                  /* Portada: diseño especial centrado */
                  <div className="relative flex flex-col items-center justify-center h-[calc(100%-6px)] p-8 text-center">
                    {/* Imagen de fondo de portada si existe */}
                    {(() => {
                      const imgSlot = slideGroup.slots.find((s) => s.type === 'image');
                      const imgVal = imgSlot ? session.slotValues[imgSlot.id] : null;
                      if (imgVal?.startsWith('data:image') || imgVal?.startsWith('https://')) {
                        return (
                          <>
                            <img
                              src={imgVal}
                              alt="Portada"
                              className="absolute inset-0 w-full h-full object-cover"
                            />
                            <div
                              className="absolute inset-0"
                              style={{
                                background: `linear-gradient(135deg, ${renderBrand.params.colorPrimary}cc 0%, ${renderBrand.params.colorSecondary}99 100%)`,
                              }}
                            />
                          </>
                        );
                      }
                      return (
                        <div
                          className="absolute inset-0"
                          style={{
                            background: `linear-gradient(135deg, ${renderBrand.params.colorPrimary} 0%, ${renderBrand.params.colorSecondary} 100%)`,
                          }}
                        />
                      );
                    })()}

                    <div className="relative z-10 max-w-2xl mx-auto">
                      {renderBrand.params.logoUrl && (
                        <img
                          src={renderBrand.params.logoUrl}
                          alt={`${renderBrand.name} logo`}
                          className={`rounded-lg object-contain bg-white/90 p-2 shadow-md mb-6 ${pubLogoPosClass}`}
                          style={{ height: pubLogoSize(4), width: pubLogoSize(4) }}
                        />
                      )}
                      {slideGroup.slots.filter((s) => s.type !== 'image').map((slot) => {
                        const val = session.slotValues[slot.id];
                        if (!val?.trim()) return null;
                        if (slot.type === 'title') {
                          return (
                            <h1
                              key={slot.id}
                              className="text-3xl md:text-5xl font-bold mb-3 tracking-tight"
                              style={{
                                color: '#ffffff',
                                fontFamily: brand.params.fontTitle || 'inherit',
                              }}
                            >
                              {val}
                            </h1>
                          );
                        }
                        return (
                          <h2
                            key={slot.id}
                            className="text-lg md:text-2xl font-normal"
                            style={{
                              color: '#ffffffbb',
                              fontFamily: brand.params.fontTitle || 'inherit',
                            }}
                          >
                            {val}
                          </h2>
                        );
                      })}
                      {session.moleculeName && (
                        <p className="text-white/70 text-sm mt-4">
                          {session.moleculeName}
                          {session.indicationNames.length > 0 && ` — ${session.indicationNames.join(', ')}`}
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  /* Slides internos */
                  <div className="p-8 h-[calc(100%-6px)] flex flex-col">
                    {/* Número de slide */}
                    <div className="flex items-center justify-between mb-4">
                      <span
                        className="text-xs font-semibold px-2 py-0.5 rounded"
                        style={{
                          backgroundColor: renderBrand.params.colorPrimary + '15',
                          color: renderBrand.params.colorPrimary,
                        }}
                      >
                        Slide {slideGroup.slideNumber}
                      </span>
                      {renderBrand.params.logoUrl && (
                        <img
                          src={renderBrand.params.logoUrl}
                          alt={renderBrand.name}
                          className="object-contain opacity-60"
                          style={{ height: pubLogoSize(2), width: pubLogoSize(2) }}
                        />
                      )}
                    </div>

                    {/* Contenido del slide */}
                    <div className="flex-1">
                      {groups.map((group, idx) => {
                        if (group.kind === 'overlay') {
                          return (
                            <ImageOverlay
                              key={idx}
                              textSlots={group.textSlots}
                              imageSlot={group.imageSlot}
                              values={session.slotValues}
                              brand={effectiveBrand ?? brand}
                            />
                          );
                        }
                        const value = session.slotValues[group.slot.id];
                        if (!value?.trim()) return null;
                        return (
                          <SlotRenderer
                            key={group.slot.id}
                            slot={group.slot}
                            value={value}
                            brand={effectiveBrand ?? brand}
                          />
                        );
                      })}
                    </div>

                    {/* Footer del slide */}
                    <div className="mt-auto pt-3 border-t border-gray-100 flex items-center justify-between">
                      <p className="text-[9px] text-gray-300">{renderBrand.name} · {session.templateName}</p>
                      <div className="flex items-center gap-1.5">
                        <div
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: renderBrand.params.colorPrimary }}
                        />
                        <div
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: renderBrand.params.colorSecondary }}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {template.slots.every((s) => !session.slotValues[s.id]?.trim()) && (
            <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
              <p className="text-gray-400 text-sm">
                No hay contenido generado aún. Vuelve al chat para crear contenido.
              </p>
            </div>
          )}
        </div>
      ) : (
      /* ── Renderizado normal (pdf/jpg) — multipágina ── */
      (() => {
        if (isBrochureLocked && brochureLayoutSpec) {
          const slotMap = new Map(template.slots.map((s) => [s.id, s] as const));
          const lockedPages = brochureLayoutSpec.pages.length > 0 ? brochureLayoutSpec.pages : [{ pageNumber: 1, zones: [] }];
          const lockedPageCount = lockedPages.length;
          const visibleLockedPage = Math.min(currentPubPage, lockedPageCount);
          const lockedAspectRatio = `${brochureLayoutSpec.width || 100} / ${brochureLayoutSpec.height || 100}`;

          const renderLockedSlot = (slot: TemplateSlot, value: string) => {
            if (!value?.trim()) return null;

            if (slot.type === 'image') {
              return (
                <img
                  src={value}
                  alt={slot.name}
                  className="w-full h-full object-cover rounded-lg"
                />
              );
            }

            if (slot.type === 'bullets') {
              const lines = value.split('\n').filter((l) => l.trim());
              return (
                <div className="w-full h-full overflow-hidden text-[10px] leading-relaxed text-gray-800" style={{ fontFamily: renderBrand.params.fontBody || 'inherit' }}>
                  {lines.map((line, i) => (
                    <div key={i} className="flex items-start gap-1.5 mb-0.5">
                      <span style={{ color: renderBrand.params.colorPrimary }}>•</span>
                      <span>{line}</span>
                    </div>
                  ))}
                </div>
              );
            }

            const typography: Record<string, string> = {
              title: 'text-[20px] font-bold leading-tight text-gray-900',
              subtitle: 'text-[14px] font-semibold leading-snug text-gray-700',
              body: 'text-[11px] leading-relaxed text-gray-800',
              callout: 'text-[11px] font-semibold leading-relaxed text-gray-900',
              disclaimer: 'text-[9px] leading-snug text-gray-500',
            };

            const fontFamily = ['title', 'subtitle'].includes(slot.type)
              ? (renderBrand.params.fontTitle || 'inherit')
              : (renderBrand.params.fontBody || 'inherit');

            return (
              <div
                className={`w-full h-full overflow-hidden whitespace-pre-wrap ${typography[slot.type] ?? typography.body}`}
                style={{ fontFamily }}
              >
                {value}
              </div>
            );
          };

          const renderLockedPage = (pageNum: number) => {
            const page = lockedPages[pageNum - 1];
            const backgroundUrl = page?.backgroundImageUrl ?? session.slotValues['__brochure_source_url'];

            return (
              <div
                key={`locked-page-${pageNum}`}
                className="relative rounded-2xl overflow-hidden shadow-xl mx-auto print:border-none print:shadow-none print:rounded-none print:break-after-page"
                style={{
                  aspectRatio: lockedAspectRatio,
                  maxHeight: 'calc(100vh - 220px)',
                  width: '100%',
                  background: '#fff',
                }}
              >
                {backgroundUrl && (
                  <img
                    src={backgroundUrl}
                    alt="Brochure base"
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                )}

                <div className="absolute inset-0" style={{ background: 'rgba(255,255,255,0.18)' }} />

                {(page?.zones ?? []).map((zone) => {
                  const slot = slotMap.get(zone.slotId);
                  if (!slot) return null;
                  const value = session.slotValues[zone.slotId];
                  if (!value?.trim()) return null;

                  return (
                    <div
                      key={zone.id}
                      className="absolute"
                      style={{
                        left: `${zone.x}%`,
                        top: `${zone.y}%`,
                        width: `${zone.w}%`,
                        height: `${zone.h}%`,
                      }}
                    >
                      {slot.type === 'callout' ? (
                        <div
                          className="w-full h-full rounded-lg border px-2 py-1 overflow-hidden"
                          style={{
                            borderColor: renderBrand.params.colorPrimary,
                            background: '#ffffffd9',
                          }}
                        >
                          {renderLockedSlot(slot, value)}
                        </div>
                      ) : (
                        renderLockedSlot(slot, value)
                      )}
                    </div>
                  );
                })}

                <div className="absolute left-0 right-0 bottom-0 px-4 py-1.5 flex items-center justify-between text-[10px]"
                  style={{ background: 'rgba(255,255,255,0.78)' }}>
                  <span className="text-gray-500">{renderBrand.name}</span>
                  <span style={{ color: renderBrand.params.colorPrimary }}>Pág. {pageNum} de {lockedPageCount}</span>
                </div>
              </div>
            );
          };

          return (
            <div ref={publicationRef}>
              <div className="print:hidden">
                {renderLockedPage(visibleLockedPage)}
              </div>

              <div className="hidden print:block">
                {Array.from({ length: lockedPageCount }, (_, i) => i + 1).map((pNum) => (
                  <div key={`print-locked-${pNum}`} className="print-page">
                    {renderLockedPage(pNum)}
                  </div>
                ))}
              </div>

              {lockedPageCount > 1 && (
                <div className="mt-5 print:hidden">
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <button
                        onClick={() => setCurrentPubPage((p) => Math.max(1, p - 1))}
                        disabled={currentPubPage === 1}
                        className="w-9 h-9 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                        </svg>
                      </button>
                      <span className="text-sm text-gray-500 font-medium whitespace-nowrap">
                        {visibleLockedPage} / {lockedPageCount}
                      </span>
                      <button
                        onClick={() => setCurrentPubPage((p) => Math.min(lockedPageCount, p + 1))}
                        disabled={currentPubPage === lockedPageCount}
                        className="w-9 h-9 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        }

        // Read page settings from slotValues
        const savedPageCount = parseInt(session.slotValues['__page_count'] || '0') || 0;
        const pubPageCount = savedPageCount > 0 ? savedPageCount
          : template.id === 'folleto-2p' ? 2
          : (() => {
              const nums = template.slots.map(s => s.name.match(/página\s*(\d+)/i)).filter(Boolean).map(m => parseInt(m![1]));
              return nums.length > 0 ? Math.max(...nums) : 1;
            })();
        const savedPageSize = (session.slotValues['__page_size'] || 'letter') as 'letter' | 'a4' | 'a5' | 'legal' | 'half-letter';
        const pageSizeRatios: Record<string, string> = {
          letter: '216 / 279', a4: '210 / 297', a5: '148 / 210',
          legal: '216 / 356', 'half-letter': '140 / 216',
        };
        const pubAspectRatio = pageSizeRatios[savedPageSize] ?? '216 / 279';

        // Distribute slots across pages
        const contentSlots = template.slots.filter(s => !s.id.startsWith('__'));
        const pubPages: TemplateSlot[][] = (() => {
          if (pubPageCount <= 1) return [contentSlots];
          const assignRaw = session.slotValues['__page_assign'];
          if (assignRaw) {
            try {
              const assignment: Record<string, number> = JSON.parse(assignRaw);
              const pages: TemplateSlot[][] = Array.from({ length: pubPageCount }, () => []);
              for (const slot of contentSlots) {
                const pageIdx = Math.min((assignment[slot.id] ?? 1) - 1, pubPageCount - 1);
                pages[pageIdx].push(slot);
              }
              return pages;
            } catch { /* fall through */ }
          }
          const pages: TemplateSlot[][] = Array.from({ length: pubPageCount }, () => []);
          const perPage = Math.ceil(contentSlots.length / pubPageCount);
          contentSlots.forEach((slot, i) => {
            const pageIdx = Math.min(Math.floor(i / perPage), pubPageCount - 1);
            pages[pageIdx].push(slot);
          });
          return pages;
        })();

        // Design variant for this session
        const pubVariant = (session.slotValues['__design_variant'] as DesignVariant) || 'moderna';
        const pubVS = getVariantStyles(pubVariant);
        const vHeader = pubVS.header(renderBrand.params.colorPrimary, renderBrand.params.colorSecondary, true);
        const vBar = pubVS.thinBar(renderBrand.params.colorPrimary, renderBrand.params.colorSecondary);
        const vContent = pubVS.content();
        const vFooter = pubVS.footer(renderBrand.params.colorPrimary);

        // Render only the current page (slider mode)
        const renderPubPage = (pageNum: number) => {
          const pageSlots = pubPages[pageNum - 1] ?? [];
          const isFirstPage = pageNum === 1;
          const groups = groupSlots(pageSlots, session.slotValues);
          const primary = renderBrand.params.colorPrimary;
          const secondary = renderBrand.params.colorSecondary;
          const fontTitle = renderBrand.params.fontTitle || 'inherit';
          const fontBody = renderBrand.params.fontBody || 'inherit';

          // Separate slots by type for flexible layout
          const titleSlots = groups.filter(g => g.kind === 'normal' && g.slot.type === 'title') as { kind: 'normal'; slot: TemplateSlot }[];
          const subtitleSlots = groups.filter(g => g.kind === 'normal' && g.slot.type === 'subtitle') as { kind: 'normal'; slot: TemplateSlot }[];
          const imageSlots = groups.filter(g => g.kind === 'normal' && g.slot.type === 'image') as { kind: 'normal'; slot: TemplateSlot }[];
          const overlayGroups = groups.filter(g => g.kind === 'overlay');
          const bodySlots = groups.filter(g => g.kind === 'normal' && g.slot.type === 'body') as { kind: 'normal'; slot: TemplateSlot }[];
          const bulletSlots = groups.filter(g => g.kind === 'normal' && g.slot.type === 'bullets') as { kind: 'normal'; slot: TemplateSlot }[];
          const calloutSlots = groups.filter(g => g.kind === 'normal' && g.slot.type === 'callout') as { kind: 'normal'; slot: TemplateSlot }[];
          const disclaimerSlots = groups.filter(g => g.kind === 'normal' && g.slot.type === 'disclaimer') as { kind: 'normal'; slot: TemplateSlot }[];

          const heroImage = imageSlots.length > 0 ? session.slotValues[imageSlots[0].slot.id] : null;
          const hasHeroImage = heroImage && heroImage.trim().length > 0;
          const secondaryImage = imageSlots.length > 1 ? session.slotValues[imageSlots[1].slot.id] : null;
          const hasSecondaryImage = secondaryImage && secondaryImage.trim().length > 0;

          // ── COVER PAGE — Magazine-style hero layout ──
          if (isFirstPage) {
            return (
              <div
                key={pageNum}
                className="relative rounded-2xl overflow-hidden shadow-2xl mx-auto
                           print:border-none print:shadow-none print:rounded-none print:break-after-page"
                style={{
                  aspectRatio: pubAspectRatio,
                  maxHeight: 'calc(100vh - 220px)',
                  width: '100%',
                  background: '#fff',
                }}
              >
                {/* === HERO IMAGE as full background === */}
                {hasHeroImage && (
                  <img
                    src={heroImage}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover"
                    style={{ filter: 'brightness(0.85) contrast(1.05)' }}
                  />
                )}

                {/* === GRADIENT OVERLAY on hero image === */}
                <div className="absolute inset-0" style={{
                  background: hasHeroImage
                    ? `linear-gradient(180deg, ${primary}10 0%, ${primary}30 20%, transparent 45%, ${primary}60 70%, ${primary}e8 88%, ${primary}f5 100%)`
                    : `linear-gradient(150deg, ${primary} 0%, ${primary}ee 30%, ${secondary}cc 60%, ${secondary}88 80%, ${primary}dd 100%)`,
                }} />

                {/* === Decorative elements === */}
                <div className="absolute inset-0 pointer-events-none overflow-hidden">
                  {/* Top-left brand color glow */}
                  <div className="absolute" style={{
                    top: '-10%', left: '-10%', width: '60%', height: '50%',
                    borderRadius: '50%',
                    background: `radial-gradient(ellipse at center, ${primary}40, transparent 70%)`,
                  }} />
                  {/* Diagonal accent line */}
                  <div className="absolute" style={{
                    top: 0, right: '12%', width: '3px', height: '40%',
                    background: `linear-gradient(180deg, ${secondary}80, transparent)`,
                    transform: 'rotate(-15deg)',
                    transformOrigin: 'top center',
                  }} />
                  <div className="absolute" style={{
                    top: 0, right: '15%', width: '1px', height: '35%',
                    background: `linear-gradient(180deg, rgba(255,255,255,.3), transparent)`,
                    transform: 'rotate(-15deg)',
                    transformOrigin: 'top center',
                  }} />
                  {/* Abstract geometric — corner accent */}
                  <svg className="absolute top-0 right-0" width="200" height="200" viewBox="0 0 200 200" style={{ opacity: 0.08 }}>
                    <circle cx="200" cy="0" r="120" fill="none" stroke="#fff" strokeWidth="1.5" />
                    <circle cx="200" cy="0" r="80" fill="none" stroke="#fff" strokeWidth="1" />
                    <circle cx="200" cy="0" r="40" fill="none" stroke="#fff" strokeWidth="0.5" />
                  </svg>
                </div>

                {/* === CONTENT LAYOUT === */}
                <div className="absolute inset-0 flex flex-col justify-between" style={{ zIndex: 1 }}>

                  {/* --- TOP: Logo + brand badge --- */}
                  <div className="px-8 pt-6">
                    <div className={`flex items-center gap-3 ${pubLogoPosFlexClass}`}>
                      {renderBrand.params.logoUrl && (
                        <img
                          src={renderBrand.params.logoUrl}
                          alt={renderBrand.name}
                          className="rounded-xl object-contain shrink-0"
                          style={{
                            height: pubLogoSize(3.5),
                            width: pubLogoSize(3.5),
                            padding: '5px',
                            background: 'rgba(255,255,255,.95)',
                            boxShadow: '0 4px 24px rgba(0,0,0,.15)',
                          }}
                        />
                      )}
                      {session.moleculeName && (
                        <div className="rounded-full px-4 py-1.5" style={{
                          background: 'rgba(255,255,255,.15)',
                          backdropFilter: 'blur(12px)',
                          border: '1px solid rgba(255,255,255,.2)',
                        }}>
                          <span className="text-[11px] font-semibold tracking-wider uppercase" style={{
                            color: 'rgba(255,255,255,.9)',
                          }}>
                            {session.moleculeName}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* --- CENTER: secondary image (if exists) as floating card --- */}
                  {hasSecondaryImage && !hasHeroImage && (
                    <div className="px-8 flex justify-center">
                      <div className="rounded-2xl overflow-hidden shadow-2xl" style={{
                        maxWidth: '65%',
                        border: '3px solid rgba(255,255,255,.2)',
                      }}>
                        <img src={secondaryImage!} alt="" className="w-full h-auto object-cover" style={{ maxHeight: '180px' }} />
                      </div>
                    </div>
                  )}

                  {/* --- BOTTOM: Title block + content teasers --- */}
                  <div className="px-8 pb-6">
                    {/* Accent line above title */}
                    <div className="mb-4" style={{
                      width: '60px', height: '3px',
                      background: `linear-gradient(90deg, ${secondary}, rgba(255,255,255,.6))`,
                      borderRadius: '2px',
                    }} />

                    {/* Title */}
                    {titleSlots.map(g => {
                      const val = session.slotValues[g.slot.id];
                      if (!val?.trim()) return null;
                      return (
                        <h1
                          key={g.slot.id}
                          className="font-extrabold tracking-tight leading-[1.1] mb-2"
                          style={{
                            color: '#fff',
                            fontFamily: fontTitle,
                            fontSize: 'clamp(1.5rem, 4vw, 2.2rem)',
                            textShadow: '0 2px 20px rgba(0,0,0,.3)',
                          }}
                        >
                          {val}
                        </h1>
                      );
                    })}

                    {/* Subtitle */}
                    {subtitleSlots.map(g => {
                      const val = session.slotValues[g.slot.id];
                      if (!val?.trim()) return null;
                      return (
                        <p
                          key={g.slot.id}
                          className="font-light tracking-wide leading-relaxed mb-3"
                          style={{
                            color: 'rgba(255,255,255,.85)',
                            fontFamily: fontTitle,
                            fontSize: 'clamp(0.85rem, 2vw, 1.05rem)',
                            textShadow: '0 1px 8px rgba(0,0,0,.2)',
                          }}
                        >
                          {val}
                        </p>
                      );
                    })}

                    {/* Callout as highlighted badge on cover */}
                    {calloutSlots.slice(0, 1).map(g => {
                      const val = session.slotValues[g.slot.id];
                      if (!val?.trim()) return null;
                      return (
                        <div key={g.slot.id} className="mt-2 inline-flex items-start gap-2.5 rounded-xl px-4 py-3" style={{
                          background: 'rgba(255,255,255,.12)',
                          backdropFilter: 'blur(16px)',
                          border: '1px solid rgba(255,255,255,.15)',
                          maxWidth: '85%',
                        }}>
                          <div className="w-1.5 min-h-[20px] rounded-full shrink-0 self-stretch" style={{
                            background: `linear-gradient(180deg, ${secondary}, rgba(255,255,255,.4))`,
                          }} />
                          <p className="text-[12px] font-medium leading-[1.6]" style={{
                            color: 'rgba(255,255,255,.92)',
                            fontFamily: fontBody,
                          }}>
                            {val}
                          </p>
                        </div>
                      );
                    })}

                    {/* Indication tags */}
                    {session.indicationNames.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-4">
                        {session.indicationNames.map((ind, i) => (
                          <span key={i} className="text-[9px] font-semibold uppercase tracking-widest px-3 py-1 rounded-full" style={{
                            background: 'rgba(255,255,255,.1)',
                            color: 'rgba(255,255,255,.7)',
                            border: '1px solid rgba(255,255,255,.12)',
                          }}>
                            {ind}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Footer line */}
                    <div className="flex items-center justify-between mt-5 pt-3" style={{
                      borderTop: '1px solid rgba(255,255,255,.12)',
                    }}>
                      <p className="text-[9px] font-medium tracking-wider uppercase" style={{ color: 'rgba(255,255,255,.45)' }}>
                        {renderBrand.name}
                        {pubPageCount > 1 && ` · Pág. ${pageNum} de ${pubPageCount}`}
                      </p>
                      {renderBrand.params.disclaimerBadge && (
                        <p className="text-[7px] tracking-wider uppercase" style={{ color: 'rgba(255,255,255,.35)' }}>
                          {renderBrand.params.disclaimerBadge}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          }

          // ── INNER PAGES — Clean editorial layout ──
          return (
            <div
              key={pageNum}
              className="relative rounded-2xl overflow-hidden shadow-2xl mx-auto
                         print:border-none print:shadow-none print:rounded-none print:break-after-page"
              style={{
                aspectRatio: pubAspectRatio,
                maxHeight: 'calc(100vh - 220px)',
                width: '100%',
                background: '#fafbfc',
              }}
            >
              {/* === BACKGROUND DESIGN === */}
              <div className="absolute inset-0 pointer-events-none overflow-hidden">
                {/* Full white base */}
                <div className="absolute inset-0" style={{ background: '#fff' }} />
                {/* Top gradient bar — thick and bold */}
                <div className="absolute top-0 left-0 right-0" style={{
                  height: '5px',
                  background: `linear-gradient(90deg, ${primary}, ${secondary})`,
                }} />
                {/* Left accent strip */}
                <div className="absolute top-0 left-0 bottom-0" style={{
                  width: '52px',
                  background: `linear-gradient(180deg, ${primary}08 0%, ${primary}04 50%, transparent 100%)`,
                }} />
                {/* Top-right corner decoration */}
                <svg className="absolute top-0 right-0" width="180" height="180" viewBox="0 0 180 180" style={{ opacity: 0.04 }}>
                  <path d="M180,0 L180,180 C120,160 40,120 0,0 Z" fill={primary} />
                </svg>
                {/* Bottom-left corner decoration */}
                <svg className="absolute bottom-0 left-0" width="120" height="120" viewBox="0 0 120 120" style={{ opacity: 0.03 }}>
                  <circle cx="0" cy="120" r="100" fill={secondary} />
                </svg>
              </div>

              {/* === CONTENT === */}
              <div className="absolute inset-0 flex flex-col" style={{ zIndex: 1 }}>

                {/* --- Inner page header with brand bar --- */}
                <div className="px-8 pt-5 pb-3 shrink-0 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-1 h-6 rounded-full" style={{
                      background: `linear-gradient(180deg, ${primary}, ${secondary})`,
                    }} />
                    {titleSlots.length > 0 && session.slotValues[titleSlots[0].slot.id]?.trim() && (
                      <h2 className="text-lg font-bold tracking-tight" style={{
                        color: primary,
                        fontFamily: fontTitle,
                      }}>
                        {session.slotValues[titleSlots[0].slot.id]}
                      </h2>
                    )}
                  </div>
                  {renderBrand.params.logoUrl && (
                    <img
                      src={renderBrand.params.logoUrl}
                      alt={renderBrand.name}
                      className="object-contain opacity-50"
                      style={{ height: pubLogoSize(2), width: pubLogoSize(2) }}
                    />
                  )}
                </div>

                {/* --- Main content area — two-column layout when image exists --- */}
                <div className="flex-1 overflow-auto px-8 py-2 print:overflow-visible">
                  {/* Subtitles */}
                  {subtitleSlots.map(g => {
                    const val = session.slotValues[g.slot.id];
                    if (!val?.trim()) return null;
                    return (
                      <p key={g.slot.id} className="text-sm font-light tracking-wide leading-relaxed mb-3" style={{
                        color: secondary,
                        fontFamily: fontTitle,
                      }}>
                        {val}
                      </p>
                    );
                  })}

                  {/* Overlay groups (text over image) */}
                  {overlayGroups.map((g, idx) => {
                    if (g.kind !== 'overlay') return null;
                    return (
                      <ImageOverlay
                        key={`overlay-${idx}`}
                        textSlots={g.textSlots}
                        imageSlot={g.imageSlot}
                        values={session.slotValues}
                        brand={effectiveBrand ?? brand}
                      />
                    );
                  })}

                  {/* Two-column layout: text left, image right (when image exists) */}
                  {(bodySlots.length > 0 || bulletSlots.length > 0) && imageSlots.some(g => session.slotValues[g.slot.id]?.trim()) ? (
                    <div className="flex gap-5 mb-3" style={{ minHeight: '120px' }}>
                      {/* Left column: text */}
                      <div className="flex-1 flex flex-col gap-3 min-w-0">
                        {bodySlots.map(g => {
                          const val = session.slotValues[g.slot.id];
                          if (!val?.trim()) return null;
                          return (
                            <p key={g.slot.id} className="text-[13px] text-gray-700 leading-[1.8]" style={{ fontFamily: fontBody }}>
                              {val}
                            </p>
                          );
                        })}
                        {bulletSlots.map(g => {
                          const val = session.slotValues[g.slot.id];
                          if (!val?.trim()) return null;
                          const items = val.split('\n').filter(l => l.trim());
                          return (
                            <div key={g.slot.id} className="space-y-2">
                              {items.map((item, i) => (
                                <div key={i} className="flex items-start gap-2.5">
                                  <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0 mt-0.5 text-[9px] font-bold text-white" style={{
                                    background: `linear-gradient(135deg, ${primary}, ${secondary})`,
                                  }}>
                                    {i + 1}
                                  </div>
                                  <span className="text-[12px] text-gray-700 leading-relaxed" style={{ fontFamily: fontBody }}>
                                    {item}
                                  </span>
                                </div>
                              ))}
                            </div>
                          );
                        })}
                      </div>
                      {/* Right column: image */}
                      <div className="w-[42%] shrink-0">
                        {imageSlots.slice(0, 1).map(g => {
                          const val = session.slotValues[g.slot.id];
                          if (!val?.trim()) return null;
                          return (
                            <div key={g.slot.id} className="rounded-xl overflow-hidden shadow-lg h-full" style={{
                              border: `2px solid ${primary}15`,
                            }}>
                              <img src={val} alt={g.slot.name} className="w-full h-full object-cover" />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Single column layout when no image */}
                      {bodySlots.map(g => {
                        const val = session.slotValues[g.slot.id];
                        if (!val?.trim()) return null;
                        return (
                          <p key={g.slot.id} className="text-[13px] text-gray-700 leading-[1.8] mb-3" style={{ fontFamily: fontBody }}>
                            {val}
                          </p>
                        );
                      })}
                      {/* Full-width image if no body text */}
                      {imageSlots.map(g => {
                        const val = session.slotValues[g.slot.id];
                        if (!val?.trim()) return null;
                        return (
                          <div key={g.slot.id} className="my-3 rounded-xl overflow-hidden shadow-lg" style={{
                            border: `2px solid ${primary}10`,
                          }}>
                            <img src={val} alt={g.slot.name} className="w-full object-cover" style={{ maxHeight: '220px' }} />
                          </div>
                        );
                      })}
                      {bulletSlots.map(g => {
                        const val = session.slotValues[g.slot.id];
                        if (!val?.trim()) return null;
                        const items = val.split('\n').filter(l => l.trim());
                        return (
                          <div key={g.slot.id} className="space-y-2.5 mb-3">
                            {items.map((item, i) => (
                              <div key={i} className="flex items-start gap-2.5">
                                <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0 mt-0.5 text-[9px] font-bold text-white" style={{
                                  background: `linear-gradient(135deg, ${primary}, ${secondary})`,
                                }}>
                                  {i + 1}
                                </div>
                                <span className="text-[12px] text-gray-700 leading-relaxed" style={{ fontFamily: fontBody }}>
                                  {item}
                                </span>
                              </div>
                            ))}
                          </div>
                        );
                      })}
                    </>
                  )}

                  {/* Callout — highlighted card */}
                  {calloutSlots.map(g => {
                    const val = session.slotValues[g.slot.id];
                    if (!val?.trim()) return null;
                    return (
                      <div key={g.slot.id} className="rounded-xl px-5 py-4 my-2" style={{
                        background: `linear-gradient(135deg, ${primary}08, ${secondary}06)`,
                        border: `1px solid ${primary}15`,
                      }}>
                        <div className="flex items-start gap-3">
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{
                            background: `linear-gradient(135deg, ${primary}, ${secondary})`,
                          }}>
                            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                          </div>
                          <p className="text-[13px] font-semibold leading-[1.6]" style={{
                            color: primary,
                            fontFamily: fontBody,
                          }}>
                            {val}
                          </p>
                        </div>
                      </div>
                    );
                  })}

                  {/* Disclaimer */}
                  {disclaimerSlots.map(g => {
                    const val = session.slotValues[g.slot.id];
                    if (!val?.trim()) return null;
                    return (
                      <p key={g.slot.id} className="text-[8px] text-gray-400 leading-snug italic mt-2" style={{ fontFamily: fontBody }}>
                        {val}
                      </p>
                    );
                  })}

                  {groups.length === 0 && (
                    <div className="flex items-center justify-center h-full">
                      <p className="text-sm text-gray-300 italic">Página vacía</p>
                    </div>
                  )}
                </div>

                {/* --- FOOTER --- */}
                <div className="px-8 py-3 shrink-0">
                  {brand.params.disclaimerBadge && (
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke={primary} strokeWidth={2} style={{ opacity: 0.4 }}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                      <p className="text-[8px] uppercase tracking-wider font-medium text-gray-400">{brand.params.disclaimerBadge}</p>
                    </div>
                  )}
                  <div className="flex items-center justify-between" style={{
                    borderTop: `1px solid ${primary}10`,
                    paddingTop: '6px',
                  }}>
                    <p className="text-[9px] text-gray-400 font-medium">
                      {pubPageCount > 1 && `Pág. ${pageNum} de ${pubPageCount}  ·  `}
                      {brand.name} · {session.templateName}
                    </p>
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full" style={{ background: primary }} />
                      <div className="w-2 h-2 rounded-full" style={{ background: secondary, opacity: 0.6 }} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        };

        return (
          <div ref={publicationRef}>
            {/* Current page (screen view) */}
            <div className="print:hidden">
              {renderPubPage(currentPubPage)}
            </div>

            {/* ALL pages for print (hidden on screen) */}
            <div className="hidden print:block">
              {Array.from({ length: pubPageCount }, (_, i) => i + 1).map(pNum => (
                <div key={`print-${pNum}`} className="print-page">
                  {renderPubPage(pNum)}
                </div>
              ))}
            </div>

            {/* Slider navigation (only when multi-page, hidden on print) */}
            {pubPageCount > 1 && (
              <div className="mt-5 print:hidden">
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3">
                  <div className="flex items-center gap-3">
                    {/* Prev */}
                    <button
                      onClick={() => setCurrentPubPage(p => Math.max(1, p - 1))}
                      disabled={currentPubPage === 1}
                      className="w-9 h-9 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>

                    {/* Page thumbnails */}
                    <div className="flex-1 flex items-center justify-center gap-2 overflow-x-auto py-1">
                      {Array.from({ length: pubPageCount }, (_, i) => i + 1).map(pNum => {
                        const isActive = pNum === currentPubPage;
                        const pSlots = pubPages[pNum - 1] ?? [];
                        const filledCount = pSlots.filter(s => session.slotValues[s.id]?.trim()).length;
                        return (
                          <button
                            key={pNum}
                            onClick={() => setCurrentPubPage(pNum)}
                            className={`relative flex flex-col items-center gap-1 px-1 transition-all ${
                              isActive ? 'scale-110' : 'hover:scale-105 opacity-70 hover:opacity-100'
                            }`}
                          >
                            {/* Mini page */}
                            <div
                              className={`rounded-md border-2 transition-colors flex flex-col overflow-hidden ${
                                isActive
                                  ? 'border-blue-500 shadow-md shadow-blue-500/20'
                                  : 'border-gray-200 hover:border-gray-300'
                              }`}
                              style={{ width: '44px', aspectRatio: pubAspectRatio }}
                            >
                              <div
                                className={pNum === 1 ? 'h-2' : 'h-0.5'}
                                style={{ background: `linear-gradient(90deg, ${brand.params.colorPrimary}, ${brand.params.colorSecondary})` }}
                              />
                              <div className="flex-1 p-1 flex flex-col gap-0.5 justify-center">
                                {pSlots.slice(0, 4).map((s, j) => (
                                  <div key={j}
                                    className={`h-0.5 rounded-full ${session.slotValues[s.id]?.trim() ? 'bg-gray-300' : 'bg-gray-100'}`}
                                    style={{ width: s.type === 'title' ? '60%' : s.type === 'image' ? '100%' : '85%' }}
                                  />
                                ))}
                              </div>
                            </div>
                            <span className={`text-[10px] font-medium ${
                              isActive ? 'text-blue-600' : 'text-gray-400'
                            }`}>{pNum}</span>
                            {filledCount > 0 && (
                              <span className={`absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full text-[8px] flex items-center justify-center font-bold ${
                                isActive ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-500'
                              }`}>{filledCount}</span>
                            )}
                          </button>
                        );
                      })}
                    </div>

                    {/* Next */}
                    <button
                      onClick={() => setCurrentPubPage(p => Math.min(pubPageCount, p + 1))}
                      disabled={currentPubPage === pubPageCount}
                      className="w-9 h-9 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </button>

                    <div className="h-6 w-px bg-gray-200" />
                    <span className="text-sm text-gray-500 font-medium whitespace-nowrap">
                      {currentPubPage} / {pubPageCount}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })()
      )}
    </div>
  );
};

export default PublicationPage;
