import { cn } from "../../lib/utils";

const VARIANT_CLASSES = {
  default: "border-[#E5E5E0] bg-[#FBFBF9] text-[#666666]",
  primary: "border-[#006FEE]/20 bg-[#006FEE]/10 text-[#006FEE]",
};

function Badge({ className, variant = "default", ...props }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium",
        VARIANT_CLASSES[variant],
        className
      )}
      {...props}
    />
  );
}

export { Badge };
