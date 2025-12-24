import { MODEL } from "../constants";

function Header() {
  return (
    <header className="flex w-full items-center border-b border-white/10 px-10 py-3">
      <div className="flex w-full flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-emerald-200/80">quiz and summarize</p>
          <h1 className="mt-1 text-2xl font-bold leading-tight text-white sm:text-3xl">
            Zeusian.ai
          </h1>
        </div>
      </div>
    </header>
  );
}

export default Header;
