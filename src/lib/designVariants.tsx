/**
 * Design Variants — Visual themes for generated promotional materials.
 *
 * Each variant controls the header, content area, footer, and individual slot styles
 * for both CanvasEditor preview and Publication view.
 */

export type DesignVariant =
  | 'moderna'
  | 'elegante'
  | 'vibrante'
  | 'editorial'
  | 'minimalista'
  | 'impacto';

export interface VariantMeta {
  id: DesignVariant;
  name: string;
  description: string;
  icon: string; // emoji
}

export const DESIGN_VARIANTS: VariantMeta[] = [
  { id: 'moderna',      name: 'Moderna',      description: 'Gradientes premium, patrón grid sutil, sombras elegantes',     icon: '🎨' },
  { id: 'elegante',     name: 'Elegante',      description: 'Tonos cálidos, ornamentos clásicos, tipografía refinada',     icon: '✨' },
  { id: 'vibrante',     name: 'Vibrante',      description: 'Orbes de color, formas geométricas, cards con sombra',        icon: '🔥' },
  { id: 'editorial',    name: 'Editorial',     description: 'Estilo revista, filetes dobles, pull-quotes centrados',       icon: '📰' },
  { id: 'minimalista',  name: 'Minimalista',   description: 'Ultra limpio, máximo espacio en blanco, acento sutil',        icon: '🤍' },
  { id: 'impacto',      name: 'Impacto',       description: 'Cortes angulares, bloques audaces, checkmarks en card',       icon: '⚡' },
];

// ── Style helpers per region ────────────────────────────

interface CSSProps {
  className: string;
  style: React.CSSProperties;
}

interface HeaderStyles {
  wrapper: CSSProps;
  logoClass: string;
  title: CSSProps;
  subtitle: CSSProps;
  /** SVG decoration (optional) — rendered inside header with absolute positioning */
  decoration?: React.ReactNode;
}

interface ContentStyles {
  wrapper: CSSProps;
}

interface FooterStyles {
  wrapper: CSSProps;
}

interface SlotStyles {
  title: CSSProps;
  subtitle: CSSProps;
  body: CSSProps;
  bullets: {
    wrapper: CSSProps;
    item: CSSProps;
    markerStyle: 'dot' | 'number' | 'dash' | 'pill' | 'check';
  };
  callout: CSSProps;
  disclaimer: CSSProps;
  image: CSSProps;
}

export interface VariantStyles {
  header: (primary: string, secondary: string, isFirstPage: boolean) => HeaderStyles;
  thinBar: (primary: string, secondary: string) => CSSProps;
  content: () => ContentStyles;
  footer: (primary: string) => FooterStyles;
  slots: (primary: string, secondary: string) => SlotStyles;
  /** Optional page-level background behind the entire page */
  pageBg?: string;
  /** Inner page border override */
  pageBorder?: string;
}

// ── Variant implementations ─────────────────────────────

