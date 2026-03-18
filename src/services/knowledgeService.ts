import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  query,
  where,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/firebase/config';
import type { KnowledgeItem, KnowledgeItemType, KnowledgeScope } from '@/types';

const COLLECTION = 'knowledgeBank';

// ── CRUD ────────────────────────────────────────────────

export async function createKnowledgeItem(
  data: Omit<KnowledgeItem, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<string> {
  const ref = await addDoc(collection(db, COLLECTION), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateKnowledgeItem(
  id: string,
  data: Partial<Pick<KnowledgeItem, 'title' | 'description' | 'type' | 'content' | 'tags' | 'fileUrls' | 'fileNames'>>,
): Promise<void> {
  await updateDoc(doc(db, COLLECTION, id), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteKnowledgeItem(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, id));
}

// ── Queries ─────────────────────────────────────────────

/** Obtiene todos los items globales del tenant */
export async function getGlobalKnowledge(tenantId: string): Promise<KnowledgeItem[]> {
  const q = query(
    collection(db, COLLECTION),
    where('tenantId', '==', tenantId),
    where('scope', '==', 'global' as KnowledgeScope),
  );
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as KnowledgeItem))
    .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
}

/** Obtiene items específicos de una marca */
export async function getBrandKnowledge(tenantId: string, brandId: string): Promise<KnowledgeItem[]> {
  const q = query(
    collection(db, COLLECTION),
    where('tenantId', '==', tenantId),
    where('brandId', '==', brandId),
  );
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as KnowledgeItem))
    .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
}

/** Obtiene TODOS los items relevantes para una marca (global + específicos de la marca) */
export async function getKnowledgeForBrand(tenantId: string, brandId: string): Promise<KnowledgeItem[]> {
  const [global, brand] = await Promise.all([
    getGlobalKnowledge(tenantId),
    getBrandKnowledge(tenantId, brandId),
  ]);
  return [...global, ...brand];
}

/** Obtiene TODOS los items del tenant */
export async function getAllKnowledge(tenantId: string): Promise<KnowledgeItem[]> {
  const q = query(
    collection(db, COLLECTION),
    where('tenantId', '==', tenantId),
  );
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as KnowledgeItem))
    .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
}

/** Filtra items por tipo */
export function filterByType(items: KnowledgeItem[], type: KnowledgeItemType): KnowledgeItem[] {
  return items.filter((i) => i.type === type);
}
