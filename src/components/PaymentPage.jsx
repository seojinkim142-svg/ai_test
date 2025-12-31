import { useState } from "react";

const tierMeta = {
  free: "Free",
  pro: "Pro",
  premium: "Premium",
};

function PaymentPage({ onClose, currentTier = "free", theme = "dark" }) {
  const [selectedPlan, setSelectedPlan] = useState(tierMeta[currentTier] || "Free");
  const isLight = theme === "light";
  const surfaceClass = isLight
    ? "border-slate-200 bg-white/95 text-slate-900 ring-slate-200/80 shadow-black/10"
    : "border-white/10 bg-slate-950/95 text-white ring-white/10 shadow-black/40";
  const headerClass = isLight ? "border-slate-200/80 bg-white/80" : "border-white/5 bg-white/5";
  const pillClass = isLight ? "bg-slate-100 text-slate-700" : "bg-white/10 text-slate-100";
  const accentText = isLight ? "text-emerald-600" : "text-emerald-300";

  const currentPlan = tierMeta[currentTier] || "Free";
  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/50 px-4 py-6 backdrop-blur">
      <div
        className={`w-full max-w-4xl overflow-hidden rounded-3xl border shadow-2xl ring-1 ${surfaceClass}`}
      >
        <div className={`flex items-center justify-between border-b px-5 py-4 ${headerClass}`}>
          <div>
            <p className={`text-xs uppercase tracking-[0.2em] ${accentText}`}>billing</p>
            <h2 className="text-xl font-bold">업그레이드 & 결제</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`ghost-button text-sm ${isLight ? "text-slate-600" : "text-slate-200"}`}
            data-ghost-size="sm"
            style={{ "--ghost-color": isLight ? "100, 116, 139" : "148, 163, 184" }}
          >
            닫기
          </button>
        </div>

        <div
          className={`grid gap-4 px-6 py-5 md:grid-cols-3 ${
            isLight
              ? "bg-gradient-to-br from-white via-slate-50 to-white"
              : "bg-gradient-to-br from-slate-950/60 via-slate-900/50 to-slate-950/60"
          }`}
        >
          {[
            {
              name: "Free",
              price: "무료",
              desc: "가벼운 사용 · 테스트",
              features: ["PDF 업로드 최대 4개/회", "요약 · 퀴즈 기본 기능", "기본 저장소 제공"],
              cta: "그대로 사용",
              accent: "148, 163, 184",
            },
            {
              name: "Pro",
              price: "₩19,900 /월",
              desc: "스터디 · 강의 대비 추천",
              features: [
                "무제한 PDF 업로드",
                "퀴즈/OX/카드 무제한 생성",
                "요약/하이라이트 우선 처리",
              ],
              cta: "Pro로 업그레이드",
              accent: "16, 185, 129",
              highlight: true,
            },
            {
              name: "Premium",
              price: "맞춤 견적",
              desc: "강의 · 팀 프로젝트",
              features: ["팀 스페이스/공유", "관리자 권한/사용량 대시보드", "우선 지원 · SLA"],
              cta: "도입 상담",
              accent: "56, 189, 248",
            },
          ].map((plan) => (
            <div
              key={plan.name}
              onClick={() => setSelectedPlan(plan.name)}
              className={`flex h-full flex-col rounded-2xl border px-4 py-5 shadow-lg shadow-black/30 ring-1 cursor-pointer ${
                selectedPlan === plan.name
                  ? isLight
                    ? "border-emerald-400/70 ring-emerald-300/50 bg-emerald-50"
                    : "border-emerald-400/60 ring-emerald-300/50 bg-emerald-500/5"
                  : isLight
                  ? "border-slate-200 ring-slate-200/60 bg-white"
                  : "border-white/10 ring-white/10 bg-white/5"
              }`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-lg font-semibold">{plan.name}</h3>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${pillClass}`}>
                  {plan.desc}
                </span>
              </div>
              <p className="mt-2 text-2xl font-bold">{plan.price}</p>
              <ul className={`mt-3 flex-1 space-y-2 text-sm ${isLight ? "text-slate-700" : "text-slate-200"}`}>
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <span
                      className="mt-0.5 h-2 w-2 rounded-full"
                      style={{ backgroundColor: "rgba(52,211,153,0.9)" }}
                    />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className="ghost-button mt-4 text-sm text-emerald-100"
                style={{ "--ghost-color": plan.accent }}
                disabled={currentPlan === plan.name}
              >
                {currentPlan === plan.name ? "현재 이용중" : plan.cta}
              </button>
            </div>
          ))}
        </div>

        <div
          className={`flex flex-col gap-2 border-t px-6 py-4 text-sm md:flex-row md:items-center md:justify-between ${
            isLight ? "border-slate-200/80 bg-slate-50 text-slate-700" : "border-white/5 bg-white/5 text-slate-200"
          }`}
        >
          <div>
            <p className="font-semibold">결제 안내</p>
            <p className={isLight ? "text-slate-600" : "text-slate-300"}>
              카드/계좌 이체 결제(월 구독) · 부가세 별도 · 취소/환불 정책 별도 안내
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className={`ghost-button text-sm ${isLight ? "text-emerald-700" : "text-emerald-100"}`}
              style={{ "--ghost-color": "16, 185, 129" }}
            >
              카드 결제 바로가기
            </button>
            <button
              type="button"
              className={`ghost-button text-sm ${isLight ? "text-slate-600" : "text-slate-200"}`}
              style={{ "--ghost-color": isLight ? "100, 116, 139" : "148, 163, 184" }}
            >
              영수증/세금계산서 문의
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PaymentPage;
