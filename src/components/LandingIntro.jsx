import { Fragment, memo, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Sparkles, ArrowRight, Check, ChevronDown, Star, FileText, ListChecks, Layers, MessageCircle, ClipboardCheck, RefreshCw } from "lucide-react";
import { Button } from "./ui/button";
import { Hero } from "./ui/animated-hero";
import { ContainerScroll } from "./ui/container-scroll-animation";
import RadialOrbitalTimeline from "./ui/radial-orbital-timeline";
import { COMPANY_INFO_ITEMS, LEGAL_LINKS } from "../legal/companyInfo";
import { OUTPUT_LANGUAGE_OPTIONS, SHOWCASE_COPY } from "../pages/showcaseCopy";
import TermsAgreementDialog from "./TermsAgreementDialog";

const FOOTER_COMPANY_INFO = COMPANY_INFO_ITEMS.find((item) => item.label === "상호") ?? COMPANY_INFO_ITEMS[0];

const TIMELINE_ICONS = [FileText, ListChecks, Layers, MessageCircle, ClipboardCheck, RefreshCw];
const TIMELINE_RELATED_IDS = [[2], [1, 3], [2, 4], [3, 5], [4, 6], [5, 1]];
const TIMELINE_ENERGY = [100, 90, 80, 70, 60, 95];

const scrollToFeatures = () => {
  if (typeof document === "undefined") return;
  document.getElementById("features")?.scrollIntoView({ behavior: "smooth" });
};

