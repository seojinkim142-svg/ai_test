import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { MoveRight, PhoneCall } from "lucide-react";
import { Button } from "./button";

function Hero({
  badgeLabel = "Read our launch article",
  badgeIcon = MoveRight,
  titlePrefix = "This is something",
  titles = ["amazing", "new", "wonderful", "beautiful", "smart"],
  description = "Managing a small business today is already tough. Avoid further complications by ditching outdated, tedious trade methods. Our goal is to streamline SMB trade, making it easier and faster than ever.",
  secondaryAction = { label: "Jump on a call", icon: PhoneCall },
  primaryAction = { label: "Sign up here", icon: MoveRight },
}) {
  const [titleNumber, setTitleNumber] = useState(0);
  const cyclingTitles = useMemo(() => titles, [titles]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (titleNumber === cyclingTitles.length - 1) {
        setTitleNumber(0);
      } else {
        setTitleNumber(titleNumber + 1);
      }
    }, 2000);
    return () => clearTimeout(timeoutId);
  }, [titleNumber, cyclingTitles]);

  const BadgeIcon = badgeIcon;
  const SecondaryIcon = secondaryAction.icon;
  const PrimaryIcon = primaryAction.icon;

  return (
    <div className="w-full">
      <div className="container mx-auto">
        <div className="flex gap-8 py-20 lg:py-40 items-center justify-center flex-col">
          {badgeLabel ? (
            <div>
              <Button variant="secondary" size="sm" className="gap-4">
                {badgeLabel} {BadgeIcon ? <BadgeIcon className="w-4 h-4" /> : null}
              </Button>
            </div>
          ) : null}
          <div className="flex gap-4 flex-col">
            <h1 className="text-5xl md:text-7xl max-w-2xl tracking-tighter text-center font-regular">
              <span className="text-[#0A0A0A]">{titlePrefix}</span>
              <span className="relative flex w-full justify-center overflow-hidden text-center md:pb-4 md:pt-1">
                &nbsp;
                {cyclingTitles.map((title, index) => (
                  <motion.span
                    key={title}
                    className="absolute font-semibold text-[#006FEE]"
                    initial={{ opacity: 0, y: "-100" }}
                    transition={{ type: "spring", stiffness: 50 }}
                    animate={
                      titleNumber === index
                        ? { y: 0, opacity: 1 }
                        : { y: titleNumber > index ? -150 : 150, opacity: 0 }
                    }
                  >
                    {title}
                  </motion.span>
                ))}
              </span>
            </h1>

            <p className="text-lg md:text-xl leading-relaxed tracking-tight text-[#666666] max-w-2xl text-center">
              {description}
            </p>
          </div>
          <div className="flex flex-row gap-3">
            {secondaryAction ? (
              <Button size="lg" className="gap-4" variant="outline">
                {secondaryAction.label} {SecondaryIcon ? <SecondaryIcon className="w-4 h-4" /> : null}
              </Button>
            ) : null}
            {primaryAction ? (
              <Button size="lg" variant="primary" className="gap-4">
                {primaryAction.label} {PrimaryIcon ? <PrimaryIcon className="w-4 h-4" /> : null}
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export { Hero };
