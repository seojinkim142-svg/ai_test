import { Fragment, memo, useCallback, useEffect, useRef, useState } from "react";
import { COMPANY_INFO_ITEMS, LEGAL_LINKS } from "../legal/companyInfo";

function SummaryIcon({ className = "h-10 w-10" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M6 5h12M6 10h9M6 15h12M6 19h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function QuizIcon({ className = "h-10 w-10" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <text x="12" y="17" textAnchor="middle" fontSize="16" fontWeight="700" fill="currentColor">
        ?
      </text>
    </svg>
  );
}

function CardsIcon({ className = "h-10 w-10" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="5" y="5" width="12" height="14" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <rect x="8" y="3" width="12" height="14" rx="2" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function TutorIcon({ className = "h-10 w-10" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7A2.5 2.5 0 0 1 17.5 16H11l-4 4v-4H6.5A2.5 2.5 0 0 1 4 13.5v-7Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M8 9h8M8 12h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function ExamIcon({ className = "h-10 w-10" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M8 4h8l3 3v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h2Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M9 11h6M9 15h4M14 4v3h3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const FEATURE_ITEMS = [
  {
    id: "summary",
    kicker: "요약",
    label: "핵심 요약",
    description: "긴 PDF에서 핵심만 추려 빠르게 복습할 수 있게 정리합니다.",
    bullets: ["핵심 개념 중심 정리", "페이지별 요약", "요약 PDF 내보내기"],
    stats: "짧은 시간에 핵심 복습",
    Icon: SummaryIcon,
  },
  {
    id: "quiz",
    kicker: "퀴즈",
    label: "문제 생성",
    description: "객관식, OX 등 시험형 문제를 자동 생성해 실전처럼 연습합니다.",
    bullets: ["문항 유형 자동 혼합", "해설 자동 생성", "10문항 모의 테스트"],
    stats: "실전 감각 강화",
    Icon: QuizIcon,
  },
  {
    id: "flashcards",
    kicker: "카드",
    label: "암기 카드",
    description: "헷갈리는 개념을 카드로 만들어 반복 학습합니다.",
    bullets: ["카드 자동 생성", "오답 중심 복습", "학습 진행 추적"],
    stats: "반복으로 기억 고정",
    Icon: CardsIcon,
  },
  {
    id: "tutor",
    kicker: "튜터",
    label: "AI 튜터",
    description: "학습 중 궁금한 내용을 바로 물어보고 문서 기반 답변을 받습니다.",
    bullets: ["문서 기반 답변", "후속 질문 연결", "개념 비교 설명"],
    stats: "공부 중 즉시 피드백",
    Icon: TutorIcon,
  },
  {
    id: "mockExam",
    kicker: "모의",
    label: "모의고사",
    description: "10문항 모의고사로 실전 대비 상태를 점검합니다.",
    bullets: ["OX + 객관식 혼합", "자동 채점", "결과 PDF 저장"],
    stats: "시험 전 최종 점검",
    Icon: ExamIcon,
  },
];

const STEP_ITEMS = [
  {
    step: "01",
    title: "PDF 업로드",
    description: "강의자료, 교재, 필기를 올리면 준비가 끝납니다.",
  },
  {
    step: "02",
    title: "AI 분석",
    description: "요약, 문제, 카드가 자동으로 생성됩니다.",
  },
  {
    step: "03",
    title: "반복 학습",
    description: "오답 복습과 모의고사로 기억을 강화합니다.",
  },
];

const STATS = [
  { value: "5", unit: "기능", label: "요약, 퀴즈, 카드, 튜터, 모의고사" },
  { value: "10", unit: "문항", label: "자동 생성 모의 테스트" },
  { value: "1", unit: "플로우", label: "업로드부터 복습까지 한 화면" },
];

const PLAN_ITEMS = [
  {
    name: "무료",
    price: "무료",
    description: "가볍게 시작하는 개인 학습",
    features: ["PDF 최대 4개 업로드", "요약/퀴즈/OX 기본 기능", "기본 저장공간 제공"],
    ctaLabel: "무료 선택",
  },
  {
    name: "프로",
    price: "월 4,900원",
    description: "꾸준히 공부하는 사용자에게 추천",
    features: ["업로드 무제한", "요약/퀴즈/OX/카드 무제한 생성", "우선 처리"],
    ctaLabel: "프로 선택",
    featured: true,
  },
  {
    name: "프리미엄",
    price: "월 16,000원",
    description: "최대 4명 동시 공유",
    features: ["공유 스페이스로 함께 학습", "멤버별 학습 흐름 분리", "협업으로 학습 효율 향상"],
    ctaLabel: "프리미엄 선택",
  },
];
const PLAN_COMPARISON_ROWS = [
  {
    label: "추천 대상",
    values: {
      무료: "입문",
      프로: "개인 학습",
      프리미엄: "공유 학습",
    },
  },
  {
    label: "월 요금",
    values: {
      무료: "무료",
      프로: "4,900원 / 월",
      프리미엄: "16,000원 / 월",
    },
  },
  {
    label: "PDF 업로드",
    values: {
      무료: "최대 4개",
      프로: "업로드 무제한",
      프리미엄: "업로드 무제한",
    },
  },
  {
    label: "핵심 기능",
    values: {
      무료: "요약 / 퀴즈 / OX 기본",
      프로: "요약 / 퀴즈 / OX / 카드",
      프리미엄: "프로 전체 + 공유 학습",
    },
  },
  {
    label: "학습 공간",
    values: {
      무료: "기본 저장 공간",
      프로: "개인 학습 공간",
      프리미엄: "공유 워크스페이스",
    },
  },
  {
    label: "사용 인원",
    values: {
      무료: "1명",
      프로: "1명",
      프리미엄: "최대 4명",
    },
  },
  {
    label: "처리 우선순위",
    values: {
      무료: "기본",
      프로: "우선 처리",
      프리미엄: "우선 처리",
    },
  },
];

const NAV_ITEMS = [
  { id: "features", label: "기능" },
  { id: "pricing", label: "요금제" },
];

const DEFAULT_ACTIVE_PLAN = PLAN_ITEMS.find((plan) => plan.featured)?.name || PLAN_ITEMS[0]?.name || "";

const LandingIntro = memo(function LandingIntro({ onStart }) {
  const [scrollY, setScrollY] = useState(0);
  const [activeSection, setActiveSection] = useState(0);
  const [activePlanName, setActivePlanName] = useState(DEFAULT_ACTIVE_PLAN);
  const heroRef = useRef(null);
  const featureRefs = useRef([]);
  const scrollRafRef = useRef(null);
  const visibleRatioRef = useRef(new Map());

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const handleScroll = () => {
      if (scrollRafRef.current != null) return;
      scrollRafRef.current = window.requestAnimationFrame(() => {
        setScrollY(window.scrollY || 0);
        scrollRafRef.current = null;
      });
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (scrollRafRef.current != null) {
        window.cancelAnimationFrame(scrollRafRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || typeof IntersectionObserver === "undefined") return undefined;
    const ratios = visibleRatioRef.current;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const raw = entry.target.getAttribute("data-feature-index");
          const index = Number(raw);
          if (Number.isNaN(index)) return;

          if (entry.isIntersecting) {
            ratios.set(index, entry.intersectionRatio);
          } else {
            ratios.delete(index);
          }
        });

        let nextIndex = 0;
        let maxRatio = -1;
        ratios.forEach((ratio, index) => {
          if (ratio > maxRatio) {
            maxRatio = ratio;
            nextIndex = index;
          }
        });

        if (maxRatio >= 0) {
          setActiveSection(nextIndex);
        }
      },
      {
        root: null,
        threshold: [0.2, 0.35, 0.5, 0.65],
        rootMargin: "-12% 0px -28% 0px",
      }
    );

    featureRefs.current.forEach((node) => {
      if (node) observer.observe(node);
    });

    return () => {
      observer.disconnect();
      ratios.clear();
    };
  }, []);

  const heroOpacity = Math.max(0.97, 1 - scrollY / 12000);
  const heroParallax = Math.min(scrollY * 0.035, 44);

  const handleStart = useCallback(() => {
    onStart?.();
  }, [onStart]);

  const handleJump = useCallback((id) => {
    if (typeof window === "undefined") return;
    const section = document.getElementById(id);
    if (!section) return;
    const top = section.getBoundingClientRect().top + window.scrollY - 88;
    window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }, []);

  const setFeatureRef = useCallback((index, node) => {
    featureRefs.current[index] = node;
  }, []);

  const handlePlanInteract = useCallback((planName) => {
    setActivePlanName(planName);
  }, []);

  return (
    <div className="zeus-landing relative overflow-hidden bg-[#020403] text-emerald-50 select-none">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&family=Instrument+Serif:ital@0;1&display=swap');
        .zeus-landing {
          font-family: "Sora", "Pretendard Variable", "Noto Sans KR", sans-serif;
          user-select: none;
          -webkit-user-select: none;
        }
        .zeus-serif { font-family: "Instrument Serif", "Times New Roman", serif; }
        @keyframes zeus-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(10px); }
        }
        @keyframes zeus-rise {
          from { opacity: 0; transform: translateY(32px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .zeus-hero-reveal { animation: zeus-rise 900ms cubic-bezier(0.2, 0.7, 0.2, 1) forwards; }
        .zeus-float { animation: zeus-float 2.1s ease-in-out infinite; }
      `}</style>

      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-20 top-16 h-64 w-64 rounded-full bg-emerald-400/20 blur-3xl" />
        <div className="absolute right-[-80px] top-[18vh] h-80 w-80 rounded-full bg-emerald-300/10 blur-3xl" />
        <div className="absolute bottom-[-120px] left-1/2 h-[28rem] w-[28rem] -translate-x-1/2 rounded-full bg-emerald-500/10 blur-[120px]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.12),transparent_55%)]" />
        <div className="absolute left-1/2 top-1/3 h-[30rem] w-[30rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(16,185,129,0.2),rgba(16,185,129,0.02)_50%,transparent_72%)] blur-3xl" />
      </div>

      <nav className="fixed inset-x-0 top-0 z-50 border-b border-emerald-200/10 bg-black/55 backdrop-blur-2xl">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-8">
            <p className="text-lg font-semibold tracking-wide text-emerald-100">Zeusian</p>
            <div className="hidden items-center gap-6 text-sm text-emerald-50/80 md:flex">
              {NAV_ITEMS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleJump(item.id)}
                  className="transition hover:text-emerald-300"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={handleStart}
            className="rounded-full border border-emerald-300/30 bg-emerald-300 px-4 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-200"
          >
            바로 시작하기
          </button>
        </div>
      </nav>

      <section
        ref={heroRef}
        className="relative min-h-screen px-6 pt-32"
        style={{
          opacity: heroOpacity,
          transform: `translateY(${heroParallax}px)`,
          transformOrigin: "top center",
        }}
      >
        <div className="mx-auto flex min-h-[82vh] max-w-6xl flex-col items-center justify-center text-center zeus-hero-reveal">
          <p className="text-xs uppercase tracking-[0.34em] text-emerald-200/90">공부 AI</p>
          <h1 className="landing-title mt-5 text-5xl font-bold leading-[0.98] text-white drop-shadow-[0_8px_35px_rgba(0,0,0,0.45)] sm:text-7xl md:text-[96px]">
            PDF 하나로
            <br />
            요약, 퀴즈, 카드까지
          </h1>
          <p className="landing-subtitle mt-6 max-w-3xl text-base text-emerald-50/90 sm:text-xl">
            Zeusian은 PDF 강의자료를 요약하고 문제를 만드는 공부 AI입니다.
            요약부터 퀴즈, 카드, AI 튜터까지 자동으로 연결하고 반복 복습 루프를 한 곳에서 완성하세요.
          </p>
          <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row">
            <button
              type="button"
              onClick={handleStart}
              className="rounded-full bg-emerald-300 px-8 py-3 text-base font-semibold text-emerald-950 shadow-[0_0_50px_rgba(16,185,129,0.35)] transition hover:bg-emerald-200"
            >
              시작하기
            </button>
            <button
              type="button"
              onClick={() => handleJump("features")}
              className="rounded-full border border-emerald-300/35 px-8 py-3 text-base font-medium text-emerald-100/90 transition hover:border-emerald-200/55 hover:text-emerald-100"
            >
              기능 보기
            </button>
          </div>
        </div>
        <div className="absolute bottom-10 left-1/2 z-10 -translate-x-1/2 text-emerald-200/60 zeus-float">
          <span className="text-xs uppercase tracking-[0.32em]">아래로</span>
        </div>
      </section>

      <section id="features" className="relative bg-black/60 px-6 py-28">
        <div className="mx-auto max-w-7xl space-y-24">
          {FEATURE_ITEMS.map((feature, index) => {
            const isActive = activeSection === index;
            const Icon = feature.Icon;
            return (
              <article
                key={feature.id}
                data-feature-index={index}
                ref={(node) => setFeatureRef(index, node)}
                className="grid min-h-[72vh] scroll-mt-24 items-center gap-10 lg:grid-cols-2 lg:gap-16"
              >
                <div className={index % 2 ? "lg:order-2" : ""}>
                  <div
                    className="mb-6 inline-flex rounded-2xl border border-emerald-300/30 bg-emerald-300/10 p-3 text-emerald-200 transition-all duration-500"
                    style={{ opacity: isActive ? 1 : 0.45, transform: `translateX(${isActive ? 0 : -14}px)` }}
                  >
                    <Icon className="h-10 w-10" />
                  </div>
                  <p className="mb-3 text-xs uppercase tracking-[0.34em] text-emerald-300/65">
                    {String(index + 1).padStart(2, "0")} · {feature.kicker}
                  </p>
                  <h2 className="text-4xl font-bold text-white sm:text-6xl" style={{ opacity: isActive ? 1 : 0.62 }}>
                    {feature.label}
                  </h2>
                  <p className="mt-5 text-xl text-emerald-50/80">{feature.description}</p>
                  <div className="mt-6 flex flex-wrap gap-2">
                    {feature.bullets.map((bullet) => (
                      <span
                        key={`${feature.id}-${bullet}`}
                        className="rounded-full border border-emerald-200/20 bg-emerald-300/10 px-3 py-1 text-sm text-emerald-100/85"
                      >
                        {bullet}
                      </span>
                    ))}
                  </div>
                  <p className="mt-7 inline-flex rounded-full bg-emerald-200/10 px-4 py-2 text-sm font-semibold text-emerald-200">
                    {feature.stats}
                  </p>
                </div>

                <div className={index % 2 ? "lg:order-1" : ""}>
                  <div
                    className="relative overflow-hidden rounded-[2rem] border border-emerald-300/20 bg-gradient-to-br from-emerald-500/20 via-emerald-400/10 to-transparent p-8 transition-all duration-500"
                    style={{ opacity: isActive ? 1 : 0.4, transform: `scale(${isActive ? 1 : 0.95})` }}
                  >
                    <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(16,185,129,0.18),transparent_55%)]" />
                    <div className="relative min-h-[18rem] space-y-3 rounded-2xl border border-emerald-100/10 bg-black/45 p-6">
                      <p className="text-xs uppercase tracking-[0.34em] text-emerald-300/80">미리보기</p>
                      <p className="text-2xl font-semibold text-emerald-50">{feature.label}</p>
                      <p className="text-sm text-emerald-100/70">{feature.description}</p>
                      <div className="mt-4 space-y-2">
                        {feature.bullets.map((bullet) => (
                          <div
                            key={`${feature.id}-line-${bullet}`}
                            className="rounded-xl border border-emerald-200/10 bg-emerald-200/5 px-3 py-2 text-sm text-emerald-50/80"
                          >
                            {bullet}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section id="stats" className="relative border-y border-emerald-200/10 bg-[#030704] px-6 py-24">
        <div className="mx-auto grid max-w-7xl gap-8 text-center md:grid-cols-3">
          {STATS.map((stat) => (
            <article key={stat.label} className="rounded-3xl border border-emerald-300/15 bg-emerald-500/5 px-5 py-10">
              <p className="text-6xl font-bold text-emerald-200 sm:text-7xl">
                {stat.value}
                <span className="zeus-serif ml-2 text-3xl align-top text-emerald-100/85 sm:text-4xl">{stat.unit}</span>
              </p>
              <p className="mt-4 text-sm text-emerald-100/70 sm:text-base">{stat.label}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="steps" className="px-6 py-24">
        <div className="mx-auto max-w-7xl">
          <div className="mb-10 text-center">
            <p className="text-xs uppercase tracking-[0.34em] text-emerald-300/70">학습 흐름</p>
            <h2 className="mt-3 text-4xl font-bold text-white sm:text-6xl">3단계 자동 학습 루프</h2>
          </div>
          <div className="grid gap-5 md:grid-cols-3">
            {STEP_ITEMS.map((step) => (
              <article
                key={step.step}
                className="rounded-3xl border border-emerald-200/15 bg-black/45 p-7 shadow-[0_18px_40px_rgba(0,0,0,0.35)]"
              >
                <p className="text-xs uppercase tracking-[0.3em] text-emerald-300/80">{step.step}</p>
                <h3 className="mt-2 text-2xl font-semibold text-emerald-50">{step.title}</h3>
                <p className="mt-3 text-sm text-emerald-100/70">{step.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="px-6 py-24">
        <div className="mx-auto max-w-7xl">
          <div className="mb-10 text-center">
            <p className="text-xs uppercase tracking-[0.34em] text-emerald-300/70">요금제</p>
            <h2 className="mt-3 text-4xl font-bold text-white sm:text-6xl">필요한 만큼 선택하세요</h2>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {PLAN_ITEMS.map((plan) => {
              const isActive = activePlanName === plan.name;
              return (
                <article
                  key={plan.name}
                  role="button"
                  tabIndex={0}
                  aria-pressed={isActive}
                  onClick={() => handlePlanInteract(plan.name)}
                  onFocus={() => handlePlanInteract(plan.name)}
                  onPointerEnter={(event) => {
                    if (event.pointerType === "mouse") {
                      handlePlanInteract(plan.name);
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      handlePlanInteract(plan.name);
                    }
                  }}
                  className={`rounded-3xl border p-7 transition-all duration-300 ${
                    isActive
                      ? "border-emerald-300/60 bg-emerald-500/10 shadow-[0_0_60px_rgba(16,185,129,0.16)]"
                      : "border-emerald-200/15 bg-black/45"
                  }`}
                >
                  {plan.featured && (
                    <p className="mb-4 inline-flex rounded-full bg-emerald-300 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-950">
                      추천
                    </p>
                  )}
                  <h3 className="text-2xl font-bold text-emerald-50">{plan.name}</h3>
                  <p className="mt-2 text-sm text-emerald-100/70">{plan.description}</p>
                  <p className="mt-5 text-4xl font-extrabold text-white">{plan.price}</p>
                  <ul className="mt-6 space-y-3 text-sm text-emerald-100/80">
                    {plan.features.map((feature) => (
                      <li key={`${plan.name}-${feature}`} className="flex items-start gap-2">
                        <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-emerald-300" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </article>
              );
            })}
          </div>

          <div className="mt-10 overflow-hidden rounded-[2rem] border border-emerald-300/15 bg-[#06110e]/95 shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
            <div className="flex flex-col gap-2 px-6 py-6 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300/80">Compare</p>
                <h3 className="mt-2 text-3xl font-bold text-white">구독권 비교</h3>
              </div>
              <p className="text-sm text-emerald-100/60">원하는 열을 누르면 위 요금제 카드와 함께 강조됩니다.</p>
            </div>

            <div className="overflow-x-auto">
              <div className="grid min-w-[780px] grid-cols-[160px_repeat(3,minmax(0,1fr))] border-t border-emerald-300/10">
                <div className="bg-white/[0.03] px-4 py-5 text-sm font-semibold text-emerald-50">비교 항목</div>
                {PLAN_ITEMS.map((plan) => {
                  const isActive = activePlanName === plan.name;

                  return (
                    <button
                      key={`${plan.name}-compare-header`}
                      type="button"
                      onClick={() => handlePlanInteract(plan.name)}
                      className={`flex flex-col items-start gap-1 border-l border-emerald-300/10 px-4 py-5 text-left transition ${
                        isActive ? "bg-emerald-500/12" : "bg-transparent hover:bg-white/[0.03]"
                      }`}
                    >
                      <span className="text-2xl font-bold text-white">{plan.name}</span>
                      <span className="text-sm text-emerald-100/65">{plan.description}</span>
                      <span className="mt-1 text-2xl font-extrabold text-emerald-200">{plan.price}</span>
                      <span
                        className={`mt-2 rounded-full px-3 py-1 text-xs font-semibold ${
                          isActive
                            ? "bg-emerald-300 text-emerald-950"
                            : plan.featured
                              ? "bg-emerald-300/15 text-emerald-200"
                              : "bg-white/5 text-emerald-50/80"
                        }`}
                      >
                        {isActive ? "선택됨" : plan.featured ? "추천" : "선택 가능"}
                      </span>
                    </button>
                  );
                })}

                {PLAN_COMPARISON_ROWS.map((row) => (
                  <Fragment key={row.label}>
                    <div className="border-t border-emerald-300/10 px-4 py-4 text-sm font-semibold text-emerald-50">
                      {row.label}
                    </div>
                    {PLAN_ITEMS.map((plan) => {
                      const isActive = activePlanName === plan.name;

                      return (
                        <div
                          key={`${row.label}-${plan.name}`}
                          className={`border-l border-t border-emerald-300/10 px-4 py-4 text-sm leading-6 transition ${
                            isActive ? "bg-emerald-500/7 text-emerald-50" : "text-emerald-100/78"
                          }`}
                        >
                          {row.values[plan.name]}
                        </div>
                      );
                    })}
                  </Fragment>
                ))}

                <div className="border-t border-emerald-300/10 px-4 py-5 text-sm font-semibold text-emerald-50">
                  빠른 선택
                </div>
                {PLAN_ITEMS.map((plan) => {
                  const isActive = activePlanName === plan.name;

                  return (
                    <div
                      key={`${plan.name}-compare-action`}
                      className={`border-l border-t border-emerald-300/10 px-4 py-5 ${
                        isActive ? "bg-emerald-500/10" : ""
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => handlePlanInteract(plan.name)}
                        className={`w-full rounded-full border px-4 py-3 text-sm font-semibold transition ${
                          isActive
                            ? "border-emerald-300 bg-emerald-300 text-emerald-950"
                            : "border-emerald-300/35 text-emerald-100 hover:border-emerald-200/60 hover:bg-white/[0.03]"
                        }`}
                      >
                        {isActive ? "선택됨" : plan.ctaLabel}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-emerald-300/10 bg-black/75 px-6 py-28">
        <div className="mx-auto max-w-5xl text-center">
          <h2 className="text-4xl font-bold text-white sm:text-6xl">이제 공부 루프를 자동화하세요</h2>
          <p className="mt-5 text-lg text-emerald-100/70 sm:text-2xl">PDF 업로드부터 복습 문제까지, 학습 흐름을 자동으로 완성합니다.</p>
          <button
            type="button"
            onClick={handleStart}
            className="mt-10 rounded-full bg-emerald-300 px-9 py-3 text-base font-semibold text-emerald-950 transition hover:bg-emerald-200"
          >
            Zeusian 시작하기
          </button>
          <p className="mt-4 text-sm text-emerald-100/60">
            공부 AI 소개가 필요하면 <a href="/study-ai" className="font-semibold text-emerald-200 transition hover:text-emerald-100">전용 안내 페이지</a>에서 자세히 볼 수 있습니다.
          </p>
        </div>
      </section>

      <footer className="border-t border-emerald-300/10 px-6 py-10">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 text-sm text-emerald-100/65 md:flex-row md:items-start md:justify-between">
          <div className="text-center md:text-left">
            <p className="uppercase tracking-[0.24em] text-emerald-300/75">회사 정보</p>
            <div className="mt-3 space-y-1 leading-6">
              {COMPANY_INFO_ITEMS.map((item) => (
                <p key={item.label}>
                  {item.label}: {item.value}
                </p>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap justify-center gap-3 md:justify-end">
            {LEGAL_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="rounded-full border border-emerald-300/20 px-4 py-2 font-semibold text-emerald-100 transition hover:border-emerald-200/45 hover:bg-emerald-300/10"
              >
                {link.label}
              </a>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
});

export default LandingIntro;
