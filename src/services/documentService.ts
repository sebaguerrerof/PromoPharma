import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore';
import {
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';
import { db, storage } from '../firebase/config';
import type { ScientificDocument, DocumentStatus } from '../types';

const DOCUMENTS = 'documents';

// ── Queries ─────────────────────────────────────────────

export async function getDocuments(indicationId: string): Promise<ScientificDocument[]> {
  const q = query(
    collection(db, DOCUMENTS),
    where('indicationId', '==', indicationId)
  );
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as ScientificDocument)
    .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
}

// ── Upload ──────────────────────────────────────────────

export interface UploadProgress {
  percent: number;
  status: 'uploading' | 'done' | 'error';
}

export async function uploadDocument(
  file: File,
  meta: {
    indicationId: string;
    moleculeId: string;
    tenantId: string;
    createdBy: string;
  },
  onProgress?: (p: UploadProgress) => void
): Promise<string> {
  const storagePath = `tenants/${meta.tenantId}/documents/${meta.moleculeId}/${meta.indicationId}/${Date.now()}_${file.name}`;
  const storageRef = ref(storage, storagePath);

  // 1. Subir archivo a Storage
  const task = uploadBytesResumable(storageRef, file);

  await new Promise<void>((resolve, reject) => {
    task.on(
      'state_changed',
      (snap) => {
        const percent = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
        onProgress?.({ percent, status: 'uploading' });
      },
      (err) => {
        onProgress?.({ percent: 0, status: 'error' });
        reject(err);
      },
      () => {
        onProgress?.({ percent: 100, status: 'done' });
        resolve();
      }
    );
  });

  // 2. Obtener URL de descarga
  const downloadUrl = await getDownloadURL(storageRef);

  // 3. Crear registro en Firestore
  const docRef = await addDoc(collection(db, DOCUMENTS), {
    indicationId: meta.indicationId,
    moleculeId: meta.moleculeId,
    tenantId: meta.tenantId,
    fileName: file.name,
    storagePath,
    downloadUrl,
    sizeBytes: file.size,
    mimeType: file.type || 'application/pdf',
    status: 'processed' as DocumentStatus, // TODO: cambiar a 'processing' cuando haya pipeline S1
    createdBy: meta.createdBy,
    createdAt: serverTimestamp(),
  });

  return docRef.id;
}

// ── Update status ───────────────────────────────────────

export async function updateDocumentStatus(
  id: string,
  status: DocumentStatus
): Promise<void> {
  await updateDoc(doc(db, DOCUMENTS, id), { status });
}

// ── Delete ──────────────────────────────────────────────

export async function deleteDocument(document: ScientificDocument): Promise<void> {
  // Borrar de Storage
  try {
    const storageRef = ref(storage, document.storagePath);
    await deleteObject(storageRef);
  } catch {
    // Si el archivo no existe en Storage, igual borramos el registro
  }
  // Borrar registro Firestore
  await deleteDoc(doc(db, DOCUMENTS, document.id));
}
