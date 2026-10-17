import type { LocalAuthRole } from '@/services/auth/auth-types';

const roleRank: Record<LocalAuthRole, number> = {
  viewer: 0,
  operator: 1,
  admin: 2,
};

export function hasMinimumRole(role: LocalAuthRole, minimum: LocalAuthRole): boolean {
  return roleRank[role] >= roleRank[minimum];
}

export function canWriteData(role: LocalAuthRole): boolean {
  return hasMinimumRole(role, 'operator');
}

export function canOperateTickets(role: LocalAuthRole): boolean {
  return hasMinimumRole(role, 'operator');
}

export function canTestGlpi(role: LocalAuthRole): boolean {
  return hasMinimumRole(role, 'admin');
}

export function roleLabel(role: LocalAuthRole): string {
  return {
    viewer: 'Visualização',
    operator: 'Operação',
    admin: 'Administrador',
  }[role];
}
