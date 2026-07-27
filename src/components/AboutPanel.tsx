/**
 * 서비스 소개(About) — 스크롤 스토리텔링형 랜딩 페이지.
 * IntersectionObserver로 섹션 진입 시 fade-in, 카운터는 진입 시 1.5초 카운트업.
 * 외부 라이브러리·이미지 없이 CSS 그라데이션과 이모지·lucide 아이콘만 사용.
 */
import { useEffect, useRef, useState } from 'react';
import { FileSignature, ShieldCheck, Sparkles, ChevronDown } from 'lucide-react';

interface Props {
  onStart: () => void; // CTA 클릭 → 통관 작업실로 이동
}

/**
 * 진입 시 0 → end 카운트업 (ease-out, 1.5초).
 * 스스로 화면 진입을 감지한다 — 마운트 시점에 이미 보이면 즉시 시작하고,
 * 감지에 실패해도 3초 후엔 반드시 최종 숫자를 채운다 (0으로 남는 일 방지).
 */
function CountUpValue({ end }: { end: number }) {
  const [value, setValue] = useState(0);
  const spanRef = useRef<HTMLSpanElement>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    let raf = 0;
    const start = () => {
      if (startedRef.current) return;
      startedRef.current = true;
      const t0 = performance.now();
      const tick = (t: number) => {
        const p = Math.min((t - t0) / 1500, 1);
        setValue(Math.round(end * (1 - Math.pow(1 - p, 3))));
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };

    const el = spanRef.current;
    let io: IntersectionObserver | null = null;
    if (el && typeof IntersectionObserver !== 'undefined') {
      const rect = el.getBoundingClientRect();
      if (rect.top < window.innerHeight && rect.bottom > 0) {
        start(); // 마운트 시점에 이미 화면 안
      } else {
        io = new IntersectionObserver(entries => {
          if (entries.some(e => e.isIntersecting)) { start(); io?.disconnect(); }
        }, { threshold: 0.1 });
        io.observe(el);
      }
    } else {
      start();
    }
    const safety = window.setTimeout(start, 3000); // 어떤 경우에도 숫자가 0으로 남지 않게
    return () => { cancelAnimationFrame(raf); io?.disconnect(); clearTimeout(safety); };
  }, [end]);

  return <span ref={spanRef}>{value.toLocaleString()}</span>;
}

const STEPS = [
  { icon: <FileSignature size={28} />, title: '① 거래 정보 입력', desc: '품목·항구·거래조건만 입력하세요. 서류 탭이 필요한 항목만 보여주고, 나머지는 AI가 채웁니다.' },
  { icon: <ShieldCheck size={28} />, title: '② AI 검증 & HS코드 추천', desc: '관세청 사전 기반으로 HS코드를 추천하고, 관세법 근거와 함께 오류·누락을 짚어냅니다.' },
  { icon: <Sparkles size={28} />, title: '③ 문서 자동 생성', desc: '통관·선적에 필요한 서류를 실무 표준 서식으로 한 번에 만들어 미리보기·다운로드합니다.' },
];

const DOCS = [
  { icon: 'INV', name: '상업송장', desc: 'Commercial Invoice — 거래 금액·조건의 기준 서류' },
  { icon: 'PKL', name: '패킹리스트', desc: 'Packing List — 수량·중량·포장 명세' },
  { icon: 'B/L', name: '선하증권', desc: 'Bill of Lading — 해상 운송 계약의 증거' },
  { icon: 'DEC', name: '수출입신고서', desc: '관세청 신고용 — 과세가격·관세 자동 계산' },
  { icon: 'C/O', name: '원산지증명서', desc: 'Certificate of Origin — FTA 특혜 관세의 근거' },
  { icon: 'INS', name: '적하보험증권', desc: 'Insurance Policy — CIF 조건 필수 서류' },
];

export default function AboutPanel({ onStart }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 랜딩은 항상 첫 화면(히어로)부터 — 다른 탭에서 스크롤된 상태로 진입해도 리셋
    window.scrollTo(0, 0);
    const root = rootRef.current;
    if (!root) return;
    const io = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('in-view');
          io.unobserve(entry.target);
        });
      },
      { threshold: 0.15 }
    );
    root.querySelectorAll('.about-reveal').forEach(el => {
      // 마운트 시점에 이미 화면 안에 있는 요소는 관찰 없이 즉시 표시
      const rect = el.getBoundingClientRect();
      if (rect.top < window.innerHeight && rect.bottom > 0) el.classList.add('in-view');
      else io.observe(el);
    });
    return () => io.disconnect();
  }, []);

  return (
    <div className="about-page" ref={rootRef}>
      {/* 1. 히어로 */}
      <section className="about-hero">
        <div className="about-hero-waves" aria-hidden="true" />
        <span className="about-hero-ship" aria-hidden="true">🚢</span>
        <h1 className="about-hero-title">
          복잡한 통관 문서,
          <br />
          AI가 30초 만에.
        </h1>
        <p className="about-hero-sub">PortAI — 스마트 물류 &amp; 통관 자동화 플랫폼</p>
        <div className="about-scroll-hint" aria-hidden="true">
          <ChevronDown size={28} />
        </div>
      </section>

      {/* 2. 숫자 카운터 */}
      <section className="about-counters about-reveal">
        <div className="about-counter">
          <div className="about-counter-value"><CountUpValue end={12469} />개</div>
          <div className="about-counter-label">실제 관세청 HS코드</div>
        </div>
        <div className="about-counter">
          <div className="about-counter-value"><CountUpValue end={6} />종</div>
          <div className="about-counter-label">자동 생성 문서</div>
        </div>
        <div className="about-counter">
          <div className="about-counter-value">실시간</div>
          <div className="about-counter-label">오류 검증</div>
        </div>
      </section>

      {/* 3. 작동 방식 */}
      <section className="about-section">
        <h2 className="about-section-title about-reveal">이렇게 작동합니다</h2>
        <div className="about-steps">
          {STEPS.map(step => (
            <div className="about-step-card about-reveal" key={step.title}>
              <div className="about-step-icon">{step.icon}</div>
              <h3>{step.title}</h3>
              <p>{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 4. 생성 문서 소개 */}
      <section className="about-section">
        <h2 className="about-section-title about-reveal">6종 무역 서류를 자동으로</h2>
        <div className="about-docs">
          {DOCS.map(doc => (
            <div className="about-doc-card about-reveal" key={doc.name}>
              <span className="about-doc-badge">{doc.icon}</span>
              <h3>{doc.name}</h3>
              <p>{doc.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 5. CTA */}
      <section className="about-cta about-reveal">
        <h2>지금 바로 시작하세요</h2>
        <p>거래 정보만 입력하면, 나머지는 PortAI가 합니다.</p>
        <button type="button" className="about-cta-button" onClick={onStart}>
          통관 작업실로 이동 →
        </button>
      </section>
    </div>
  );
}