const moderna: VariantStyles = {
  header: (primary, secondary) => ({
    wrapper: {
      className: 'px-8 py-10 shrink-0 relative overflow-hidden',
      style: { background: `linear-gradient(145deg, ${primary} 0%, ${secondary} 60%, ${primary}cc 100%)` },
    },
    logoClass: 'rounded-xl object-contain bg-white/95 p-2 shadow-lg ring-1 ring-white/20 shrink-0',
    title: { className: 'text-white text-2xl font-bold tracking-tight drop-shadow-sm', style: {} },
    subtitle: { className: 'text-white/85 text-sm mt-1.5 font-light tracking-wide', style: {} },
    decoration: (
      <>
        {/* Mesh gradient orbs */}
        <div className="absolute -right-16 -top-16 w-56 h-56 rounded-full blur-3xl" style={{ background: secondary, opacity: 0.25 }} />
        <div className="absolute -left-12 -bottom-12 w-40 h-40 rounded-full blur-2xl" style={{ background: '#fff', opacity: 0.08 }} />
        <div className="absolute right-1/4 top-1/2 w-24 h-24 rounded-full blur-xl" style={{ background: '#fff', opacity: 0.06 }} />
        {/* Subtle grid pattern */}
        <svg className="absolute inset-0 w-full h-full opacity-[0.04]" xmlns="http://www.w3.org/2000/svg">
          <defs><pattern id="mod-grid" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M32 0H0v32" fill="none" stroke="#fff" strokeWidth="0.5"/></pattern></defs>
          <rect width="100%" height="100%" fill="url(#mod-grid)"/>
        </svg>
        {/* Accent line */}
        <div className="absolute bottom-0 left-0 right-0 h-1" style={{ background: `linear-gradient(90deg, transparent, ${secondary}80, transparent)` }} />
      </>
    ),
  }),
  thinBar: (primary, secondary) => ({
    className: 'h-1.5 shrink-0',
    style: { background: `linear-gradient(90deg, ${primary}, ${secondary}, ${primary}40)` },
  }),
  content: () => ({
    wrapper: { className: 'px-9 py-7 flex-1 overflow-auto print:overflow-visible', style: {} },
  }),
  footer: (primary) => ({
    wrapper: {
      className: 'px-9 py-3.5 shrink-0',
      style: { borderTop: `1px solid ${primary}15`, background: `linear-gradient(90deg, ${primary}04, transparent)` },
    },
  }),
  slots: (primary, secondary) => ({
    title: {
      className: 'text-xl md:text-2xl font-bold mb-2 tracking-tight leading-tight',
      style: { color: primary },
    },
    subtitle: {
      className: 'text-sm md:text-base font-normal mb-5 leading-relaxed',
      style: { color: secondary, borderLeft: `3px solid ${primary}30`, paddingLeft: '12px' },
    },
    body: { className: 'text-[13px] md:text-sm text-gray-600 mb-5 leading-[1.8]', style: {} },
    bullets: {
      wrapper: { className: 'mb-5 space-y-2', style: {} },
      item: {
        className: 'flex items-start gap-3 rounded-lg px-3.5 py-2 transition-colors',
        style: { backgroundColor: primary + '05', border: `1px solid ${primary}0a` },
      },
      markerStyle: 'dot',
    },
    callout: {
      className: 'rounded-xl px-5 py-4 mb-5 flex items-start gap-3 relative overflow-hidden',
      style: { backgroundColor: primary + '08', border: `1px solid ${primary}15`, boxShadow: `0 2px 8px ${primary}08` },
    },
    disclaimer: { className: 'text-[9px] text-gray-400 mt-auto pt-3 leading-relaxed', style: {} },
    image: { className: 'w-full rounded-xl object-cover my-5 shadow-md ring-1 ring-black/5', style: { maxHeight: '320px' } },
  }),
};

