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

const FEATURE_THEMES = {
  summary: {
    accent: "linear-gradient(135deg, #2563eb 0%, #8b5cf6 100%)",
    glow: "rgba(99, 102, 241, 0.24)",
    halo: "radial-gradient(circle at center, rgba(129, 140, 248, 0.28) 0%, rgba(129, 140, 248, 0) 68%)",
    tint: "rgba(99, 102, 241, 0.08)",
    border: "rgba(99, 102, 241, 0.14)",
  },
  quiz: {
    accent: "linear-gradient(135deg, #0f766e 0%, #06b6d4 100%)",
    glow: "rgba(13, 148, 136, 0.23)",
    halo: "radial-gradient(circle at center, rgba(45, 212, 191, 0.28) 0%, rgba(45, 212, 191, 0) 68%)",
    tint: "rgba(13, 148, 136, 0.08)",
    border: "rgba(13, 148, 136, 0.14)",
  },
  flashcards: {
    accent: "linear-gradient(135deg, #f97316 0%, #ec4899 100%)",
    glow: "rgba(244, 114, 182, 0.22)",
    halo: "radial-gradient(circle at center, rgba(251, 146, 60, 0.24) 0%, rgba(251, 146, 60, 0) 68%)",
    tint: "rgba(249, 115, 22, 0.08)",
    border: "rgba(249, 115, 22, 0.14)",
  },
  tutor: {
    accent: "linear-gradient(135deg, #4f46e5 0%, #ec4899 100%)",
    glow: "rgba(129, 140, 248, 0.24)",
    halo: "radial-gradient(circle at center, rgba(167, 139, 250, 0.28) 0%, rgba(167, 139, 250, 0) 68%)",
    tint: "rgba(129, 140, 248, 0.08)",
    border: "rgba(129, 140, 248, 0.14)",
  },
  mockExam: {
    accent: "linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)",
    glow: "rgba(59, 130, 246, 0.23)",
    halo: "radial-gradient(circle at center, rgba(56, 189, 248, 0.26) 0%, rgba(56, 189, 248, 0) 68%)",
    tint: "rgba(14, 165, 233, 0.08)",
    border: "rgba(14, 165, 233, 0.14)",
  },
};

