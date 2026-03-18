import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import type { Brand, Template, TemplateSlot, GenerationSession } from '@/types';
import { generateImage, type ImageBrandContext } from '@/services/imageService';
import { uploadGeneratedImage } from '@/services/uploadService';
import { loadGoogleFonts } from '@/services/fontService';
import { regenerateSlotText, regenerateAllSlotsText } from '@/services/generationService';
import { expandTemplateForPages } from '@/services/templateService';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import { DESIGN_VARIANTS, getVariantStyles, renderBulletMarker, type DesignVariant } from '@/lib/designVariants';

// ── Types ───────────────────────────────────────────────

interface CanvasEditorProps {
  session: GenerationSession;
  template: Template;
  brand: Brand;
  onSave: (slotValues: Record<string, string>) => void;
  onClose: () => void;
}

// ── Slot grouping (same logic as Publication.tsx) ───────

type SlotGroup =
  | { kind: 'overlay'; textSlots: TemplateSlot[]; imageSlot: TemplateSlot }
  | { kind: 'normal'; slot: TemplateSlot };

function groupSlots(
  slots: TemplateSlot[],
  values: Record<string, string>,
): SlotGroup[] {
  const groups: SlotGroup[] = [];
  let i = 0;
  while (i < slots.length) {
    const slot = slots[i];
    if (['title', 'subtitle'].includes(slot.type) && values[slot.id]?.trim()) {
      const textSlots: TemplateSlot[] = [slot];
      let j = i + 1;
      while (j < slots.length && ['title', 'subtitle'].includes(slots[j].type)) {
        if (values[slots[j].id]?.trim()) textSlots.push(slots[j]);
        j++;
      }
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

interface SlideGroup {
  slideNumber: number;
  slots: TemplateSlot[];
}

function groupBySlide(slots: TemplateSlot[]): SlideGroup[] {
  const slideMap = new Map<number, TemplateSlot[]>();
  for (const slot of slots) {
    const match = slot.id.match(/^slide(\d+)_/);
    const slideNum = match ? parseInt(match[1], 10) : 1;
    if (!slideMap.has(slideNum)) slideMap.set(slideNum, []);
    slideMap.get(slideNum)!.push(slot);
  }
  return Array.from(slideMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([slideNumber, slots]) => ({ slideNumber, slots }));
}

// ── Slot formatting (per-slot style overrides) ──────────

interface SlotFormatting {
  fontSize?: number;
  fontWeight?: 'normal' | 'bold';
  fontStyle?: 'normal' | 'italic';
  textDecoration?: 'none' | 'underline';
  textAlign?: 'left' | 'center' | 'right' | 'justify';
  color?: string;
  lineHeight?: number;
  letterSpacing?: number; // em
  textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
  fontFamily?: string;
}

const DEFAULT_FONT_SIZES: Record<string, number> = {
  title: 28, subtitle: 20, body: 15, bullets: 14, callout: 14, disclaimer: 10,
};

function getSlotFormatting(slotValues: Record<string, string>, slotId: string): SlotFormatting {
  const raw = slotValues[`__fmt_${slotId}`];
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

function applyFormatting(baseStyle: React.CSSProperties, fmt: SlotFormatting): React.CSSProperties {
  const s: React.CSSProperties = { ...baseStyle };
  if (fmt.fontSize) s.fontSize = `${fmt.fontSize}px`;
  if (fmt.fontWeight) s.fontWeight = fmt.fontWeight;
  if (fmt.fontStyle) s.fontStyle = fmt.fontStyle;
  if (fmt.textDecoration) s.textDecoration = fmt.textDecoration;
  if (fmt.textAlign) s.textAlign = fmt.textAlign;
  if (fmt.color) s.color = fmt.color;
  if (fmt.lineHeight) s.lineHeight = fmt.lineHeight;
  if (fmt.letterSpacing !== undefined) s.letterSpacing = `${fmt.letterSpacing}em`;
  if (fmt.textTransform) s.textTransform = fmt.textTransform;
  if (fmt.fontFamily) s.fontFamily = fmt.fontFamily;
  return s;
}

// ── Inline editable text ────────────────────────────────

interface EditableTextProps {
  value: string;
  slotId: string;
  isSelected: boolean;
  onSelect: (slotId: string) => void;
  onChange: (slotId: string, value: string) => void;
  formatting?: SlotFormatting;
  className?: string;
  style?: React.CSSProperties;
  tag?: 'h1' | 'h2' | 'p' | 'span';
}

function EditableText({
  value,
  slotId,
  isSelected,
  onSelect,
  onChange,
  formatting = {},
  className = '',
  style = {},
  tag: Tag = 'p',
}: EditableTextProps) {
  const ref = useRef<HTMLElement | null>(null);

  const handleBlur = () => {
    if (ref.current) onChange(slotId, ref.current.innerText || '');
  };

  const mergedStyle = applyFormatting(style, formatting);

  return (
    <Tag
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ref={ref as any}
      contentEditable
      suppressContentEditableWarning
      onClick={(e: React.MouseEvent) => { e.stopPropagation(); onSelect(slotId); }}
      onBlur={handleBlur}
      className={`outline-none transition-shadow ${className} ${
        isSelected
          ? 'ring-2 ring-blue-400 ring-offset-2 rounded-sm'
          : 'hover:ring-1 hover:ring-blue-200 hover:ring-offset-1 rounded-sm cursor-text'
      }`}
      style={mergedStyle}
    >
      {value}
    </Tag>
  );
}

// ── Editable image with regeneration ────────────────────

interface EditableImageProps {
  src: string;
  slotId: string;
  isSelected: boolean;
  onSelect: (slotId: string) => void;
  onRegenerate: (slotId: string) => void;
  regenerating: boolean;
  className?: string;
  style?: React.CSSProperties;
}

function EditableImage({
  src,
  slotId,
  isSelected,
  onSelect,
  onRegenerate,
  regenerating,
  className = '',
  style = {},
}: EditableImageProps) {
  return (
    <div
      className={`relative group cursor-pointer ${
        isSelected
          ? 'ring-2 ring-blue-400 ring-offset-2 rounded-lg'
          : 'hover:ring-1 hover:ring-blue-200 hover:ring-offset-1 rounded-lg'
      }`}
      onClick={(e) => { e.stopPropagation(); onSelect(slotId); }}
    >
      <img src={src} alt="Imagen editable" className={className} style={style} />
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors rounded-lg flex items-center justify-center">
        <button
          onClick={(e) => { e.stopPropagation(); onRegenerate(slotId); }}
          disabled={regenerating}
          className="opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 backdrop-blur-sm
                     text-gray-800 text-xs font-medium px-3 py-2 rounded-lg shadow-lg
                     hover:bg-white flex items-center gap-1.5 disabled:opacity-50"
        >
          {regenerating ? (
            <>
              <div className="w-3.5 h-3.5 border-2 border-gray-600 border-t-transparent rounded-full animate-spin" />
              Regenerando…
            </>
          ) : (
            <>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Regenerar con IA
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// ── Draggable wrapper for slots ─────────────────────────

interface DraggableSlotProps {
  slotId: string;
  offset: { x: number; y: number };
  onDragEnd: (slotId: string, offset: { x: number; y: number }) => void;
  isSelected: boolean;
  children: React.ReactNode;
}

function DraggableSlot({ slotId, offset, onDragEnd, isSelected, children }: DraggableSlotProps) {
  const elRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const startMouse = useRef({ x: 0, y: 0 });
  const startOffset = useRef({ x: 0, y: 0 });
  const [currentOffset, setCurrentOffset] = useState(offset);

  // Sync external offset
  useEffect(() => {
    if (!dragging.current) setCurrentOffset(offset);
  }, [offset.x, offset.y]);

  const handlePointerDown = (e: React.PointerEvent) => {
    // Only start drag from the handle (data-drag-handle) or if not clicking on editable content
    const target = e.target as HTMLElement;
    if (!target.closest('[data-drag-handle]')) return;

    e.preventDefault();
    e.stopPropagation();
    dragging.current = true;
    startMouse.current = { x: e.clientX, y: e.clientY };
    startOffset.current = { ...currentOffset };

    const el = elRef.current;
    if (el) el.style.zIndex = '20';

    const handleMove = (ev: PointerEvent) => {
      if (!dragging.current) return;
      const dx = ev.clientX - startMouse.current.x;
      const dy = ev.clientY - startMouse.current.y;
      setCurrentOffset({
        x: startOffset.current.x + dx,
        y: startOffset.current.y + dy,
      });
    };

    const handleUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      if (el) el.style.zIndex = '';
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      // Notify parent
      setCurrentOffset(prev => {
        onDragEnd(slotId, prev);
        return prev;
      });
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  };

  return (
    <div
      ref={elRef}
      className={`relative group/drag ${isSelected ? '' : ''}`}
      style={{
        transform: `translate(${currentOffset.x}px, ${currentOffset.y}px)`,
        transition: dragging.current ? 'none' : 'transform 0.15s ease',
      }}
      onPointerDown={handlePointerDown}
    >
      {/* Drag handle */}
      <div
        data-drag-handle
        className={`absolute -left-7 top-1/2 -translate-y-1/2 w-5 h-8 rounded-md flex items-center justify-center
                    cursor-grab active:cursor-grabbing transition-opacity z-10
                    ${isSelected
                      ? 'opacity-100 bg-blue-100 text-blue-600'
                      : 'opacity-0 group-hover/drag:opacity-70 bg-gray-200 text-gray-500 hover:bg-gray-300'
                    }`}
        title="Arrastrar para mover"
      >
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="9" cy="5" r="1.5" /><circle cx="15" cy="5" r="1.5" />
          <circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" />
          <circle cx="9" cy="19" r="1.5" /><circle cx="15" cy="19" r="1.5" />
        </svg>
      </div>

      {/* Reset position button */}
      {(currentOffset.x !== 0 || currentOffset.y !== 0) && isSelected && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setCurrentOffset({ x: 0, y: 0 });
            onDragEnd(slotId, { x: 0, y: 0 });
          }}
          className="absolute -right-7 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-red-100 text-red-500
                     flex items-center justify-center text-[10px] hover:bg-red-200 transition-colors z-10"
          title="Restablecer posición"
        >
          ×
        </button>
      )}

      {children}
    </div>
  );
}

// ── Format Toolbar ──────────────────────────────────────

const FONT_SIZE_OPTIONS = [10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 42, 48, 56, 64];
const LINE_HEIGHT_OPTIONS = [1, 1.15, 1.25, 1.5, 1.75, 2];

interface FormatToolbarProps {
  slot: TemplateSlot | null;
  formatting: SlotFormatting;
  onFormattingChange: (fmt: SlotFormatting) => void;
  brandFonts: { title: string; body: string };
  brandColors: { primary: string; secondary: string };
}

function FormatToolbar({ slot, formatting, onFormattingChange, brandFonts, brandColors }: FormatToolbarProps) {
  const [showColorPicker, setShowColorPicker] = useState(false);
  const colorRef = useRef<HTMLDivElement>(null);

  // Close color picker on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (colorRef.current && !colorRef.current.contains(e.target as Node)) setShowColorPicker(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (!slot || slot.type === 'image') {
    return (
      <div className="h-11 bg-white border-b border-gray-200 flex items-center px-4 shrink-0">
        <p className="text-xs text-gray-400 italic">Selecciona un texto para ver las opciones de formato</p>
      </div>
    );
  }

  const currentSize = formatting.fontSize ?? DEFAULT_FONT_SIZES[slot.type] ?? 16;
  const isBold = formatting.fontWeight === 'bold';
  const isItalic = formatting.fontStyle === 'italic';
  const isUnderline = formatting.textDecoration === 'underline';
  const currentAlign = formatting.textAlign ?? 'left';
  const currentColor = formatting.color ?? '';
  const currentLH = formatting.lineHeight ?? 1.5;
  const currentTransform = formatting.textTransform ?? 'none';

  const update = (patch: Partial<SlotFormatting>) => onFormattingChange({ ...formatting, ...patch });

  const ToolBtn = ({ active, onClick, title, children }: { active?: boolean; onClick: () => void; title: string; children: React.ReactNode }) => (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      title={title}
      className={`w-8 h-8 rounded-md flex items-center justify-center text-sm transition-colors ${
        active
          ? 'bg-blue-100 text-blue-700 border border-blue-300'
          : 'text-gray-600 hover:bg-gray-100 border border-transparent'
      }`}
    >
      {children}
    </button>
  );

  const Divider = () => <div className="w-px h-6 bg-gray-200 mx-1" />;

  return (
    <div className="h-11 bg-white border-b border-gray-200 flex items-center px-3 gap-1 shrink-0 overflow-x-auto" onClick={(e) => e.stopPropagation()}>
      {/* Font Size */}
      <div className="flex items-center gap-0.5">
        <button
          onClick={() => { const idx = FONT_SIZE_OPTIONS.findIndex(s => s >= currentSize); if (idx > 0) update({ fontSize: FONT_SIZE_OPTIONS[idx - 1] }); }}
          className="w-7 h-7 rounded text-gray-500 hover:bg-gray-100 flex items-center justify-center text-xs font-bold"
          title="Reducir tamaño"
        >A−</button>
        <select
          value={currentSize}
          onChange={(e) => update({ fontSize: parseInt(e.target.value) })}
          className="w-16 h-8 text-xs border border-gray-200 rounded-md text-center bg-white focus:ring-1 focus:ring-blue-300 focus:border-blue-300"
          title="Tamaño de fuente"
        >
          {FONT_SIZE_OPTIONS.map(s => (
            <option key={s} value={s}>{s}px</option>
          ))}
        </select>
        <button
          onClick={() => { const idx = FONT_SIZE_OPTIONS.findIndex(s => s > currentSize); if (idx !== -1) update({ fontSize: FONT_SIZE_OPTIONS[idx] }); }}
          className="w-7 h-7 rounded text-gray-500 hover:bg-gray-100 flex items-center justify-center text-sm font-bold"
          title="Aumentar tamaño"
        >A+</button>
      </div>

      <Divider />

      {/* Bold / Italic / Underline */}
      <ToolBtn active={isBold} onClick={() => update({ fontWeight: isBold ? 'normal' : 'bold' })} title="Negrita">
        <span className="font-bold">B</span>
      </ToolBtn>
      <ToolBtn active={isItalic} onClick={() => update({ fontStyle: isItalic ? 'normal' : 'italic' })} title="Cursiva">
        <span className="italic font-serif">I</span>
      </ToolBtn>
      <ToolBtn active={isUnderline} onClick={() => update({ textDecoration: isUnderline ? 'none' : 'underline' })} title="Subrayado">
        <span className="underline">U</span>
      </ToolBtn>

      <Divider />

      {/* Text Alignment */}
      <ToolBtn active={currentAlign === 'left'} onClick={() => update({ textAlign: 'left' })} title="Alinear a la izquierda">
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M3 6h18M3 12h12M3 18h16" />
        </svg>
      </ToolBtn>
      <ToolBtn active={currentAlign === 'center'} onClick={() => update({ textAlign: 'center' })} title="Centrar">
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M3 6h18M6 12h12M5 18h14" />
        </svg>
      </ToolBtn>
      <ToolBtn active={currentAlign === 'right'} onClick={() => update({ textAlign: 'right' })} title="Alinear a la derecha">
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M3 6h18M9 12h12M5 18h16" />
        </svg>
      </ToolBtn>
      <ToolBtn active={currentAlign === 'justify'} onClick={() => update({ textAlign: 'justify' })} title="Justificar">
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M3 6h18M3 12h18M3 18h18" />
        </svg>
      </ToolBtn>

      <Divider />

      {/* Text Color */}
      <div className="relative" ref={colorRef}>
        <button
          onClick={() => setShowColorPicker(!showColorPicker)}
          title="Color de texto"
          className="w-8 h-8 rounded-md flex flex-col items-center justify-center text-gray-600 hover:bg-gray-100 border border-transparent gap-0.5"
        >
          <span className="text-sm font-bold leading-none">A</span>
          <div className="w-5 h-1 rounded-full" style={{ backgroundColor: currentColor || '#374151' }} />
        </button>
        {showColorPicker && (
          <div className="absolute top-full left-0 mt-1 bg-white rounded-lg shadow-xl border border-gray-200 p-3 z-50 w-48">
            <p className="text-[10px] text-gray-400 mb-2 font-semibold uppercase">Colores de marca</p>
            <div className="flex gap-2 mb-3">
              <button onClick={() => { update({ color: brandColors.primary }); setShowColorPicker(false); }}
                className="w-8 h-8 rounded-lg border-2 border-gray-200 hover:scale-110 transition-transform"
                style={{ backgroundColor: brandColors.primary }} title="Color primario" />
              <button onClick={() => { update({ color: brandColors.secondary }); setShowColorPicker(false); }}
                className="w-8 h-8 rounded-lg border-2 border-gray-200 hover:scale-110 transition-transform"
                style={{ backgroundColor: brandColors.secondary }} title="Color secundario" />
              <button onClick={() => { update({ color: '#ffffff' }); setShowColorPicker(false); }}
                className="w-8 h-8 rounded-lg border-2 border-gray-200 hover:scale-110 transition-transform bg-white"
                title="Blanco" />
              <button onClick={() => { update({ color: '#1f2937' }); setShowColorPicker(false); }}
                className="w-8 h-8 rounded-lg border-2 border-gray-200 hover:scale-110 transition-transform bg-gray-800"
                title="Negro" />
            </div>
            <p className="text-[10px] text-gray-400 mb-2 font-semibold uppercase">Otros</p>
            <div className="flex gap-2 flex-wrap mb-3">
              {['#ef4444','#f97316','#eab308','#22c55e','#3b82f6','#8b5cf6','#ec4899','#6b7280'].map(c => (
                <button key={c} onClick={() => { update({ color: c }); setShowColorPicker(false); }}
                  className="w-6 h-6 rounded border border-gray-200 hover:scale-110 transition-transform"
                  style={{ backgroundColor: c }} />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={currentColor || '#374151'}
                onChange={(e) => update({ color: e.target.value })}
                className="w-8 h-8 rounded cursor-pointer border-0"
                title="Personalizado"
              />
              <span className="text-[10px] text-gray-400">Personalizado</span>
            </div>
            {currentColor && (
              <button onClick={() => { update({ color: undefined }); setShowColorPicker(false); }}
                className="mt-2 text-[10px] text-red-500 hover:text-red-700 w-full text-center">
                Restablecer color original
              </button>
            )}
          </div>
        )}
      </div>

      <Divider />

      {/* Line Height */}
      <div className="flex items-center gap-1">
        <svg className="w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M6 9l3-3 3 3M6 15l3 3 3-3M18 4v16" />
        </svg>
        <select
          value={currentLH}
          onChange={(e) => update({ lineHeight: parseFloat(e.target.value) })}
          className="w-14 h-7 text-[10px] border border-gray-200 rounded bg-white"
          title="Interlineado"
        >
          {LINE_HEIGHT_OPTIONS.map(lh => (
            <option key={lh} value={lh}>{lh}</option>
          ))}
        </select>
      </div>

      <Divider />

      {/* Text Transform */}
      <ToolBtn active={currentTransform === 'uppercase'} onClick={() => update({ textTransform: currentTransform === 'uppercase' ? 'none' : 'uppercase' })} title="Mayúsculas">
        <span className="text-[10px] font-bold">AA</span>
      </ToolBtn>
      <ToolBtn active={currentTransform === 'capitalize'} onClick={() => update({ textTransform: currentTransform === 'capitalize' ? 'none' : 'capitalize' })} title="Capitalizar">
        <span className="text-[10px] font-bold">Aa</span>
      </ToolBtn>

      <Divider />

      {/* Font selector */}
      <select
        value={formatting.fontFamily ?? ''}
        onChange={(e) => update({ fontFamily: e.target.value || undefined })}
        className="h-7 text-[10px] border border-gray-200 rounded bg-white px-1 max-w-[120px]"
        title="Tipografía"
      >
        <option value="">Fuente por defecto</option>
        {brandFonts.title && <option value={brandFonts.title}>{brandFonts.title} (Título)</option>}
        {brandFonts.body && brandFonts.body !== brandFonts.title && <option value={brandFonts.body}>{brandFonts.body} (Cuerpo)</option>}
        <option value="Arial">Arial</option>
        <option value="Georgia">Georgia</option>
        <option value="Times New Roman">Times New Roman</option>
        <option value="Verdana">Verdana</option>
        <option value="Courier New">Courier New</option>
      </select>

      {/* Reset all formatting */}
      {Object.keys(formatting).length > 0 && (
        <>
          <Divider />
          <button
            onClick={() => onFormattingChange({})}
            className="flex items-center gap-1 text-[10px] text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50 transition-colors whitespace-nowrap"
            title="Restablecer formato"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
            Limpiar formato
          </button>
        </>
      )}
    </div>
  );
}

// ── Page size definitions ───────────────────────────────

type PageSize = 'letter' | 'a4' | 'a5' | 'legal' | 'half-letter';

const PAGE_SIZES: Record<PageSize, { label: string; description: string; widthMm: number; heightMm: number; aspectRatio: string }> = {
  letter:       { label: 'Carta',       description: '216 × 279 mm',  widthMm: 216, heightMm: 279,  aspectRatio: '216 / 279' },
  a4:           { label: 'A4',          description: '210 × 297 mm',  widthMm: 210, heightMm: 297,  aspectRatio: '210 / 297' },
  a5:           { label: 'A5',          description: '148 × 210 mm',  widthMm: 148, heightMm: 210,  aspectRatio: '148 / 210' },
  legal:        { label: 'Legal',       description: '216 × 356 mm',  widthMm: 216, heightMm: 356,  aspectRatio: '216 / 356' },
  'half-letter': { label: 'Media Carta', description: '140 × 216 mm',  widthMm: 140, heightMm: 216,  aspectRatio: '140 / 216' },
};

// ── Main WYSIWYG Editor ─────────────────────────────────

export default function CanvasEditor({
  session,
  template: baseTemplate,
  brand,
  onSave,
  onClose,
}: CanvasEditorProps) {
  const [slotValues, setSlotValues] = useState<Record<string, string>>({ ...session.slotValues });
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [regeneratingSlots, setRegeneratingSlots] = useState<Set<string>>(new Set());
  const [hasChanges, setHasChanges] = useState(false);
  const [slotPositions, setSlotPositions] = useState<Record<string, { x: number; y: number }>>(() => {
    // Cargar posiciones guardadas desde slotValues (__pos_xxx)
    const positions: Record<string, { x: number; y: number }> = {};
    Object.entries(session.slotValues).forEach(([key, val]) => {
      if (key.startsWith('__pos_')) {
        const slotId = key.replace('__pos_', '');
        const [x, y] = val.split(',').map(Number);
        if (!isNaN(x) && !isNaN(y)) positions[slotId] = { x, y };
      }
    });
    return positions;
  });
  const previewRef = useRef<HTMLDivElement>(null);

  // ── Design variant ──
  const [designVariant, setDesignVariant] = useState<DesignVariant>(
    () => (session.slotValues['__design_variant'] as DesignVariant) || 'moderna'
  );
  const handleVariantChange = (v: DesignVariant) => {
    setDesignVariant(v);
    handleSlotChange('__design_variant', v);
  };
  const variantStyles = useMemo(() => getVariantStyles(designVariant), [designVariant]);

  // ── AI Regeneration state ─────────────────────────────
  const [aiSlotPrompt, setAiSlotPrompt] = useState('');
  const [aiGeneralPrompt, setAiGeneralPrompt] = useState('');
  const [aiImagePrompt, setAiImagePrompt] = useState('');
  const [aiSlotLoading, setAiSlotLoading] = useState(false);
  const [aiGeneralLoading, setAiGeneralLoading] = useState(false);
  const [voiceTarget, setVoiceTarget] = useState<'slot' | 'image' | 'general' | null>(null);

  const { isListening: voiceListening, interimTranscript: voiceInterim, isSupported: voiceSupported, toggleListening: voiceToggle, stopListening: voiceStop } = useSpeechRecognition({
    lang: 'es-ES',
    onResult: (transcript) => {
      const append = (prev: string) => {
        const sep = prev.trim() ? ' ' : '';
        return prev + sep + transcript;
      };
      if (voiceTarget === 'slot') setAiSlotPrompt(append);
      else if (voiceTarget === 'image') setAiImagePrompt(append);
      else if (voiceTarget === 'general') setAiGeneralPrompt(append);
    },
  });

  const handleVoiceToggle = (target: 'slot' | 'image' | 'general') => {
    if (voiceListening && voiceTarget === target) {
      voiceStop();
      setVoiceTarget(null);
    } else {
      if (voiceListening) voiceStop();
      setVoiceTarget(target);
      // Small delay to allow previous to stop
      setTimeout(() => voiceToggle(), 50);
    }
  };

  // ── Page settings (PDF/JPG only) ──────────────────────

  const isPaged = baseTemplate.format !== 'pptx';
  const [pageSize, setPageSize] = useState<PageSize>(() =>
    (slotValues['__page_size'] as PageSize) || 'letter'
  );
  const [pageCount, setPageCount] = useState<number>(() => {
    const saved = slotValues['__page_count'];
    if (saved) return parseInt(saved) || 1;
    // Auto-detect sensible default: folleto templates default to 2 pages
    if (baseTemplate.id === 'folleto-2p') return 2;
    // If template has page-named slots (cuerpo_1, cuerpo_2), detect pages
    const pageNums = baseTemplate.slots
      .map(s => s.name.match(/página\s*(\d+)/i))
      .filter(Boolean)
      .map(m => parseInt(m![1]));
    if (pageNums.length > 0) return Math.max(...pageNums);
    return 1;
  });
  const [currentPage, setCurrentPage] = useState(1);

  // Expand template slots dynamically based on page count
  const template = useMemo(
    () => expandTemplateForPages(baseTemplate, pageCount),
    [baseTemplate, pageCount],
  );

  const handlePageSizeChange = (size: PageSize) => {
    setPageSize(size);
    handleSlotChange('__page_size', size);
  };

  const handlePageCountChange = (count: number) => {
    const clamped = Math.max(1, Math.min(10, count));
    setPageCount(clamped);
    handleSlotChange('__page_count', String(clamped));
    if (currentPage > clamped) setCurrentPage(clamped);
  };

  // Print margins (mm)
  const [printMargins, setPrintMargins] = useState<number>(() => {
    const saved = slotValues['__print_margins'];
    return saved ? parseInt(saved) || 15 : 15;
  });

  const handlePrintMarginsChange = (mm: number) => {
    const clamped = Math.max(0, Math.min(30, mm));
    setPrintMargins(clamped);
    handleSlotChange('__print_margins', String(clamped));
  };

  // Distribute slots across pages
  const distributeSlots = (): TemplateSlot[][] => {
    // Check for saved assignment first
    const contentSlots = template.slots.filter(s => !s.id.startsWith('__'));
    if (pageCount <= 1) return [contentSlots];

    // Check if user has saved page assignments
    const assignmentRaw = slotValues['__page_assign'];
    if (assignmentRaw) {
      try {
        const assignment: Record<string, number> = JSON.parse(assignmentRaw);
        const pages: TemplateSlot[][] = Array.from({ length: pageCount }, () => []);
        for (const slot of contentSlots) {
          const pageIdx = Math.min((assignment[slot.id] ?? 1) - 1, pageCount - 1);
          pages[pageIdx].push(slot);
        }
        return pages;
      } catch { /* fall through to auto */ }
    }

    // Auto-distribute evenly
    const pages: TemplateSlot[][] = Array.from({ length: pageCount }, () => []);
    const perPage = Math.ceil(contentSlots.length / pageCount);
    contentSlots.forEach((slot, i) => {
      const pageIdx = Math.min(Math.floor(i / perPage), pageCount - 1);
      pages[pageIdx].push(slot);
    });
    return pages;
  };

  const pagesSlots = distributeSlots();

  // Cargar fuentes de la marca
  loadGoogleFonts([brand.params.fontTitle, brand.params.fontBody]);

  // -- Logo visual params helpers --
  const logoScale = parseFloat(slotValues['__logo_scale'] || '1') || 1;
  const logoPosition = (slotValues['__logo_position'] || 'left') as 'left' | 'center' | 'right';

  const setLogoScale = (v: number) => {
    const clamped = Math.max(0.5, Math.min(3, v));
    handleSlotChange('__logo_scale', clamped.toFixed(1));
  };
  const setLogoPosition = (v: 'left' | 'center' | 'right') => {
    handleSlotChange('__logo_position', v);
  };

  /** CSS size for logo based on scale. baseRem = base size in rem */
  const logoSize = (baseRem: number) => `${baseRem * logoScale}rem`;

  /** CSS justify/align class for logo position */
  const logoPosClass = logoPosition === 'center' ? 'mx-auto' : logoPosition === 'right' ? 'ml-auto' : '';
  const logoPosFlexClass = logoPosition === 'center' ? 'justify-center' : logoPosition === 'right' ? 'justify-end' : 'justify-start';

  // ── Handlers ──────────────────────────────────────────

  const handleSlotChange = useCallback((slotId: string, value: string) => {
    setSlotValues(prev => ({ ...prev, [slotId]: value }));
    setHasChanges(true);
  }, []);

  const handleSelectSlot = useCallback((slotId: string) => {
    setSelectedSlot(slotId);
    setAiSlotPrompt('');
    setAiImagePrompt('');
  }, []);

  const handleDragEnd = useCallback((slotId: string, offset: { x: number; y: number }) => {
    setSlotPositions(prev => ({ ...prev, [slotId]: offset }));
    // Persistir en slotValues como __pos_xxx
    setSlotValues(prev => ({
      ...prev,
      [`__pos_${slotId}`]: `${Math.round(offset.x)},${Math.round(offset.y)}`,
    }));
    setHasChanges(true);
  }, []);

  // ── Formatting helpers ──────────────────────────────────

  const selectedSlotFormatting = selectedSlot ? getSlotFormatting(slotValues, selectedSlot) : {};

  const handleFormattingChange = useCallback((fmt: SlotFormatting) => {
    if (!selectedSlot) return;
    const key = `__fmt_${selectedSlot}`;
    if (Object.keys(fmt).length === 0) {
      // Clear formatting
      setSlotValues(prev => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    } else {
      setSlotValues(prev => ({ ...prev, [key]: JSON.stringify(fmt) }));
    }
    setHasChanges(true);
  }, [selectedSlot]);

  const getFormattingFor = (slotId: string) => getSlotFormatting(slotValues, slotId);

  const buildImageBrandCtx = (): ImageBrandContext => ({
    brandName: brand.name,
    colorPrimary: brand.params.colorPrimary,
    colorSecondary: brand.params.colorSecondary,
    moleculeName: session.moleculeName,
    indicationNames: session.indicationNames,
    claims: brand.params.claims?.map(c => c.text),
  });

  const handleRegenerateImage = async (slotId: string) => {
    const slot = template.slots.find(s => s.id === slotId);
    if (!slot) return;
    const prompt = slot.imagePromptHint || `Professional pharmaceutical image for ${brand.name}`;
    setRegeneratingSlots(prev => new Set(prev).add(slotId));
    try {
      const dataUrl = await generateImage(prompt, buildImageBrandCtx());
      // Subir a Storage para evitar problemas de tamaño en Firestore
      const storageUrl = await uploadGeneratedImage(session.id, slotId, dataUrl);
      handleSlotChange(slotId, storageUrl);
    } catch (err) {
      console.warn('Error regenerando imagen:', err);
    } finally {
      setRegeneratingSlots(prev => { const n = new Set(prev); n.delete(slotId); return n; });
    }
  };

  // ── AI Regeneration for a single text slot ────────────
  const handleAiRegenerateSlot = async () => {
    if (!selectedSlot || !aiSlotPrompt.trim()) return;
    const slot = template.slots.find(s => s.id === selectedSlot);
    if (!slot || slot.type === 'image') return;
    setAiSlotLoading(true);
    try {
      const newText = await regenerateSlotText(
        brand,
        template,
        selectedSlot,
        aiSlotPrompt.trim(),
        slotValues,
        session.moleculeName ?? null,
        session.indicationNames ?? [],
      );
      handleSlotChange(selectedSlot, newText);
      setAiSlotPrompt('');
    } catch (err) {
      console.warn('Error regenerando slot con IA:', err);
    } finally {
      setAiSlotLoading(false);
    }
  };

  // ── AI Regeneration for all text slots ────────────────
  const handleAiRegenerateAll = async () => {
    if (!aiGeneralPrompt.trim()) return;
    setAiGeneralLoading(true);
    try {
      const newValues = await regenerateAllSlotsText(
        brand,
        template,
        aiGeneralPrompt.trim(),
        slotValues,
        session.moleculeName ?? null,
        session.indicationNames ?? [],
      );
      // Apply all generated values
      Object.entries(newValues).forEach(([slotId, value]) => {
        handleSlotChange(slotId, value);
      });
      setAiGeneralPrompt('');
    } catch (err) {
      console.warn('Error regenerando todos los slots con IA:', err);
    } finally {
      setAiGeneralLoading(false);
    }
  };

  // ── AI Regeneration for image slot with custom prompt ─
  const handleAiRegenerateImageCustom = async () => {
    if (!selectedSlot || !aiImagePrompt.trim()) return;
    const slot = template.slots.find(s => s.id === selectedSlot);
    if (!slot || slot.type !== 'image') return;
    setRegeneratingSlots(prev => new Set(prev).add(selectedSlot));
    try {
      const dataUrl = await generateImage(aiImagePrompt.trim(), buildImageBrandCtx());
      const storageUrl = await uploadGeneratedImage(session.id, selectedSlot, dataUrl);
      handleSlotChange(selectedSlot, storageUrl);
      setAiImagePrompt('');
    } catch (err) {
      console.warn('Error regenerando imagen con IA:', err);
    } finally {
      setRegeneratingSlots(prev => { const n = new Set(prev); n.delete(selectedSlot); return n; });
    }
  };

  const handleSave = () => onSave(slotValues);

  const handleExportPng = async () => {
    if (!previewRef.current) return;
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(previewRef.current, {
        scale: 2, useCORS: true, allowTaint: true, backgroundColor: '#ffffff',
      });
      const link = document.createElement('a');
      link.download = `${brand.name} - ${template.name}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (err) {
      console.error('Export error:', err);
    }
  };

  const selectedSlotInfo = selectedSlot ? template.slots.find(s => s.id === selectedSlot) : null;

  // ── Render individual slot (matches Publication.tsx exactly) ──

  const renderSlot = (slot: TemplateSlot) => {
    const value = slotValues[slot.id] ?? '';
    if (!value?.trim() && slot.type !== 'image') return null;
    const isSelected = selectedSlot === slot.id;
    const offset = slotPositions[slot.id] ?? { x: 0, y: 0 };
    const vs = variantStyles.slots(brand.params.colorPrimary, brand.params.colorSecondary);

    const inner = (() => {
      switch (slot.type) {
        case 'image':
          if (!value?.startsWith('data:image') && !value?.startsWith('https://')) return null;
          return (
            <div className="my-4">
              <EditableImage
                src={value} slotId={slot.id} isSelected={isSelected}
                onSelect={handleSelectSlot} onRegenerate={handleRegenerateImage}
                regenerating={regeneratingSlots.has(slot.id)}
                className={vs.image.className}
                style={vs.image.style}
              />
            </div>
          );

        case 'title':
          return (
            <EditableText value={value} slotId={slot.id}
              isSelected={isSelected} onSelect={handleSelectSlot} onChange={handleSlotChange}
              formatting={getFormattingFor(slot.id)}
              tag="h1" className={vs.title.className}
              style={{ ...vs.title.style, fontFamily: brand.params.fontTitle || 'inherit' }}
            />
          );

        case 'subtitle':
          return (
            <EditableText value={value} slotId={slot.id}
              isSelected={isSelected} onSelect={handleSelectSlot} onChange={handleSlotChange}
              formatting={getFormattingFor(slot.id)}
              tag="h2" className={vs.subtitle.className}
              style={{ ...vs.subtitle.style, fontFamily: brand.params.fontTitle || 'inherit' }}
            />
          );

        case 'body':
          return (
            <EditableText value={value} slotId={slot.id}
              isSelected={isSelected} onSelect={handleSelectSlot} onChange={handleSlotChange}
              formatting={getFormattingFor(slot.id)}
              tag="p" className={vs.body.className}
              style={{ ...vs.body.style, fontFamily: brand.params.fontBody || 'inherit' }}
            />
          );

        case 'bullets':
          return (
            <EditableText value={value} slotId={slot.id}
              isSelected={isSelected} onSelect={handleSelectSlot} onChange={handleSlotChange}
              formatting={getFormattingFor(slot.id)}
              tag="p" className={vs.body.className + ' whitespace-pre-line'}
              style={{ ...vs.body.style, fontFamily: brand.params.fontBody || 'inherit' }}
            />
          );

        case 'callout':
          return (
            <div className={vs.callout.className} style={vs.callout.style}>
              <EditableText value={value} slotId={slot.id} isSelected={isSelected}
                onSelect={handleSelectSlot} onChange={handleSlotChange}
                formatting={getFormattingFor(slot.id)}
                tag="p" className="text-sm font-semibold"
                style={{
                  color: designVariant === 'vibrante' || designVariant === 'impacto' ? '#fff' : brand.params.colorPrimary,
                  fontFamily: brand.params.fontBody || 'inherit',
                }}
              />
            </div>
          );

        case 'disclaimer':
          return (
            <EditableText value={value} slotId={slot.id}
              isSelected={isSelected} onSelect={handleSelectSlot} onChange={handleSlotChange}
              formatting={getFormattingFor(slot.id)}
              tag="p" className={vs.disclaimer.className}
              style={vs.disclaimer.style}
            />
          );

        default:
          return null;
      }
    })();

    if (!inner) return null;

    return (
      <DraggableSlot
        key={slot.id}
        slotId={slot.id}
        offset={offset}
        onDragEnd={handleDragEnd}
        isSelected={isSelected}
      >
        {inner}
      </DraggableSlot>
    );
  };

  // ── Render image overlay (text over image) ────────────

  const renderImageOverlay = (textSlots: TemplateSlot[], imageSlot: TemplateSlot) => {
    const imgValue = slotValues[imageSlot.id];
    if (!imgValue?.startsWith('data:image') && !imgValue?.startsWith('https://')) return null;
    const overlayId = `overlay_${imageSlot.id}`;
    const offset = slotPositions[overlayId] ?? { x: 0, y: 0 };

    return (
      <DraggableSlot
        slotId={overlayId}
        offset={offset}
        onDragEnd={handleDragEnd}
        isSelected={selectedSlot === imageSlot.id || textSlots.some(ts => selectedSlot === ts.id)}
      >
        <div className="relative my-4 rounded-lg overflow-hidden shadow-sm">
          <EditableImage
            src={imgValue} slotId={imageSlot.id}
            isSelected={selectedSlot === imageSlot.id}
            onSelect={handleSelectSlot} onRegenerate={handleRegenerateImage}
            regenerating={regeneratingSlots.has(imageSlot.id)}
            className="w-full object-cover" style={{ minHeight: '280px', maxHeight: '480px' }}
          />
          <div className="absolute inset-0 flex flex-col justify-end p-6 md:p-8 pointer-events-none"
            style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.25) 50%, rgba(0,0,0,0.05) 100%)' }}>
            {textSlots.map(ts => {
              const val = slotValues[ts.id];
              if (!val?.trim()) return null;
              return (
                <div key={ts.id} className="pointer-events-auto">
                  <EditableText value={val} slotId={ts.id}
                    isSelected={selectedSlot === ts.id}
                    onSelect={handleSelectSlot} onChange={handleSlotChange}
                    formatting={getFormattingFor(ts.id)}
                    tag={ts.type === 'title' ? 'h1' : 'h2'}
                    className={ts.type === 'title'
                      ? 'text-2xl md:text-4xl font-bold mb-1 drop-shadow-lg'
                      : 'text-base md:text-xl font-medium drop-shadow-md'}
                    style={{
                      color: ts.type === 'title' ? '#ffffff' : '#ffffffdd',
                      fontFamily: brand.params.fontTitle || 'inherit',
                    textShadow: '0 2px 8px rgba(0,0,0,0.5)',
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>
      </DraggableSlot>
    );
  };

  // ── Render slide (pptx format) ────────────────────────

  const renderSlide = (slideGroup: SlideGroup) => {
    const hasContent = slideGroup.slots.some(s => slotValues[s.id]?.trim());
    if (!hasContent) return null;

    const isPortada = slideGroup.slideNumber === 1;
    const groups = groupSlots(slideGroup.slots, slotValues);

    return (
      <div key={slideGroup.slideNumber}
        className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden"
        style={{ aspectRatio: '16 / 9' }}>
        {/* Gradient bar */}
        <div className="h-1.5"
          style={{ background: `linear-gradient(90deg, ${brand.params.colorPrimary}, ${brand.params.colorSecondary})` }} />

        {isPortada ? (
          <div className="relative flex flex-col items-center justify-center h-[calc(100%-6px)] p-8 text-center">
            {(() => {
              const imgSlot = slideGroup.slots.find(s => s.type === 'image');
              const imgVal = imgSlot ? slotValues[imgSlot.id] : null;
              if (imgVal?.startsWith('data:image') || imgVal?.startsWith('https://')) {
                return (
                  <>
                    <EditableImage src={imgVal} slotId={imgSlot!.id}
                      isSelected={selectedSlot === imgSlot!.id}
                      onSelect={handleSelectSlot} onRegenerate={handleRegenerateImage}
                      regenerating={regeneratingSlots.has(imgSlot!.id)}
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                    <div className="absolute inset-0"
                      style={{ background: `linear-gradient(135deg, ${brand.params.colorPrimary}cc 0%, ${brand.params.colorSecondary}99 100%)` }} />
                  </>
                );
              }
              return (
                <div className="absolute inset-0"
                  style={{ background: `linear-gradient(135deg, ${brand.params.colorPrimary} 0%, ${brand.params.colorSecondary} 100%)` }} />
              );
            })()}
            <div className="relative z-10 max-w-2xl mx-auto">
              {brand.params.logoUrl && (
                <img src={brand.params.logoUrl} alt={`${brand.name} logo`}
                  className={`rounded-lg object-contain bg-white/90 p-2 shadow-md mb-6 ${logoPosClass}`}
                  style={{ height: logoSize(4), width: logoSize(4) }} />
              )}
              {slideGroup.slots.filter(s => s.type !== 'image').map(slot => {
                const val = slotValues[slot.id];
                if (!val?.trim()) return null;
                return (
                  <EditableText key={slot.id} value={val} slotId={slot.id}
                    isSelected={selectedSlot === slot.id}
                    onSelect={handleSelectSlot} onChange={handleSlotChange}
                    formatting={getFormattingFor(slot.id)}
                    tag={slot.type === 'title' ? 'h1' : 'h2'}
                    className={slot.type === 'title'
                      ? 'text-3xl md:text-5xl font-bold mb-3 drop-shadow-lg'
                      : 'text-lg md:text-2xl font-medium drop-shadow-md'}
                    style={{
                      color: slot.type === 'title' ? '#ffffff' : '#ffffffcc',
                      fontFamily: brand.params.fontTitle || 'inherit',
                      textShadow: '0 2px 8px rgba(0,0,0,0.3)',
                    }}
                  />
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
          <div className="p-8 h-[calc(100%-6px)] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-semibold px-2 py-0.5 rounded"
                style={{ backgroundColor: brand.params.colorPrimary + '15', color: brand.params.colorPrimary }}>
                Slide {slideGroup.slideNumber}
              </span>
              {brand.params.logoUrl && (
                <img src={brand.params.logoUrl} alt={brand.name}
                  className="object-contain opacity-60"
                  style={{ height: logoSize(2), width: logoSize(2) }} />
              )}
            </div>
            <div className="flex-1">
              {groups.map((group, idx) => {
                if (group.kind === 'overlay') return <div key={idx}>{renderImageOverlay(group.textSlots, group.imageSlot)}</div>;
                return <div key={group.slot.id}>{renderSlot(group.slot)}</div>;
              })}
            </div>
            <div className="mt-auto pt-3 border-t border-gray-100 flex items-center justify-between">
              <p className="text-[9px] text-gray-300">{brand.name} · {session.templateName}</p>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: brand.params.colorPrimary }} />
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: brand.params.colorSecondary }} />
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ── Render PDF/JPG content (paged) ──────────────────────

  const renderPage = (pageNum: number, pageSlots: TemplateSlot[]) => {
    const groups = groupSlots(pageSlots, slotValues);
    const sizeInfo = PAGE_SIZES[pageSize];
    const isFirstPage = pageNum === 1;
    const vHeader = variantStyles.header(brand.params.colorPrimary, brand.params.colorSecondary, isFirstPage);
    const vBar = variantStyles.thinBar(brand.params.colorPrimary, brand.params.colorSecondary);
    const vContent = variantStyles.content();
    const vFooter = variantStyles.footer(brand.params.colorPrimary);

    return (
      <div
        key={pageNum}
        className="bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden flex flex-col mx-auto"
        style={{
          aspectRatio: sizeInfo.aspectRatio,
          maxHeight: 'calc(100vh - 220px)',
          width: '100%',
          maxWidth: '680px',
          backgroundColor: variantStyles.pageBg ?? '#fff',
          border: variantStyles.pageBorder ?? undefined,
        }}
      >
        {/* Header (first page only has brand banner, others have thin bar) */}
        {isFirstPage ? (
          <div className={vHeader.wrapper.className} style={vHeader.wrapper.style}>
            {vHeader.decoration && <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>{vHeader.decoration}</div>}
            <div className={`flex items-center gap-4 ${logoPosFlexClass} relative z-10`}>
              {brand.params.logoUrl && (
                <img src={brand.params.logoUrl} alt={`${brand.name} logo`}
                  className={vHeader.logoClass}
                  style={{ height: logoSize(3.5), width: logoSize(3.5) }} />
              )}
              <div>
                <h2 className={vHeader.title.className}
                  style={{ ...vHeader.title.style, fontFamily: brand.params.fontTitle || 'inherit' }}>
                  {brand.name}
                </h2>
                {session.moleculeName && (
                  <p className={vHeader.subtitle.className} style={vHeader.subtitle.style}>
                    {session.moleculeName}
                    {session.indicationNames.length > 0 && ` — ${session.indicationNames.join(', ')}`}
                  </p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className={vBar.className} style={vBar.style} />
        )}

        {/* Content */}
        <div className={vContent.wrapper.className} style={vContent.wrapper.style}>
          {groups.length > 0 ? groups.map((group, idx) => {
            if (group.kind === 'overlay') return <div key={idx}>{renderImageOverlay(group.textSlots, group.imageSlot)}</div>;
            return <div key={group.slot.id}>{renderSlot(group.slot)}</div>;
          }) : (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-gray-300 italic">Página vacía — arrastra slots desde el panel derecho</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={vFooter.wrapper.className} style={vFooter.wrapper.style}>
          {brand.params.disclaimerBadge && (
            <div className="flex items-center gap-1.5 mb-1.5">
              <svg className="w-3 h-3 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              <p className={`text-[8px] uppercase tracking-wider font-medium ${
                designVariant === 'impacto' ? 'text-white/60' : 'text-gray-400'
              }`}>{brand.params.disclaimerBadge}</p>
            </div>
          )}
          <div className="flex items-center justify-between">
            <p className={`text-[10px] ${
              designVariant === 'impacto' ? 'text-white/50' : 'text-gray-400'
            }`}>
              {pageCount > 1 && `Pág. ${pageNum} de ${pageCount} · `}
              {brand.name} · {session.templateName}
            </p>
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: brand.params.colorPrimary }} />
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: brand.params.colorSecondary }} />
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderPdfContent = () => {
    if (pageCount <= 1) {
      return renderPage(1, template.slots);
    }
    // Show only the current page (slider mode)
    return renderPage(currentPage, pagesSlots[currentPage - 1] ?? []);
  };

  // ── Main layout ───────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 bg-gray-100 flex flex-col" onClick={() => setSelectedSlot(null)}>
      {/* ── Toolbar ── */}
      <div className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 shrink-0 shadow-sm">
        <div className="flex items-center gap-3">
          <button onClick={onClose}
            className="text-gray-500 hover:text-gray-800 text-sm flex items-center gap-1.5 font-medium transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Volver
          </button>
          <div className="h-5 w-px bg-gray-200" />
          <span className="text-sm font-semibold text-gray-900">{template.name}</span>
          <span className="text-xs text-gray-400">· {brand.name}</span>
        </div>

        <div className="flex items-center gap-3">
          {hasChanges && (
            <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-full flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-amber-500 rounded-full" />
              Cambios sin guardar
            </span>
          )}
          <button onClick={handleExportPng}
            className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-600
                       hover:bg-gray-50 transition-colors flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Exportar PNG
          </button>
          <button onClick={handleSave} disabled={!hasChanges}
            className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white
                       hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed
                       flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Guardar cambios
          </button>
        </div>
      </div>

      {/* ── Format Toolbar ── */}
      <FormatToolbar
        slot={selectedSlotInfo ?? null}
        formatting={selectedSlotFormatting}
        onFormattingChange={handleFormattingChange}
        brandFonts={{ title: brand.params.fontTitle, body: brand.params.fontBody }}
        brandColors={{ primary: brand.params.colorPrimary, secondary: brand.params.colorSecondary }}
      />

      <div className="flex flex-1 min-h-0">
        {/* ── Preview area ── */}
        <div className="flex-1 overflow-auto py-6 px-4 lg:px-8 flex flex-col">
          <div className="max-w-3xl mx-auto mb-3 w-full">
            <p className="text-xs text-gray-400 text-center">
              Haz clic en cualquier texto para editarlo · Usa la barra de formato para cambiar estilos · Arrastra con el asa lateral
            </p>
          </div>
          <div ref={previewRef} className="max-w-3xl mx-auto pl-8 flex-1 w-full">
            {template.format === 'pptx' ? (
              <div className="space-y-6">
                {groupBySlide(template.slots).map(sg => renderSlide(sg))}
              </div>
            ) : (
              renderPdfContent()
            )}
          </div>

          {/* ── Page slider (only for multi-page PDF/JPG) ── */}
          {isPaged && pageCount > 1 && (
            <div className="max-w-3xl mx-auto w-full mt-4" onClick={(e) => e.stopPropagation()}>
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3">
                <div className="flex items-center gap-3">
                  {/* Previous page button */}
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>

                  {/* Page thumbnails */}
                  <div className="flex-1 flex items-center gap-2 overflow-x-auto py-1">
                    {Array.from({ length: pageCount }, (_, i) => i + 1).map(pNum => {
                      const isActive = pNum === currentPage;
                      const pageSlots = pagesSlots[pNum - 1] ?? [];
                      const filledSlots = pageSlots.filter(s => slotValues[s.id]?.trim()).length;
                      return (
                        <button
                          key={pNum}
                          onClick={() => setCurrentPage(pNum)}
                          className={`relative flex flex-col items-center gap-1 px-1 transition-all ${
                            isActive ? 'scale-105' : 'hover:scale-105'
                          }`}
                        >
                          {/* Mini page thumbnail */}
                          <div
                            className={`rounded-md border-2 transition-colors flex flex-col overflow-hidden ${
                              isActive
                                ? 'border-blue-500 shadow-md shadow-blue-500/20'
                                : 'border-gray-200 hover:border-gray-300'
                            }`}
                            style={{
                              width: '48px',
                              aspectRatio: PAGE_SIZES[pageSize].aspectRatio,
                            }}
                          >
                            {/* Mini header bar */}
                            <div
                              className={pNum === 1 ? 'h-2' : 'h-0.5'}
                              style={{ background: `linear-gradient(90deg, ${brand.params.colorPrimary}, ${brand.params.colorSecondary})` }}
                            />
                            {/* Content lines */}
                            <div className="flex-1 p-1 flex flex-col gap-0.5 justify-center">
                              {pageSlots.slice(0, 4).map((s, j) => (
                                <div key={j}
                                  className={`h-0.5 rounded-full ${slotValues[s.id]?.trim() ? 'bg-gray-300' : 'bg-gray-100'}`}
                                  style={{ width: s.type === 'title' ? '70%' : s.type === 'image' ? '100%' : '90%' }}
                                />
                              ))}
                            </div>
                          </div>
                          {/* Page label */}
                          <span className={`text-[10px] font-medium ${
                            isActive ? 'text-blue-600' : 'text-gray-400'
                          }`}>
                            {pNum}
                          </span>
                          {/* Slot count badge */}
                          {filledSlots > 0 && (
                            <span className={`absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full text-[8px] flex items-center justify-center font-bold ${
                              isActive ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-500'
                            }`}>
                              {filledSlots}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Next page button */}
                  <button
                    onClick={() => setCurrentPage(p => Math.min(pageCount, p + 1))}
                    disabled={currentPage === pageCount}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </button>

                  {/* Page info */}
                  <div className="h-6 w-px bg-gray-200" />
                  <span className="text-xs text-gray-500 whitespace-nowrap font-medium">
                    {currentPage} / {pageCount}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Right panel ── */}
        <div className="w-72 bg-white border-l border-gray-200 flex-col shrink-0 overflow-y-auto hidden lg:flex">
          {/* Selected slot info */}
          {selectedSlotInfo ? (
            <div className="p-4 border-b border-gray-100">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2 h-2 rounded-full bg-blue-500" />
                <h3 className="text-sm font-semibold text-gray-900">{selectedSlotInfo.name}</h3>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>Tipo</span>
                  <span className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-600 capitalize">{selectedSlotInfo.type}</span>
                </div>
                {selectedSlotInfo.type !== 'image' && (
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>Caracteres</span>
                    <span className={(slotValues[selectedSlotInfo.id]?.length ?? 0) > selectedSlotInfo.maxLength ? 'text-red-500 font-medium' : ''}>
                      {slotValues[selectedSlotInfo.id]?.length ?? 0} / {selectedSlotInfo.maxLength}
                    </span>
                  </div>
                )}
                {selectedSlotInfo.required && (
                  <div className="text-[10px] text-amber-600 bg-amber-50 px-2 py-1 rounded">Campo obligatorio</div>
                )}
              </div>
            </div>
          ) : (
            <div className="p-4 border-b border-gray-100">
              <p className="text-xs text-gray-400 text-center py-4">Selecciona un elemento para ver sus propiedades</p>
            </div>
          )}

          {/* ── AI Assistant section ── */}
          <div className="p-4 border-b border-gray-100" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold mb-3 flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Asistente IA
            </h3>

            {/* Per-slot AI: text */}
            {selectedSlotInfo && selectedSlotInfo.type !== 'image' && (
              <div className="mb-3">
                <span className="text-[11px] text-gray-600 font-medium block mb-1.5">
                  Regenerar "{selectedSlotInfo.name}"
                </span>
                <div className="relative">
                  <textarea
                    value={aiSlotPrompt}
                    onChange={(e) => setAiSlotPrompt(e.target.value)}
                    placeholder={`Ej: "Hazlo más persuasivo" o "Enfocado en eficacia clínica"`}
                    rows={2}
                    className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-2 pr-8 resize-none
                               focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent
                               placeholder:text-gray-300"
                  />
                  {voiceSupported && (
                    <button
                      onClick={() => handleVoiceToggle('slot')}
                      type="button"
                      className={`absolute right-1.5 top-1.5 p-1 rounded-md transition-colors ${
                        voiceListening && voiceTarget === 'slot'
                          ? 'bg-red-100 text-red-500 animate-pulse'
                          : 'text-gray-300 hover:text-gray-500 hover:bg-gray-100'
                      }`}
                      title={voiceListening && voiceTarget === 'slot' ? 'Detener' : 'Dictar'}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 1a3 3 0 00-3 3v4a3 3 0 006 0V4a3 3 0 00-3-3z" />
                      </svg>
                    </button>
                  )}
                  {voiceListening && voiceTarget === 'slot' && voiceInterim && (
                    <div className="absolute left-2.5 bottom-0.5 text-[9px] text-purple-500 italic truncate max-w-[70%]">
                      {voiceInterim}…
                    </div>
                  )}
                </div>
                <button
                  onClick={handleAiRegenerateSlot}
                  disabled={aiSlotLoading || !aiSlotPrompt.trim()}
                  className="mt-1.5 w-full flex items-center justify-center gap-1.5 rounded-lg
                             bg-purple-600 px-3 py-2 text-xs font-medium text-white
                             hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {aiSlotLoading ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Generando…
                    </>
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      Regenerar con IA
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Per-slot AI: image */}
            {selectedSlotInfo && selectedSlotInfo.type === 'image' && (
              <div className="mb-3">
                <span className="text-[11px] text-gray-600 font-medium block mb-1.5">
                  Regenerar "{selectedSlotInfo.name}"
                </span>
                <div className="relative">
                  <textarea
                    value={aiImagePrompt}
                    onChange={(e) => setAiImagePrompt(e.target.value)}
                    placeholder={`Describe la imagen que necesitas…`}
                    rows={2}
                    className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-2 pr-8 resize-none
                               focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent
                               placeholder:text-gray-300"
                  />
                  {voiceSupported && (
                    <button
                      onClick={() => handleVoiceToggle('image')}
                      type="button"
                      className={`absolute right-1.5 top-1.5 p-1 rounded-md transition-colors ${
                        voiceListening && voiceTarget === 'image'
                          ? 'bg-red-100 text-red-500 animate-pulse'
                          : 'text-gray-300 hover:text-gray-500 hover:bg-gray-100'
                      }`}
                      title={voiceListening && voiceTarget === 'image' ? 'Detener' : 'Dictar'}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 1a3 3 0 00-3 3v4a3 3 0 006 0V4a3 3 0 00-3-3z" />
                      </svg>
                    </button>
                  )}
                  {voiceListening && voiceTarget === 'image' && voiceInterim && (
                    <div className="absolute left-2.5 bottom-0.5 text-[9px] text-purple-500 italic truncate max-w-[70%]">
                      {voiceInterim}…
                    </div>
                  )}
                </div>
                <div className="flex gap-1.5 mt-1.5">
                  <button
                    onClick={() => handleRegenerateImage(selectedSlotInfo.id)}
                    disabled={regeneratingSlots.has(selectedSlotInfo.id)}
                    className="flex-1 flex items-center justify-center gap-1.5 rounded-lg
                               bg-gray-100 px-2 py-2 text-xs font-medium text-gray-700
                               hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Auto
                  </button>
                  <button
                    onClick={handleAiRegenerateImageCustom}
                    disabled={regeneratingSlots.has(selectedSlotInfo.id) || !aiImagePrompt.trim()}
                    className="flex-1 flex items-center justify-center gap-1.5 rounded-lg
                               bg-purple-600 px-2 py-2 text-xs font-medium text-white
                               hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {regeneratingSlots.has(selectedSlotInfo.id) ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Generando…
                      </>
                    ) : (
                      <>
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        Con prompt
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Divider if slot was shown */}
            {selectedSlotInfo && <div className="border-t border-gray-100 my-3" />}

            {/* General AI regeneration */}
            <div>
              <span className="text-[11px] text-gray-600 font-medium block mb-1.5">
                Regenerar todo el contenido
              </span>
              <div className="relative">
                <textarea
                  value={aiGeneralPrompt}
                  onChange={(e) => setAiGeneralPrompt(e.target.value)}
                  placeholder={`Ej: "Tono más técnico y formal" o "Enfocado en cardiólogos"`}
                  rows={2}
                  className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-2 pr-8 resize-none
                             focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent
                             placeholder:text-gray-300"
                />
                {voiceSupported && (
                  <button
                    onClick={() => handleVoiceToggle('general')}
                    type="button"
                    className={`absolute right-1.5 top-1.5 p-1 rounded-md transition-colors ${
                      voiceListening && voiceTarget === 'general'
                        ? 'bg-red-100 text-red-500 animate-pulse'
                        : 'text-gray-300 hover:text-gray-500 hover:bg-gray-100'
                    }`}
                    title={voiceListening && voiceTarget === 'general' ? 'Detener' : 'Dictar'}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 1a3 3 0 00-3 3v4a3 3 0 006 0V4a3 3 0 00-3-3z" />
                    </svg>
                  </button>
                )}
                {voiceListening && voiceTarget === 'general' && voiceInterim && (
                  <div className="absolute left-2.5 bottom-0.5 text-[9px] text-purple-500 italic truncate max-w-[70%]">
                    {voiceInterim}…
                  </div>
                )}
              </div>
              <button
                onClick={handleAiRegenerateAll}
                disabled={aiGeneralLoading || !aiGeneralPrompt.trim()}
                className="mt-1.5 w-full flex items-center justify-center gap-1.5 rounded-lg
                           bg-indigo-600 px-3 py-2 text-xs font-medium text-white
                           hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {aiGeneralLoading ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Generando todo…
                  </>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Regenerar todos los textos
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Design variant selector */}
          <div className="p-4 border-b border-gray-100" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold mb-3">Estilo de diseño</h3>
            <div className="grid grid-cols-2 gap-1.5">
              {DESIGN_VARIANTS.map(v => {
                const active = designVariant === v.id;
                return (
                  <button
                    key={v.id}
                    onClick={() => handleVariantChange(v.id)}
                    className={`text-left rounded-lg px-2.5 py-2 text-[10px] border transition-colors ${
                      active
                        ? 'bg-blue-50 border-blue-300 text-blue-700'
                        : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <span className="font-semibold block">{v.icon} {v.name}</span>
                    <span className={`text-[9px] leading-tight ${active ? 'text-blue-500' : 'text-gray-400'}`}>{v.description}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Page config (PDF/JPG only) */}
          {isPaged && (
            <div className="p-4 border-b border-gray-100" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold mb-3">Configuración de página</h3>

              {/* Page size */}
              <div className="mb-3">
                <span className="text-[11px] text-gray-500 block mb-1.5">Tamaño de página</span>
                <div className="grid grid-cols-2 gap-1.5">
                  {(Object.keys(PAGE_SIZES) as PageSize[]).map(size => {
                    const info = PAGE_SIZES[size];
                    const active = pageSize === size;
                    return (
                      <button
                        key={size}
                        onClick={() => handlePageSizeChange(size)}
                        className={`text-left rounded-lg px-2.5 py-2 text-[10px] border transition-colors ${
                          active
                            ? 'bg-blue-50 border-blue-300 text-blue-700'
                            : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        <span className="font-semibold block">{info.label}</span>
                        <span className={`text-[9px] ${active ? 'text-blue-500' : 'text-gray-400'}`}>{info.description}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Page count */}
              <div>
                <span className="text-[11px] text-gray-500 block mb-1.5">Número de páginas</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handlePageCountChange(pageCount - 1)}
                    disabled={pageCount <= 1}
                    className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-100 disabled:opacity-30 transition-colors font-bold text-sm"
                  >−</button>
                  <div className="flex-1 text-center">
                    <span className="text-lg font-bold text-gray-800">{pageCount}</span>
                    <span className="text-[10px] text-gray-400 block -mt-0.5">
                      {pageCount === 1 ? 'página' : 'páginas'}
                    </span>
                  </div>
                  <button
                    onClick={() => handlePageCountChange(pageCount + 1)}
                    disabled={pageCount >= 10}
                    className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-100 disabled:opacity-30 transition-colors font-bold text-sm"
                  >+</button>
                </div>
              </div>

              {/* Print margins */}
              <div>
                <span className="text-[11px] text-gray-500 block mb-1.5">Márgenes de impresión</span>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={0}
                    max={30}
                    value={printMargins}
                    onChange={e => handlePrintMarginsChange(parseInt(e.target.value))}
                    className="flex-1 accent-purple-600 h-1.5"
                  />
                  <span className="text-xs font-semibold text-gray-700 w-12 text-right">{printMargins} mm</span>
                </div>
                <div className="flex gap-1 mt-1.5">
                  {[
                    { label: 'Sin', value: 0 },
                    { label: 'Mínimo', value: 5 },
                    { label: 'Normal', value: 15 },
                    { label: 'Ancho', value: 25 },
                  ].map(preset => (
                    <button
                      key={preset.value}
                      onClick={() => handlePrintMarginsChange(preset.value)}
                      className={`flex-1 text-[10px] py-1 rounded-md border transition-colors ${
                        printMargins === preset.value
                          ? 'border-purple-400 bg-purple-50 text-purple-700 font-semibold'
                          : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Slot list */}
          <div className="p-4 flex-1">
            <h3 className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold mb-3">
              {isPaged && pageCount > 1 ? `Slots · Página ${currentPage}` : 'Todos los slots'}
            </h3>
            <div className="space-y-1.5">
              {(isPaged && pageCount > 1 ? (pagesSlots[currentPage - 1] ?? []) : template.slots).map(slot => {
                const value = slotValues[slot.id];
                const hasValue = !!value?.trim();
                const isActive = selectedSlot === slot.id;
                return (
                  <button key={slot.id}
                    onClick={(e) => { e.stopPropagation(); handleSelectSlot(slot.id); }}
                    className={`w-full text-left rounded-lg px-3 py-2 text-xs transition-colors ${
                      isActive ? 'bg-blue-50 border border-blue-200 text-blue-800'
                        : hasValue ? 'bg-gray-50 border border-gray-100 text-gray-700 hover:bg-gray-100'
                          : 'bg-white border border-gray-100 text-gray-400 hover:bg-gray-50'
                    }`}>
                    <div className="flex items-center justify-between">
                      <span className="font-medium truncate">{slot.name}</span>
                      <div className="flex items-center gap-1.5">
                        {isPaged && pageCount > 1 && (
                          <select
                            value={(() => {
                              try {
                                const assign = JSON.parse(slotValues['__page_assign'] || '{}');
                                return assign[slot.id] ?? Math.min(Math.floor(template.slots.indexOf(slot) / Math.ceil(template.slots.length / pageCount)) + 1, pageCount);
                              } catch { return 1; }
                            })()}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => {
                              e.stopPropagation();
                              const page = parseInt(e.target.value);
                              const current = (() => {
                                try { return JSON.parse(slotValues['__page_assign'] || '{}'); } catch { return {}; }
                              })();
                              current[slot.id] = page;
                              handleSlotChange('__page_assign', JSON.stringify(current));
                            }}
                            className="text-[9px] border border-gray-200 rounded px-1 py-0.5 bg-white w-12"
                            title="Mover a página"
                          >
                            {Array.from({ length: pageCount }, (_, i) => (
                              <option key={i + 1} value={i + 1}>Pág {i + 1}</option>
                            ))}
                          </select>
                        )}
                        <span className={`w-2 h-2 rounded-full shrink-0 ${hasValue ? 'bg-green-500' : 'bg-gray-300'}`} />
                      </div>
                    </div>
                    {hasValue && slot.type !== 'image' && (
                      <p className="text-[10px] text-gray-400 mt-0.5 truncate">{value!.slice(0, 60)}</p>
                    )}
                    {hasValue && slot.type === 'image' && (
                      <p className="text-[10px] text-green-600 mt-0.5">Imagen generada</p>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Logo controls */}
          {brand.params.logoUrl && (
            <div className="p-4 border-t border-gray-100">
              <h3 className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold mb-3">Logo</h3>

              {/* Scale slider */}
              <div className="mb-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] text-gray-500">Tamaño</span>
                  <span className="text-[11px] font-mono text-gray-600">{logoScale.toFixed(1)}x</span>
                </div>
                <input
                  type="range" min="0.5" max="3" step="0.1"
                  value={logoScale}
                  onChange={(e) => setLogoScale(parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
                <div className="flex justify-between text-[9px] text-gray-300 mt-0.5">
                  <span>0.5x</span><span>1.0x</span><span>2.0x</span><span>3.0x</span>
                </div>
              </div>

              {/* Position buttons */}
              <div>
                <span className="text-[11px] text-gray-500 block mb-1.5">Posición</span>
                <div className="flex gap-1">
                  {(['left', 'center', 'right'] as const).map((pos) => (
                    <button key={pos}
                      onClick={(e) => { e.stopPropagation(); setLogoPosition(pos); }}
                      className={`flex-1 text-[10px] font-medium py-1.5 rounded-md border transition-colors ${
                        logoPosition === pos
                          ? 'bg-blue-50 border-blue-300 text-blue-700'
                          : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
                      }`}>
                      {pos === 'left' ? 'Izq' : pos === 'center' ? 'Centro' : 'Der'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Brand info */}
          <div className="p-4 border-t border-gray-100">
            <h3 className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold mb-2">Marca</h3>
            <div className="flex items-center gap-2 mb-3">
              {brand.params.logoUrl && (
                <img src={brand.params.logoUrl} alt="" className="w-8 h-8 rounded object-contain bg-gray-50 border border-gray-100 p-0.5" />
              )}
              <div>
                <p className="text-xs font-medium text-gray-800">{brand.name}</p>
                {session.moleculeName && <p className="text-[10px] text-gray-400">{session.moleculeName}</p>}
              </div>
            </div>
            <div className="flex gap-2">
              <div className="w-6 h-6 rounded border border-gray-200" style={{ backgroundColor: brand.params.colorPrimary }} title={brand.params.colorPrimary} />
              <div className="w-6 h-6 rounded border border-gray-200" style={{ backgroundColor: brand.params.colorSecondary }} title={brand.params.colorSecondary} />
            </div>
            <div className="mt-2 space-y-0.5">
              <p className="text-[10px] text-gray-400">Títulos: <span className="text-gray-600">{brand.params.fontTitle || 'Default'}</span></p>
              <p className="text-[10px] text-gray-400">Cuerpo: <span className="text-gray-600">{brand.params.fontBody || 'Default'}</span></p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
