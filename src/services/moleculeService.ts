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
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import type { Molecule, Indication } from '../types';

const MOLECULES = 'molecules';
const INDICATIONS = 'indications';

// ── Moléculas ───────────────────────────────────────────

export async function getMolecules(tenantId: string): Promise<Molecule[]> {
  const q = query(
    collection(db, MOLECULES),
    where('tenantId', '==', tenantId)
  );
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as Molecule)
    .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
}

export async function getMolecule(id: string): Promise<Molecule | null> {
  const snap = await getDoc(doc(db, MOLECULES, id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Molecule;
}

export async function createMolecule(
  data: Pick<Molecule, 'name' | 'tenantId' | 'createdBy'>
): Promise<string> {
  const ref = await addDoc(collection(db, MOLECULES), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateMolecule(
  id: string,
  data: Partial<Pick<Molecule, 'name'>>
): Promise<void> {
  await updateDoc(doc(db, MOLECULES, id), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteMolecule(id: string): Promise<void> {
  await deleteDoc(doc(db, MOLECULES, id));
}

// ── Indicaciones ────────────────────────────────────────

export async function getIndications(moleculeId: string): Promise<Indication[]> {
  const q = query(
    collection(db, INDICATIONS),
    where('moleculeId', '==', moleculeId)
  );
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as Indication)
    .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
}

export async function createIndication(
  data: Pick<Indication, 'name' | 'moleculeId' | 'tenantId' | 'createdBy'>
): Promise<string> {
  const ref = await addDoc(collection(db, INDICATIONS), {
    ...data,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateIndication(
  id: string,
  data: Partial<Pick<Indication, 'name' | 'benefits'>>
): Promise<void> {
  await updateDoc(doc(db, INDICATIONS, id), {
    ...data,
  });
}

export async function deleteIndication(id: string): Promise<void> {
  await deleteDoc(doc(db, INDICATIONS, id));
}