const LANDING_COPY = {
  ko: {
    languageLabel: "언어",
    startNow: "바로 시작하기",
    startZeusian: "Zeusian.ai 시작하기",
    openMenu: "메뉴 열기",
    closeMenu: "메뉴 닫기",
    nav: {
      features: "기능",
      workflow: "학습 플로우",
      pricing: "요금제",
    },
    hero: {
      line1: "시험 직전",
      line2: "벼락치기용 PDF 공부 AI",
      description:
        "Zeusian.ai(제우시안 AI)는 시험 직전 빠르게 복습해야 할 때, PDF 강의자료를 요약, 퀴즈, 카드, AI 튜터 흐름으로 바로 바꿔주는 공부 AI입니다.",
      primary: "시작하기",
      secondary: "기능 보기",
    },
    sections: {
      featuresLead: "지금 공부 흐름에 바로 들어갈",
      featuresAccent: "핵심 기능 다섯 가지",
      featuresDescription:
        "문서를 올린 뒤 끝나는 서비스가 아니라, 이해하고 문제를 풀고 다시 복습하는 흐름까지 이어지도록 설계했습니다.",
      workflowLead: "업로드 이후 공부 흐름이",
      workflowAccent: "끊기지 않게 설계했습니다",
      workflowDescription:
        "자료를 올리고, 핵심을 정리하고, 문제를 풀고, 다시 헷갈린 부분을 튜터로 이어가는 루프를 한 화면에서 다룹니다.",
      pricingLead: "필요한 만큼 시작하고",
      pricingAccent: "학습 범위에 맞게 확장하세요",
      pricingDescription:
        "무료로 가볍게 시작하고, 더 자주 공부하면 프로로, 함께 쓰면 패밀리로 자연스럽게 넘어가면 됩니다.",
      ctaLead: "이제 공부 루프를",
      ctaAccent: "실제로 돌려보세요",
      ctaDescription:
        "PDF 업로드부터 복습 문제까지, 학습 흐름 전체를 한 곳에 정리할 준비가 되어 있습니다.",
    },
    featureVisualStep: "한 번 생성한 뒤 계속 이어서 복습합니다.",
    features: {
      summary: {
        label: "핵심 요약",
        description: "긴 PDF에서 핵심만 추려 빠르게 복습할 수 있게 정리합니다.",
        previewTitle: "강의 흐름은 유지하고 핵심만 남깁니다",
        bullets: ["핵심 개념 자동 정리", "페이지 단위 문맥 유지", "정리본 PDF 저장"],
      },
      quiz: {
        label: "문제 생성",
        description: "객관식, OX 등 시험형 문제를 자동 생성해 실전처럼 연습합니다.",
        previewTitle: "시험형 문제를 바로 연습 세트로 바꿉니다",
        bullets: ["객관식과 OX 혼합", "문항별 해설 자동 연결", "10문항 모의 테스트 구성"],
      },
      flashcards: {
        label: "암기 카드",
        description: "헷갈리는 개념을 카드로 만들어 반복 학습합니다.",
        previewTitle: "헷갈리는 개념을 짧고 자주 꺼내 보게 만듭니다",
        bullets: ["개념 카드 자동 생성", "오답 카드 우선 배치", "학습 진도 추적"],
      },
      tutor: {
        label: "AI 튜터",
        description: "학습 중 궁금한 내용을 바로 물어보고 문서 기반 답변을 받습니다.",
        previewTitle: "문서 근거를 바탕으로 바로 묻고 이어서 이해합니다",
        bullets: ["문서 기반 답변", "후속 질문 이어서 탐색", "비교 설명으로 이해 보강"],
      },
      mockExam: {
        label: "모의고사",
        description: "10문항 모의고사로 실전 대비 상태를 점검합니다.",
        previewTitle: "시험 직전 점검용 세트를 빠르게 돌릴 수 있습니다",
        bullets: ["10문항 자동 구성", "바로 채점과 정답 확인", "결과 PDF 저장"],
      },
    },
    workflow: {
      stats: [
        { value: "5", unit: "기능", label: "요약, 퀴즈, 카드, 튜터, 모의고사" },
        { value: "10", unit: "문항", label: "자동 생성 모의 테스트" },
        { value: "1", unit: "플로우", label: "업로드부터 복습까지 한 화면" },
      ],
      steps: [
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
      ],
    },
    pricing: {
      current: "현재 선택",
      choose: "선택",
      selected: "선택됨",
      compare: "비교 항목",
      plans: [
        {
          id: "free",
          name: "무료",
          price: "무료",
          description: "가볍게 시작하는 기본 플랜",
          features: ["PDF 업로드 4개 제한", "요약/퀴즈/OX 일부 제공", "기본 학습 흐름 체험"],
          ctaLabel: "무료 시작",
          accent: "linear-gradient(135deg, #cbd5e1 0%, #94a3b8 100%)",
          glow: "rgba(148, 163, 184, 0.22)",
        },
        {
          id: "pro",
          name: "프로",
          originalPrices: ["9,900원", "6,900원"],
          price: "0원",
          description: "혼자 꾸준히 공부하는 사용자용",
          features: ["업로드 무제한", "요약/퀴즈/OX/카드 전체 제공", "AI 튜터"],
          ctaLabel: "프로 선택",
          accent: "linear-gradient(135deg, #2563eb 0%, #8b5cf6 100%)",
          glow: "rgba(99, 102, 241, 0.26)",
        },
        {
          id: "premium",
          name: "패밀리",
          originalPrice: "36,000원",
          price: "월 18,900원",
          description: "최대 4명 팀 학습",
          features: ["공유 스페이스로 함께 학습", "팀원별 학습 현황 확인", "패밀리 자료 관리 기능"],
          ctaLabel: "패밀리 선택",
          accent: "linear-gradient(135deg, #0f766e 0%, #14b8a6 100%)",
          glow: "rgba(20, 184, 166, 0.24)",
        },
      ],
      rows: [
        { label: "이용 방식", values: { free: "무료", pro: "개인 학습", premium: "팀 학습" } },
        { label: "월 요금", values: { free: "무료", pro: "0원", premium: "18,900원 / 월" } },
        { label: "PDF 업로드", values: { free: "최대 4개", pro: "무제한 업로드", premium: "무제한 업로드" } },
        { label: "학습 도구", values: { free: "요약 / 퀴즈 / OX 일부", pro: "요약 / 퀴즈 / OX / 카드", premium: "전체 기능 + 팀 학습" } },
        { label: "AI 튜터", values: { free: "기본 답변 제공", pro: "문서 기반 답변", premium: "팀 문맥 포함 답변" } },
        { label: "공간 인원", values: { free: "1명", pro: "1명", premium: "최대 4명" } },
        { label: "자료 내보내기", values: { free: "불가", pro: "PDF 저장", premium: "PDF 저장" } },
      ],
    },
    cta: {
      primary: "Zeusian.ai 시작하기",
      secondary: "지금 바로 문서 올리기",
      bullets: [
        "PDF를 올리면 요약, 퀴즈, 카드 흐름이 바로 시작됩니다.",
        "AI 튜터와 함께 모르는 부분을 다시 이해할 수 있습니다.",
        "시험직전용 복습 루프도 자동으로 정리됩니다.",
      ],
    },
    footer: {
      companyLabel: "상호",
      titleLine1: "PDF 한 장에서",
      titleLine2: "복습 루프까지",
      description: "Zeusian.ai(제우시안 AI)는 PDF 요약, 퀴즈, 카드, AI 튜터 흐름을 한곳에서 이어줍니다.",
      legal: "법률",
      legalLinks: { terms: "이용약관", privacy: "개인정보처리방침" },
      groups: [
        {
          title: "서비스",
          links: [
            { label: "기능", href: "#features" },
            { label: "학습 플로우", href: "#workflow" },
            { label: "요금제", href: "#pricing" },
          ],
        },
        {
          title: "회사",
          links: [
            { label: "Zeusian 소개", href: "#hero" },
            { label: "Study AI", href: "/study-ai" },
            { label: "시작하기", href: "/start" },
          ],
        },
        {
          title: "리소스",
          links: [
            { label: "요약", href: "#features" },
            { label: "퀴즈", href: "#features" },
            { label: "카드", href: "#features" },
          ],
        },
      ],
    },
  },
  zh: {
    languageLabel: "语言",
    startNow: "立即开始",
    startZeusian: "开始使用 Zeusian.ai",
    openMenu: "打开菜单",
    closeMenu: "关闭菜单",
    nav: {
      features: "功能",
      workflow: "学习流程",
      pricing: "价格",
    },
    hero: {
      line1: "讲义 PDF",
      line2: "摘要、测验、卡片一站完成",
      description:
        "Zeusian.ai 是一款把 PDF 课程资料转成学习流程的 AI。它会把摘要、测验、卡片和 AI 导师连接成持续复习闭环，让你在一个页面里完成学习与回顾。",
      primary: "开始使用",
      secondary: "查看功能",
    },
    sections: {
      featuresLead: "可直接接入你的学习流程",
      featuresAccent: "的五个核心功能",
      featuresDescription:
        "它不只是展示文档。上传一次后，就能继续完成理解、练习与复习，整个流程保持连贯。",
      workflowLead: "上传之后的学习流程",
      workflowAccent: "持续衔接不断开",
      workflowDescription:
        "上传资料、提炼重点、完成练习，再把薄弱部分交给 AI 导师继续讲解，整个复习循环在同一界面里完成。",
      pricingLead: "按需开始",
      pricingAccent: "随学习规模扩展",
      pricingDescription:
        "可以先免费开始，学习更频繁时升级到 Pro，需要共享学习空间时再选择 Family。",
      ctaLead: "现在就把学习闭环",
      ctaAccent: "真正跑起来",
      ctaDescription:
        "从 PDF 上传到考前复习，Zeusian.ai 已经准备好把完整学习流程整合到一个地方。",
    },
    featureVisualStep: "生成一次后即可持续衔接复习。",
    features: {
      summary: {
        label: "核心摘要",
        description: "从长篇 PDF 中提取重点，帮助你更快进入复习状态。",
        previewTitle: "保留课程脉络，只留下真正重要的内容",
        bullets: ["自动整理核心概念", "保留分页语境", "支持导出摘要 PDF"],
      },
      quiz: {
        label: "题目生成",
        description: "自动生成选择题与 OX 判断题，直接按考试形式练习。",
        previewTitle: "把课程资料立刻转成可练习的题组",
        bullets: ["选择题与 OX 混合", "自动附带解析", "10 题模拟测试"],
      },
      flashcards: {
        label: "记忆卡片",
        description: "把容易混淆的概念做成卡片，反复记忆更高效。",
        previewTitle: "把薄弱概念变成短频快的复习节奏",
        bullets: ["自动生成概念卡", "优先复习错题卡", "跟踪学习进度"],
      },
      tutor: {
        label: "AI 导师",
        description: "学习过程中随时提问，并获得基于文档内容的回答。",
        previewTitle: "基于文档依据立即提问并继续理解",
        bullets: ["基于文档的回答", "支持追问延展", "对比式讲解帮助理解"],
      },
      mockExam: {
        label: "模拟考试",
        description: "通过 10 题模拟考试快速检查考前状态。",
        previewTitle: "考前快速跑一套最终检查题",
        bullets: ["自动生成 10 题", "即时评分与答案查看", "支持导出结果 PDF"],
      },
    },
    workflow: {
      stats: [
        { value: "5", unit: "功能", label: "摘要、测验、卡片、导师、模拟考试" },
        { value: "10", unit: "题", label: "自动生成模拟测试" },
        { value: "1", unit: "流程", label: "从上传到复习同屏完成" },
      ],
      steps: [
        {
          step: "01",
          title: "上传 PDF",
          description: "上传讲义、教材或笔记后，学习准备就完成了。",
          note: "即使叠加多个 PDF，学习流程也会保持连贯。",
        },
        {
          step: "02",
          title: "AI 分析",
          description: "系统会自动生成摘要、题目和卡片。",
          note: "重点整理与练习内容会一次性衔接完成。",
        },
        {
          step: "03",
          title: "循环复习",
          description: "通过错题回顾和模拟考试强化记忆。",
          note: "直到考试当天，复习路径都会保持清晰。",
        },
      ],
    },
    pricing: {
      current: "当前选择",
      choose: "选择",
      selected: "已选择",
      compare: "对比项目",
      plans: [
        {
          id: "free",
          name: "免费",
          price: "免费",
          description: "适合轻量起步",
          features: ["最多上传 4 个 PDF", "提供部分摘要 / 测验 / OX 功能", "体验基础学习流程"],
          ctaLabel: "免费开始",
          accent: "linear-gradient(135deg, #cbd5e1 0%, #94a3b8 100%)",
          glow: "rgba(148, 163, 184, 0.22)",
        },
        {
          id: "pro",
          name: "Pro",
          originalPrices: ["KRW 9,900 / month", "KRW 6,900 / month"],
          price: "KRW 0",
          description: "适合稳定的个人学习",
          features: ["无限上传", "完整提供摘要 / 测验 / OX / 卡片", "AI 导师"],
          ctaLabel: "选择 Pro",
          accent: "linear-gradient(135deg, #2563eb 0%, #8b5cf6 100%)",
          glow: "rgba(99, 102, 241, 0.26)",
        },
        {
          id: "premium",
          name: "Family",
          originalPrice: "₩36,000 / 月",
          price: "₩18,900 / 月",
          description: "最多 4 人共享学习",
          features: ["共享学习空间协作", "查看成员学习进度", "高级资料管理功能"],
          ctaLabel: "选择 Family",
          accent: "linear-gradient(135deg, #0f766e 0%, #14b8a6 100%)",
          glow: "rgba(20, 184, 166, 0.24)",
        },
      ],
      rows: [
        { label: "适合对象", values: { free: "起步使用", pro: "个人学习", premium: "共享学习" } },
        { label: "月费", values: { free: "免费", pro: "KRW 0", premium: "KRW 18,900 / month" } },
        { label: "PDF 上传", values: { free: "最多 4 个", pro: "无限上传", premium: "无限上传" } },
        { label: "学习工具", values: { free: "部分摘要 / 测验 / OX", pro: "摘要 / 测验 / OX / 卡片", premium: "全部功能 + 团队学习" } },
        { label: "AI 导师", values: { free: "基础回答", pro: "文档依据回答", premium: "含团队上下文回答" } },
        { label: "空间人数", values: { free: "1 人", pro: "1 人", premium: "最多 4 人" } },
        { label: "资料导出", values: { free: "不可用", pro: "PDF 导出", premium: "PDF 导出" } },
      ],
    },
    cta: {
      primary: "开始使用 Zeusian.ai",
      secondary: "立即上传文档",
      bullets: [
        "上传 PDF 后，摘要、测验与卡片流程会立即启动。",
        "可通过 AI 导师继续追问并重新理解薄弱部分。",
        "考前复习闭环也会自动整理好。",
      ],
    },
    footer: {
      companyLabel: "运营方",
      titleLine1: "从一份 PDF",
      titleLine2: "到完整复习闭环",
      description: "Zeusian.ai 把 PDF 摘要、测验、卡片和 AI 导师流程连接在同一个地方。",
      legal: "法律",
      legalLinks: { terms: "服务条款", privacy: "隐私政策" },
      groups: [
        {
          title: "服务",
          links: [
            { label: "功能", href: "#features" },
            { label: "学习流程", href: "#workflow" },
            { label: "价格", href: "#pricing" },
          ],
        },
        {
          title: "公司",
          links: [
            { label: "关于 Zeusian", href: "#hero" },
            { label: "Study AI", href: "/study-ai" },
            { label: "开始使用", href: "/start" },
          ],
        },
        {
          title: "资源",
          links: [
            { label: "摘要", href: "#features" },
            { label: "测验", href: "#features" },
            { label: "卡片", href: "#features" },
          ],
        },
      ],
    },
  },
  ja: {
    languageLabel: "言語",
    startNow: "今すぐ始める",
    startZeusian: "Zeusian.aiを始める",
    openMenu: "メニューを開く",
    closeMenu: "メニューを閉じる",
    nav: {
      features: "機能",
      workflow: "学習フロー",
      pricing: "料金",
    },
    hero: {
      line1: "講義PDFが",
      line2: "要約、クイズ、カードまで",
      description:
        "Zeusian.aiはPDF講義資料を要約し、問題を作る学習AIです。要約からクイズ、カード、AIチューターまでを自動でつなぎ、反復復習のループを一か所で完成できます。",
      primary: "始める",
      secondary: "機能を見る",
    },
    sections: {
      featuresLead: "今の学習フローにそのまま入る",
      featuresAccent: "5つのコア機能",
      featuresDescription:
        "文書を見せるだけで終わりません。アップロード後も、理解、演習、復習まで一つの流れで続けられるように設計しています。",
      workflowLead: "アップロード後も",
      workflowAccent: "学習フローは途切れません",
      workflowDescription:
        "資料を上げて要点を整理し、問題を解き、曖昧な部分をAIチューターで補いながら、同じ画面で復習ループを回せます。",
      pricingLead: "必要な分だけ始めて",
      pricingAccent: "学習量に合わせて広げられます",
      pricingDescription:
        "まずは無料で始め、学習頻度が増えたらProへ、共有スペースが必要ならFamilyへ自然に移行できます。",
      ctaLead: "学習ループを",
      ctaAccent: "実際に回してみましょう",
      ctaDescription:
        "PDFアップロードから試験直前の復習まで、Zeusian.aiが学習フロー全体を一か所にまとめます。",
    },
    featureVisualStep: "一度生成すれば、そのまま続けて復習できます。",
    features: {
      summary: {
        label: "要点要約",
        description: "長いPDFから本当に必要な内容だけを抜き出し、素早く復習できます。",
        previewTitle: "講義の流れを保ったまま要点だけ残します",
        bullets: ["重要概念を自動整理", "ページ単位の文脈を維持", "要約PDFを書き出し"],
      },
      quiz: {
        label: "問題生成",
        description: "選択式やOX問題を自動生成し、本番形式で練習できます。",
        previewTitle: "講義資料をすぐ解ける演習セットに変えます",
        bullets: ["選択式とOXを混合", "解説を自動で接続", "10問の模擬セット"],
      },
      flashcards: {
        label: "暗記カード",
        description: "曖昧な概念をカード化し、反復学習しやすくします。",
        previewTitle: "弱い概念を短く何度も見返せる形にします",
        bullets: ["概念カードを自動生成", "誤答カードを優先表示", "学習進捗を追跡"],
      },
      tutor: {
        label: "AIチューター",
        description: "学習中に気になる点をすぐ質問し、文書ベースの回答を受け取れます。",
        previewTitle: "文書の根拠をもとにすぐ質問して理解をつなげます",
        bullets: ["文書ベースの回答", "追質問をそのまま継続", "比較説明で理解を補強"],
      },
      mockExam: {
        label: "模擬試験",
        description: "10問の模擬試験で本番前の状態を素早く確認できます。",
        previewTitle: "試験直前に最終確認セットをすぐ回せます",
        bullets: ["10問を自動構成", "即時採点と正答確認", "結果PDFを書き出し"],
      },
    },
    workflow: {
      stats: [
        { value: "5", unit: "機能", label: "要約、クイズ、カード、チューター、模擬試験" },
        { value: "10", unit: "問", label: "自動生成の模擬テスト" },
        { value: "1", unit: "フロー", label: "アップロードから復習まで同じ画面" },
      ],
      steps: [
        {
          step: "01",
          title: "PDFをアップロード",
          description: "講義資料、教科書、ノートを上げれば準備完了です。",
          note: "複数のPDFを重ねても学習フローは一つにつながります。",
        },
        {
          step: "02",
          title: "AI分析",
          description: "要約、問題、カードが自動で生成されます。",
          note: "重要整理から演習問題まで一度に連結されます。",
        },
        {
          step: "03",
          title: "反復復習",
          description: "誤答復習と模擬試験で記憶を強化します。",
          note: "試験当日まで見返す流れが整理されたまま残ります。",
        },
      ],
    },
    pricing: {
      current: "現在の選択",
      choose: "選択",
      selected: "選択済み",
      compare: "比較項目",
      plans: [
        {
          id: "free",
          name: "無料",
          price: "無料",
          description: "気軽に始める基本プラン",
          features: ["PDFアップロードは4件まで", "要約 / クイズ / OXの一部提供", "基本学習フローを体験"],
          ctaLabel: "無料で始める",
          accent: "linear-gradient(135deg, #cbd5e1 0%, #94a3b8 100%)",
          glow: "rgba(148, 163, 184, 0.22)",
        },
        {
          id: "pro",
          name: "Pro",
          originalPrices: ["KRW 9,900 / month", "KRW 6,900 / month"],
          price: "KRW 0",
          description: "一人で継続学習する人向け",
          features: ["アップロード無制限", "要約 / クイズ / OX / カードをフル提供", "AIチューター"],
          ctaLabel: "Proを選ぶ",
          accent: "linear-gradient(135deg, #2563eb 0%, #8b5cf6 100%)",
          glow: "rgba(99, 102, 241, 0.26)",
        },
        {
          id: "premium",
          name: "Family",
          originalPrice: "₩36,000 / 月",
          price: "₩18,900 / 月",
          description: "最大4人の共有学習",
          features: ["共有スペースで一緒に学習", "メンバー別の進捗確認", "プレミアム資料管理機能"],
          ctaLabel: "Familyを選ぶ",
          accent: "linear-gradient(135deg, #0f766e 0%, #14b8a6 100%)",
          glow: "rgba(20, 184, 166, 0.24)",
        },
      ],
      rows: [
        { label: "利用スタイル", values: { free: "はじめて使う人", pro: "個人学習", premium: "共有学習" } },
        { label: "月額", values: { free: "無料", pro: "KRW 0", premium: "KRW 18,900 / month" } },
        { label: "PDFアップロード", values: { free: "最大4件", pro: "無制限", premium: "無制限" } },
        { label: "学習ツール", values: { free: "要約 / クイズ / OXの一部", pro: "要約 / クイズ / OX / カード", premium: "全機能 + チーム学習" } },
        { label: "AIチューター", values: { free: "基本回答", pro: "文書ベース回答", premium: "チーム文脈を含む回答" } },
        { label: "利用人数", values: { free: "1人", pro: "1人", premium: "最大4人" } },
        { label: "資料書き出し", values: { free: "不可", pro: "PDF保存", premium: "PDF保存" } },
      ],
    },
    cta: {
      primary: "Zeusian.aiを始める",
      secondary: "今すぐ文書をアップロード",
      bullets: [
        "PDFを上げると、要約、クイズ、カードの流れがすぐ始まります。",
        "AIチューターに質問を重ねながら弱点をその場で埋められます。",
        "試験直前用の復習ループも自動で整理されます。",
      ],
    },
    footer: {
      companyLabel: "事業者",
      titleLine1: "1つのPDFから",
      titleLine2: "復習ループ全体へ",
      description: "Zeusian.aiはPDF要約、クイズ、カード、AIチューターの流れを一か所でつなげます。",
      legal: "法務",
      legalLinks: { terms: "利用規約", privacy: "プライバシーポリシー" },
      groups: [
        {
          title: "サービス",
          links: [
            { label: "機能", href: "#features" },
            { label: "学習フロー", href: "#workflow" },
            { label: "料金", href: "#pricing" },
          ],
        },
        {
          title: "会社",
          links: [
            { label: "Zeusianについて", href: "#hero" },
            { label: "Study AI", href: "/study-ai" },
            { label: "始める", href: "/start" },
          ],
        },
        {
          title: "リソース",
          links: [
            { label: "要約", href: "#features" },
            { label: "クイズ", href: "#features" },
            { label: "カード", href: "#features" },
          ],
        },
      ],
    },
  },
  hi: {
    languageLabel: "भाषा",
    startNow: "अभी शुरू करें",
    startZeusian: "Zeusian.ai शुरू करें",
    openMenu: "मेनू खोलें",
    closeMenu: "मेनू बंद करें",
    nav: {
      features: "फ़ीचर्स",
      workflow: "अध्ययन प्रवाह",
      pricing: "कीमत",
    },
    hero: {
      line1: "आपकी लेक्चर PDF",
      line2: "सारांश, क्विज़ और कार्ड तक",
      description:
        "Zeusian.ai एक स्टडी AI है जो PDF लेक्चर सामग्री को सारांश और अभ्यास में बदल देता है। सारांश, क्विज़, कार्ड और AI ट्यूटर को जोड़कर यह पूरा रिव्यू लूप एक ही जगह चलाता है।",
      primary: "शुरू करें",
      secondary: "फ़ीचर्स देखें",
    },
    sections: {
      featuresLead: "आपके अध्ययन प्रवाह में सीधे जुड़ने वाले",
      featuresAccent: "पाँच मुख्य फ़ीचर्स",
      featuresDescription:
        "यह सिर्फ दस्तावेज़ दिखाने वाला टूल नहीं है। एक बार अपलोड करने के बाद समझना, अभ्यास करना और दोहराना एक ही जुड़े हुए प्रवाह में चलता रहता है।",
      workflowLead: "अपलोड के बाद भी आपका अध्ययन प्रवाह",
      workflowAccent: "टूटा नहीं रहता",
      workflowDescription:
        "सामग्री अपलोड करें, मुख्य बिंदु निकालें, प्रश्न हल करें, और जहाँ कमजोरी हो वहाँ AI ट्यूटर के साथ उसी स्क्रीन पर रिव्यू जारी रखें।",
      pricingLead: "जितनी ज़रूरत हो उतना शुरू करें",
      pricingAccent: "और पढ़ाई के साथ बढ़ें",
      pricingDescription:
        "मुफ़्त में शुरू करें, ज़्यादा नियमित पढ़ाई पर Pro लें, और साझा अध्ययन स्पेस की ज़रूरत हो तो Family चुनें।",
      ctaLead: "अब अपने अध्ययन लूप को",
      ctaAccent: "वास्तव में चलाइए",
      ctaDescription:
        "PDF अपलोड से लेकर परीक्षा से पहले की रिव्यू ड्रिल तक, Zeusian.ai पूरे अध्ययन प्रवाह को एक जगह रखने के लिए तैयार है।",
    },
    featureVisualStep: "एक बार बनाइए और उसी प्रवाह में बार-बार रिव्यू कीजिए।",
    features: {
      summary: {
        label: "मुख्य सारांश",
        description: "लंबी PDF से सिर्फ ज़रूरी बिंदु निकालकर तेज़ रिव्यू के लिए तैयार करता है।",
        previewTitle: "लेक्चर का प्रवाह बनाए रखकर सिर्फ मुख्य बातें बचती हैं",
        bullets: ["मुख्य अवधारणाओं का स्वतः संगठन", "पेज-स्तर का संदर्भ बरकरार", "सारांश PDF निर्यात"],
      },
      quiz: {
        label: "क्विज़ निर्माण",
        description: "मल्टिपल चॉइस और OX जैसे परीक्षा-शैली प्रश्न अपने आप बनाता है।",
        previewTitle: "कोर्स सामग्री को तुरंत अभ्यास सेट में बदलता है",
        bullets: ["मिश्रित प्रश्न प्रकार", "स्वचालित व्याख्या", "10-प्रश्न मॉक सेट"],
      },
      flashcards: {
        label: "फ़्लैशकार्ड",
        description: "कन्फ्यूज़ करने वाली अवधारणाओं को कार्ड में बदलकर बार-बार याद करने में मदद करता है।",
        previewTitle: "कमज़ोर अवधारणाओं को छोटे और बार-बार होने वाले रिव्यू में लाता है",
        bullets: ["अवधारणा कार्ड स्वतः बनते हैं", "गलतियों वाले कार्ड पहले", "अध्ययन प्रगति ट्रैकिंग"],
      },
      tutor: {
        label: "AI ट्यूटर",
        description: "पढ़ाई के दौरान सवाल पूछें और दस्तावेज़-आधारित उत्तर पाएँ।",
        previewTitle: "दस्तावेज़ के आधार पर तुरंत पूछें और समझ को आगे बढ़ाएँ",
        bullets: ["दस्तावेज़-आधारित उत्तर", "फ़ॉलो-अप सवाल जारी रखें", "तुलनात्मक समझाइश"],
      },
      mockExam: {
        label: "मॉक एग्ज़ाम",
        description: "10 प्रश्नों के मॉक एग्ज़ाम से असली परीक्षा से पहले अपनी तैयारी जाँचें।",
        previewTitle: "परीक्षा से पहले अंतिम जाँच सेट तुरंत चलाइए",
        bullets: ["10 प्रश्न स्वतः तैयार", "तुरंत ग्रेडिंग और उत्तर", "परिणाम PDF निर्यात"],
      },
    },
    workflow: {
      stats: [
        { value: "5", unit: "फ़ीचर्स", label: "सारांश, क्विज़, कार्ड, ट्यूटर, मॉक एग्ज़ाम" },
        { value: "10", unit: "प्रश्न", label: "स्वतः बना अभ्यास टेस्ट" },
        { value: "1", unit: "प्रवाह", label: "अपलोड से रिव्यू तक एक ही स्क्रीन" },
      ],
      steps: [
        {
          step: "01",
          title: "PDF अपलोड करें",
          description: "लेक्चर नोट्स, टेक्स्टबुक या अपने नोट्स अपलोड करते ही तैयारी पूरी हो जाती है।",
          note: "कई PDF जोड़ने पर भी अध्ययन प्रवाह जुड़ा रहता है।",
        },
        {
          step: "02",
          title: "AI विश्लेषण",
          description: "सारांश, प्रश्न और कार्ड अपने आप तैयार हो जाते हैं।",
          note: "मुख्य बिंदु और अभ्यास सामग्री एक साथ जुड़ते हैं।",
        },
        {
          step: "03",
          title: "दोहराव वाला रिव्यू",
          description: "गलत उत्तरों की समीक्षा और मॉक एग्ज़ाम से याददाश्त मज़बूत होती है।",
          note: "परीक्षा के दिन तक रिव्यू का रास्ता व्यवस्थित रहता है।",
        },
      ],
    },
    pricing: {
      current: "वर्तमान चयन",
      choose: "चुनें",
      selected: "चयनित",
      compare: "तुलना बिंदु",
      plans: [
        {
          id: "free",
          name: "मुफ़्त",
          price: "मुफ़्त",
          description: "हल्के उपयोग से शुरुआत",
          features: ["अधिकतम 4 PDF अपलोड", "सारांश / क्विज़ / OX के कुछ टूल", "बेसिक अध्ययन प्रवाह का अनुभव"],
          ctaLabel: "मुफ़्त शुरू करें",
          accent: "linear-gradient(135deg, #cbd5e1 0%, #94a3b8 100%)",
          glow: "rgba(148, 163, 184, 0.22)",
        },
        {
          id: "pro",
          name: "Pro",
          originalPrices: ["KRW 9,900 / month", "KRW 6,900 / month"],
          price: "KRW 0",
          description: "लगातार अकेले पढ़ने वालों के लिए",
          features: ["अनलिमिटेड अपलोड", "सारांश / क्विज़ / OX / कार्ड पूरे", "AI ट्यूटर"],
          ctaLabel: "Pro चुनें",
          accent: "linear-gradient(135deg, #2563eb 0%, #8b5cf6 100%)",
          glow: "rgba(99, 102, 241, 0.26)",
        },
        {
          id: "premium",
          name: "Family",
          originalPrice: "₩36,000 / माह",
          price: "₩18,900 / माह",
          description: "अधिकतम 4 लोगों के लिए साझा अध्ययन",
          features: ["शेयर्ड स्पेस में साथ पढ़ाई", "हर सदस्य की प्रगति देखें", "प्रीमियम सामग्री प्रबंधन"],
          ctaLabel: "Family चुनें",
          accent: "linear-gradient(135deg, #0f766e 0%, #14b8a6 100%)",
          glow: "rgba(20, 184, 166, 0.24)",
        },
      ],
      rows: [
        { label: "उपयोग प्रकार", values: { free: "शुरुआत", pro: "व्यक्तिगत अध्ययन", premium: "साझा अध्ययन" } },
        { label: "मासिक शुल्क", values: { free: "मुफ़्त", pro: "KRW 0", premium: "KRW 18,900 / month" } },
        { label: "PDF अपलोड", values: { free: "अधिकतम 4 फ़ाइलें", pro: "अनलिमिटेड", premium: "अनलिमिटेड" } },
        { label: "मुख्य टूल", values: { free: "सारांश / क्विज़ / OX", pro: "सारांश / क्विज़ / OX / कार्ड", premium: "सभी फीचर + टीम अध्ययन" } },
        { label: "AI ट्यूटर", values: { free: "बेसिक उत्तर", pro: "दस्तावेज़-आधारित उत्तर", premium: "टीम संदर्भ सहित उत्तर" } },
        { label: "उपयोगकर्ता", values: { free: "1 उपयोगकर्ता", pro: "1 उपयोगकर्ता", premium: "अधिकतम 4 उपयोगकर्ता" } },
        { label: "निर्यात", values: { free: "उपलब्ध नहीं", pro: "PDF सेव", premium: "PDF सेव" } },
      ],
    },
    cta: {
      primary: "Zeusian.ai शुरू करें",
      secondary: "अभी दस्तावेज़ अपलोड करें",
      bullets: [
        "PDF अपलोड करते ही सारांश, क्विज़ और कार्ड का प्रवाह शुरू हो जाता है।",
        "AI ट्यूटर के साथ कमज़ोर हिस्सों को फिर से समझा जा सकता है।",
        "परीक्षा से पहले का रिव्यू लूप भी अपने आप व्यवस्थित हो जाता है।",
      ],
    },
    footer: {
      companyLabel: "संचालक",
      titleLine1: "एक PDF से",
      titleLine2: "पूरे रिव्यू लूप तक",
      description: "Zeusian.ai सारांश, क्विज़, कार्ड और AI ट्यूटर को एक ही अध्ययन प्रवाह में जोड़ता है।",
      legal: "कानूनी",
      legalLinks: { terms: "सेवा शर्तें", privacy: "गोपनीयता नीति" },
      groups: [
        {
          title: "सेवा",
          links: [
            { label: "फ़ीचर्स", href: "#features" },
            { label: "अध्ययन प्रवाह", href: "#workflow" },
            { label: "कीमत", href: "#pricing" },
          ],
        },
        {
          title: "कंपनी",
          links: [
            { label: "Zeusian के बारे में", href: "#hero" },
            { label: "Study AI", href: "/study-ai" },
            { label: "शुरू करें", href: "/start" },
          ],
        },
        {
          title: "संसाधन",
          links: [
            { label: "सारांश", href: "#features" },
            { label: "क्विज़", href: "#features" },
            { label: "कार्ड", href: "#features" },
          ],
        },
      ],
    },
  },
  en: {
    languageLabel: "Language",
    startNow: "Get Started",
    startZeusian: "Start Zeusian.ai",
    openMenu: "Open menu",
    closeMenu: "Close menu",
    nav: {
      features: "Features",
      workflow: "Workflow",
      pricing: "Pricing",
    },
    hero: {
      line1: "Your lecture PDF",
      line2: "to summaries, quizzes, and cards",
      description:
        "Zeusian.ai is a study AI that turns PDF course materials into summaries and practice. Connect summary, quiz, cards, and AI tutoring in one continuous review loop.",
      primary: "Start",
      secondary: "View Features",
    },
    sections: {
      featuresLead: "Five core tools",
      featuresAccent: "built into your study flow",
      featuresDescription:
        "It does more than display documents. Upload once, then keep moving through understanding, practice, and review in one connected flow.",
      workflowLead: "Your study flow after upload",
      workflowAccent: "stays connected",
      workflowDescription:
        "Upload the material, extract the essentials, solve practice questions, and revisit weak points with the AI tutor in one loop.",
      pricingLead: "Start small",
      pricingAccent: "and scale with your workload",
      pricingDescription:
        "Begin for free, move to Pro when you study more often, or Family when you need a shared study space.",
      ctaLead: "Put your study loop",
      ctaAccent: "into motion",
      ctaDescription:
        "From PDF upload to final review drills, Zeusian.ai is ready to keep the entire learning flow in one place.",
    },
    featureVisualStep: "Generate once and keep reviewing in the same flow.",
    features: {
      summary: {
        label: "Core Summary",
        description: "Pull out only the essential points from long PDFs so you can review faster.",
        previewTitle: "Keep the lecture flow intact and keep only the essentials",
        bullets: ["Auto-organized key concepts", "Page-by-page context", "Summary PDF export"],
      },
      quiz: {
        label: "Quiz Generation",
        description: "Create multiple-choice and OX questions automatically for exam-style practice.",
        previewTitle: "Turn course material into a ready-to-run practice set",
        bullets: ["Mixed question types", "Automatic explanations", "10-question mock set"],
      },
      flashcards: {
        label: "Flashcards",
        description: "Turn confusing concepts into cards for repeated memorization.",
        previewTitle: "Bring weak concepts back in short, frequent review sessions",
        bullets: ["Auto-generated concept cards", "Mistake-first review", "Study progress tracking"],
      },
      tutor: {
        label: "AI Tutor",
        description: "Ask questions while studying and get answers grounded in your document.",
        previewTitle: "Ask immediately and keep understanding with document-based answers",
        bullets: ["Document-grounded answers", "Follow-up question flow", "Comparison-based explanations"],
      },
      mockExam: {
        label: "Mock Exam",
        description: "Check your readiness with a 10-question mock exam before the real test.",
        previewTitle: "Run a quick final-check set right before the exam",
        bullets: ["Auto-built 10-question set", "Instant grading and answers", "Result PDF export"],
      },
    },
    workflow: {
      stats: [
        { value: "5", unit: "tools", label: "Summary, quiz, flashcards, tutor, mock exam" },
        { value: "10", unit: "items", label: "Auto-generated practice test" },
        { value: "1", unit: "flow", label: "From upload to review in one screen" },
      ],
      steps: [
        {
          step: "01",
          title: "Upload PDF",
          description: "Add lecture notes, textbook pages, or your own material to get started.",
          note: "Even when you stack multiple PDFs, the study flow stays connected.",
        },
        {
          step: "02",
          title: "AI Analysis",
          description: "Summaries, questions, and cards are generated automatically.",
          note: "Core notes and practice content are linked in one pass.",
        },
        {
          step: "03",
          title: "Repeat Review",
          description: "Strengthen memory through mistake review and mock exams.",
          note: "Your review path stays organized all the way to exam day.",
        },
      ],
    },
    pricing: {
      current: "Current",
      choose: "Choose",
      selected: "Selected",
      compare: "Compare",
      plans: [
        {
          id: "free",
          name: "Free",
          price: "Free",
          description: "Light personal study",
          features: ["Upload up to 4 PDFs", "Basic summary / quiz / OX tools", "Starter storage included"],
          ctaLabel: "Choose Free",
          accent: "linear-gradient(135deg, #cbd5e1 0%, #94a3b8 100%)",
          glow: "rgba(148, 163, 184, 0.22)",
        },
        {
          id: "pro",
          name: "Pro",
          originalPrices: ["KRW 9,900 / month", "KRW 6,900 / month"],
          price: "KRW 0",
          description: "Recommended for steady solo study",
          features: ["Unlimited uploads", "Unlimited summary / quiz / OX / cards", "Priority processing"],
          ctaLabel: "Choose Pro",
          accent: "linear-gradient(135deg, #2563eb 0%, #8b5cf6 100%)",
          glow: "rgba(99, 102, 241, 0.26)",
        },
        {
          id: "premium",
          name: "Family",
          originalPrice: "KRW 36,000 / month",
          price: "KRW 18,900 / month",
          description: "Shared study for up to 4 people",
          features: ["Collaborative shared space", "Separate flow for each member", "Better study efficiency together"],
          ctaLabel: "Choose Family",
          accent: "linear-gradient(135deg, #0f766e 0%, #14b8a6 100%)",
          glow: "rgba(20, 184, 166, 0.24)",
        },
      ],
      rows: [
        { label: "Best for", values: { free: "Getting started", pro: "Solo study", premium: "Shared study" } },
        { label: "Monthly price", values: { free: "Free", pro: "KRW 0", premium: "KRW 18,900 / month" } },
        { label: "PDF upload", values: { free: "Up to 4 files", pro: "Unlimited", premium: "Unlimited" } },
        { label: "Core tools", values: { free: "Summary / quiz / OX", pro: "Summary / quiz / OX / cards", premium: "Everything in Pro + shared learning" } },
        { label: "Workspace", values: { free: "Starter storage", pro: "Personal study space", premium: "Shared workspace" } },
        { label: "Users", values: { free: "1 user", pro: "1 user", premium: "Up to 4 users" } },
        { label: "Priority", values: { free: "Standard", pro: "Priority", premium: "Priority" } },
      ],
    },
    cta: {
      primary: "Start Zeusian.ai",
      secondary: "View Guide Page",
      bullets: [
        "Upload a PDF and generate summary, quiz, and flashcard flows automatically.",
        "Keep asking document-based questions with the AI tutor.",
        "Stay in review mode until exam day with mock exams and mistake review.",
      ],
    },
    footer: {
      companyLabel: "Operator",
      titleLine1: "From one PDF",
      titleLine2: "to the full review loop",
      description: "Zeusian.ai keeps summary, quiz, flashcards, and AI tutor workflows connected in one place.",
      legal: "Legal",
      legalLinks: { terms: "Terms", privacy: "Privacy" },
      groups: [
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
      ],
    },
  },
};