const elegante: VariantStyles = {
  header: (primary) => ({
    wrapper: {
      className: 'px-10 py-9 shrink-0 relative overflow-hidden',
      style: { background: 'linear-gradient(160deg, #fdfcf9 0%, #f7f4ed 40%, #f2efe6 100%)', borderBottom: `3px solid ${primary}` },
    },
    logoClass: 'rounded-md object-contain shadow-md shrink-0 border border-stone-200 p-1.5 bg-white',
    title: { className: 'text-stone-900 text-2xl font-semibold tracking-tight', style: { fontVariant: 'small-caps' } },
    subtitle: { className: 'text-stone-500 text-sm mt-2 tracking-[0.12em] uppercase font-light', style: {} },
    decoration: (
      <>
        {/* Corner ornament */}
        <svg className="absolute top-0 right-0 w-28 h-28 opacity-[0.06]" viewBox="0 0 100 100" fill="none" stroke={primary} strokeWidth="1">
          <path d="M100 0 C60 0, 0 60, 0 100" /><path d="M100 10 C65 10, 10 65, 10 100" /><path d="M100 20 C70 20, 20 70, 20 100" />
          <path d="M100 30 C75 30, 30 75, 30 100" /><path d="M100 40 C80 40, 40 80, 40 100" />
        </svg>
        <svg className="absolute bottom-0 left-0 w-28 h-28 opacity-[0.06] rotate-180" viewBox="0 0 100 100" fill="none" stroke={primary} strokeWidth="1">
          <path d="M100 0 C60 0, 0 60, 0 100" /><path d="M100 10 C65 10, 10 65, 10 100" /><path d="M100 20 C70 20, 20 70, 20 100" />
        </svg>
        {/* Gold accent line */}
        <div className="absolute left-10 right-10 bottom-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${primary}40, transparent)` }} />
      </>
    ),
  }),
  thinBar: (primary) => ({
    className: 'h-0.5 shrink-0',
    style: { background: `linear-gradient(90deg, transparent 5%, ${primary} 50%, transparent 95%)` },
  }),
  content: () => ({
    wrapper: { className: 'px-10 py-8 flex-1 overflow-auto print:overflow-visible', style: { backgroundColor: '#fcfbf7' } },
  }),
  footer: (primary) => ({
    wrapper: {
      className: 'px-10 py-3 shrink-0',
      style: { backgroundColor: '#f9f7f2', borderTop: `1px solid ${primary}20` },
    },
  }),
  slots: (primary, secondary) => ({
    title: {
      className: 'text-xl md:text-2xl font-semibold mb-3 tracking-tight',
      style: { color: '#1a1a1a', borderBottom: `2px solid ${primary}`, paddingBottom: '10px', fontVariant: 'small-caps' },
    },
    subtitle: {
      className: 'text-sm md:text-base font-light mb-5 tracking-[0.1em] uppercase',
      style: { color: secondary, letterSpacing: '0.1em' },
    },
    body: { className: 'text-[13px] md:text-sm text-stone-600 mb-5 leading-[1.9]', style: { textIndent: '1em' } },
    bullets: {
      wrapper: { className: 'mb-5 space-y-3 pl-1', style: {} },
      item: {
        className: 'flex items-start gap-3 pb-2.5',
        style: { borderBottom: '1px solid #f0ece3' },
      },
      markerStyle: 'number',
    },
    callout: {
      className: 'rounded-none border-l-4 px-7 py-5 mb-5 relative overflow-hidden',
      style: { borderLeftColor: primary, background: 'linear-gradient(135deg, #faf8f3, #f5f2ea)', boxShadow: '0 1px 4px rgba(0,0,0,.04)' },
    },
    disclaimer: {
      className: 'text-[9px] text-stone-400 mt-auto pt-4 leading-relaxed tracking-wide text-center italic',
      style: { borderTop: `1px solid #e8e4da` },
    },
    image: { className: 'w-full rounded-lg object-cover my-6 shadow-lg ring-1 ring-stone-200/60', style: { maxHeight: '300px' } },
  }),
  pageBg: '#fcfbf7',
  pageBorder: '1px solid #e8e4da',
};

