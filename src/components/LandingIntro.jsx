import { Fragment, memo, useCallback, useEffect, useRef, useState } from "react";
import { COMPANY_INFO_ITEMS, LEGAL_LINKS } from "../legal/companyInfo";

const FOOTER_COMPANY_INFO = COMPANY_INFO_ITEMS.find((item) => item.label === "상호") ?? COMPANY_INFO_ITEMS[0];

function SummaryIcon({ className = "h-10 w-10" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M6 5h12M6 10h9M6 15h12M6 19h8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function QuizIcon({ className = "h-10 w-10" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.7" />
      <path d="M9.2 9.6a2.8 2.8 0 1 1 4.7 2.05c-.76.72-1.5 1.2-1.5 2.15" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="12" cy="16.8" r="1" fill="currentColor" />
    </svg>
  );
}

function CardsIcon({ className = "h-10 w-10" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="5" y="6" width="11" height="13" rx="2.2" stroke="currentColor" strokeWidth="1.7" />
      <rect x="8" y="4" width="11" height="13" rx="2.2" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function TutorIcon({ className = "h-10 w-10" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M4.5 6.5A2.5 2.5 0 0 1 7 4h10a2.5 2.5 0 0 1 2.5 2.5v6A2.5 2.5 0 0 1 17 15H11l-4.5 4v-4H7A2.5 2.5 0 0 1 4.5 12.5v-6Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M8.5 8.8h7M8.5 11.8h4.4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function ExamIcon({ className = "h-10 w-10" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M7.5 4.5h8l3 3v11.2A1.8 1.8 0 0 1 16.7 20.5H7.3a1.8 1.8 0 0 1-1.8-1.8V6.3a1.8 1.8 0 0 1 1.8-1.8h.2Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M14.5 4.5v3h3M9 11h6M9 15h4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckIcon({ className = "h-4 w-4" }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path d="m4.5 10.5 3.2 3.2 7.8-8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ArrowRightIcon({ className = "h-4 w-4" }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path d="M4 10h11.5M11 4.5 16.5 10 11 15.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MenuIcon({ className = "h-5 w-5" }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path d="M3.5 5.5h13M3.5 10h13M3.5 14.5h13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon({ className = "h-5 w-5" }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path d="m5 5 10 10M15 5 5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function ZeusianLogo({ className = "h-11 w-11 rounded-2xl" }) {
  return (
    <img
      src="/apple-touch-icon.png"
      alt=""
      aria-hidden="true"
      decoding="async"
      className={className}
    />
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
    previewLabel: "Summary Bundle",
    previewTitle: "강의 흐름은 유지하고 핵심만 남깁니다",
    previewMeta: ["핵심 개념 자동 정리", "페이지 단위 문맥 유지", "정리본 PDF 저장"],
    previewBars: [84, 67, 91],
    Icon: SummaryIcon,
    theme: {
      accent: "linear-gradient(135deg, #2563eb 0%, #8b5cf6 100%)",
      glow: "rgba(99, 102, 241, 0.24)",
      halo: "radial-gradient(circle at center, rgba(129, 140, 248, 0.28) 0%, rgba(129, 140, 248, 0) 68%)",
      tint: "rgba(99, 102, 241, 0.08)",
      border: "rgba(99, 102, 241, 0.14)",
      chip: "rgba(59, 130, 246, 0.1)",
    },
  },
  {
    id: "quiz",
    kicker: "퀴즈",
    label: "문제 생성",
    description: "객관식, OX 등 시험형 문제를 자동 생성해 실전처럼 연습합니다.",
    bullets: ["문항 유형 자동 혼합", "해설 자동 생성", "10문항 모의 테스트"],
    stats: "실전 감각 강화",
    previewLabel: "Quiz Studio",
    previewTitle: "시험형 문제를 바로 연습 세트로 바꿉니다",
    previewMeta: ["객관식과 OX 혼합", "문항별 해설 자동 연결", "10문항 모의 테스트 구성"],
    previewBars: [79, 73, 88],
    Icon: QuizIcon,
    theme: {
      accent: "linear-gradient(135deg, #0f766e 0%, #06b6d4 100%)",
      glow: "rgba(13, 148, 136, 0.23)",
      halo: "radial-gradient(circle at center, rgba(45, 212, 191, 0.28) 0%, rgba(45, 212, 191, 0) 68%)",
      tint: "rgba(13, 148, 136, 0.08)",
      border: "rgba(13, 148, 136, 0.14)",
      chip: "rgba(13, 148, 136, 0.1)",
    },
  },
  {
    id: "flashcards",
    kicker: "카드",
    label: "암기 카드",
    description: "헷갈리는 개념을 카드로 만들어 반복 학습합니다.",
    bullets: ["카드 자동 생성", "오답 중심 복습", "학습 진행 추적"],
    stats: "반복으로 기억 고정",
    previewLabel: "Cards Stack",
    previewTitle: "헷갈리는 개념을 짧고 자주 꺼내 보게 만듭니다",
    previewMeta: ["개념 카드 자동 생성", "오답 카드 우선 배치", "학습 진도 추적"],
    previewBars: [76, 82, 69],
    Icon: CardsIcon,
    theme: {
      accent: "linear-gradient(135deg, #f97316 0%, #ec4899 100%)",
      glow: "rgba(244, 114, 182, 0.22)",
      halo: "radial-gradient(circle at center, rgba(251, 146, 60, 0.24) 0%, rgba(251, 146, 60, 0) 68%)",
      tint: "rgba(249, 115, 22, 0.08)",
      border: "rgba(249, 115, 22, 0.14)",
      chip: "rgba(249, 115, 22, 0.1)",
    },
  },
  {
    id: "tutor",
    kicker: "튜터",
    label: "AI 튜터",
    description: "학습 중 궁금한 내용을 바로 물어보고 문서 기반 답변을 받습니다.",
    bullets: ["문서 기반 답변", "후속 질문 연결", "개념 비교 설명"],
    stats: "공부 중 즉시 피드백",
    previewLabel: "Tutor Thread",
    previewTitle: "문서 근거를 바탕으로 바로 묻고 이어서 이해합니다",
    previewMeta: ["문서 기반 답변", "후속 질문 이어서 탐색", "비교 설명으로 이해 보강"],
    previewBars: [88, 65, 78],
    Icon: TutorIcon,
    theme: {
      accent: "linear-gradient(135deg, #4f46e5 0%, #ec4899 100%)",
      glow: "rgba(129, 140, 248, 0.24)",
      halo: "radial-gradient(circle at center, rgba(167, 139, 250, 0.28) 0%, rgba(167, 139, 250, 0) 68%)",
      tint: "rgba(129, 140, 248, 0.08)",
      border: "rgba(129, 140, 248, 0.14)",
      chip: "rgba(99, 102, 241, 0.1)",
    },
  },
  {
    id: "mockExam",
    kicker: "모의",
    label: "모의고사",
    description: "10문항 모의고사로 실전 대비 상태를 점검합니다.",
    bullets: ["OX + 객관식 혼합", "자동 채점", "결과 PDF 저장"],
    stats: "시험 전 최종 점검",
    previewLabel: "Mock Exam",
    previewTitle: "시험 직전 점검용 세트를 빠르게 돌릴 수 있습니다",
    previewMeta: ["10문항 자동 구성", "바로 채점과 정답 확인", "결과 PDF 저장"],
    previewBars: [92, 81, 74],
    Icon: ExamIcon,
    theme: {
      accent: "linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)",
      glow: "rgba(59, 130, 246, 0.23)",
      halo: "radial-gradient(circle at center, rgba(56, 189, 248, 0.26) 0%, rgba(56, 189, 248, 0) 68%)",
      tint: "rgba(14, 165, 233, 0.08)",
      border: "rgba(14, 165, 233, 0.14)",
      chip: "rgba(14, 165, 233, 0.1)",
    },
  },
];

const STEP_ITEMS = [
  {
    step: "01",
    title: "PDF 업로드",
    description: "강의자료, 교재, 필기를 올리면 준비가 끝납니다.",
    note: "여러 PDF를 쌓아도 학습 흐름은 하나로 이어집니다.",
  },
  {
    step: "02",
    title: "AI 분석",
    description: "요약, 문제, 카드가 자동으로 생성됩니다.",
    note: "핵심 정리부터 연습 문제까지 한 번에 연결됩니다.",
  },
  {
    step: "03",
    title: "반복 학습",
    description: "오답 복습과 모의고사로 기억을 강화합니다.",
    note: "시험 직전까지 다시 볼 흐름이 정리됩니다.",
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
    features: ["PDF 최대 4개 업로드", "요약/퀴즈/OX 기본 기능", "기본 저장 공간 제공"],
    ctaLabel: "무료 선택",
    badge: "Start",
    accent: "linear-gradient(135deg, #cbd5e1 0%, #94a3b8 100%)",
    glow: "rgba(148, 163, 184, 0.22)",
  },
  {
    name: "프로",
    price: "월 6,900원",
    description: "꾸준히 공부하는 사용자에게 추천",
    features: ["업로드 무제한", "요약/퀴즈/OX/카드 무제한 생성", "우선 처리"],
    ctaLabel: "프로 선택",
    badge: "Recommended",
    accent: "linear-gradient(135deg, #2563eb 0%, #8b5cf6 100%)",
    glow: "rgba(99, 102, 241, 0.26)",
    featured: true,
  },
  {
    name: "프리미엄",
    price: "월 18,900원",
    description: "최대 4명 동시 공유",
    features: ["공유 스페이스로 함께 학습", "멤버별 학습 흐름 분리", "협업으로 학습 효율 향상"],
    ctaLabel: "프리미엄 선택",
    badge: "Shared",
    accent: "linear-gradient(135deg, #0f766e 0%, #14b8a6 100%)",
    glow: "rgba(20, 184, 166, 0.24)",
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
      프로: "6,900원 / 월",
      프리미엄: "18,900원 / 월",
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
  { id: "workflow", label: "학습 플로우" },
  { id: "pricing", label: "요금제" },
];

const FOOTER_LINK_GROUPS = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "#features" },
      { label: "Workflow", href: "#workflow" },
      { label: "Pricing", href: "#pricing" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About Zeusian", href: "#hero" },
      { label: "Study AI", href: "/study-ai" },
      { label: "Get Started", href: "/start" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Summary", href: "#features" },
      { label: "Quiz", href: "#features" },
      { label: "Flashcards", href: "#features" },
    ],
  },
];

const DEFAULT_ACTIVE_PLAN = PLAN_ITEMS.find((plan) => plan.featured)?.name || PLAN_ITEMS[0]?.name || "";

function getRevealStyle(isVisible, { y = 36, x = 0, scale = 0.97, delay = 0 } = {}) {
  return {
    opacity: isVisible ? 1 : 0,
    transform: isVisible ? "translate3d(0, 0, 0) scale(1)" : `translate3d(${x}px, ${y}px, 0) scale(${scale})`,
    filter: isVisible ? "blur(0px)" : "blur(10px)",
    transition: `opacity 760ms cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms, transform 920ms cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms, filter 920ms cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms`,
  };
}

function FeatureVisual({ feature, isActive }) {
  return (
    <div className="relative">
      <div
        className="pointer-events-none absolute inset-[-12%] rounded-[3rem] blur-3xl transition duration-500"
        style={{
          background: feature.theme.halo,
          opacity: isActive ? 1 : 0.5,
        }}
      />
      <div
        className="relative overflow-hidden rounded-[2rem] border bg-white/85 p-5 shadow-[0_30px_80px_-42px_rgba(15,23,42,0.22)] backdrop-blur-xl sm:p-6"
        style={{
          borderColor: feature.theme.border,
          boxShadow: isActive
            ? `0 38px 90px -46px ${feature.theme.glow}, inset 0 1px 0 rgba(255,255,255,0.72)`
            : "0 28px 70px -54px rgba(15, 23, 42, 0.22), inset 0 1px 0 rgba(255,255,255,0.72)",
          transform: `translateY(${isActive ? 0 : 12}px) scale(${isActive ? 1 : 0.985})`,
          transition: "transform 480ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 480ms ease, border-color 480ms ease",
        }}
      >
        <div className="absolute inset-0 opacity-90" style={{ background: feature.theme.tint }} />
        <div className="absolute inset-x-0 top-0 h-24 opacity-80" style={{ background: feature.theme.accent, filter: "blur(88px)" }} />
        <div className="relative">
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_240px]">
            <div className="rounded-[1.6rem] border border-white/70 bg-white/[0.82] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.86)]">
              <p className="text-2xl font-bold leading-tight text-slate-900">{feature.previewTitle}</p>
              <div className="mt-5 space-y-3">
                {feature.previewMeta.map((item, index) => (
                  <div
                    key={`${feature.id}-preview-${item}`}
                    className="flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-3.5"
                  >
                    <div
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-sm font-bold text-white"
                      style={{
                        background: feature.theme.accent,
                      }}
                    >
                      {index + 1}
                    </div>
                    <p className="min-w-0 text-sm font-semibold leading-6 text-slate-800">{item}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-4">
              <div className="rounded-[1.6rem] border border-white/70 bg-slate-950 p-5 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                <p className="text-3xl font-bold">{feature.bullets.length} step</p>
                <p className="mt-2 text-sm text-slate-300">한 번 생성한 뒤 계속 이어서 복습합니다.</p>
              </div>

              <div className="rounded-[1.6rem] border border-slate-200/80 bg-white/90 p-5">
                <div className="space-y-3 text-sm leading-6 text-slate-600">
                  {feature.bullets.map((bullet) => (
                    <div key={`${feature.id}-point-${bullet}`} className="flex items-start gap-3">
                      <span className="mt-2 h-2.5 w-2.5 rounded-full" style={{ background: feature.theme.accent }} />
                      <span>{bullet}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function HeroDashboard({ scrollY = 0 }) {
  const floatingOffset = Math.min(scrollY * 0.12, 54);
  const floatingTilt = Math.min(scrollY * 0.01, 5);
  const floatingScale = Math.max(0.945, 1 - scrollY / 3600);

  return (
    <div className="relative mx-auto max-w-6xl" style={{ perspective: "1800px" }}>
      <div className="pointer-events-none absolute -left-10 top-24 hidden h-28 w-28 rounded-full bg-sky-300/30 blur-3xl lg:block" />
      <div className="pointer-events-none absolute -right-8 top-10 hidden h-32 w-32 rounded-full bg-violet-300/30 blur-3xl lg:block" />

      <div className="grid gap-5">
        <div
          className="relative overflow-hidden rounded-[2rem] border border-white/70 bg-white/[0.72] p-4 shadow-[0_34px_90px_-54px_rgba(15,23,42,0.3)] backdrop-blur-xl sm:p-6"
          style={{
            transform: `translate3d(0, ${floatingOffset}px, 0) rotateX(${floatingTilt}deg) scale(${floatingScale})`,
            transformOrigin: "top center",
            transition: "transform 140ms linear",
            willChange: "transform",
          }}
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.14),transparent_28%),radial-gradient(circle_at_top_right,rgba(139,92,246,0.16),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.94),rgba(246,248,252,0.9))]" />
          <div className="relative">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
              </div>
              <span className="rounded-full border border-slate-200 bg-white/85 px-3 py-1 text-xs font-semibold text-slate-600">
                PDF to Study Loop
              </span>
            </div>

            <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1.18fr)_minmax(220px,0.82fr)]">
              <div className="rounded-[1.8rem] border border-white/75 bg-slate-950 p-5 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.26em] text-slate-400">Uploaded PDF</p>
                    <h3 className="mt-2 text-2xl font-bold sm:text-3xl">시험 범위 PDF가 바로 학습 보드로 변환됩니다</h3>
                  </div>
                  <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-slate-200">AI Ready</span>
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-[1.35rem] border border-white/10 bg-white/[0.05] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Summary</p>
                    <p className="mt-3 text-lg font-semibold">핵심 개념 정리</p>
                    <p className="mt-2 text-sm text-slate-300">핵심만 남기고 빠르게 훑습니다.</p>
                  </div>
                  <div className="rounded-[1.35rem] border border-white/10 bg-white/[0.05] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Quiz</p>
                    <p className="mt-3 text-lg font-semibold">실전형 문제 생성</p>
                    <p className="mt-2 text-sm text-slate-300">객관식과 OX를 바로 연습합니다.</p>
                  </div>
                  <div className="rounded-[1.35rem] border border-white/10 bg-white/[0.05] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Tutor</p>
                    <p className="mt-3 text-lg font-semibold">AI 튜터 연결</p>
                    <p className="mt-2 text-sm text-slate-300">궁금한 내용을 문서 기준으로 묻습니다.</p>
                  </div>
                </div>
              </div>

              <div className="grid gap-4">
                <div className="rounded-[1.8rem] border border-slate-200/85 bg-white/90 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Current Flow</p>
                  <div className="mt-4 space-y-3">
                    {["PDF 업로드", "요약 생성", "퀴즈 생성", "카드 생성", "AI 튜터 연결"].map((item, index) => (
                      <div key={item} className="flex items-center gap-3">
                        <div
                          className="flex h-9 w-9 items-center justify-center rounded-2xl text-sm font-bold text-white"
                          style={{
                            background: index < 3
                              ? "linear-gradient(135deg, #2563eb 0%, #8b5cf6 100%)"
                              : "linear-gradient(135deg, #cbd5e1 0%, #94a3b8 100%)",
                          }}
                        >
                          {index + 1}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-slate-800">{item}</p>
                          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-blue-600 to-violet-500"
                              style={{ width: `${92 - index * 14}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-[1.7rem] border border-slate-200/85 bg-white/90 p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Study Assets</p>
                    <p className="mt-3 text-3xl font-bold text-slate-900">요약 + 퀴즈</p>
                    <p className="mt-2 text-sm text-slate-500">한 화면에서 이어지는 복습 흐름</p>
                  </div>
                  <div className="rounded-[1.7rem] border border-slate-200/85 bg-white/90 p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Premium Space</p>
                    <p className="mt-3 text-3xl font-bold text-slate-900">최대 4명</p>
                    <p className="mt-2 text-sm text-slate-500">공유 스페이스로 함께 학습</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="hidden">
          <div className="rounded-[1.9rem] border border-white/70 bg-white/[0.82] p-5 shadow-[0_30px_80px_-52px_rgba(15,23,42,0.24)] backdrop-blur-xl">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-slate-500">시험 직전 복습 보드</p>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">Ready</span>
            </div>
            <div className="mt-4 space-y-3">
              {["핵심 요약 PDF 저장", "10문항 모의고사 실행", "오답 카드 다시 보기"].map((item) => (
                <div key={item} className="flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 text-white">
                    <CheckIcon className="h-4 w-4" />
                  </div>
                  <p className="text-sm font-semibold text-slate-700">{item}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const LandingIntro = memo(function LandingIntro({ onStart }) {
  const [scrollY, setScrollY] = useState(0);
  const [activeFeatureId, setActiveFeatureId] = useState(FEATURE_ITEMS[0]?.id || "");
  const [activePlanName, setActivePlanName] = useState(DEFAULT_ACTIVE_PLAN);
  const [menuOpen, setMenuOpen] = useState(false);
  const [visibleSections, setVisibleSections] = useState({});
  const scrollRafRef = useRef(null);
  const revealNodesRef = useRef(new Map());
  const featureNodesRef = useRef(new Map());
  const featureRatiosRef = useRef(new Map());

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
    if (typeof document === "undefined") return undefined;
    const previousOverflow = document.body.style.overflow;
    if (menuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = previousOverflow;
    }

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [menuOpen]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof IntersectionObserver === "undefined") return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        setVisibleSections((previous) => {
          let next = previous;
          let changed = false;

          entries.forEach((entry) => {
            const key = entry.target.getAttribute("data-reveal-key");
            if (!key) return;

            const isVisible = entry.isIntersecting || entry.intersectionRatio > 0.16;
            if (previous[key] === isVisible) return;

            if (!changed) {
              next = { ...previous };
              changed = true;
            }

            next[key] = isVisible;
          });

          return changed ? next : previous;
        });
      },
      {
        root: null,
        threshold: [0.12, 0.22, 0.35, 0.5],
        rootMargin: "-8% 0px -14% 0px",
      }
    );

    revealNodesRef.current.forEach((node) => {
      observer.observe(node);
    });

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || typeof IntersectionObserver === "undefined") return undefined;
    const ratios = featureRatiosRef.current;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const id = entry.target.getAttribute("data-feature-id");
          if (!id) return;

          if (entry.isIntersecting) {
            ratios.set(id, entry.intersectionRatio);
          } else {
            ratios.delete(id);
          }
        });

        let nextId = FEATURE_ITEMS[0]?.id || "";
        let maxRatio = -1;

        ratios.forEach((ratio, id) => {
          if (ratio > maxRatio) {
            maxRatio = ratio;
            nextId = id;
          }
        });

        if (maxRatio >= 0) {
          setActiveFeatureId(nextId);
        }
      },
      {
        root: null,
        threshold: [0.22, 0.35, 0.48, 0.62, 0.74],
        rootMargin: "-10% 0px -24% 0px",
      }
    );

    featureNodesRef.current.forEach((node) => {
      observer.observe(node);
    });

    return () => {
      observer.disconnect();
      ratios.clear();
    };
  }, []);

  const registerRevealNode = useCallback((key, node) => {
    if (node) {
      revealNodesRef.current.set(key, node);
    } else {
      revealNodesRef.current.delete(key);
    }
  }, []);

  const registerFeatureNode = useCallback((key, node) => {
    if (node) {
      featureNodesRef.current.set(key, node);
    } else {
      featureNodesRef.current.delete(key);
    }
  }, []);

  const forceRevealAll =
    typeof window !== "undefined" &&
    (() => {
      const params = new URLSearchParams(window.location.search);
      return params.get("revealAll") === "1" || params.get("previewLanding") === "1";
    })();

  const isVisible = useCallback((key) => forceRevealAll || Boolean(visibleSections[key]), [forceRevealAll, visibleSections]);

  const handleStart = useCallback(() => {
    setMenuOpen(false);
    onStart?.();
  }, [onStart]);

  const handleJump = useCallback((id) => {
    if (typeof window === "undefined") return;
    const section = document.getElementById(id);
    setMenuOpen(false);
    if (!section) return;
    const top = section.getBoundingClientRect().top + window.scrollY - 88;
    window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }, []);

  const handlePlanInteract = useCallback((planName) => {
    setActivePlanName(planName);
  }, []);

  const navSolid = scrollY > 24;
  const heroOpacity = Math.max(0.52, 1 - scrollY / 1100);
  const heroTranslate = Math.min(scrollY * 0.145, 168);
  const heroScale = Math.max(0.88, 1 - scrollY / 2100);
  const heroGlowShift = Math.min(scrollY * 0.18, 180);
  const heroGlowSpread = Math.min(scrollY * 0.065, 56);
  const heroGridShift = Math.min(scrollY * 0.24, 240);

  return (
    <div className="zeus-landing relative overflow-hidden bg-[#f5f7fb] text-slate-900">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:wght@500;600;700&family=Sora:wght@400;500;600;700;800&display=swap');
        .zeus-landing {
          --zeus-border: rgba(255, 255, 255, 0.72);
          --zeus-panel: rgba(255, 255, 255, 0.8);
          font-family: "Sora", "Pretendard Variable", "Noto Sans KR", sans-serif;
          background:
            radial-gradient(circle at top left, rgba(96, 165, 250, 0.22), transparent 24%),
            radial-gradient(circle at top right, rgba(167, 139, 250, 0.24), transparent 25%),
            linear-gradient(180deg, #f8fbff 0%, #f3f6fb 50%, #eef2ff 100%);
        }
        .zeus-display {
          font-family: "Fraunces", "Times New Roman", serif;
        }
        .zeus-landing .landing-title,
        .zeus-landing .landing-subtitle {
          text-wrap: balance;
        }
        .zeus-hero-enter {
          animation: zeus-hero-in 880ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
        .zeus-float-soft {
          animation: zeus-float-soft 8s ease-in-out infinite;
        }
        .zeus-float-delay {
          animation-delay: -2.5s;
        }
        @keyframes zeus-hero-in {
          from {
            opacity: 0;
            transform: translateY(28px) scale(0.985);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @keyframes zeus-float-soft {
          0%, 100% {
            transform: translate3d(0, 0, 0);
          }
          50% {
            transform: translate3d(0, 12px, 0);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .zeus-hero-enter,
          .zeus-float-soft,
          .zeus-float-delay {
            animation: none !important;
          }
        }
      `}</style>

      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute left-[-10%] top-24 h-64 w-64 rounded-full bg-sky-300/25 blur-3xl sm:h-80 sm:w-80"
          style={{ transform: `translate3d(${-heroGlowSpread}px, ${heroGlowShift * 0.48}px, 0)` }}
        />
        <div
          className="absolute right-[-12%] top-10 h-72 w-72 rounded-full bg-violet-300/25 blur-3xl sm:h-[26rem] sm:w-[26rem]"
          style={{ transform: `translate3d(${heroGlowSpread}px, ${heroGlowShift * 0.34}px, 0)` }}
        />
        <div
          className="absolute bottom-[-10rem] left-1/2 h-[24rem] w-[24rem] rounded-full bg-cyan-200/40 blur-[140px]"
          style={{ transform: `translate3d(-50%, ${heroGlowShift * 0.26}px, 0) scale(${1 + Math.min(scrollY / 3200, 0.12)})` }}
        />
        <div
          className="absolute inset-0"
          style={{
            opacity: 0.05,
            backgroundImage: "linear-gradient(rgba(15,23,42,0.85) 1px, transparent 1px), linear-gradient(90deg, rgba(15,23,42,0.85) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
            backgroundPosition: `0 ${heroGridShift}px, 0 ${heroGridShift}px`,
          }}
        />
      </div>

      <nav
        className={`fixed inset-x-0 top-0 z-50 border-b transition-all duration-300 ${
          navSolid
            ? "border-slate-200/80 bg-white/[0.84] shadow-[0_20px_40px_-34px_rgba(15,23,42,0.34)] backdrop-blur-2xl"
            : "border-white/70 bg-white/55 backdrop-blur-xl"
        }`}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-6 lg:px-8">
          <button type="button" onClick={() => handleJump("hero")} className="flex items-center gap-3 text-left">
            <ZeusianLogo className="h-11 w-11 rounded-2xl object-cover shadow-[0_18px_34px_-18px_rgba(15,23,42,0.3)]" />
            <div>
              <p className="text-lg font-bold text-slate-900">Zeusian.ai</p>
            </div>
          </button>

          <div className="hidden items-center gap-8 lg:flex">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleJump(item.id)}
                className="text-sm font-semibold text-slate-600 transition hover:text-slate-950"
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="hidden items-center gap-3 lg:flex">
            <a
              href="/study-ai"
              className="rounded-full px-4 py-2 text-sm font-semibold text-slate-600 transition hover:text-slate-950"
            >
              소개 문서
            </a>
            <button
              type="button"
              onClick={handleStart}
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-blue-600 to-violet-500 px-5 py-3 text-sm font-semibold text-white shadow-[0_18px_34px_-18px_rgba(99,102,241,0.55)] transition hover:translate-y-[-1px] hover:shadow-[0_24px_38px_-18px_rgba(99,102,241,0.55)]"
            >
              <span>바로 시작하기</span>
              <ArrowRightIcon className="h-4 w-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => setMenuOpen((previous) => !previous)}
            aria-expanded={menuOpen}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white/80 text-slate-700 shadow-sm lg:hidden"
          >
            {menuOpen ? <CloseIcon /> : <MenuIcon />}
          </button>
        </div>
      </nav>

      {menuOpen ? (
        <div className="fixed inset-x-5 top-[5.35rem] z-40 rounded-[1.8rem] border border-white/80 bg-white/90 p-5 shadow-[0_32px_80px_-46px_rgba(15,23,42,0.32)] backdrop-blur-2xl lg:hidden">
          <div className="space-y-2">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleJump(item.id)}
                className="flex w-full items-center justify-between rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-3 text-left text-sm font-semibold text-slate-700"
              >
                <span>{item.label}</span>
                <ArrowRightIcon className="h-4 w-4" />
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={handleStart}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 to-violet-500 px-5 py-3.5 text-sm font-semibold text-white shadow-[0_18px_34px_-18px_rgba(99,102,241,0.55)]"
          >
            <span>Zeusian.ai 시작하기</span>
            <ArrowRightIcon className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      <section id="hero" className="relative px-5 pb-24 pt-28 sm:px-6 lg:px-8 lg:pb-32 lg:pt-32">
        <div className="mx-auto max-w-7xl">
          <div
            className="zeus-hero-enter mx-auto flex max-w-5xl flex-col items-center text-center"
            style={{
              opacity: heroOpacity,
              transform: `translateY(${heroTranslate}px) scale(${heroScale})`,
              transformOrigin: "top center",
            }}
          >
            <h1 className="landing-title max-w-5xl text-[2.9rem] font-bold leading-[0.96] text-slate-950 sm:text-[4.35rem] lg:text-[6.2rem]">
              강의 PDF가
              <br />
              <span className="bg-gradient-to-r from-blue-600 via-sky-500 to-violet-500 bg-clip-text text-transparent">
                요약, 퀴즈, 카드까지
              </span>
            </h1>
            <p className="landing-subtitle mt-7 max-w-3xl text-base leading-8 text-slate-600 sm:text-lg">
              Zeusian.ai는 PDF 강의자료를 요약하고 문제를 만드는 공부 AI입니다. 요약부터 퀴즈, 카드, AI 튜터까지
              자동으로 연결하고 반복 복습 루프를 한 곳에서 완성하세요.
            </p>

            <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row">
              <button
                type="button"
                onClick={handleStart}
                className="inline-flex min-w-[11rem] items-center justify-center gap-2 rounded-full bg-gradient-to-r from-blue-600 to-violet-500 px-7 py-3.5 text-sm font-semibold text-white shadow-[0_22px_40px_-20px_rgba(99,102,241,0.58)] transition hover:translate-y-[-1px] hover:shadow-[0_28px_44px_-20px_rgba(99,102,241,0.58)]"
              >
                <span>시작하기</span>
                <ArrowRightIcon className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => handleJump("features")}
                className="inline-flex min-w-[11rem] items-center justify-center gap-2 rounded-full border border-slate-300 bg-white/[0.72] px-7 py-3.5 text-sm font-semibold text-slate-700 shadow-[0_16px_32px_-24px_rgba(15,23,42,0.3)] backdrop-blur transition hover:border-slate-400 hover:text-slate-950"
              >
                <span>기능 보기</span>
                <ArrowRightIcon className="h-4 w-4" />
              </button>
            </div>

          </div>

        </div>
      </section>
      <section id="features" className="relative px-5 py-24 sm:px-6 lg:px-8 lg:py-32">
        <div className="mx-auto max-w-7xl">
          <div
            ref={(node) => registerRevealNode("features-heading", node)}
            data-reveal-key="features-heading"
            className="mx-auto max-w-3xl text-center"
            style={getRevealStyle(isVisible("features-heading"), { y: 28 })}
          >
            <h2 className="landing-title text-4xl font-bold leading-tight text-slate-950 sm:text-5xl lg:text-6xl">
              지금 공부 흐름에 바로 들어갈
              <br />
              <span className="bg-gradient-to-r from-blue-600 to-violet-500 bg-clip-text text-transparent">핵심 기능 다섯 가지</span>
            </h2>
            <p className="landing-subtitle mt-6 text-base leading-8 text-slate-600 sm:text-lg">
              문서를 올린 뒤 끝나는 서비스가 아니라, 이해하고 문제를 풀고 다시 복습하는 흐름까지 이어지도록
              설계했습니다.
            </p>
          </div>

          <div className="mt-16 space-y-20 lg:mt-24 lg:space-y-28">
            {FEATURE_ITEMS.map((feature, index) => {
              const isActive = activeFeatureId === feature.id;
              const sectionVisible = isVisible(`feature-${feature.id}`);
              const Icon = feature.Icon;

              return (
                <article
                  key={feature.id}
                  ref={(node) => {
                    registerRevealNode(`feature-${feature.id}`, node);
                    registerFeatureNode(feature.id, node);
                  }}
                  data-reveal-key={`feature-${feature.id}`}
                  data-feature-id={feature.id}
                  onPointerEnter={(event) => {
                    if (event.pointerType === "mouse") {
                      setActiveFeatureId(feature.id);
                    }
                  }}
                  className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.92fr)] lg:gap-16"
                  style={getRevealStyle(sectionVisible, {
                    y: 44,
                    x: index % 2 === 0 ? -14 : 14,
                    delay: Math.min(index * 60, 220),
                  })}
                >
                  <div className={index % 2 === 0 ? "lg:order-2" : ""}>
                    <div className="relative">
                      <div
                        className="pointer-events-none absolute inset-[-9%] rounded-[3rem] blur-3xl transition duration-500"
                        style={{
                          background: feature.theme.halo,
                          opacity: isActive ? 1 : 0.5,
                        }}
                      />
                      <div
                        className="relative aspect-[1.18/0.82] overflow-hidden rounded-[2.2rem] border border-white/80 bg-white/80 shadow-[0_30px_80px_-42px_rgba(15,23,42,0.22)] backdrop-blur-xl"
                        style={{
                          boxShadow: isActive
                            ? `0 38px 90px -46px ${feature.theme.glow}, inset 0 1px 0 rgba(255,255,255,0.72)`
                            : "0 28px 70px -54px rgba(15,23,42,0.22), inset 0 1px 0 rgba(255,255,255,0.72)",
                        }}
                      >
                        <div className="absolute inset-0 opacity-90" style={{ background: feature.theme.tint }} />
                        <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(255,255,255,0.82),rgba(255,255,255,0.16))]" />
                        <div
                          className="absolute inset-0 opacity-[0.2]"
                          style={{
                            backgroundImage: "linear-gradient(rgba(15,23,42,0.18) 1px, transparent 1px), linear-gradient(90deg, rgba(15,23,42,0.18) 1px, transparent 1px)",
                            backgroundSize: "34px 34px",
                          }}
                        />
                        <div className="absolute -left-8 top-10 h-28 w-28 rounded-full blur-3xl" style={{ background: feature.theme.accent, opacity: 0.3 }} />
                        <div className="absolute -right-12 bottom-0 h-40 w-40 rounded-full blur-3xl" style={{ background: feature.theme.accent, opacity: 0.22 }} />
                        <div className="absolute left-[14%] top-[22%] h-px w-[44%] bg-slate-900/16" />
                        <div className="absolute left-[26%] top-[46%] h-px w-[50%] bg-slate-900/12" />
                        <div className="absolute left-[18%] top-[68%] h-px w-[36%] bg-slate-900/14" />
                        <div className="relative flex h-full items-center justify-center p-8 sm:p-10">
                          <div className="flex h-28 w-28 items-center justify-center rounded-[2rem] border border-white/70 bg-white/85 text-slate-950 shadow-[0_28px_60px_-28px_rgba(15,23,42,0.35)] sm:h-32 sm:w-32">
                            <Icon className="h-14 w-14 sm:h-16 sm:w-16" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className={index % 2 === 0 ? "lg:order-1" : ""}>
                    <div
                      className="inline-flex rounded-[1.4rem] p-4 text-white shadow-[0_24px_40px_-24px_rgba(99,102,241,0.6)]"
                      style={{ background: feature.theme.accent }}
                    >
                      <Icon className="h-8 w-8 sm:h-10 sm:w-10" />
                    </div>
                    <h3 className="mt-6 text-3xl font-bold leading-tight text-slate-950 sm:text-4xl lg:text-5xl">{feature.label}</h3>
                    <p className="mt-5 max-w-xl text-base leading-8 text-slate-600 sm:text-lg">{feature.description}</p>
                    <div className="mt-7 space-y-3">
                      {feature.previewMeta.map((item) => (
                        <div key={`${feature.id}-copy-${item}`} className="flex items-start gap-3">
                          <span
                            className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white"
                            style={{ background: feature.theme.accent }}
                          >
                            <CheckIcon className="h-3 w-3" />
                          </span>
                          <span className="text-sm leading-7 text-slate-600 sm:text-base">{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section id="workflow" className="relative px-5 py-24 sm:px-6 lg:px-8 lg:py-32">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:gap-16">
          <div
            ref={(node) => registerRevealNode("workflow-copy", node)}
            data-reveal-key="workflow-copy"
            style={getRevealStyle(isVisible("workflow-copy"), { y: 32 })}
          >
            <h2 className="landing-title text-4xl font-bold leading-tight text-slate-950 sm:text-5xl lg:text-6xl">
              업로드 이후 공부 흐름이
              <br />
              <span className="bg-gradient-to-r from-cyan-500 to-blue-600 bg-clip-text text-transparent">끊기지 않게 설계했습니다</span>
            </h2>
            <p className="landing-subtitle mt-6 text-base leading-8 text-slate-600 sm:text-lg">
              자료를 올리고, 핵심을 정리하고, 문제를 풀고, 다시 헷갈린 부분을 튜터로 이어가는 루프를 한 화면에서
              다룹니다.
            </p>

            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              {STATS.map((stat, index) => (
                <div
                  key={stat.label}
                  className="rounded-[1.8rem] border border-white/80 bg-white/80 px-5 py-6 shadow-[0_22px_40px_-34px_rgba(15,23,42,0.25)] backdrop-blur"
                  style={getRevealStyle(isVisible("workflow-copy"), { y: 24, delay: 120 + index * 70 })}
                >
                  <p className="text-4xl font-bold text-slate-950 sm:text-5xl">
                    {stat.value}
                    <span className="zeus-display ml-2 text-2xl text-slate-500">{stat.unit}</span>
                  </p>
                  <p className="mt-3 text-sm leading-6 text-slate-500">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>

          <div
            ref={(node) => registerRevealNode("workflow-steps", node)}
            data-reveal-key="workflow-steps"
            className="space-y-4"
            style={getRevealStyle(isVisible("workflow-steps"), { y: 32, delay: 90 })}
          >
            {STEP_ITEMS.map((step, index) => (
              <article
                key={step.step}
                className="relative overflow-hidden rounded-[2rem] border border-white/80 bg-white/[0.82] p-6 shadow-[0_28px_70px_-46px_rgba(15,23,42,0.24)] backdrop-blur sm:p-7"
                style={getRevealStyle(isVisible("workflow-steps"), { y: 24, delay: index * 90 })}
              >
                <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-blue-600 via-sky-500 to-violet-500" />
                <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
                  <div className="flex items-start gap-4">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[1.3rem] bg-gradient-to-br from-blue-600 to-violet-500 text-lg font-bold text-white shadow-[0_18px_30px_-18px_rgba(99,102,241,0.55)]">
                      {step.step}
                    </div>
                    <div>
                      <h3 className="text-2xl font-bold text-slate-950">{step.title}</h3>
                      <p className="mt-3 text-base leading-7 text-slate-600">{step.description}</p>
                      <p className="mt-3 text-sm leading-6 text-slate-500">{step.note}</p>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="relative px-5 py-24 sm:px-6 lg:px-8 lg:py-32">
        <div className="mx-auto max-w-7xl">
          <div
            ref={(node) => registerRevealNode("pricing-heading", node)}
            data-reveal-key="pricing-heading"
            className="mx-auto max-w-3xl text-center"
            style={getRevealStyle(isVisible("pricing-heading"), { y: 28 })}
          >
            <h2 className="landing-title text-4xl font-bold leading-tight text-slate-950 sm:text-5xl lg:text-6xl">
              필요한 만큼 시작하고
              <br />
              <span className="bg-gradient-to-r from-blue-600 to-violet-500 bg-clip-text text-transparent">학습 범위에 맞게 확장하세요</span>
            </h2>
            <p className="landing-subtitle mt-6 text-base leading-8 text-slate-600 sm:text-lg">
              무료로 가볍게 시작하고, 더 자주 공부하면 프로로, 함께 쓰면 프리미엄으로 자연스럽게 넘어가면 됩니다.
            </p>
          </div>

          <div className="mt-16 grid gap-5 lg:grid-cols-3">
            {PLAN_ITEMS.map((plan, index) => {
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
                  className="relative overflow-hidden rounded-[2rem] border bg-white/[0.82] p-6 shadow-[0_28px_70px_-48px_rgba(15,23,42,0.24)] backdrop-blur transition-all duration-300 sm:p-7"
                  style={{
                    ...getRevealStyle(isVisible("pricing-heading"), { y: 28, delay: 120 + index * 80 }),
                    borderColor: isActive ? "rgba(99, 102, 241, 0.28)" : "rgba(255, 255, 255, 0.78)",
                    boxShadow: isActive
                      ? `0 34px 84px -44px ${plan.glow}, inset 0 1px 0 rgba(255,255,255,0.72)`
                      : "0 28px 70px -48px rgba(15,23,42,0.24), inset 0 1px 0 rgba(255,255,255,0.72)",
                    transform: isActive ? "translateY(-6px)" : "translateY(0)",
                  }}
                >
                  <div className="absolute inset-x-0 top-0 h-1.5" style={{ background: plan.accent }} />
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-2xl font-bold text-slate-950">{plan.name}</h3>
                      <p className="mt-3 text-sm leading-6 text-slate-500">{plan.description}</p>
                    </div>
                  </div>

                  <p className="mt-8 text-4xl font-bold text-slate-950">{plan.price}</p>
                  <ul className="mt-7 space-y-3 text-sm text-slate-600">
                    {plan.features.map((feature) => (
                      <li key={`${plan.name}-${feature}`} className="flex items-start gap-3">
                        <span
                          className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white"
                          style={{ background: plan.accent }}
                        >
                          <CheckIcon className="h-3.5 w-3.5" />
                        </span>
                        <span className="leading-6">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <button
                    type="button"
                    onClick={() => handlePlanInteract(plan.name)}
                    className={`mt-8 inline-flex w-full items-center justify-center gap-2 rounded-full border px-5 py-3 text-sm font-semibold transition ${
                      isActive ? "border-transparent text-white" : "border-slate-300 bg-white/[0.82] text-slate-700 hover:border-slate-400 hover:text-slate-950"
                    }`}
                    style={isActive ? { background: plan.accent, boxShadow: `0 18px 34px -18px ${plan.glow}` } : undefined}
                  >
                    <span>{isActive ? "현재 선택" : plan.ctaLabel}</span>
                    <ArrowRightIcon className="h-4 w-4" />
                  </button>
                </article>
              );
            })}
          </div>
          <div
            className="mt-10 grid gap-4 md:hidden"
            style={getRevealStyle(isVisible("pricing-heading"), { y: 28, delay: 180 })}
          >
            {PLAN_ITEMS.map((plan) => {
              const isActive = activePlanName === plan.name;
              return (
                <article
                  key={`${plan.name}-mobile-compare`}
                  className={`rounded-[1.8rem] border bg-white/[0.82] p-5 shadow-[0_24px_60px_-46px_rgba(15,23,42,0.24)] ${
                    isActive ? "border-violet-200" : "border-white/80"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xl font-bold text-slate-950">{plan.name}</p>
                      <p className="mt-1 text-sm text-slate-500">{plan.price}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handlePlanInteract(plan.name)}
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                        isActive ? "bg-slate-950 text-white" : "border border-slate-200 bg-white text-slate-600"
                      }`}
                    >
                      {isActive ? "선택됨" : "선택"}
                    </button>
                  </div>
                  <div className="mt-4 space-y-3">
                    {PLAN_COMPARISON_ROWS.map((row) => (
                      <div key={`${plan.name}-${row.label}`} className="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{row.label}</p>
                        <p className="mt-2 text-sm font-medium leading-6 text-slate-700">{row.values[plan.name]}</p>
                      </div>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>

          <div
            className="mt-12 hidden overflow-hidden rounded-[2rem] border border-white/80 bg-white/[0.82] shadow-[0_34px_90px_-54px_rgba(15,23,42,0.28)] backdrop-blur md:block"
            style={getRevealStyle(isVisible("pricing-heading"), { y: 28, delay: 220 })}
          >
            <div className="grid grid-cols-[180px_repeat(3,minmax(0,1fr))] border-b border-slate-200/80">
              <div className="px-5 py-5 text-sm font-semibold uppercase tracking-[0.22em] text-slate-400">비교 항목</div>
              {PLAN_ITEMS.map((plan) => {
                const isActive = activePlanName === plan.name;
                return (
                  <button
                    key={`${plan.name}-header`}
                    type="button"
                    onClick={() => handlePlanInteract(plan.name)}
                    className={`border-l px-5 py-5 text-left transition ${
                      isActive ? "bg-slate-950 text-white" : "bg-white/75 text-slate-900 hover:bg-slate-50"
                    }`}
                  >
                    <p className="text-2xl font-bold">{plan.name}</p>
                    <p className={`mt-2 text-sm ${isActive ? "text-slate-300" : "text-slate-500"}`}>{plan.description}</p>
                    <p className={`mt-4 text-2xl font-bold ${isActive ? "text-white" : "text-slate-900"}`}>{plan.price}</p>
                  </button>
                );
              })}
            </div>

            {PLAN_COMPARISON_ROWS.map((row) => (
              <Fragment key={row.label}>
                <div className="grid grid-cols-[180px_repeat(3,minmax(0,1fr))] border-b border-slate-200/80 last:border-b-0">
                  <div className="bg-slate-50/80 px-5 py-4 text-sm font-semibold text-slate-500">{row.label}</div>
                  {PLAN_ITEMS.map((plan) => {
                    const isActive = activePlanName === plan.name;
                    return (
                      <div
                        key={`${row.label}-${plan.name}`}
                        className={`border-l px-5 py-4 text-sm leading-7 ${
                          isActive ? "bg-violet-50/70 text-slate-900" : "bg-white/70 text-slate-600"
                        }`}
                      >
                        {row.values[plan.name]}
                      </div>
                    );
                  })}
                </div>
              </Fragment>
            ))}
          </div>
        </div>
      </section>

      <section className="relative px-5 py-24 sm:px-6 lg:px-8 lg:py-32">
        <div className="mx-auto max-w-7xl">
          <div
            ref={(node) => registerRevealNode("cta", node)}
            data-reveal-key="cta"
            className="relative overflow-hidden rounded-[2.4rem] border border-slate-900/10 bg-slate-950 px-6 py-8 text-white shadow-[0_36px_90px_-52px_rgba(15,23,42,0.45)] sm:px-8 sm:py-10 lg:px-12 lg:py-12"
            style={getRevealStyle(isVisible("cta"), { y: 32 })}
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(96,165,250,0.28),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(167,139,250,0.24),transparent_34%),linear-gradient(180deg,#020617_0%,#0f172a_100%)]" />
            <div className="absolute inset-0 opacity-[0.08]" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.8) 1px, transparent 1px)", backgroundSize: "38px 38px" }} />

            <div className="relative grid gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)] lg:items-center">
              <div>
                <h2 className="landing-title text-4xl font-bold leading-tight text-white sm:text-5xl lg:text-6xl">
                  이제 공부 루프를
                  <br />
                  <span className="bg-gradient-to-r from-sky-300 to-violet-300 bg-clip-text text-transparent">실제로 돌려보세요</span>
                </h2>
                <p className="landing-subtitle mt-6 max-w-2xl text-base leading-8 text-slate-300 sm:text-lg">
                  PDF 업로드부터 복습 문제까지, 학습 흐름 전체를 한 곳에 정리할 준비가 되어 있습니다.
                </p>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={handleStart}
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-blue-600 to-violet-500 px-7 py-3.5 text-sm font-semibold text-white shadow-[0_18px_36px_-18px_rgba(99,102,241,0.58)] transition hover:translate-y-[-1px]"
                  >
                    <span>Zeusian.ai 시작하기</span>
                    <ArrowRightIcon className="h-4 w-4" />
                  </button>
                  <a
                    href="/study-ai"
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-white/15 bg-white/5 px-7 py-3.5 text-sm font-semibold text-white/90 transition hover:bg-white/10"
                  >
                    <span>전용 안내 페이지 보기</span>
                  </a>
                </div>
              </div>

              <div className="rounded-[2rem] border border-white/10 bg-white/[0.08] p-5 backdrop-blur-xl sm:p-6">
                <div className="rounded-[1.7rem] border border-white/10 bg-white/5 p-5">
                  <div className="space-y-4">
                    {[
                      "PDF를 올리면 요약, 퀴즈, 카드 흐름이 자동 생성됩니다.",
                      "AI 튜터로 문서 기반 질문을 이어서 할 수 있습니다.",
                      "모의고사와 오답 복습으로 시험 직전까지 이어집니다.",
                    ].map((item, index) => (
                      <div key={item} className="flex items-start gap-3">
                        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 to-violet-400 text-sm font-bold text-slate-950">
                          {index + 1}
                        </div>
                        <p className="text-sm leading-7 text-slate-200">{item}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="relative overflow-hidden border-t border-white/6 bg-[#171a21] px-5 py-10 text-slate-300 sm:px-6 lg:px-8 lg:py-12">
        <div className="pointer-events-none absolute inset-0 opacity-[0.07]" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.82) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.82) 1px, transparent 1px)", backgroundSize: "44px 44px" }} />
        <div className="pointer-events-none absolute -left-24 top-0 h-56 w-56 rounded-full bg-emerald-400/10 blur-[120px]" />
        <div className="pointer-events-none absolute right-0 top-10 h-64 w-64 rounded-full bg-blue-400/8 blur-[140px]" />

        <div className="relative mx-auto max-w-7xl">
          <div className="rounded-[2rem] border border-white/8 bg-white/[0.03] p-6 shadow-[0_28px_80px_-48px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:p-7 lg:p-8">
            <div className="flex flex-col gap-5 border-b border-white/8 pb-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-3">
                <ZeusianLogo className="h-12 w-12 rounded-2xl object-cover shadow-[0_20px_36px_-24px_rgba(16,185,129,0.4)]" />
                <div>
                  <p className="text-[1.65rem] font-bold tracking-[-0.03em] text-white">Zeusian.ai</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                {LEGAL_LINKS.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-slate-100 transition hover:border-white/20 hover:bg-white/[0.08]"
                  >
                    {link.label}
                  </a>
                ))}
              </div>
            </div>

            <div className="grid gap-10 pt-6 lg:grid-cols-[minmax(260px,1.05fr)_minmax(0,1fr)] lg:pt-8">
              <div className="space-y-5">
                {FOOTER_COMPANY_INFO ? (
                  <div className="text-sm leading-7 text-slate-400">
                    <p>
                      {FOOTER_COMPANY_INFO.label}: {FOOTER_COMPANY_INFO.value}
                    </p>
                  </div>
                ) : null}

                <div className="max-w-sm">
                  <p className="zeus-display text-3xl leading-tight text-white sm:text-[2.4rem]">
                    PDF 한 장에서
                    <br />
                    복습 루프까지
                  </p>
                  <p className="mt-4 text-sm leading-7 text-slate-400 sm:text-base">
                    Zeusian.ai는 PDF 요약, 퀴즈, 카드, AI 튜터 흐름을 한곳에서 이어줍니다.
                  </p>
                </div>
              </div>

              <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
                {FOOTER_LINK_GROUPS.map((group) => (
                  <div key={group.title}>
                    <p className="text-sm font-semibold text-white">{group.title}</p>
                    <div className="mt-4 space-y-3">
                      {group.links.map((link) => (
                        <a
                          key={`${group.title}-${link.href}-${link.label}`}
                          href={link.href}
                          className="block text-sm text-slate-400 transition hover:text-white"
                        >
                          {link.label}
                        </a>
                      ))}
                    </div>
                  </div>
                ))}

                <div>
                  <p className="text-sm font-semibold text-white">Legal</p>
                  <div className="mt-4 space-y-3">
                    {LEGAL_LINKS.map((link) => (
                      <a
                        key={`legal-column-${link.href}`}
                        href={link.href}
                        className="block text-sm text-slate-400 transition hover:text-white"
                      >
                        {link.label}
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
});

export default LandingIntro;