const OUTPUT_LANGUAGE_OPTIONS = [
  { code: "en", label: "English" },
  { code: "zh", label: "中文" },
  { code: "ja", label: "日本語" },
  { code: "hi", label: "हिन्दी" },
  { code: "ko", label: "한국어" },
];

const SUMMARY_DEMO_VIDEO_SRC = encodeURI("/화면 녹화 중 2026-04-09 235144.mp4");
const QUIZ_DEMO_VIDEO_SRC = "/quiz-generation-demo.mp4";
const FLASHCARD_DEMO_VIDEO_SRC = "/flashcard-demo.mp4";
const TUTOR_DEMO_VIDEO_SRC = "/tutor-demo.mp4";
const MOCK_EXAM_DEMO_VIDEO_SRC = "/mock-exam-demo.mp4";

const getLandingCopy = (outputLanguage) => LANDING_COPY[outputLanguage] ?? LANDING_COPY.ko;

const getFeatureItems = (copy) => [
  {
    id: "summary",
    ...copy.features.summary,
    previewMeta: copy.features.summary.bullets,
    stepLabel: copy.featureVisualStep,
    Icon: SummaryIcon,
    theme: FEATURE_THEMES.summary,
  },
  {
    id: "quiz",
    ...copy.features.quiz,
    previewMeta: copy.features.quiz.bullets,
    stepLabel: copy.featureVisualStep,
    Icon: QuizIcon,
    theme: FEATURE_THEMES.quiz,
  },
  {
    id: "flashcards",
    ...copy.features.flashcards,
    previewMeta: copy.features.flashcards.bullets,
    stepLabel: copy.featureVisualStep,
    Icon: CardsIcon,
    theme: FEATURE_THEMES.flashcards,
  },
  {
    id: "tutor",
    ...copy.features.tutor,
    previewMeta: copy.features.tutor.bullets,
    stepLabel: copy.featureVisualStep,
    Icon: TutorIcon,
    theme: FEATURE_THEMES.tutor,
  },
  {
    id: "mockExam",
    ...copy.features.mockExam,
    previewMeta: copy.features.mockExam.bullets,
    stepLabel: copy.featureVisualStep,
    Icon: ExamIcon,
    theme: FEATURE_THEMES.mockExam,
  },
];

