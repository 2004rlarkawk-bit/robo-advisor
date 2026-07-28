import type { ServiceRole } from '../services/profileService';

// 2026-07-23 편의성 업그레이드: 회원 역할에 따른 통관 작업 화면 분기
export type WorkspaceRole = 'shipper' | 'forwarder';

export function resolveWorkspaceRole(
  serviceRole: ServiceRole | null | undefined,
  integratedWorkspaceRole: WorkspaceRole,
): WorkspaceRole {
  if (serviceRole === 'shipper' || serviceRole === 'forwarder') return serviceRole;
  return integratedWorkspaceRole;
}
