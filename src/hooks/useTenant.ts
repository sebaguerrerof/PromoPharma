import { useAuth } from './useAuth';

/**
 * Devuelve el tenantId del usuario autenticado.
 * Por ahora usa el UID del usuario como tenant (single-tenant personal).
 * Cuando se implemente multi-tenancy real, se leerá de los custom claims
 * del token o de un documento /users/{uid}.tenantId en Firestore.
 */
export function useTenant(): string {
  const { user } = useAuth();
  // Cada usuario es su propio tenant hasta implementar multi-tenancy
  return user?.uid ?? 'anonymous';
}