const getNavItems = (copy) => [
  { id: "features", label: copy.nav.features },
  { id: "workflow", label: copy.nav.workflow },
  { id: "pricing", label: copy.nav.pricing },
];

const DEFAULT_ACTIVE_PLAN = "pro";

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
                <p className="mt-2 text-sm text-slate-300">{feature.stepLabel}</p>
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
                    <p className="text-xs font-semibold tracking-[0.24em] text-slate-400">패밀리 스페이스</p>
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

const LandingIntro = memo(function LandingIntro({ onStart, outputLanguage = "ko", setOutputLanguage }) {
  const copy = getLandingCopy(outputLanguage);
  const FEATURE_ITEMS = getFeatureItems(copy);
  const NAV_ITEMS = getNavItems(copy);
  const STEP_ITEMS = copy.workflow.steps;
  const STATS = copy.workflow.stats;
  const PLAN_ITEMS = copy.pricing.plans;
  const PLAN_COMPARISON_ROWS = copy.pricing.rows;
  const FOOTER_LINK_GROUPS = copy.footer.groups;
  const [scrollY, setScrollY] = useState(0);
  const [activeFeatureId, setActiveFeatureId] = useState(FEATURE_ITEMS[0]?.id || "summary");
  const [activePlanId, setActivePlanId] = useState(DEFAULT_ACTIVE_PLAN);
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

        let nextId = FEATURE_ITEMS[0]?.id || "summary";
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

  const handlePlanInteract = useCallback((planId) => {
    setActivePlanId(planId);
  }, []);

  const navSolid = scrollY > 24;
  const heroOpacity = Math.max(0.52, 1 - scrollY / 1100);
  const heroTranslate = Math.min(scrollY * 0.145, 168);
  const pricingSectionVisible = isVisible("pricing-stage") && !isVisible("pricing-fade-end");
  const heroScale = Math.max(0.88, 1 - scrollY / 2100);
  const heroGlowShift = Math.min(scrollY * 0.18, 180);
  const heroGlowSpread = Math.min(scrollY * 0.065, 56);
  const heroGridShift = Math.min(scrollY * 0.24, 240);

  return (
    <div className="zeus-landing relative overflow-x-hidden bg-[#f5f7fb] text-slate-900">
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
              className="hidden rounded-full px-4 py-2 text-sm font-semibold text-slate-600 transition hover:text-slate-950"
            >
              소개 문서
            </a>
            <label className="relative">
              <span className="sr-only">{copy.languageLabel}</span>
              <select
                value={outputLanguage}
                onChange={(event) => setOutputLanguage?.(event.target.value)}
                className="appearance-none rounded-full border border-slate-200 bg-white/80 px-4 py-2 pr-10 text-sm font-semibold text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-slate-400"
              >
                {OUTPUT_LANGUAGE_OPTIONS.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.label}
                  </option>
                ))}
              </select>
              <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-slate-400">
                <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
                  <path d="m5 7.5 5 5 5-5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </label>
            <button
              type="button"
              onClick={handleStart}
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-blue-600 to-violet-500 px-5 py-3 text-sm font-semibold text-white shadow-[0_18px_34px_-18px_rgba(99,102,241,0.55)] transition hover:translate-y-[-1px] hover:shadow-[0_24px_38px_-18px_rgba(99,102,241,0.55)]"
            >
              <span>{copy.startNow}</span>
              <ArrowRightIcon className="h-4 w-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => setMenuOpen((previous) => !previous)}
            aria-expanded={menuOpen}
            aria-label={menuOpen ? copy.closeMenu : copy.openMenu}
            className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white/80 text-slate-700 shadow-sm lg:hidden"
          >
            {menuOpen ? <CloseIcon /> : <MenuIcon />}
          </button>
        </div>
      </nav>

      {menuOpen ? (
        <div className="fixed inset-x-5 top-[5.35rem] z-40 rounded-[1.8rem] border border-white/80 bg-white/90 p-5 shadow-[0_32px_80px_-46px_rgba(15,23,42,0.32)] backdrop-blur-2xl lg:hidden">
          <label className="mb-4 block">
            <span className="mb-2 block text-xs font-semibold tracking-[0.16em] text-slate-500">{copy.languageLabel}</span>
            <div className="relative">
              <select
                value={outputLanguage}
                onChange={(event) => setOutputLanguage?.(event.target.value)}
                className="w-full appearance-none rounded-2xl border border-slate-200/80 bg-slate-50/90 px-4 py-3 pr-10 text-sm font-semibold text-slate-700 outline-none transition focus:border-slate-300"
              >
                {OUTPUT_LANGUAGE_OPTIONS.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.label}
                  </option>
                ))}
              </select>
              <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-slate-400">
                <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
                  <path d="m5 7.5 5 5 5-5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </div>
          </label>
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
            <span>{copy.startZeusian}</span>
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
              {copy.hero.line1}
              <br />
              <span className="bg-gradient-to-r from-blue-600 via-sky-500 to-violet-500 bg-clip-text text-transparent">
                {copy.hero.line2}
              </span>
            </h1>
            <p className="landing-subtitle mt-7 max-w-3xl text-base leading-8 text-slate-600 sm:text-lg">{copy.hero.description}</p>

            <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row">
              <button
                type="button"
                onClick={handleStart}
                className="inline-flex min-w-[11rem] items-center justify-center gap-2 rounded-full bg-gradient-to-r from-blue-600 to-violet-500 px-7 py-3.5 text-sm font-semibold text-white shadow-[0_22px_40px_-20px_rgba(99,102,241,0.58)] transition hover:translate-y-[-1px] hover:shadow-[0_28px_44px_-20px_rgba(99,102,241,0.58)]"
              >
                <span>{copy.hero.primary}</span>
                <ArrowRightIcon className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => handleJump("features")}
                className="inline-flex min-w-[11rem] items-center justify-center gap-2 rounded-full border border-slate-300 bg-white/[0.72] px-7 py-3.5 text-sm font-semibold text-slate-700 shadow-[0_16px_32px_-24px_rgba(15,23,42,0.3)] backdrop-blur transition hover:border-slate-400 hover:text-slate-950"
              >
                <span>{copy.hero.secondary}</span>
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
              {copy.sections.featuresLead}
              <br />
              <span className="bg-gradient-to-r from-blue-600 to-violet-500 bg-clip-text text-transparent">{copy.sections.featuresAccent}</span>
            </h2>
            <p className="landing-subtitle mt-6 text-base leading-8 text-slate-600 sm:text-lg">{copy.sections.featuresDescription}</p>
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
                        {feature.id === "summary" ||
                        feature.id === "quiz" ||
                        feature.id === "flashcards" ||
                        feature.id === "tutor" ||
                        feature.id === "mockExam" ? (
                          <>
                            <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.55),rgba(255,255,255,0.12))]" />
                            <div className="absolute inset-[3.5%] overflow-hidden rounded-[1.9rem] border border-white/70 bg-slate-950 shadow-[0_32px_70px_-40px_rgba(15,23,42,0.42)]">
                              <video
                                className="h-full w-full object-cover object-center"
                                src={
                                  feature.id === "summary"
                                    ? SUMMARY_DEMO_VIDEO_SRC
                                    : feature.id === "quiz"
                                      ? QUIZ_DEMO_VIDEO_SRC
                                      : feature.id === "flashcards"
                                        ? FLASHCARD_DEMO_VIDEO_SRC
                                        : feature.id === "tutor"
                                          ? TUTOR_DEMO_VIDEO_SRC
                                          : MOCK_EXAM_DEMO_VIDEO_SRC
                                }
                                autoPlay
                                muted
                                loop
                                playsInline
                                preload="metadata"
                              />
                            </div>
                            <div className="pointer-events-none absolute inset-[3.5%] rounded-[1.9rem] bg-[linear-gradient(180deg,rgba(255,255,255,0.12),transparent_20%,transparent_80%,rgba(15,23,42,0.08))]" />
                          </>
                        ) : (
                          <>
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
                          </>
                        )}
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
              {copy.sections.workflowLead}
              <br />
              <span className="bg-gradient-to-r from-cyan-500 to-blue-600 bg-clip-text text-transparent">{copy.sections.workflowAccent}</span>
            </h2>
            <p className="landing-subtitle mt-6 text-base leading-8 text-slate-600 sm:text-lg">{copy.sections.workflowDescription}</p>

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

      <section id="pricing" className="relative scroll-mt-28 px-5 py-24 sm:px-6 lg:px-8 lg:py-32">
        <div
          ref={(node) => registerRevealNode("pricing-stage", node)}
          data-reveal-key="pricing-stage"
          className="mx-auto max-w-7xl"
        >
          <div
            className="mx-auto max-w-3xl text-center"
            style={getRevealStyle(pricingSectionVisible, { y: 28 })}
          >
            <h2 className="landing-title text-4xl font-bold leading-tight text-slate-950 sm:text-5xl lg:text-6xl">
              {copy.sections.pricingLead}
              <br />
              <span className="bg-gradient-to-r from-blue-600 to-violet-500 bg-clip-text text-transparent">{copy.sections.pricingAccent}</span>
            </h2>
            <p className="landing-subtitle mt-6 text-base leading-8 text-slate-600 sm:text-lg">{copy.sections.pricingDescription}</p>
          </div>

          <div className="mobile-card-rail mt-16 flex gap-5 md:grid md:grid-cols-2 lg:grid-cols-3">
            {PLAN_ITEMS.map((plan, index) => {
              const isActive = activePlanId === plan.id;
              const originalPrices = Array.isArray(plan.originalPrices)
                ? plan.originalPrices.filter(Boolean)
                : plan.originalPrice
                  ? [plan.originalPrice]
                  : [];
              return (
                <article
                  key={plan.name}
                  role="button"
                  tabIndex={0}
                  aria-pressed={isActive}
                  onClick={() => handlePlanInteract(plan.id)}
                  onFocus={() => handlePlanInteract(plan.id)}
                  onPointerEnter={(event) => {
                    if (event.pointerType === "mouse") {
                      handlePlanInteract(plan.id);
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      handlePlanInteract(plan.id);
                    }
                  }}
                  className="relative min-w-[280px] flex-1 overflow-hidden rounded-[2rem] border bg-white/[0.82] p-6 shadow-[0_28px_70px_-48px_rgba(15,23,42,0.24)] backdrop-blur transition-all duration-300 sm:min-w-[320px] sm:p-7 md:min-w-0"
                  style={{
                    ...getRevealStyle(pricingSectionVisible, { y: 28, delay: 120 + index * 80 }),
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

                  <div className="mt-8 flex flex-wrap items-end gap-3">
                    {originalPrices.map((originalPrice) => (
                      <span key={`${plan.id}-${originalPrice}`} className="text-base font-semibold text-slate-400 line-through">
                        {originalPrice}
                      </span>
                    ))}
                    <p className="text-4xl font-bold text-slate-950">{plan.price}</p>
                  </div>
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
                    onClick={() => handlePlanInteract(plan.id)}
                    className={`mt-8 inline-flex w-full items-center justify-center gap-2 rounded-full border px-5 py-3 text-sm font-semibold transition ${
                      isActive ? "border-transparent text-white" : "border-slate-300 bg-white/[0.82] text-slate-700 hover:border-slate-400 hover:text-slate-950"
                    }`}
                    style={isActive ? { background: plan.accent, boxShadow: `0 18px 34px -18px ${plan.glow}` } : undefined}
                  >
                    <span>{isActive ? copy.pricing.current : plan.ctaLabel}</span>
                    <ArrowRightIcon className="h-4 w-4" />
                  </button>
                </article>
              );
            })}
          </div>

          <div
            className="mt-8 rounded-[2rem] border border-white/80 bg-white/[0.82] shadow-[0_34px_90px_-54px_rgba(15,23,42,0.28)] backdrop-blur"
            style={getRevealStyle(pricingSectionVisible, { y: 28, delay: 180 })}
          >
            <div className="show-scrollbar overflow-x-auto overflow-y-visible pb-3">
              <div className="min-w-[720px]">
                <div className="grid grid-cols-[160px_repeat(3,minmax(180px,1fr))] border-b border-slate-200/80 md:grid-cols-[180px_repeat(3,minmax(0,1fr))]">
                  <div className="sticky left-0 z-20 bg-white/[0.96] px-4 py-5 text-sm font-semibold uppercase tracking-[0.22em] text-slate-400 backdrop-blur md:px-5">
                    {copy.pricing.compare}
                  </div>
                  {PLAN_ITEMS.map((plan) => {
                    const isActive = activePlanId === plan.id;
                    const originalPrices = Array.isArray(plan.originalPrices)
                      ? plan.originalPrices.filter(Boolean)
                      : plan.originalPrice
                        ? [plan.originalPrice]
                        : [];
                    return (
                      <button
                        key={`${plan.name}-header`}
                        type="button"
                        onClick={() => handlePlanInteract(plan.id)}
                        className={`border-l px-4 py-5 text-left transition md:px-5 ${
                          isActive ? "bg-slate-950 text-white" : "bg-white/75 text-slate-900 hover:bg-slate-50"
                        }`}
                      >
                        <p className="text-xl font-bold md:text-2xl">{plan.name}</p>
                        <p className={`mt-2 text-sm ${isActive ? "text-slate-300" : "text-slate-500"}`}>{plan.description}</p>
                        <div className="mt-4 flex flex-wrap items-end gap-2">
                          {originalPrices.map((originalPrice) => (
                            <span
                              key={`${plan.id}-comparison-${originalPrice}`}
                              className={`text-sm font-semibold line-through ${isActive ? "text-slate-400" : "text-slate-400"}`}
                            >
                              {originalPrice}
                            </span>
                          ))}
                          <p className={`text-xl font-bold md:text-2xl ${isActive ? "text-white" : "text-slate-900"}`}>{plan.price}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {PLAN_COMPARISON_ROWS.map((row) => (
                  <Fragment key={row.label}>
                    <div className="grid grid-cols-[160px_repeat(3,minmax(180px,1fr))] border-b border-slate-200/80 last:border-b-0 md:grid-cols-[180px_repeat(3,minmax(0,1fr))]">
                      <div className="sticky left-0 z-10 bg-slate-50/95 px-4 py-4 text-sm font-semibold text-slate-500 backdrop-blur md:px-5">
                        {row.label}
                      </div>
                      {PLAN_ITEMS.map((plan) => {
                        const isActive = activePlanId === plan.id;
                        return (
                          <div
                            key={`${row.label}-${plan.id}`}
                            className={`border-l px-4 py-4 text-sm leading-7 md:px-5 ${
                              isActive ? "bg-violet-50/70 text-slate-900" : "bg-white/70 text-slate-600"
                            }`}
                          >
                            {row.values[plan.id]}
                          </div>
                        );
                      })}
                    </div>
                  </Fragment>
                ))}
              </div>
            </div>
          </div>

          <div
            ref={(node) => registerRevealNode("pricing-fade-end", node)}
            data-reveal-key="pricing-fade-end"
            className="mt-14 h-px w-full"
            aria-hidden="true"
          />
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
                  {copy.sections.ctaLead}
                  <br />
                  <span className="bg-gradient-to-r from-sky-300 to-violet-300 bg-clip-text text-transparent">{copy.sections.ctaAccent}</span>
                </h2>
                <p className="landing-subtitle mt-6 max-w-2xl text-base leading-8 text-slate-300 sm:text-lg">{copy.sections.ctaDescription}</p>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={handleStart}
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-blue-600 to-violet-500 px-7 py-3.5 text-sm font-semibold text-white shadow-[0_18px_36px_-18px_rgba(99,102,241,0.58)] transition hover:translate-y-[-1px]"
                  >
                    <span>{copy.cta.primary}</span>
                    <ArrowRightIcon className="h-4 w-4" />
                  </button>
                  <a
                    href="/study-ai"
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-white/15 bg-white/5 px-7 py-3.5 text-sm font-semibold text-white/90 transition hover:bg-white/10"
                  >
                    <span>{copy.cta.secondary}</span>
                  </a>
                </div>
              </div>

              <div className="rounded-[2rem] border border-white/10 bg-white/[0.08] p-5 backdrop-blur-xl sm:p-6">
                <div className="rounded-[1.7rem] border border-white/10 bg-white/5 p-5">
                  <div className="space-y-4">
                    {copy.cta.bullets.map((item, index) => (
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
                    {link.href.includes("privacy") ? copy.footer.legalLinks.privacy : copy.footer.legalLinks.terms}
                  </a>
                ))}
              </div>
            </div>

            <div className="grid gap-10 pt-6 lg:grid-cols-[minmax(260px,1.05fr)_minmax(0,1fr)] lg:pt-8">
              <div className="space-y-5">
                {FOOTER_COMPANY_INFO ? (
                  <div className="text-sm leading-7 text-slate-400">
                    <p>
                      {copy.footer.companyLabel}: {FOOTER_COMPANY_INFO.value}
                    </p>
                    <p>contact:hestra.co@gmail.com</p>
                  </div>
                ) : null}

                <div className="max-w-sm">
                  <p className="zeus-display text-3xl leading-tight text-white sm:text-[2.4rem]">
                    {copy.footer.titleLine1}
                    <br />
                    {copy.footer.titleLine2}
                  </p>
                  <p className="mt-4 text-sm leading-7 text-slate-400 sm:text-base">{copy.footer.description}</p>
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
                  <p className="text-sm font-semibold text-white">{copy.footer.legal}</p>
                  <div className="mt-4 space-y-3">
                    {LEGAL_LINKS.map((link) => (
                      <a
                        key={`legal-column-${link.href}`}
                        href={link.href}
                        className="block text-sm text-slate-400 transition hover:text-white"
                      >
                        {link.href.includes("privacy") ? copy.footer.legalLinks.privacy : copy.footer.legalLinks.terms}
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
