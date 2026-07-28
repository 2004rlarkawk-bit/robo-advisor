/**
 * 서비스 소개(About) — 스크롤 스토리텔링형 랜딩 페이지.
 * IntersectionObserver로 섹션 진입 시 fade-in,
 * 카운터는 화면 진입 시 1.5초 동안 카운트업.
 * 외부 이미지 없이 CSS 그라데이션과 이모지·lucide 아이콘만 사용.
 */

import { useEffect, useRef, useState } from 'react';
import {
  FileSignature,
  ShieldCheck,
  Sparkles,
  ChevronDown
} from 'lucide-react';

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
  const rootRef =
    useRef<HTMLDivElement>(null);

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
      {/* 1. 히어로 */}
      <section className="about-hero">
        <div
          className="about-hero-waves"
          aria-hidden="true"
        />

        <span
          className="about-hero-ship"
          aria-hidden="true"
        >
          🚢
        </span>

        <h1 className="about-hero-title">
          복잡한 통관 문서,
          <br />
          AI가 30초 만에.
        </h1>

        <p className="about-hero-sub">
          PortAI — 스마트 물류 &amp;
          통관 자동화 플랫폼
        </p>

        <div
          className="about-scroll-hint"
          aria-hidden="true"
        >
          <ChevronDown size={28} />
        </div>
      </section>

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