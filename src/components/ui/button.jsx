import { forwardRef } from "react";
import { cn } from "../../lib/utils";

const VARIANT_CLASSES = {
  default: "bg-[#0A0A0A] text-white hover:bg-[#0A0A0A]/90",
  primary: "bg-[#006FEE] text-white hover:bg-[#006FEE]/90 shadow-[0_8px_24px_-8px_rgba(0,111,238,0.6)]",
  outline: "border border-[#E5E5E0] bg-white text-[#0A0A0A] hover:bg-[#FBFBF9]",
  secondary: "bg-[#FBFBF9] text-[#0A0A0A] border border-[#E5E5E0] hover:bg-[#E5E5E0]/60",
  ghost: "text-[#0A0A0A] hover:bg-[#0A0A0A]/5",
};

const SIZE_CLASSES = {
  default: "h-10 px-5 text-sm",
  sm: "h-9 px-4 text-sm",
  lg: "h-12 px-7 text-base",
};

const Button = forwardRef(function Button(
  { className, variant = "default", size = "default", ...props },
  ref
) {
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full font-medium transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#006FEE]/40 focus-visible:ring-offset-2",
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className
      )}
      {...props}
    />
  );
});

export { Button };