const LandingIntro = memo(function LandingIntro({ onStart, outputLanguage = "ko", setOutputLanguage }) {
  const [activePlanId, setActivePlanId] = useState("premium");
  const [showTermsDialog, setShowTermsDialog] = useState(false);

  const copy = SHOWCASE_COPY[outputLanguage] ?? SHOWCASE_COPY.ko;

  const featureTimeline = useMemo(
    () =>
      copy.features.timeline.map((item, index) => ({
        id: index + 1,
        title: item.title,
        date: item.date,
        content: item.content,
        category: item.category,
        bullets: item.bullets,
        icon: TIMELINE_ICONS[index],
        relatedIds: TIMELINE_RELATED_IDS[index],
        status: "completed",
        energy: TIMELINE_ENERGY[index],
      })),
    [copy]
  );

  const visibleLegalLinks = useMemo(
    () =>
      LEGAL_LINKS
        .filter((link) => !link.href.includes("japan-transactions") || outputLanguage === "ja")
        .map((link) => ({
          ...link,
          label: link.href.includes("privacy")
            ? copy.footer.legalLinks.privacy
            : link.href.includes("japan-transactions")
              ? copy.footer.legalLinks.japanTransactions
              : copy.footer.legalLinks.terms,
        })),
    [copy, outputLanguage]
  );

  return (
    <div className="min-h-screen bg-[#FBFBF9] font-sans text-[#0A0A0A]">
      {/* Hero */}
      <header className="relative overflow-hidden border-b border-[#E5E5E0]">
        <div
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(60% 50% at 50% 0%, rgba(0,111,238,0.12) 0%, rgba(251,251,249,0) 70%)",
          }}
        />
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
          <div className="flex items-center gap-2 text-base font-semibold">
            <img
              src="/apple-touch-icon.png"
              alt=""
              aria-hidden="true"
              decoding="async"
              className="h-9 w-9 rounded-[8px] object-cover"
            />
            Zeusian.ai
          </div>
          <div className="hidden items-center gap-8 text-sm text-[#666666] sm:flex">
            <a href="#features" className="hover:text-[#0A0A0A]">{copy.nav.features}</a>
            <a href="#pricing" className="hover:text-[#0A0A0A]">{copy.nav.pricing}</a>
            <a href="#cta" className="hover:text-[#0A0A0A]">{copy.nav.start}</a>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <label className="relative">
              <span className="sr-only">{copy.nav.language}</span>
              <select
                value={outputLanguage}
                onChange={(e) => setOutputLanguage?.(e.target.value)}
                className="appearance-none rounded-full border border-[#E5E5E0] bg-white px-3 py-1.5 pr-7 text-xs text-[#0A0A0A] outline-none transition hover:border-[#006FEE] sm:px-4 sm:py-2 sm:pr-8 sm:text-sm"
              >
                {OUTPUT_LANGUAGE_OPTIONS.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.label}
                  </option>
                ))}
              </select>
              <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-[#666666] sm:right-3">
                <ChevronDown className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </span>
            </label>
            <Button variant="primary" size="sm" onClick={onStart}>{copy.nav.start}</Button>
          </div>
        </nav>

        <Hero
          badgeLabel={copy.hero.badgeLabel}
          badgeIcon={Sparkles}
          titlePrefix={copy.hero.titlePrefix}
          titles={copy.hero.titles}
          description={copy.hero.description}
          secondaryAction={{ label: copy.hero.secondaryAction, onClick: scrollToFeatures }}
          primaryAction={{ label: copy.hero.primaryAction, icon: ArrowRight, onClick: onStart }}
        />
      </header>

      {/* Product preview - scroll zoom */}
      <ContainerScroll
        titleComponent={
          <h2 className="font-display text-3xl font-semibold tracking-[-0.02em] sm:text-4xl">
            {copy.scroll.line1}
            <br />
            <span className="text-[#006FEE]">{copy.scroll.accent}</span>
          </h2>
        }
      >
        <img
          src="https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=1400&q=80"
          alt="Zeusian.ai 학습 화면 미리보기"
          height={720}
          width={1400}
          className="mx-auto h-full w-full rounded-2xl object-cover object-left-top"
          draggable={false}
        />
      </ContainerScroll>

      {/* Features - radial orbital timeline */}
      <section id="features" className="relative">
        <div className="absolute left-0 right-0 top-10 z-10 mx-auto max-w-2xl px-6 text-center">
          <h2 className="font-display text-3xl font-semibold tracking-[-0.02em] text-[#0A0A0A] sm:text-4xl">
            {copy.features.lead}
            <span className="text-[#006FEE]"> {copy.features.accent}</span>
          </h2>
          <p className="mt-3 text-[#666666]">
            {copy.features.description}
          </p>
        </div>
        <RadialOrbitalTimeline timelineData={featureTimeline} />
      </section>

      {/* Pricing */}
      <section id="pricing" className="border-t border-[#E5E5E0] px-6 py-24">
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-display text-3xl font-semibold tracking-[-0.02em] text-[#0A0A0A] sm:text-4xl">
              {copy.pricing.lead}
              <br />
              <span className="text-[#006FEE]">{copy.pricing.accent}</span>
            </h2>
            <p className="mt-3 text-[#666666]">
              {copy.pricing.description}
            </p>
          </div>

          <div className="mt-12 grid gap-5 md:grid-cols-3 md:items-center">
            {copy.pricing.plans.map((plan, index) => {
              const isActive = activePlanId === plan.id;
              const isPopular = plan.id === "pro";
              const originalPrices = Array.isArray(plan.originalPrices)
                ? plan.originalPrices
                : plan.originalPrice
                  ? [plan.originalPrice]
                  : [];
              return (
                <motion.div
                  key={plan.id}
                  initial={{ y: 40, opacity: 0 }}
                  whileInView={{
                    y: isPopular ? -12 : 0,
                    opacity: 1,
                    scale: index === 0 || index === 2 ? 0.97 : 1,
                  }}
                  viewport={{ once: true }}
                  transition={{
                    duration: 0.8,
                    type: "spring",
                    stiffness: 100,
                    damping: 30,
                    delay: index * 0.1,
                  }}
                  role="button"
                  tabIndex={0}
                  onClick={() => setActivePlanId(plan.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setActivePlanId(plan.id);
                    }
                  }}
                  className={`relative flex cursor-pointer flex-col rounded-2xl border p-6 text-center transition ${
                    isActive
                      ? "border-2 border-[#006FEE] bg-white shadow-xl shadow-[#006FEE]/10"
                      : "border-[#E5E5E0] bg-[#FBFBF9] hover:bg-white"
                  }`}
                >
                  {isPopular && (
                    <div className="absolute right-0 top-0 flex items-center gap-1 rounded-bl-xl rounded-tr-xl bg-[#006FEE] px-3 py-1">
                      <Star className="h-3.5 w-3.5 fill-current text-white" />
                      <span className="text-xs font-semibold text-white">Popular</span>
                    </div>
                  )}

                  <div className="flex-1">
                    <p className="text-sm font-semibold text-[#666666]">{plan.name}</p>

                    <div className="mt-6 flex items-end justify-center gap-2">
                      {originalPrices.map((originalPrice) => (
                        <span key={originalPrice} className="text-sm font-semibold text-[#999999] line-through">
                          {originalPrice}
                        </span>
                      ))}
                      <p className="text-4xl font-bold tracking-tight text-[#0A0A0A]">{plan.price}</p>
                    </div>

                    <ul className="mt-6 space-y-3 text-left text-sm text-[#0A0A0A]">
                      {plan.features.map((feature) => (
                        <li key={feature} className="flex items-start gap-3">
                          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#006FEE] text-white">
                            <Check className="h-3 w-3" />
                          </span>
                          <span className="leading-6">{feature}</span>
                        </li>
                      ))}
                    </ul>

                    <hr className="my-5 border-[#E5E5E0]" />

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActivePlanId(plan.id);
                        onStart?.();
                      }}
                      className={`group relative inline-flex w-full items-center justify-center gap-2 overflow-hidden rounded-full px-5 py-3 text-sm font-semibold ring-offset-2 transition-all duration-300 ease-out hover:ring-2 hover:ring-[#006FEE] hover:ring-offset-1 ${
                        isActive
                          ? "bg-[#006FEE] text-white"
                          : "border border-[#E5E5E0] bg-white text-[#006FEE] hover:bg-[#006FEE] hover:text-white"
                      }`}
                    >
                      <span>{isActive ? copy.pricing.current : plan.ctaLabel}</span>
                      <ArrowRight className="h-4 w-4" />
                    </button>

                    <p className="mt-4 text-xs leading-5 text-[#999999]">{plan.description}</p>
                  </div>
                </motion.div>
              );
            })}
          </div>

          <div className="mt-8 hidden overflow-hidden rounded-2xl border border-[#E5E5E0] bg-white md:block">
            <div className="overflow-x-auto">
              <div className="min-w-[720px]">
                <div className="grid grid-cols-[180px_repeat(3,minmax(0,1fr))] border-b border-[#E5E5E0]">
                  <div className="px-5 py-5 text-xs font-semibold uppercase tracking-widest text-[#999999]">
                    {copy.pricing.compare}
                  </div>
                  {copy.pricing.plans.map((plan) => {
                    const isActive = activePlanId === plan.id;
                    const originalPrices = Array.isArray(plan.originalPrices)
                      ? plan.originalPrices
                      : plan.originalPrice
                        ? [plan.originalPrice]
                        : [];
                    return (
                      <button
                        key={plan.id}
                        type="button"
                        onClick={() => setActivePlanId(plan.id)}
                        className={`border-l border-[#E5E5E0] px-5 py-5 text-left transition ${
                          isActive ? "bg-[#0A0A0A] text-white" : "bg-white text-[#0A0A0A] hover:bg-[#FBFBF9]"
                        }`}
                      >
                        <p className="text-lg font-semibold">{plan.name}</p>
                        <p className={`mt-1 text-sm ${isActive ? "text-white/50" : "text-[#666666]"}`}>{plan.description}</p>
                        <div className="mt-3 flex flex-wrap items-end gap-2">
                          {originalPrices.map((originalPrice) => (
                            <span
                              key={originalPrice}
                              className={`text-sm line-through ${isActive ? "text-white/40" : "text-[#999999]"}`}
                            >
                              {originalPrice}
                            </span>
                          ))}
                          <p className={`text-xl font-semibold ${isActive ? "text-white" : "text-[#0A0A0A]"}`}>{plan.price}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {copy.pricing.rows.map((row) => (
                  <Fragment key={row.label}>
                    <div className="grid grid-cols-[180px_repeat(3,minmax(0,1fr))] border-b border-[#E5E5E0] last:border-b-0">
                      <div className="bg-[#FBFBF9] px-5 py-4 text-sm font-semibold text-[#666666]">
                        {row.label}
                      </div>
                      {copy.pricing.plans.map((plan) => {
                        const isActive = activePlanId === plan.id;
                        return (
                          <div
                            key={`${row.label}-${plan.id}`}
                            className={`border-l border-[#E5E5E0] px-5 py-4 text-sm leading-7 ${
                              isActive ? "bg-blue-50 text-[#0A0A0A]" : "bg-white text-[#666666]"
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
        </div>
      </section>

      {/* CTA */}
      <section id="cta" className="mx-auto max-w-4xl px-6 py-24 text-center">
        <h2 className="font-display text-3xl font-semibold tracking-[-0.02em] sm:text-4xl">
          {copy.cta.lead} <span className="text-[#006FEE]">{copy.cta.accent}</span>
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-[#666666]">
          {copy.cta.description}
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button variant="primary" size="lg" onClick={onStart}>{copy.cta.primary}</Button>
          <Button variant="ghost" size="lg" onClick={onStart}>{copy.cta.secondary}</Button>
        </div>
      </section>

      <footer className="border-t border-[#E5E5E0] bg-[#FBFBF9] px-5 py-12 text-[#0A0A0A] sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
            <div className="space-y-3 sm:col-span-2 lg:col-span-1">
              <div className="flex items-center gap-3">
                <img
                  src="/apple-touch-icon.png"
                  alt=""
                  aria-hidden="true"
                  decoding="async"
                  className="h-9 w-9 rounded-[8px] object-cover"
                />
                <p className="text-base font-semibold text-[#0A0A0A]">Zeusian.ai</p>
              </div>
              <div className="max-w-sm">
                <p className="font-display text-2xl font-semibold leading-tight tracking-[-0.02em] text-[#0A0A0A] sm:text-3xl">
                  {copy.footer.titleLine1}
                  <br />
                  {copy.footer.titleLine2}
                </p>
                <p className="mt-3 text-sm leading-6 text-[#666666]">
                  {copy.footer.description}
                </p>
              </div>
            </div>

            {copy.footer.groups.map((group) => (
              <div key={group.title}>
                <p className="text-xs font-semibold uppercase tracking-wider text-[#0A0A0A]">{group.title}</p>
                <div className="mt-3 space-y-2.5">
                  {group.links.map((link) => (
                    <a
                      key={`${group.title}-${link.href}-${link.label}`}
                      href={link.href}
                      className="block text-sm text-[#666666] transition hover:text-[#006FEE]"
                    >
                      {link.label}
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-[#E5E5E0] pt-6 text-center sm:flex-row sm:text-left">
            {FOOTER_COMPANY_INFO ? (
              <div className="text-xs leading-6 text-[#999999]">
                <p>{copy.footer.companyLabel}: {FOOTER_COMPANY_INFO.value}</p>
                <p>contact: hestra.co@gmail.com</p>
              </div>
            ) : null}
            <nav className="flex flex-wrap justify-center gap-4 text-sm">
              {visibleLegalLinks.map((link) =>
                link.href === "/terms" || link.href === "/privacy" ? (
                  <button
                    key={link.href}
                    type="button"
                    onClick={() => setShowTermsDialog(true)}
                    className="text-[#666666] transition hover:text-[#006FEE]"
                  >
                    {link.label}
                  </button>
                ) : (
                  <a
                    key={link.href}
                    href={link.href}
                    className="text-[#666666] transition hover:text-[#006FEE]"
                  >
                    {link.label}
                  </a>
                )
              )}
            </nav>
          </div>
        </div>
      </footer>

      <TermsAgreementDialog
        open={showTermsDialog}
        onOpenChange={setShowTermsDialog}
        onAgree={() => setShowTermsDialog(false)}
        outputLanguage={outputLanguage}
      />
    </div>
  );
});

export default LandingIntro;
