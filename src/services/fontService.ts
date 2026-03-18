/**
 * Servicio para cargar fuentes de Google Fonts dinámicamente.
 * Mantiene un registro de fuentes ya cargadas para evitar duplicados.
 */

const loadedFonts = new Set<string>();

// Fuentes del sistema que NO necesitan Google Fonts
const SYSTEM_FONTS = new Set([
  'Arial',
  'Calibri',
  'Garamond',
  'Georgia',
  'Helvetica',
  'Times New Roman',
  'Trebuchet MS',
  'Verdana',
  'inherit',
  '',
]);

/**
 * Lista de fuentes disponibles (Google Fonts + sistema).
 * Las de sistema se muestran pero no se cargan de Google.
 */
export const AVAILABLE_FONTS = [
  'Arial',
  'Bebas Neue',
  'Calibri',
  'DM Sans',
  'Garamond',
  'Georgia',
  'Helvetica',
  'Inter',
  'Lato',
  'Merriweather',
  'Montserrat',
  'Nunito',
  'Open Sans',
  'Oswald',
  'Playfair Display',
  'Poppins',
  'PT Sans',
  'Raleway',
  'Roboto',
  'Roboto Condensed',
  'Roboto Slab',
  'Source Sans 3',
  'Times New Roman',
  'Trebuchet MS',
  'Ubuntu',
  'Verdana',
  'Work Sans',
] as const;

/**
 * Carga una fuente de Google Fonts inyectando un <link> en el <head>.
 * Si la fuente ya fue cargada o es del sistema, no hace nada.
 */
export function loadGoogleFont(fontName: string): void {
  if (!fontName || SYSTEM_FONTS.has(fontName) || loadedFonts.has(fontName)) return;

  loadedFonts.add(fontName);

  const encodedName = fontName.replace(/ /g, '+');
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${encodedName}:wght@300;400;500;600;700;800&display=swap`;
  document.head.appendChild(link);
}

/**
 * Carga múltiples fuentes a la vez.
 */
export function loadGoogleFonts(fontNames: string[]): void {
  for (const name of fontNames) {
    if (name) loadGoogleFont(name);
  }
}
