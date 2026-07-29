/**
 * 서비스 소개(About) — 다크 바다 히어로 + 스크롤 스토리텔링 랜딩.
 * 1) 히어로: 캔버스(화물선·항로 아크·수면·지도 점·입자) 애니메이션 — aboutHero.css(.portai-hero 스코프).
 *    작업실 진입 CTA는 히어로에 두지 않는다(페이지 하단 CTA로 단일화).
 * 2) 이하 섹션: 숫자 카운터·작동 방식·6종 서류·CTA — IntersectionObserver로 진입 시 fade-in.
 * 외부 이미지/라이브러리 없이 canvas 2D·CSS·lucide 아이콘만 사용.
 * prefers-reduced-motion 시 캔버스는 정지 프레임 1장만 렌더한다.
 */
import { useEffect, useRef, useState } from 'react';
import {
  FileSignature,
  ShieldCheck,
  Sparkles
} from 'lucide-react';
import '../styles/aboutHero.css';

interface Props {
  /** CTA 클릭 시 통관 작업실로 이동 */
  onStart: () => void;
}

/**
 * 화면 진입 시 0부터 end까지 카운트업합니다.
 *
 * - 애니메이션 시간: 1.5초
 * - 마운트 시 이미 화면에 보이면 즉시 시작
 * - IntersectionObserver를 사용할 수 없으면 즉시 시작
 * - 감지 오류가 발생해도 3초 후에는 반드시 시작
 */
function CountUpValue({ end }: { end: number }) {
  const [value, setValue] = useState(0);
  const spanRef = useRef<HTMLSpanElement>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    let animationFrameId = 0;
    let observer: IntersectionObserver | null = null;

    const startCountUp = () => {
      // 중복 실행 방지
      if (startedRef.current) {
        return;
      }

      startedRef.current = true;

      const startedAt = performance.now();

      const tick = (currentTime: number) => {
        const progress = Math.min(
          (currentTime - startedAt) / 1500,
          1
        );

        // ease-out cubic
        const easedProgress =
          1 - Math.pow(1 - progress, 3);

        setValue(
          Math.round(end * easedProgress)
        );

        if (progress < 1) {
          animationFrameId =
            requestAnimationFrame(tick);
        }
      };

      animationFrameId =
        requestAnimationFrame(tick);
    };

    const element = spanRef.current;

    if (
      element &&
      typeof IntersectionObserver !== 'undefined'
    ) {
      const rect =
        element.getBoundingClientRect();

      const isAlreadyVisible =
        rect.top < window.innerHeight &&
        rect.bottom > 0;

      if (isAlreadyVisible) {
        startCountUp();
      } else {
        observer = new IntersectionObserver(
          entries => {
            const isVisible = entries.some(
              entry => entry.isIntersecting
            );

            if (!isVisible) {
              return;
            }

            startCountUp();
            observer?.disconnect();
          },
          {
            threshold: 0.1
          }
        );

        observer.observe(element);
      }
    } else {
      startCountUp();
    }

    /*
     * IntersectionObserver가 브라우저 환경이나 렌더링 시점 문제로
     * 정상 작동하지 않더라도 숫자가 계속 0으로 남지 않도록 합니다.
     */
    const safetyTimer = window.setTimeout(
      startCountUp,
      3000
    );

    return () => {
      cancelAnimationFrame(animationFrameId);
      observer?.disconnect();
      window.clearTimeout(safetyTimer);
    };
  }, [end]);

  return (
    <span ref={spanRef}>
      {value.toLocaleString()}
    </span>
  );
}

const STEPS = [
  {
    icon: <FileSignature size={28} />,
    title: '① 거래 정보 입력',
    desc:
      '품목·항구·거래조건만 입력하세요. 서류 탭이 필요한 항목만 보여주고, 나머지는 AI가 채웁니다.'
  },
  {
    icon: <ShieldCheck size={28} />,
    title: '② AI 검증 & HS코드 추천',
    desc:
      '관세청 사전 기반으로 HS코드를 추천하고, 관세법 근거와 함께 오류·누락을 짚어냅니다.'
  },
  {
    icon: <Sparkles size={28} />,
    title: '③ 문서 자동 생성',
    desc:
      '통관·선적에 필요한 서류를 실무 표준 서식으로 한 번에 만들어 미리보기·다운로드합니다.'
  }
];

