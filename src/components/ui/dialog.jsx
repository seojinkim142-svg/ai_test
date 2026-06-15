import { useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "../../lib/utils";

function Dialog({ open, onOpenChange, children }) {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onOpenChange?.(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black/80"
        onClick={() => onOpenChange?.(false)}
        aria-hidden="true"
      />
      {children}
    </div>
  );
}

function DialogContent({ className, children, onClose }) {
  return (
    <div
      className={cn(
        "relative z-50 grid w-full max-w-lg gap-4 rounded-lg border border-white/10 bg-slate-950 shadow-2xl",
        className
      )}
    >
      {children}
      <button
        type="button"
        onClick={() => onClose?.()}
        className="absolute right-4 top-4 rounded-sm text-slate-400 transition hover:text-white"
        aria-label="닫기"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function DialogHeader({ className, ...props }) {
  return <div className={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)} {...props} />;
}

function DialogFooter({ className, ...props }) {
  return <div className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:space-x-2", className)} {...props} />;
}

function DialogTitle({ className, ...props }) {
  return <h2 className={cn("text-lg font-semibold leading-none tracking-tight text-white", className)} {...props} />;
}

function DialogDescription({ className, ...props }) {
  return <div className={cn("text-sm text-slate-400", className)} {...props} />;
}

export { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription };
