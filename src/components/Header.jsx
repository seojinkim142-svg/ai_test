import { MODEL } from "../constants";

function Header() {
  return (
    <header className="rounded-3xl border border-white/5 bg-white/5 p-6 shadow-2xl shadow-emerald-900/20 backdrop-blur">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-emerald-300/80">PDF Quiz</p>
          <h1 className="mt-1 text-3xl font-bold leading-tight text-white sm:text-4xl">
            본문 기반 객관식 4문항, 계산형 주관식 1문항 생성
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-300">
            PDF를 올리면 본문만으로 한국어 문제를 만들어드립니다. 로컬에서 추출 작업을 실행하고 OpenAI API 키는
            직접 설정해주세요.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl border border-white/15 bg-white/10 p-2 shadow-inner shadow-black/30">
            <img
              src="/pnu-logo.png"
              alt="Pusan National University Industrial Engineering"
              className="h-full w-full object-contain"
            />
          </div>
          <div className="rounded-2xl bg-emerald-400/10 px-4 py-3 text-emerald-100 ring-1 ring-emerald-300/30">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-200">Model</p>
            <p className="text-sm font-bold">{MODEL}</p>
          </div>
        </div>
      </div>
    </header>
  );
}

export default Header;
