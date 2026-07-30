import { describe, expect, it } from 'vitest';
import {
  defaultWorkspaceSession,
  parseWorkspaceSession,
} from './workspaceSessionService';

describe('현재 화면 session 복원', () => {
  it('상위 탭, direction/role, step, 선택 거래를 복원한다', () => {
    expect(parseWorkspaceSession(JSON.stringify({
      userId: 'user-a',
      activeMenu: 'docs',
      direction: 'import',
      role: 'forwarder',
      currentStep: 3,
      selectedTradeId: 'trade-1',
    }), 'user-a')).toEqual({
      userId: 'user-a',
      activeMenu: 'docs',
      direction: 'import',
      role: 'forwarder',
      currentStep: 3,
      selectedTradeId: 'trade-1',
    });
  });

  it('잘못된 enum과 step은 안전한 기본값으로 대체한다', () => {
    expect(parseWorkspaceSession(JSON.stringify({
      userId: 'user-a',
      activeMenu: 'admin',
      direction: 'domestic',
      role: 'owner',
      currentStep: 999,
      selectedTradeId: 123,
    }), 'user-a')).toEqual(defaultWorkspaceSession('user-a'));
  });

  it('다른 사용자 상태와 손상 JSON은 보호 화면을 복원하지 않는다', () => {
    const otherUser = JSON.stringify({
      userId: 'user-b',
      activeMenu: 'dashboard',
      direction: 'import',
      role: 'forwarder',
      currentStep: 3,
      selectedTradeId: 'trade-b',
    });
    expect(parseWorkspaceSession(otherUser, 'user-a')).toEqual(defaultWorkspaceSession('user-a'));
    expect(parseWorkspaceSession('{broken', 'user-a')).toEqual(defaultWorkspaceSession('user-a'));
  });
});
