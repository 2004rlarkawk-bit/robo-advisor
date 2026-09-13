/**
 * 첫 방문 가이드 투어 — 화면을 어둡게 깔고 실제 메뉴/버튼을 스포트라이트로 하나씩 짚어준다.
 * - 실제 DOM 요소를 텍스트/클래스로 찾아 하이라이트하므로 App.tsx의 요소를 수정할 필요가 없다.
 * - 통관 작업실 단계에서는 메뉴를 자동으로 눌러 작업실로 이동한 뒤, 거래 유형 선택·입력 영역·생성 버튼을 설명한다.
 * - 대상이 화면에 없으면 잠시 기다렸다가(렌더 대기) 그래도 없으면 그 단계는 건너뛴다.
 * - 한 번 보거나 건너뛰면 localStorage에 기억해 다음부터는 뜨지 않는다.
 * - 사용 안내의 [알리미 다시 보기]로 언제든 처음부터 다시 띄울 수 있다(replayOnboardingTour).
 * - 외부 라이브러리 없이 자체 스타일만 사용한다.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

const STORAGE_KEY = 'portai_tour_done_v1';
const REPLAY_EVENT = 'portai:tour-replay';

/** 사용 안내의 [알리미 다시 보기]에서 호출 — 이미 본 사용자도 투어를 처음부터 다시 띄운다. */
export function replayOnboardingTour() {
  window.dispatchEvent(new Event(REPLAY_EVENT));
}

interface Step {
  find: () => HTMLElement | null;
  goto?: () => void; // 이 단계를 보기 전에 실행 (예: 작업실 메뉴로 이동)
  chip: string;
  title: string;
  desc: string;
}

function findMenuByText(text: string): HTMLElement | null {
  const items = Array.from(document.querySelectorAll('.menu-item')) as HTMLElement[];
  return items.find((el) => (el.textContent || '').includes(text)) || null;
}
function findButtonByText(text: string): HTMLElement | null {
  const btns = Array.from(document.querySelectorAll('button')) as HTMLElement[];
  return btns.find((el) => (el.textContent || '').includes(text)) || null;
}
// 입력 영역의 머리(제목줄)를 가리킨다. 폼 전체를 잡으면 스포트라이트가 화면을 다 덮어버린다.
// 수출(화주·포워더)은 "…정보 입력" 제목, 수입은 단계 표시줄을 대상으로 한다.
function findInputArea(): HTMLElement | null {
  const titles = Array.from(document.querySelectorAll('.card-title')) as HTMLElement[];
  const t = titles.find((el) => (el.textContent || '').includes('정보 입력'));
  if (t) return (t.closest('.trade-section-header') as HTMLElement) || t;
  return document.querySelector('.import-steps') as HTMLElement | null;
}
function gotoWorkspace() {
  const menu = findMenuByText('통관 작업실');
  if (menu) menu.click();
}

const STEPS: Step[] = [
  {
    find: () => findMenuByText('통관 작업실'),
    chip: 'STEP 1',
    title: '여기가 메인 작업 공간이에요',
    desc: 'AI 통관 작업실에서 수출·수입 서류 작업을 모두 해요. [다음]을 누르면 작업실로 들어가 볼게요.',
  },
  {
    goto: gotoWorkspace,
    find: () => document.querySelector('.trade-selector-panel') as HTMLElement | null,
    chip: 'STEP 2',
    title: '① 수출·수입과 내 역할 고르기',
    desc: '물건을 보내는지(수출) 들여오는지(수입), 그리고 화주인지 포워더인지 고르면 그에 맞는 화면이 열려요.',
  },
  {
    goto: gotoWorkspace,
    find: findInputArea,
    chip: 'STEP 3',
    title: '② 정보 입력 · 서류 업로드',
    desc: '수출은 거래 정보를 입력하고, 수입은 해외에서 받은 서류 PDF를 올려요. HS CODE는 모르면 비워두세요 — AI가 후보를 추천해요.',
  },
  {
    goto: gotoWorkspace,
    find: () => findButtonByText('필요 서류 자동 생성'),
    chip: 'STEP 4',
    title: '③ 버튼 하나로 서류 자동 생성',
    desc: '이 버튼을 누르면 AI 에이전트가 필요한 서류를 판별하고, 만들고, 통관 규정에 맞는지 검증해요. 작성하다 나가도 작업실 맨 아래 임시보관함에 저장돼요.',
  },
  {
    find: () => findMenuByText('문서 관리'),
    chip: 'STEP 5',
    title: '전송한 거래는 여기 보관돼요',
    desc: '문서를 다시 보거나 내려받을 수 있어요. [새 거래로 복사]를 누르면 지난 거래를 그대로 다시 쓸 수 있어요.',
  },
  {
    find: () => findMenuByText('통관 내역'),
    chip: 'STEP 6',
    title: '통관 진행 상황 확인',
    desc: '수출신고 접수부터 수리·반입·출항까지 지금 어느 단계인지 확인할 수 있어요.',
  },
  {
    find: () => findMenuByText('사용 안내'),
    chip: 'STEP 7',
    title: '언제든 다시 볼 수 있어요',
    desc: '헷갈리면 사용 안내 메뉴에서 수출·수입별 이용 순서를 확인하거나 [알리미 다시 보기]로 이 안내를 다시 볼 수 있어요. 이제 시작해볼까요?',
  },
];

