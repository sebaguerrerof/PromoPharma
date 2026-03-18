import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from '@/firebase/config';

/**
 * Convierte un data URL base64 a un Blob.
 */
function base64ToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(',');
  const mime = header.match(/:(.*?);/)?.[1] ?? 'image/png';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

/**
 * Sube una imagen base64 a Firebase Storage y retorna la URL pública.
 * @param sessionId ID de la sesión de generación
 * @param slotId ID del slot de imagen
 * @param dataUrl La imagen en formato data:image/...;base64,...
 */
export async function uploadGeneratedImage(
  sessionId: string,
  slotId: string,
  dataUrl: string,
): Promise<string> {
  const blob = base64ToBlob(dataUrl);
  const ext = blob.type === 'image/jpeg' ? 'jpg' : 'png';
  const path = `sessions/${sessionId}/${slotId}_${Date.now()}.${ext}`;
  const storageRef = ref(storage, path);
  const snapshot = await uploadBytes(storageRef, blob);
  return getDownloadURL(snapshot.ref);
}

/**
 * Sube un archivo a Firebase Storage y retorna la URL pública.
 * @param file Archivo a subir
 * @param path Ruta en Storage (ej: "brands/abc123/logo.png")
 */
export async function uploadFile(file: File, path: string): Promise<string> {
  const storageRef = ref(storage, path);
  const snapshot = await uploadBytes(storageRef, file);
  return getDownloadURL(snapshot.ref);
}

/**
 * Sube un Blob a Firebase Storage y retorna la URL pública.
 */
export async function uploadBlob(blob: Blob, path: string): Promise<string> {
  const storageRef = ref(storage, path);
  const snapshot = await uploadBytes(storageRef, blob);
  return getDownloadURL(snapshot.ref);
}

/**
 * Sube el logo de una marca.
 */
export async function uploadBrandLogo(brandId: string, file: File): Promise<string> {
  const ext = file.name.split('.').pop() ?? 'png';
  const path = `brands/${brandId}/logo.${ext}`;
  return uploadFile(file, path);
}

/**
 * Sube un asset (imagen extra) de una marca.
 */
export async function uploadBrandAsset(brandId: string, file: File): Promise<string> {
  const timestamp = Date.now();
  const ext = file.name.split('.').pop() ?? 'png';
  const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
  const path = `brands/${brandId}/assets/${timestamp}_${safeName}`;
  return uploadFile(file, path);
}

/**
 * Elimina un archivo de Storage por su URL.
 */
export async function deleteFileByUrl(url: string): Promise<void> {
  try {
    const storageRef = ref(storage, url);
    await deleteObject(storageRef);
  } catch {
    // Si el archivo ya no existe, ignorar
  }
}
