import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  getDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/firebase/config';
import type { DesignTemplate, DesignLayout, DesignCategory } from '@/types';
import { Timestamp } from 'firebase/firestore';

const COLLECTION = 'designTemplates';
const EMAIL_WIDTH = 600;

// ═══════════════════════════════════════════════════════════
// System templates (in-memory, no Firestore needed)
// ═══════════════════════════════════════════════════════════

export type EmailDesignTag = 'simple' | 'visual' | 'informativo' | 'promocional' | 'científico' | 'newsletter';

export interface SystemDesignTemplate extends Omit<DesignTemplate, 'createdAt' | 'updatedAt'> {
  description: string;
  tags: EmailDesignTag[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

const ts = Timestamp.now();

export const SYSTEM_EMAIL_DESIGNS: SystemDesignTemplate[] = [
  // ── SIMPLE ─────────────────────────────────────────────
  {
    id: 'sys-minimal',
    name: 'Minimal',
    description: 'Diseño limpio y directo. Ideal para comunicaciones simples.',
    tags: ['simple'],
    brandId: null, brandName: null,
    category: 'email',
    thumbnailUrl: '',
    source: 'system',
    tenantId: '__system__',
    createdBy: 'system',
    createdAt: ts, updatedAt: ts,
    style: { colorPrimary: '#2563EB', colorSecondary: '#0EA5E9', colorBackground: '#FFFFFF', fontTitle: 'Inter', fontBody: 'Inter', variant: 'moderna' },
    layout: {
      width: EMAIL_WIDTH, height: 700,
      blocks: [
        { id: 'logo', type: 'header', x: 0, y: 0, w: 100, h: 10, defaultContent: 'Logo de marca' },
        { id: 'title', type: 'text', x: 5, y: 14, w: 90, h: 8, defaultContent: 'Título del email', style: { fontSize: '28px', fontWeight: 'bold', textAlign: 'center' } },
        { id: 'body', type: 'text', x: 8, y: 26, w: 84, h: 40, defaultContent: 'Contenido principal del email. Información relevante para profesionales de la salud.' },
        { id: 'cta', type: 'cta', x: 25, y: 70, w: 50, h: 7, defaultContent: 'Más información' },
        { id: 'footer', type: 'footer', x: 0, y: 85, w: 100, h: 15, defaultContent: 'Material exclusivo para profesionales de la salud.' },
      ],
    },
  },
  {
    id: 'sys-texto-puro',
    name: 'Texto Puro',
    description: 'Solo texto, sin imágenes. Para mensajes directos y personales.',
    tags: ['simple'],
    brandId: null, brandName: null,
    category: 'email',
    thumbnailUrl: '',
    source: 'system',
    tenantId: '__system__',
    createdBy: 'system',
    createdAt: ts, updatedAt: ts,
    style: { colorPrimary: '#374151', colorSecondary: '#6B7280', colorBackground: '#FFFFFF', fontTitle: 'Inter', fontBody: 'Inter', variant: 'moderna' },
    layout: {
      width: EMAIL_WIDTH, height: 600,
      blocks: [
        { id: 'logo', type: 'header', x: 0, y: 0, w: 100, h: 8, defaultContent: 'Logo de marca' },
        { id: 'saludo', type: 'text', x: 8, y: 12, w: 84, h: 5, defaultContent: 'Estimado/a Doctor/a,', style: { fontSize: '16px' } },
        { id: 'body', type: 'text', x: 8, y: 20, w: 84, h: 45, defaultContent: 'Le escribimos para informarle sobre las últimas novedades de nuestro producto. Nos gustaría compartir con usted información actualizada sobre eficacia y seguridad.' },
        { id: 'despedida', type: 'text', x: 8, y: 68, w: 84, h: 8, defaultContent: 'Atentamente,\nEquipo Médico', style: { fontSize: '14px', color: '#666' } },
        { id: 'footer', type: 'footer', x: 0, y: 85, w: 100, h: 15, defaultContent: 'Material exclusivo para profesionales de la salud.' },
      ],
    },
  },
  {
    id: 'sys-aviso-breve',
    name: 'Aviso Breve',
    description: 'Notificación corta con un solo CTA. Perfecto para alertas.',
    tags: ['simple', 'promocional'],
    brandId: null, brandName: null,
    category: 'email',
    thumbnailUrl: '',
    source: 'system',
    tenantId: '__system__',
    createdBy: 'system',
    createdAt: ts, updatedAt: ts,
    style: { colorPrimary: '#2563EB', colorSecondary: '#0EA5E9', colorBackground: '#FFFFFF', fontTitle: 'Inter', fontBody: 'Inter', variant: 'moderna' },
    layout: {
      width: EMAIL_WIDTH, height: 500,
      blocks: [
        { id: 'logo', type: 'header', x: 0, y: 0, w: 100, h: 12, defaultContent: 'Logo de marca' },
        { id: 'spacer1', type: 'spacer', x: 0, y: 12, w: 100, h: 5 },
        { id: 'title', type: 'text', x: 10, y: 20, w: 80, h: 10, defaultContent: '¡Novedad importante!', style: { fontSize: '24px', fontWeight: 'bold', textAlign: 'center' } },
        { id: 'body', type: 'text', x: 10, y: 34, w: 80, h: 20, defaultContent: 'Descripción breve de la novedad o actualización. Un párrafo conciso.', style: { textAlign: 'center' } },
        { id: 'cta', type: 'cta', x: 25, y: 60, w: 50, h: 8, defaultContent: 'Ver ahora' },
        { id: 'footer', type: 'footer', x: 0, y: 80, w: 100, h: 20, defaultContent: 'Material exclusivo para profesionales de la salud.' },
      ],
    },
  },

  // ── VISUAL ─────────────────────────────────────────────
  {
    id: 'sys-hero',
    name: 'Hero Image',
    description: 'Imagen hero grande con texto y CTA. Alto impacto visual.',
    tags: ['visual', 'promocional'],
    brandId: null, brandName: null,
    category: 'email',
    thumbnailUrl: '',
    source: 'system',
    tenantId: '__system__',
    createdBy: 'system',
    createdAt: ts, updatedAt: ts,
    style: { colorPrimary: '#2563EB', colorSecondary: '#0EA5E9', colorBackground: '#FFFFFF', fontTitle: 'Inter', fontBody: 'Inter', variant: 'moderna' },
    layout: {
      width: EMAIL_WIDTH, height: 900,
      blocks: [
        { id: 'logo', type: 'header', x: 0, y: 0, w: 100, h: 7, defaultContent: 'Logo de marca' },
        { id: 'hero', type: 'hero', x: 0, y: 7, w: 100, h: 28, defaultContent: 'Imagen principal' },
        { id: 'title', type: 'text', x: 5, y: 38, w: 90, h: 7, defaultContent: 'Título impactante', style: { fontSize: '26px', fontWeight: 'bold', textAlign: 'center' } },
        { id: 'divider1', type: 'divider', x: 20, y: 46, w: 60, h: 1 },
        { id: 'body', type: 'text', x: 8, y: 50, w: 84, h: 22, defaultContent: 'Contenido principal con información sobre el producto o la indicación clínica.' },
        { id: 'cta', type: 'cta', x: 25, y: 76, w: 50, h: 7, defaultContent: 'Ver más detalles' },
        { id: 'footer', type: 'footer', x: 0, y: 88, w: 100, h: 12, defaultContent: 'Material exclusivo para profesionales de la salud.' },
      ],
    },
  },
  {
    id: 'sys-hero-centrado',
    name: 'Hero Centrado',
    description: 'Imagen hero con texto centrado superpuesto. Elegante y moderno.',
    tags: ['visual', 'promocional'],
    brandId: null, brandName: null,
    category: 'email',
    thumbnailUrl: '',
    source: 'system',
    tenantId: '__system__',
    createdBy: 'system',
    createdAt: ts, updatedAt: ts,
    style: { colorPrimary: '#7C3AED', colorSecondary: '#A78BFA', colorBackground: '#FFFFFF', fontTitle: 'Inter', fontBody: 'Inter', variant: 'elegante' },
    layout: {
      width: EMAIL_WIDTH, height: 850,
      blocks: [
        { id: 'logo', type: 'header', x: 0, y: 0, w: 100, h: 8, defaultContent: 'Logo de marca' },
        { id: 'hero', type: 'hero', x: 0, y: 8, w: 100, h: 30, defaultContent: 'Imagen hero de fondo' },
        { id: 'spacer1', type: 'spacer', x: 0, y: 38, w: 100, h: 3 },
        { id: 'title', type: 'text', x: 10, y: 42, w: 80, h: 8, defaultContent: 'Descubre lo nuevo', style: { fontSize: '30px', fontWeight: 'bold', textAlign: 'center' } },
        { id: 'subtitle', type: 'text', x: 15, y: 52, w: 70, h: 5, defaultContent: 'Una breve descripción que complementa el título', style: { fontSize: '15px', textAlign: 'center', color: '#666' } },
        { id: 'divider1', type: 'divider', x: 30, y: 58, w: 40, h: 1 },
        { id: 'body', type: 'text', x: 10, y: 62, w: 80, h: 15, defaultContent: 'Texto principal del email con información detallada.', style: { textAlign: 'center' } },
        { id: 'cta', type: 'cta', x: 25, y: 80, w: 50, h: 7, defaultContent: 'Explorar' },
        { id: 'footer', type: 'footer', x: 0, y: 90, w: 100, h: 10, defaultContent: 'Material exclusivo para profesionales de la salud.' },
      ],
    },
  },
  {
    id: 'sys-producto',
    name: 'Producto Destacado',
    description: 'Foco en imagen de producto con beneficios en bullets.',
    tags: ['visual', 'promocional'],
    brandId: null, brandName: null,
    category: 'email',
    thumbnailUrl: '',
    source: 'system',
    tenantId: '__system__',
    createdBy: 'system',
    createdAt: ts, updatedAt: ts,
    style: { colorPrimary: '#2563EB', colorSecondary: '#0EA5E9', colorBackground: '#FFFFFF', fontTitle: 'Inter', fontBody: 'Inter', variant: 'moderna' },
    layout: {
      width: EMAIL_WIDTH, height: 850,
      blocks: [
        { id: 'logo', type: 'header', x: 0, y: 0, w: 100, h: 8, defaultContent: 'Logo de marca' },
        { id: 'hero', type: 'image', x: 15, y: 10, w: 70, h: 25, defaultContent: 'Foto del producto' },
        { id: 'title', type: 'text', x: 5, y: 38, w: 90, h: 7, defaultContent: 'Nombre del Producto®', style: { fontSize: '28px', fontWeight: 'bold', textAlign: 'center' } },
        { id: 'subtitle', type: 'text', x: 10, y: 46, w: 80, h: 5, defaultContent: 'Indicación principal y posología', style: { fontSize: '15px', textAlign: 'center', color: '#666' } },
        { id: 'bullets', type: 'bullets', x: 10, y: 54, w: 80, h: 18, defaultContent: '• Eficacia clínica demostrada\n• Perfil de seguridad favorable\n• Posología cómoda\n• Resultados desde la primera semana' },
        { id: 'cta', type: 'cta', x: 20, y: 75, w: 60, h: 7, defaultContent: 'Conocer más' },
        { id: 'divider1', type: 'divider', x: 10, y: 85, w: 80, h: 1 },
        { id: 'footer', type: 'footer', x: 0, y: 88, w: 100, h: 12, defaultContent: 'Material exclusivo para profesionales de la salud.' },
      ],
    },
  },

  // ── INFORMATIVO ────────────────────────────────────────
  {
    id: 'sys-editorial',
    name: 'Editorial',
    description: 'Estilo revista con imagen lateral y texto en columnas.',
    tags: ['informativo', 'científico'],
    brandId: null, brandName: null,
    category: 'email',
    thumbnailUrl: '',
    source: 'system',
    tenantId: '__system__',
    createdBy: 'system',
    createdAt: ts, updatedAt: ts,
    style: { colorPrimary: '#1E40AF', colorSecondary: '#3B82F6', colorBackground: '#FFFFFF', fontTitle: 'Inter', fontBody: 'Inter', variant: 'editorial' },
    layout: {
      width: EMAIL_WIDTH, height: 950,
      blocks: [
        { id: 'logo', type: 'header', x: 0, y: 0, w: 100, h: 7, defaultContent: 'Logo de marca' },
        { id: 'title', type: 'text', x: 5, y: 9, w: 90, h: 7, defaultContent: 'Título editorial', style: { fontSize: '26px', fontWeight: 'bold' } },
        { id: 'subtitle', type: 'text', x: 5, y: 17, w: 90, h: 4, defaultContent: 'Subtítulo descriptivo del contenido', style: { fontSize: '16px', color: '#666' } },
        { id: 'divider1', type: 'divider', x: 5, y: 22, w: 90, h: 1 },
        { id: 'image', type: 'image', x: 5, y: 25, w: 45, h: 22, defaultContent: 'Imagen editorial' },
        { id: 'body1', type: 'text', x: 52, y: 25, w: 43, h: 22, defaultContent: 'Primera sección con información clave sobre el producto farmacéutico y sus indicaciones.' },
        { id: 'body2', type: 'text', x: 5, y: 50, w: 90, h: 20, defaultContent: 'Desarrollo del contenido principal, datos clínicos y evidencia científica relevante.' },
        { id: 'bullets', type: 'bullets', x: 5, y: 72, w: 90, h: 12, defaultContent: '• Dato clínico relevante\n• Evidencia de eficacia\n• Perfil de seguridad' },
        { id: 'cta', type: 'cta', x: 25, y: 86, w: 50, h: 6, defaultContent: 'Solicitar información' },
        { id: 'footer', type: 'footer', x: 0, y: 93, w: 100, h: 7, defaultContent: 'Material exclusivo para profesionales de la salud.' },
      ],
    },
  },
  {
    id: 'sys-datos-clinicos',
    name: 'Datos Clínicos',
    description: 'Estructura ideal para presentar resultados de estudios.',
    tags: ['informativo', 'científico'],
    brandId: null, brandName: null,
    category: 'email',
    thumbnailUrl: '',
    source: 'system',
    tenantId: '__system__',
    createdBy: 'system',
    createdAt: ts, updatedAt: ts,
    style: { colorPrimary: '#0F766E', colorSecondary: '#14B8A6', colorBackground: '#FFFFFF', fontTitle: 'Inter', fontBody: 'Inter', variant: 'cientifica' },
    layout: {
      width: EMAIL_WIDTH, height: 950,
      blocks: [
        { id: 'logo', type: 'header', x: 0, y: 0, w: 100, h: 7, defaultContent: 'Logo de marca' },
        { id: 'title', type: 'text', x: 5, y: 9, w: 90, h: 6, defaultContent: 'Resultados del Estudio Fase III', style: { fontSize: '22px', fontWeight: 'bold' } },
        { id: 'subtitle', type: 'text', x: 5, y: 16, w: 90, h: 4, defaultContent: 'Estudio multicéntrico, doble ciego, aleatorizado', style: { fontSize: '14px', color: '#666' } },
        { id: 'divider1', type: 'divider', x: 5, y: 21, w: 90, h: 1 },
        { id: 'stat1', type: 'text', x: 5, y: 24, w: 42, h: 15, defaultContent: '45%\nReducción de síntomas\nvs placebo (p<0.001)', style: { fontSize: '18px', textAlign: 'center', fontWeight: 'bold' } },
        { id: 'stat2', type: 'text', x: 53, y: 24, w: 42, h: 15, defaultContent: '89%\nPacientes satisfechos\na 12 semanas', style: { fontSize: '18px', textAlign: 'center', fontWeight: 'bold' } },
        { id: 'divider2', type: 'divider', x: 5, y: 41, w: 90, h: 1 },
        { id: 'body', type: 'text', x: 5, y: 44, w: 90, h: 20, defaultContent: 'Resumen de los principales hallazgos del estudio, incluyendo endpoints primarios y secundarios.' },
        { id: 'image', type: 'image', x: 10, y: 66, w: 80, h: 12, defaultContent: 'Gráfico de resultados' },
        { id: 'bullets', type: 'bullets', x: 5, y: 80, w: 90, h: 8, defaultContent: '• Referencia: Autor et al. Journal 2026\n• ClinicalTrials.gov: NCT000000' },
        { id: 'footer', type: 'footer', x: 0, y: 92, w: 100, h: 8, defaultContent: 'Material exclusivo para profesionales de la salud.' },
      ],
    },
  },
  {
    id: 'sys-invitacion',
    name: 'Invitación Evento',
    description: 'Para congresos, webinars o eventos médicos.',
    tags: ['informativo', 'promocional'],
    brandId: null, brandName: null,
    category: 'email',
    thumbnailUrl: '',
    source: 'system',
    tenantId: '__system__',
    createdBy: 'system',
    createdAt: ts, updatedAt: ts,
    style: { colorPrimary: '#9333EA', colorSecondary: '#C084FC', colorBackground: '#FFFFFF', fontTitle: 'Inter', fontBody: 'Inter', variant: 'elegante' },
    layout: {
      width: EMAIL_WIDTH, height: 850,
      blocks: [
        { id: 'logo', type: 'header', x: 0, y: 0, w: 100, h: 8, defaultContent: 'Logo de marca' },
        { id: 'hero', type: 'hero', x: 0, y: 8, w: 100, h: 22, defaultContent: 'Imagen del evento' },
        { id: 'title', type: 'text', x: 8, y: 33, w: 84, h: 8, defaultContent: 'Le invitamos al\nSimposio Internacional 2026', style: { fontSize: '24px', fontWeight: 'bold', textAlign: 'center' } },
        { id: 'info', type: 'text', x: 15, y: 44, w: 70, h: 12, defaultContent: '📅 15 de abril, 2026\n📍 Centro de convenciones, Madrid\n🕐 9:00 - 18:00 h', style: { fontSize: '15px', textAlign: 'center' } },
        { id: 'body', type: 'text', x: 8, y: 58, w: 84, h: 14, defaultContent: 'Únase a líderes de opinión internacionales para discutir los últimos avances en el tratamiento de...' },
        { id: 'cta', type: 'cta', x: 20, y: 75, w: 60, h: 8, defaultContent: 'Confirmar asistencia' },
        { id: 'footer', type: 'footer', x: 0, y: 88, w: 100, h: 12, defaultContent: 'Material exclusivo para profesionales de la salud.' },
      ],
    },
  },

  // ── NEWSLETTER ─────────────────────────────────────────
  {
    id: 'sys-newsletter',
    name: 'Newsletter Médico',
    description: 'Newsletter con múltiples secciones y artículos.',
    tags: ['newsletter', 'informativo'],
    brandId: null, brandName: null,
    category: 'email',
    thumbnailUrl: '',
    source: 'system',
    tenantId: '__system__',
    createdBy: 'system',
    createdAt: ts, updatedAt: ts,
    style: { colorPrimary: '#2563EB', colorSecondary: '#60A5FA', colorBackground: '#F8FAFC', fontTitle: 'Inter', fontBody: 'Inter', variant: 'moderna' },
    layout: {
      width: EMAIL_WIDTH, height: 1100,
      blocks: [
        { id: 'logo', type: 'header', x: 0, y: 0, w: 100, h: 6, defaultContent: 'NEWSLETTER MÉDICO — Marzo 2026' },
        { id: 'hero', type: 'hero', x: 0, y: 6, w: 100, h: 15, defaultContent: 'Imagen de cabecera' },
        { id: 'title1', type: 'text', x: 5, y: 23, w: 90, h: 5, defaultContent: '📰 Artículo Principal', style: { fontSize: '20px', fontWeight: 'bold' } },
        { id: 'body1', type: 'text', x: 5, y: 29, w: 90, h: 12, defaultContent: 'Resumen del artículo principal del newsletter, con los hallazgos más relevantes del mes.' },
        { id: 'cta1', type: 'cta', x: 5, y: 43, w: 40, h: 5, defaultContent: 'Leer más →' },
        { id: 'divider1', type: 'divider', x: 5, y: 50, w: 90, h: 1 },
        { id: 'title2', type: 'text', x: 5, y: 53, w: 90, h: 5, defaultContent: '🔬 Últimas Novedades', style: { fontSize: '18px', fontWeight: 'bold' } },
        { id: 'bullets', type: 'bullets', x: 5, y: 59, w: 90, h: 14, defaultContent: '• Novedad 1: Descripción breve del hallazgo\n• Novedad 2: Resultado de estudio reciente\n• Novedad 3: Actualización de guías clínicas' },
        { id: 'divider2', type: 'divider', x: 5, y: 75, w: 90, h: 1 },
        { id: 'title3', type: 'text', x: 5, y: 78, w: 90, h: 5, defaultContent: '📅 Próximos Eventos', style: { fontSize: '18px', fontWeight: 'bold' } },
        { id: 'body2', type: 'text', x: 5, y: 84, w: 90, h: 8, defaultContent: 'Congreso Anual — 20 de abril, Madrid\nWebinar de Formación — 10 de mayo, Online' },
        { id: 'footer', type: 'footer', x: 0, y: 94, w: 100, h: 6, defaultContent: 'Para darse de baja, haga clic aquí. Material exclusivo para profesionales.' },
      ],
    },
  },
  {
    id: 'sys-newsletter-compacto',
    name: 'Newsletter Compacto',
    description: 'Newsletter corto con 2 secciones. Rápido de leer.',
    tags: ['newsletter', 'simple'],
    brandId: null, brandName: null,
    category: 'email',
    thumbnailUrl: '',
    source: 'system',
    tenantId: '__system__',
    createdBy: 'system',
    createdAt: ts, updatedAt: ts,
    style: { colorPrimary: '#1D4ED8', colorSecondary: '#93C5FD', colorBackground: '#FFFFFF', fontTitle: 'Inter', fontBody: 'Inter', variant: 'minimalista' },
    layout: {
      width: EMAIL_WIDTH, height: 750,
      blocks: [
        { id: 'logo', type: 'header', x: 0, y: 0, w: 100, h: 8, defaultContent: 'Logo de marca' },
        { id: 'title', type: 'text', x: 5, y: 11, w: 90, h: 6, defaultContent: 'Lo más relevante esta semana', style: { fontSize: '22px', fontWeight: 'bold' } },
        { id: 'divider1', type: 'divider', x: 5, y: 18, w: 20, h: 1 },
        { id: 'body1', type: 'text', x: 5, y: 22, w: 90, h: 18, defaultContent: 'Primer tema: descripción breve pero informativa sobre el primer punto relevante de esta edición.' },
        { id: 'image', type: 'image', x: 5, y: 42, w: 90, h: 18, defaultContent: 'Imagen ilustrativa' },
        { id: 'body2', type: 'text', x: 5, y: 62, w: 90, h: 14, defaultContent: 'Segundo tema: información complementaria o novedad adicional para el profesional.' },
        { id: 'cta', type: 'cta', x: 25, y: 79, w: 50, h: 6, defaultContent: 'Ver todo en la web' },
        { id: 'footer', type: 'footer', x: 0, y: 90, w: 100, h: 10, defaultContent: 'Material exclusivo para profesionales de la salud.' },
      ],
    },
  },

  // ── CIENTÍFICO ─────────────────────────────────────────
  {
    id: 'sys-caso-clinico',
    name: 'Caso Clínico',
    description: 'Estructura para presentar un caso clínico paso a paso.',
    tags: ['científico', 'informativo'],
    brandId: null, brandName: null,
    category: 'email',
    thumbnailUrl: '',
    source: 'system',
    tenantId: '__system__',
    createdBy: 'system',
    createdAt: ts, updatedAt: ts,
    style: { colorPrimary: '#0369A1', colorSecondary: '#38BDF8', colorBackground: '#FFFFFF', fontTitle: 'Inter', fontBody: 'Inter', variant: 'cientifica' },
    layout: {
      width: EMAIL_WIDTH, height: 1000,
      blocks: [
        { id: 'logo', type: 'header', x: 0, y: 0, w: 100, h: 7, defaultContent: 'Logo de marca' },
        { id: 'badge', type: 'text', x: 5, y: 9, w: 30, h: 3, defaultContent: 'CASO CLÍNICO', style: { fontSize: '11px', fontWeight: 'bold', color: '#0369A1' } },
        { id: 'title', type: 'text', x: 5, y: 13, w: 90, h: 6, defaultContent: 'Paciente con dolor neuropático refractario', style: { fontSize: '22px', fontWeight: 'bold' } },
        { id: 'divider1', type: 'divider', x: 5, y: 20, w: 90, h: 1 },
        { id: 'historia', type: 'text', x: 5, y: 23, w: 90, h: 5, defaultContent: '📋 Historia clínica', style: { fontSize: '16px', fontWeight: 'bold' } },
        { id: 'body1', type: 'text', x: 5, y: 29, w: 90, h: 12, defaultContent: 'Paciente de 58 años, con antecedentes de diabetes mellitus tipo 2...' },
        { id: 'tratamiento', type: 'text', x: 5, y: 43, w: 90, h: 5, defaultContent: '💊 Tratamiento', style: { fontSize: '16px', fontWeight: 'bold' } },
        { id: 'body2', type: 'text', x: 5, y: 49, w: 90, h: 12, defaultContent: 'Se inició tratamiento con... a dosis de... con titulación progresiva.' },
        { id: 'resultado', type: 'text', x: 5, y: 63, w: 90, h: 5, defaultContent: '📊 Resultado', style: { fontSize: '16px', fontWeight: 'bold' } },
        { id: 'body3', type: 'text', x: 5, y: 69, w: 90, h: 10, defaultContent: 'A las 8 semanas, el paciente reportó una reducción significativa del dolor (EVA de 8 a 3).' },
        { id: 'image', type: 'image', x: 10, y: 81, w: 80, h: 8, defaultContent: 'Gráfico de evolución' },
        { id: 'footer', type: 'footer', x: 0, y: 92, w: 100, h: 8, defaultContent: 'Caso ficticio con fines educativos. Material exclusivo para profesionales.' },
      ],
    },
  },
];

// ── Public API: get system templates ─────────────────────

export function getSystemEmailDesigns(): SystemDesignTemplate[] {
  return SYSTEM_EMAIL_DESIGNS;
}

export function getSystemDesignById(id: string): SystemDesignTemplate | undefined {
  return SYSTEM_EMAIL_DESIGNS.find((d) => d.id === id);
}

export function getSystemDesignsByTag(tag: EmailDesignTag): SystemDesignTemplate[] {
  return SYSTEM_EMAIL_DESIGNS.filter((d) => d.tags.includes(tag));
}

export const ALL_EMAIL_TAGS: { key: EmailDesignTag; label: string; icon: string }[] = [
  { key: 'simple', label: 'Simple', icon: '📝' },
  { key: 'visual', label: 'Visual', icon: '🖼️' },
  { key: 'informativo', label: 'Informativo', icon: '📰' },
  { key: 'promocional', label: 'Promocional', icon: '🎯' },
  { key: 'científico', label: 'Científico', icon: '🔬' },
  { key: 'newsletter', label: 'Newsletter', icon: '📮' },
];

// ═══════════════════════════════════════════════════════════
// Custom templates (Firestore, user-created/imported)
// ═══════════════════════════════════════════════════════════

export async function getCustomDesignTemplates(tenantId: string): Promise<DesignTemplate[]> {
  const q = query(
    collection(db, COLLECTION),
    where('tenantId', '==', tenantId),
    orderBy('createdAt', 'desc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as DesignTemplate);
}

export async function getDesignTemplate(id: string): Promise<DesignTemplate | null> {
  const snap = await getDoc(doc(db, COLLECTION, id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as DesignTemplate;
}

export async function createDesignTemplate(
  data: Omit<DesignTemplate, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<string> {
  const ref = await addDoc(collection(db, COLLECTION), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateDesignTemplate(
  id: string,
  data: Partial<Omit<DesignTemplate, 'id' | 'createdAt'>>,
): Promise<void> {
  await updateDoc(doc(db, COLLECTION, id), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteDesignTemplate(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, id));
}
