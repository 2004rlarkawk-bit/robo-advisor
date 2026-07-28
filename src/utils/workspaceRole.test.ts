import { describe, expect, it } from 'vitest';
import { resolveWorkspaceRole } from './workspaceRole';

describe('통관 작업 역할 분기', () => {
  it('화주 회원은 화주 작업 역할로 고정한다', () => {
    expect(resolveWorkspaceRole('shipper', 'forwarder')).toBe('shipper');
  });

  it('포워더 회원은 포워더 작업 역할로 고정한다', () => {
    expect(resolveWorkspaceRole('forwarder', 'shipper')).toBe('forwarder');
  });

  it('통합 회원은 현재 선택한 작업 역할을 사용한다', () => {
    expect(resolveWorkspaceRole('integrated', 'shipper')).toBe('shipper');
    expect(resolveWorkspaceRole('integrated', 'forwarder')).toBe('forwarder');
  });
});