const vibrante: VariantStyles = {
  header: (primary, secondary) => ({
    wrapper: {
      className: 'px-8 py-10 shrink-0 relative overflow-hidden',
      style: { background: `linear-gradient(135deg, ${primary} 0%, ${secondary} 50%, ${primary}dd 100%)` },
    },
    logoClass: 'rounded-2xl object-contain bg-white p-2.5 shadow-xl ring-2 ring-white/30 shrink-0',
    title: { className: 'text-white text-2xl font-extrabold drop-shadow-lg tracking-tight', style: {} },
    subtitle: { className: 'text-white/90 text-sm mt-1.5 font-medium tracking-wide', style: {} },
    decoration: (
      <>
        {/* Floating orbs */}
        <div className="absolute -right-10 -top-10 w-44 h-44 rounded-full blur-xl" style={{ background: `radial-gradient(circle, ${secondary}60, transparent 70%)` }} />
        <div className="absolute -left-8 -bottom-8 w-36 h-36 rounded-full blur-lg" style={{ background: `radial-gradient(circle, #fff, transparent 70%)`, opacity: 0.1 }} />
        <div className="absolute right-1/3 bottom-2 w-28 h-28 rounded-full blur-lg" style={{ background: `radial-gradient(circle, #fff, transparent 70%)`, opacity: 0.07 }} />
        {/* Geometric shapes */}
        <svg className="absolute right-6 top-4 w-16 h-16 opacity-10" viewBox="0 0 64 64" fill="none" stroke="#fff" strokeWidth="2">
          <rect x="8" y="8" width="48" height="48" rx="8" transform="rotate(15 32 32)"/>
        </svg>
        <svg className="absolute left-1/2 bottom-3 w-12 h-12 opacity-[0.07]" viewBox="0 0 48 48" fill="none" stroke="#fff" strokeWidth="1.5">
          <circle cx="24" cy="24" r="20"/><circle cx="24" cy="24" r="12"/>
        </svg>
        {/* Dot pattern */}
        <svg className="absolute inset-0 w-full h-full opacity-[0.05]" xmlns="http://www.w3.org/2000/svg">
          <defs><pattern id="vib-dots" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="#fff"/></pattern></defs>
          <rect width="100%" height="100%" fill="url(#vib-dots)"/>
        </svg>
      </>
    ),
  }),
  thinBar: (primary, secondary) => ({
    className: 'h-2 shrink-0',
    style: { background: `repeating-linear-gradient(90deg, ${primary} 0px, ${primary} 16px, ${secondary} 16px, ${secondary} 32px)` },
  }),
  content: () => ({
    wrapper: { className: 'px-8 py-7 flex-1 overflow-auto print:overflow-visible', style: { backgroundColor: '#fafbff' } },
  }),
  footer: (primary) => ({
    wrapper: {
      className: 'px-8 py-3.5 shrink-0 relative overflow-hidden',
      style: { background: `linear-gradient(90deg, ${primary}08, ${primary}05)`, borderTop: `2px solid ${primary}20` },
    },
  }),
  slots: (primary, secondary) => ({
    title: {
      className: 'text-xl md:text-2xl font-extrabold mb-2 tracking-tight',
      style: { background: `linear-gradient(135deg, ${primary}, ${secondary})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' },
    },
    subtitle: { className: 'text-sm md:text-base font-semibold mb-5', style: { color: secondary } },
    body: { className: 'text-[13px] md:text-sm text-gray-700 mb-5 leading-[1.75]', style: {} },
    bullets: {
      wrapper: { className: 'mb-5 grid gap-2', style: {} },
      item: {
        className: 'flex items-start gap-3 bg-white rounded-xl px-4 py-3 shadow-sm border border-gray-100 hover:shadow-md transition-shadow',
        style: {},
      },
      markerStyle: 'pill',
    },
    callout: {
      className: 'rounded-2xl px-6 py-5 mb-5 text-white font-semibold relative overflow-hidden',
      style: { background: `linear-gradient(135deg, ${primary}, ${secondary})`, boxShadow: `0 4px 16px ${primary}30` },
    },
    disclaimer: { className: 'text-[9px] text-gray-400 mt-auto pt-3 leading-relaxed', style: {} },
    image: { className: 'w-full rounded-2xl object-cover my-5 shadow-xl ring-1 ring-black/5', style: { maxHeight: '340px' } },
  }),
  pageBg: '#fafbff',
};

const editorial: VariantStyles = {
  header: (primary, secondary) => ({
    wrapper: {
      className: 'px-10 pt-10 pb-5 shrink-0 relative overflow-hidden',
      style: { backgroundColor: '#fff', borderBottom: `3px double ${primary}` },
    },
    logoClass: 'rounded-md object-contain shrink-0',
    title: {
      className: 'text-gray-900 text-3xl font-black tracking-[-0.04em] leading-none',
      style: {},
    },
    subtitle: {
      className: 'text-gray-400 text-xs mt-3 uppercase tracking-[0.25em] font-medium',
      style: {},
    },
    decoration: (
      <>
        {/* Top rule line */}
        <div className="absolute top-0 left-10 right-10 h-px" style={{ background: '#000', opacity: 0.08 }} />
        <div className="absolute top-[3px] left-10 right-10 h-px" style={{ background: '#000', opacity: 0.04 }} />
        {/* Section marker */}
        <div className="absolute top-0 right-10 px-3 py-1.5 text-[8px] font-bold uppercase tracking-[0.3em]"
          style={{ color: primary, backgroundColor: primary + '08', borderBottom: `2px solid ${primary}` }}>
          PHARMA
        </div>
        {/* Vertical rules */}
        <div className="absolute left-8 top-0 bottom-0 w-px opacity-[0.06]" style={{ background: '#000' }} />
        <div className="absolute right-8 top-0 bottom-0 w-px opacity-[0.06]" style={{ background: '#000' }} />
      </>
    ),
  }),
  thinBar: (primary) => ({
    className: 'h-px shrink-0 mx-10',
    style: { background: `${primary}30` },
  }),
  content: () => ({
    wrapper: { className: 'px-10 py-8 flex-1 overflow-auto print:overflow-visible', style: {} },
  }),
  footer: (primary) => ({
    wrapper: { className: 'px-10 py-3 shrink-0', style: { borderTop: `3px double ${primary}30` } },
  }),
  slots: (primary, secondary) => ({
    title: {
      className: 'text-2xl md:text-3xl font-black mb-4 tracking-[-0.03em] leading-tight',
      style: { color: '#111' },
    },
    subtitle: {
      className: 'text-sm font-light mb-6 uppercase tracking-[0.15em] pb-3',
      style: { color: secondary, borderBottom: '1px solid #e5e5e5' },
    },
    body: {
      className: 'text-[13px] md:text-sm text-gray-700 mb-5 leading-[1.95]',
      style: { textIndent: '1.5em' },
    },
    bullets: {
      wrapper: { className: 'mb-5 space-y-3 border-l-2 pl-5 ml-2', style: { borderColor: primary + '25' } },
      item: { className: 'flex items-start gap-2.5', style: {} },
      markerStyle: 'dash',
    },
    callout: {
      className: 'my-6 py-6 px-8 text-center relative italic',
      style: {
        borderTop: `1px solid ${primary}25`,
        borderBottom: `1px solid ${primary}25`,
        fontSize: '15px',
        lineHeight: '1.7',
        color: '#333',
      },
    },
    disclaimer: {
      className: 'text-[8px] text-gray-400 mt-auto pt-4 leading-relaxed text-center italic',
      style: { borderTop: '1px double #ddd' },
    },
    image: { className: 'w-full object-cover my-6 ring-1 ring-black/5', style: { maxHeight: '300px' } },
  }),
};

const minimalista: VariantStyles = {
  header: (primary) => ({
    wrapper: {
      className: 'px-12 py-7 shrink-0 flex items-center justify-between relative',
      style: { borderBottom: `1px solid #eee` },
    },
    logoClass: 'rounded-sm object-contain shrink-0',
    title: { className: 'text-gray-800 text-lg font-medium tracking-tight', style: {} },
    subtitle: { className: 'text-gray-400 text-xs mt-1 font-light', style: {} },
    decoration: (
      <>
        {/* Single accent dot */}
        <div className="absolute bottom-[-3px] left-12 w-1.5 h-1.5 rounded-full" style={{ backgroundColor: primary }} />
      </>
    ),
  }),
  thinBar: () => ({
    className: 'h-px shrink-0 mx-12',
    style: { background: '#f0f0f0' },
  }),
  content: () => ({
    wrapper: { className: 'px-14 py-12 flex-1 overflow-auto print:overflow-visible', style: {} },
  }),
  footer: () => ({
    wrapper: { className: 'px-14 py-2.5 shrink-0', style: { borderTop: '1px solid #f5f5f5' } },
  }),
  slots: (primary) => ({
    title: {
      className: 'text-lg font-medium mb-5 tracking-tight leading-snug',
      style: { color: '#111' },
    },
    subtitle: {
      className: 'text-sm font-light mb-7 text-gray-400 tracking-wide',
      style: {},
    },
    body: { className: 'text-sm text-gray-500 mb-7 leading-[2.1]', style: { maxWidth: '540px' } },
    bullets: {
      wrapper: { className: 'mb-7 space-y-4 pl-1', style: {} },
      item: {
        className: 'flex items-start gap-3',
        style: {},
      },
      markerStyle: 'dash',
    },
    callout: {
      className: 'my-8 italic px-8 py-6 text-center',
      style: { color: primary, borderTop: '1px solid #eee', borderBottom: '1px solid #eee', fontSize: '14px', lineHeight: '1.9' },
    },
    disclaimer: { className: 'text-[8px] text-gray-300 mt-auto pt-5 leading-relaxed', style: {} },
    image: { className: 'w-full object-cover my-10', style: { maxHeight: '280px' } },
  }),
};

const impacto: VariantStyles = {
  header: (primary, secondary) => ({
    wrapper: {
      className: 'px-8 py-10 shrink-0 relative overflow-hidden',
      style: { background: primary },
    },
    logoClass: 'rounded-xl object-contain bg-white/95 p-2.5 shadow-2xl shrink-0',
    title: { className: 'text-white text-3xl font-black uppercase tracking-[-0.02em] leading-none', style: {} },
    subtitle: { className: 'text-white/85 text-sm mt-2 font-bold uppercase tracking-[0.15em]', style: {} },
    decoration: (
      <>
        {/* Angular shapes */}
        <div className="absolute right-0 top-0 w-2/5 h-full" style={{ background: secondary, opacity: 0.25, clipPath: 'polygon(25% 0, 100% 0, 100% 100%, 0% 100%)' }} />
        <div className="absolute right-0 top-0 w-1/4 h-full" style={{ background: '#fff', opacity: 0.06, clipPath: 'polygon(40% 0, 100% 0, 100% 100%, 15% 100%)' }} />
        {/* Horizontal accent lines */}
        <div className="absolute left-0 top-1/3 w-16 h-1 opacity-30" style={{ background: secondary }} />
        <div className="absolute left-0 top-1/3 mt-2 w-10 h-0.5 opacity-20" style={{ background: '#fff' }} />
        {/* Corner accent */}
        <svg className="absolute bottom-3 left-6 w-8 h-8 opacity-15" viewBox="0 0 32 32" fill="none" stroke="#fff" strokeWidth="2">
          <path d="M0 32 L0 0 L32 0"/>
        </svg>
        {/* Bottom gradient fade */}
        <div className="absolute bottom-0 left-0 right-0 h-px" style={{ background: `linear-gradient(90deg, ${secondary}, #fff40, transparent)` }} />
      </>
    ),
  }),
  thinBar: (primary, secondary) => ({
    className: 'h-2 shrink-0',
    style: { background: `linear-gradient(90deg, ${secondary}, ${primary})` },
  }),
  content: () => ({
    wrapper: { className: 'px-8 py-7 flex-1 overflow-auto print:overflow-visible', style: {} },
  }),
  footer: (primary) => ({
    wrapper: {
      className: 'px-8 py-3.5 shrink-0',
      style: { background: primary, borderTop: 'none' },
    },
  }),
  slots: (primary, secondary) => ({
    title: {
      className: 'text-2xl md:text-3xl font-black mb-3 uppercase tracking-tight leading-none',
      style: { color: primary },
    },
    subtitle: {
      className: 'text-sm font-bold mb-5 uppercase tracking-[0.12em]',
      style: { color: secondary },
    },
    body: { className: 'text-[13px] md:text-sm text-gray-700 mb-5 leading-[1.75]', style: {} },
    bullets: {
      wrapper: { className: 'mb-5 space-y-2', style: {} },
      item: {
        className: 'flex items-start gap-3 py-2 px-3 rounded-lg',
        style: { backgroundColor: primary + '06', borderLeft: `3px solid ${primary}` },
      },
      markerStyle: 'check',
    },
    callout: {
      className: 'rounded-xl px-6 py-5 mb-5 text-white font-bold uppercase tracking-wide text-center relative overflow-hidden',
      style: { background: primary, boxShadow: `0 4px 16px ${primary}40` },
    },
    disclaimer: { className: 'text-[9px] text-white/60 mt-auto pt-3 leading-relaxed', style: {} },
    image: { className: 'w-full rounded-xl object-cover my-5 shadow-xl', style: { maxHeight: '340px' } },
  }),
  pageBorder: '2px solid #111',
};

// ── Registry ────────────────────────────────────────────

const VARIANT_MAP: Record<DesignVariant, VariantStyles> = {
  moderna,
  elegante,
  vibrante,
  editorial,
  minimalista,
  impacto,
};

export function getVariantStyles(variant: DesignVariant): VariantStyles {
  return VARIANT_MAP[variant] ?? moderna;
}

// ── Bullet marker renderers ─────────────────────────────

export function renderBulletMarker(
  style: 'dot' | 'number' | 'dash' | 'pill' | 'check',
  index: number,
  primary: string,
): React.ReactNode {
  switch (style) {
    case 'dot':
      return (
        <div className="mt-[7px] w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: primary, boxShadow: `0 0 0 2px ${primary}25` }} />
      );
    case 'number':
      return (
        <span
          className="w-6 h-6 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5"
          style={{ backgroundColor: primary, color: '#fff' }}
        >
          {index + 1}
        </span>
      );
    case 'dash':
      return (
        <span className="mt-px shrink-0 font-light text-sm" style={{ color: primary + '60' }}>—</span>
      );
    case 'pill':
      return (
        <span
          className="w-2.5 h-2.5 rounded-md shrink-0 mt-[5px]"
          style={{ background: `linear-gradient(135deg, ${primary}, ${primary}cc)` }}
        />
      );
    case 'check':
      return (
        <span
          className="w-5 h-5 rounded-md flex items-center justify-center shrink-0 mt-0.5"
          style={{ backgroundColor: primary + '12' }}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke={primary} strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </span>
      );
  }
}