interface Box { left: number; top: number; width: number; height: number; }

export default function OnboardingTour() {
  const [active, setActive] = useState(false);
  const [idx, setIdx] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const [tick, setTick] = useState(0); // 리사이즈/스크롤 시 재계산
  const dirRef = useRef(1); // 마지막 이동 방향 (없는 단계 자동 건너뛰기용)
  const tipRef = useRef<HTMLDivElement>(null);
  const [tipH, setTipH] = useState(200); // 말풍선 실제 높이 — 화면 밖으로 넘치지 않게 위치 보정용

  // 최초 마운트: 이미 봤으면 표시 안 함. 아니면 DOM이 준비된 뒤 시작.
  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY)) return;
    const t = setTimeout(() => {
      if (findMenuByText('통관 작업실')) setActive(true);
    }, 700);
    return () => clearTimeout(t);
  }, []);

  // 다시 보기 요청: 완료 기록과 무관하게 1단계부터 재시작
  useEffect(() => {
    const onReplay = () => {
      dirRef.current = 1;
      setBox(null);
      setIdx(0);
      setActive(true);
    };
    window.addEventListener(REPLAY_EVENT, onReplay);
    return () => window.removeEventListener(REPLAY_EVENT, onReplay);
  }, []);

  // 현재 단계 대상 위치 계산 (필요 시 이동 후 렌더될 때까지 폴링)
  useEffect(() => {
    if (!active) return;
    const step = STEPS[idx];
    if (!step) return;
    step.goto?.();

    let cancelled = false;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout>;
    const locate = () => {
      if (cancelled) return;
      const el = step.find();
      if (el) {
        const r = el.getBoundingClientRect();
        setBox({ left: r.left, top: r.top, width: r.width, height: r.height });
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        return;
      }
      tries += 1;
      if (tries < 14) {
        timer = setTimeout(locate, 150); // 렌더/이동 대기
      } else {
        // 끝내 못 찾으면 진행 방향으로 자동 건너뛰기
        const n = idx + dirRef.current;
        if (n >= 0 && n < STEPS.length) setIdx(n);
        else finish();
      }
    };
    timer = setTimeout(locate, step.goto ? 250 : 0);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [active, idx, tick]);

  useEffect(() => {
    if (!active) return;
    const onMove = () => setTick((n) => n + 1);
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    return () => {
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
    };
  }, [active]);

  const finish = () => {
    localStorage.setItem(STORAGE_KEY, '1');
    setActive(false);
  };
  const go = (dir: number) => {
    dirRef.current = dir;
    const n = idx + dir;
    if (n < 0 || n >= STEPS.length) finish();
    else setIdx(n);
  };

  // 렌더된 말풍선 높이를 측정 (단계마다 문구 길이가 달라 높이도 달라진다)
  useLayoutEffect(() => {
    const h = tipRef.current?.offsetHeight;
    if (h && h !== tipH) setTipH(h);
  });

  if (!active || !box) return null;

  const step = STEPS[idx];
  const PAD = 8;
  const isFirst = idx === 0;
  const isLast = idx === STEPS.length - 1;

  // 말풍선 위치: 대상 오른쪽에 공간이 있으면 오른쪽, 없으면 아래(아래도 모자라면 위).
  // 어느 경우든 화면 세로 범위 안으로 끌어올려 버튼이 잘려 누를 수 없는 일이 없게 한다.
  const TIP_W = 300;
  const EDGE = 16;
  const maxTop = Math.max(EDGE, window.innerHeight - tipH - EDGE);
  const clampTop = (t: number) => Math.min(Math.max(EDGE, t), maxTop);
  const placeRight = box.left + box.width + 20 + TIP_W < window.innerWidth;
  const belowTop = box.top + box.height + PAD + 16;
  const fitsBelow = belowTop + tipH + EDGE <= window.innerHeight;
  const tipStyle: { left: number; top: number } = placeRight
    ? { left: box.left + box.width + PAD + 16, top: clampTop(box.top - 4) }
    : {
      left: Math.max(12, Math.min(box.left, window.innerWidth - TIP_W - 12)),
      top: clampTop(fitsBelow ? belowTop : box.top - PAD - 16 - tipH),
    };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 3000 }}>
      <style>{`
        @keyframes potPop { from { opacity:0; transform:translateY(8px);} to { opacity:1; transform:none;} }
        .pot-tip button { font-family:inherit; }
      `}</style>

      {/* 클릭 차단 레이어 (투어 중 뒤쪽 앱 클릭 방지, 클릭 시 다음 단계) */}
      <div style={{ position: 'fixed', inset: 0, background: 'transparent' }} onClick={() => go(1)} />

      {/* 스포트라이트 (구멍 + 바깥 어둡게) */}
      <div
        style={{
          position: 'fixed',
          left: box.left - PAD,
          top: box.top - PAD,
          width: box.width + PAD * 2,
          height: box.height + PAD * 2,
          borderRadius: 12,
          boxShadow: '0 0 0 9999px rgba(15,23,42,0.62)',
          outline: '3px solid #fff',
          outlineOffset: 2,
          pointerEvents: 'none',
          transition: 'all .3s cubic-bezier(.4,0,.2,1)',
        }}
      />

      {/* 말풍선 */}
      <div
        ref={tipRef}
        className="pot-tip"
        style={{
          position: 'fixed',
          width: TIP_W,
          background: '#fff',
          borderRadius: 14,
          padding: '18px 18px 14px',
          boxShadow: '0 20px 45px -15px rgba(15,23,42,0.5)',
          animation: 'potPop .25s ease',
          ...tipStyle,
        }}
      >
        <button
          onClick={finish}
          style={{ position: 'absolute', top: 12, right: 13, border: 'none', background: 'none', color: '#94a3b8', fontSize: 12, cursor: 'pointer' }}
        >
          건너뛰기 ✕
        </button>
        <span style={{ display: 'inline-block', fontSize: 11, fontWeight: 800, color: '#0b57d0', background: '#e8f0fe', padding: '3px 9px', borderRadius: 999, marginBottom: 9 }}>
          {step.chip}
        </span>
        <h3 style={{ fontSize: 15.5, fontWeight: 800, margin: '0 0 6px', color: '#1e293b' }}>{step.title}</h3>
        <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 14px', lineHeight: 1.55 }}>{step.desc}</p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 12, color: '#94a3b8' }}>{idx + 1} / {STEPS.length}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            {!isFirst && (
              <button onClick={() => go(-1)} style={{ fontSize: 13, fontWeight: 700, border: 'none', background: '#f1f5f9', color: '#64748b', padding: '8px 14px', borderRadius: 8, cursor: 'pointer' }}>
                이전
              </button>
            )}
            <button onClick={() => go(1)} style={{ fontSize: 13, fontWeight: 700, border: 'none', background: '#0b57d0', color: '#fff', padding: '8px 16px', borderRadius: 8, cursor: 'pointer' }}>
              {isLast ? '완료' : '다음 →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