const DOCS = [
  {
    icon: 'INV',
    name: '상업송장',
    desc:
      'Commercial Invoice — 거래 금액·조건의 기준 서류'
  },
  {
    icon: 'PKL',
    name: '패킹리스트',
    desc:
      'Packing List — 수량·중량·포장 명세'
  },
  {
    icon: 'B/L',
    name: '선하증권',
    desc:
      'Bill of Lading — 해상 운송 계약의 증거'
  },
  {
    icon: 'DEC',
    name: '수출입신고서',
    desc:
      '관세청 신고용 — 과세가격·관세 자동 계산'
  },
  {
    icon: 'C/O',
    name: '원산지증명서',
    desc:
      'Certificate of Origin — FTA 특혜 관세의 근거'
  },
  {
    icon: 'INS',
    name: '적하보험증권',
    desc:
      'Insurance Policy — CIF 조건 필수 서류'
  }
];

export default function AboutPanel({
  onStart
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // ── 히어로 캔버스 애니메이션 (다크 바다 테마) ──────────────
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;

    const reduce = matchMedia('(prefers-reduced-motion:reduce)').matches;
    let W = 0, H = 0;
    let raf = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = cv.clientWidth;
      H = cv.clientHeight;
      cv.width = W * dpr;
      cv.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const nodes = [
      { x: .16, y: .30 }, { x: .30, y: .20 }, { x: .24, y: .44 },
      { x: .40, y: .34 }, { x: .11, y: .52 }, { x: .36, y: .56 },
    ];
    const arcs: [number, number][] = [[0, 3], [1, 3], [4, 2], [2, 5], [3, 5]];

    const dots: { x: number; y: number; p: number; a: number }[] = [];
    for (let i = 0; i < 440; i++) {
      const x = Math.pow(Math.random(), 1.7) * 0.52;
      const y = 0.12 + Math.random() * 0.62;
      const edge = 1 - x / 0.52;
      if (Math.random() > edge * edge * 0.9 + 0.06) continue;
      dots.push({ x, y, p: Math.random() * Math.PI * 2, a: 0.15 + Math.random() * 0.5 * edge });
    }

    const parts: { x: number; y: number; s: number; ph: number }[] = [];
    for (let i = 0; i < 46; i++) {
      parts.push({ x: Math.random(), y: 0.5 + Math.random() * 0.5, s: 0.2 + Math.random() * 0.8, ph: Math.random() * 6.28 });
    }

    const bez = (a: { x: number; y: number }, b: { x: number; y: number }) => {
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2 - 0.10 - Math.abs(a.x - b.x) * 0.18;
      return { mx, my };
    };

    const drawMap = (t: number) => {
      for (const d of dots) {
        const tw = 0.6 + 0.4 * Math.sin(t * 0.0012 + d.p);
        ctx.fillStyle = `rgba(120,175,255,${(d.a * tw).toFixed(3)})`;
        ctx.beginPath(); ctx.arc(d.x * W, d.y * H, 1.35, 0, 6.283); ctx.fill();
      }
      for (const n of nodes) {
        const px = n.x * W, py = n.y * H;
        const g = ctx.createRadialGradient(px, py, 0, px, py, 10);
        g.addColorStop(0, 'rgba(99,210,255,.9)'); g.addColorStop(1, 'rgba(99,210,255,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, 10, 0, 6.283); ctx.fill();
        ctx.fillStyle = '#CFEBFF'; ctx.beginPath(); ctx.arc(px, py, 1.9, 0, 6.283); ctx.fill();
      }
    };

    const drawArcs = (t: number) => {
      ctx.lineWidth = 1;
      arcs.forEach((seg, i) => {
        const a = nodes[seg[0]], b = nodes[seg[1]];
        const c = bez(a, b);
        const ax = a.x * W, ay = a.y * H, bx = b.x * W, by = b.y * H, mx = c.mx * W, my = c.my * H;
        ctx.strokeStyle = 'rgba(90,150,240,.28)';
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo(mx, my, bx, by); ctx.stroke();
        const prog = ((t * 0.00016 + i * 0.27) % 1);
        const u = prog, iu = 1 - u;
        const qx = iu * iu * ax + 2 * iu * u * mx + u * u * bx;
        const qy = iu * iu * ay + 2 * iu * u * my + u * u * by;
        const g = ctx.createRadialGradient(qx, qy, 0, qx, qy, 7);
        g.addColorStop(0, 'rgba(150,225,255,.95)'); g.addColorStop(1, 'rgba(150,225,255,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(qx, qy, 7, 0, 6.283); ctx.fill();
      });
    };

    const drawWater = (t: number) => {
      const hy = H * 0.80;
      const g = ctx.createLinearGradient(0, hy - 60, 0, hy + 70);
      g.addColorStop(0, 'rgba(60,130,230,0)'); g.addColorStop(.5, 'rgba(70,150,255,.16)'); g.addColorStop(1, 'rgba(30,70,140,0)');
      ctx.fillStyle = g; ctx.fillRect(0, hy - 60, W, 130);
      const cg = ctx.createLinearGradient(W * 0.2, 0, W * 0.95, 0);
      cg.addColorStop(0, 'rgba(99,210,255,0)'); cg.addColorStop(.5, `rgba(120,215,255,${0.28 + 0.06 * Math.sin(t * 0.002)})`); cg.addColorStop(1, 'rgba(99,210,255,0)');
      ctx.fillStyle = cg; ctx.fillRect(0, hy - 1, W, 2.2);
      ctx.strokeStyle = 'rgba(150,205,255,.10)'; ctx.lineWidth = 1;
      for (let i = 0; i < 26; i++) {
        const x = (i / 26) * W + Math.sin(t * 0.001 + i) * 6;
        const y = hy + 8 + (i % 4) * 7;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 14, y); ctx.stroke();
      }
    };

    const drawShip = () => {
      const s = Math.min(W, 1400) / 1400;
      const baseX = W * 0.62, baseY = H * 0.80;
      ctx.save(); ctx.translate(baseX, baseY); ctx.scale(s, s);
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(130,180,255,.55)'; ctx.shadowColor = 'rgba(79,155,255,.55)'; ctx.shadowBlur = 14; ctx.lineWidth = 1.6;
      ctx.save(); ctx.strokeStyle = 'rgba(120,170,255,.42)'; ctx.shadowBlur = 10;
      for (let k = 0; k < 2; k++) {
        const gx = 40 + k * 150;
        ctx.beginPath();
        ctx.moveTo(gx, 0); ctx.lineTo(gx, -190);
        ctx.moveTo(gx + 70, 0); ctx.lineTo(gx + 70, -190);
        ctx.moveTo(gx - 30, -190); ctx.lineTo(gx + 150, -190);
        ctx.lineTo(gx + 150, -165); ctx.lineTo(gx - 30, -165); ctx.closePath();
        ctx.moveTo(gx, -190); ctx.lineTo(gx + 35, -215); ctx.lineTo(gx + 70, -190);
        ctx.stroke();
      }
      ctx.restore();
      ctx.beginPath(); ctx.moveTo(-260, 0); ctx.lineTo(300, 0); ctx.lineTo(268, 54); ctx.lineTo(-210, 54); ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-250, -2); ctx.lineTo(300, -2); ctx.stroke();
      ctx.save(); ctx.strokeStyle = 'rgba(140,190,255,.5)'; ctx.shadowBlur = 8; ctx.lineWidth = 1.3;
      const cw = 34, ch = 18, cols = 13, x0 = -235, y0 = -6;
      const heights = [3, 4, 4, 5, 4, 5, 4, 4, 3, 4, 3, 2, 2];
      for (let c = 0; c < cols; c++) {
        const h = heights[c];
        for (let r = 0; r < h; r++) ctx.strokeRect(x0 + c * cw, y0 - (r + 1) * ch, cw - 3, ch - 3);
      }
      ctx.restore();
      ctx.beginPath(); ctx.rect(215, -70, 58, 64);
      ctx.moveTo(224, -70); ctx.lineTo(224, -92); ctx.lineTo(250, -92); ctx.lineTo(250, -70); ctx.stroke();
      ctx.save(); ctx.strokeStyle = 'rgba(150,210,255,.6)'; ctx.shadowBlur = 6; ctx.lineWidth = 1;
      for (let r = 0; r < 3; r++) { ctx.beginPath(); ctx.moveTo(221, -60 + r * 16); ctx.lineTo(267, -60 + r * 16); ctx.stroke(); }
      ctx.restore();
      ctx.save(); ctx.shadowBlur = 0; ctx.globalAlpha = .5;
      const rg = ctx.createLinearGradient(0, 56, 0, 120);
      rg.addColorStop(0, 'rgba(90,160,255,.22)'); rg.addColorStop(1, 'rgba(90,160,255,0)');
      ctx.fillStyle = rg; ctx.fillRect(-230, 56, 540, 60);
      ctx.restore();
      ctx.restore();
    };

    const drawParts = (t: number) => {
      ctx.fillStyle = 'rgba(150,205,255,.5)';
      for (const p of parts) {
        const a = 0.25 + 0.35 * Math.sin(t * 0.0015 + p.ph);
        ctx.globalAlpha = Math.max(0, a);
        ctx.beginPath(); ctx.arc(p.x * W, (p.y + 0.02 * Math.sin(t * 0.0006 + p.ph)) * H, p.s, 0, 6.283); ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    const frame = (t: number) => {
      ctx.clearRect(0, 0, W, H);
      drawMap(t); drawArcs(t); drawWater(t); drawShip(); drawParts(t);
      if (!reduce) raf = requestAnimationFrame(frame);
    };

    window.addEventListener('resize', resize);
    resize();
    if (reduce) frame(1200);
    else raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  // ── 스크롤 진입 reveal (히어로 아래 섹션) ─────────────────
  useEffect(() => {
    /*
     * 다른 탭에서 아래로 스크롤한 상태로 소개 페이지에 진입해도
     * 항상 히어로 영역부터 보여주도록 초기화합니다.
     */
    window.scrollTo({
      top: 0,
      left: 0,
      behavior: 'auto'
    });

    const root = rootRef.current;

    if (!root) {
      return;
    }

    /*
     * IntersectionObserver를 지원하지 않는 환경에서는
     * 모든 요소를 바로 표시합니다.
     */
    if (
      typeof IntersectionObserver === 'undefined'
    ) {
      root
        .querySelectorAll('.about-reveal')
        .forEach(element => {
          element.classList.add('in-view');
        });

      return;
    }

    const observer =
      new IntersectionObserver(
        entries => {
          entries.forEach(entry => {
            if (!entry.isIntersecting) {
              return;
            }

            entry.target.classList.add(
              'in-view'
            );

            /*
             * 한 번 나타난 요소는 다시 감지할 필요가 없으므로
             * 관찰 대상에서 제거합니다.
             */
            observer.unobserve(
              entry.target
            );
          });
        },
        {
          threshold: 0.15
        }
      );

    const revealElements =
      root.querySelectorAll(
        '.about-reveal'
      );

    revealElements.forEach(element => {
      const rect =
        element.getBoundingClientRect();

      const isAlreadyVisible =
        rect.top < window.innerHeight &&
        rect.bottom > 0;

      /*
       * 마운트 당시 이미 화면 안에 있는 요소는
       * observer 콜백을 기다리지 않고 즉시 표시합니다.
       */
      if (isAlreadyVisible) {
        element.classList.add('in-view');
      } else {
        observer.observe(element);
      }
    });

    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <div
      className="about-page"
      ref={rootRef}
    >
      {/* 1. 히어로 — 다크 바다 캔버스. 작업실 CTA는 하단 섹션으로 단일화해 여기엔 두지 않는다. */}
      <div className="portai-hero">
        <canvas ref={canvasRef} className="portai-hero-canvas" />
        <div className="portai-hero-inner">
          <div className="ah-brand ah-rise ah-d1">
            <svg viewBox="0 0 48 48" aria-hidden="true" fill="none">
              <path d="M24 6l7 8H17l7-8z" fill="#4E9BFF" />
              <rect x="22.4" y="12" width="3.2" height="13" rx="1" fill="#8FC0FF" />
              <path d="M9 27h30l-3.4 9.5a5 5 0 0 1-4.7 3.3H17.1a5 5 0 0 1-4.7-3.3L9 27z" fill="#2F80F0" />
              <path d="M9 27h30" stroke="#BFE0FF" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            <span className="ah-wordmark">Port<b>AI</b></span>
          </div>
          <h1 className="ah-rise ah-d2">복잡한 통관 문서,<br /><span className="ah-ai">AI</span>로 빠르고 정확하게.</h1>
          <p className="ah-sub ah-rise ah-d3">스마트 물류 · 통관 자동화 플랫폼</p>
          <p className="ah-micro ah-rise ah-d4">AI가 문서를 이해하고, 리스크를 예측하며, 통관 업무를 자동화합니다.</p>
          <div className="ah-chips ah-rise ah-d5">
            <span className="ah-chip"><i />상업송장·패킹리스트 자동 생성</span>
            <span className="ah-chip"><i />관세·환율 실시간 환산</span>
            <span className="ah-chip"><i />규정 리스크 사전 점검</span>
          </div>
        </div>
      </div>

      {/* 2. 숫자 카운터 */}
      <section className="about-counters about-reveal">
        <div className="about-counter">
          <div className="about-counter-value">
            <CountUpValue end={12469} />
            개
          </div>

          <div className="about-counter-label">
            실제 관세청 HS코드
          </div>
        </div>

        <div className="about-counter">
          <div className="about-counter-value">
            <CountUpValue end={6} />
            종
          </div>

          <div className="about-counter-label">
            자동 생성 문서
          </div>
        </div>

        <div className="about-counter">
          <div className="about-counter-value">
            실시간
          </div>

          <div className="about-counter-label">
            오류 검증
          </div>
        </div>
      </section>

      {/* 3. 작동 방식 */}
      <section className="about-section">
        <h2 className="about-section-title about-reveal">
          이렇게 작동합니다
        </h2>

        <div className="about-steps">
          {STEPS.map(step => (
            <div
              className="about-step-card about-reveal"
              key={step.title}
            >
              <div className="about-step-icon">
                {step.icon}
              </div>

              <h3>{step.title}</h3>

              <p>{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 4. 생성 문서 소개 */}
      <section className="about-section">
        <h2 className="about-section-title about-reveal">
          6종 무역 서류를 자동으로
        </h2>

        <div className="about-docs">
          {DOCS.map(doc => (
            <div
              className="about-doc-card about-reveal"
              key={doc.name}
            >
              <span className="about-doc-badge">
                {doc.icon}
              </span>

              <h3>{doc.name}</h3>

              <p>{doc.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 5. CTA */}
      <section className="about-cta about-reveal">
        <h2>지금 바로 시작하세요</h2>

        <p>
          거래 정보만 입력하면, 나머지는
          PortAI가 합니다.
        </p>

        <button
          type="button"
          className="about-cta-button"
          onClick={onStart}
        >
          통관 작업실로 이동 →
        </button>
      </section>
    </div>
  );
}
