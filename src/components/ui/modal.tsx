"use client";

import { X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { buttonClass } from "./button";
import { cn } from "@/lib/cn";

const ModalContext = createContext<{ close: () => void } | null>(null);
/** Forms rendered inside a Modal call `useModal()?.close()` after a successful save. */
export const useModal = () => useContext(ModalContext);

/**
 * Trigger button + native <dialog>. The platform provides the focus trap, Escape-to-close and inert background,
 * so it is accessible without extra scripting. Content mounts only while open, so forms start fresh each time.
 */
export function Modal({
  trigger,
  title,
  description,
  children,
  variant = "primary",
  size = "md",
  triggerClassName,
  triggerIcon,
}: {
  trigger: string;
  title: string;
  description?: string;
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  size?: "md" | "lg";
  triggerClassName?: string;
  triggerIcon?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  const close = useCallback(() => ref.current?.close(), []);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onClose = () => setOpen(false);
    el.addEventListener("close", onClose);
    return () => el.removeEventListener("close", onClose);
  }, []);

  return (
    <>
      <button
        type="button"
        className={buttonClass(variant, triggerClassName)}
        onClick={() => {
          setOpen(true);
          ref.current?.showModal();
        }}
      >
        {triggerIcon}
        {trigger}
      </button>
      <dialog
        ref={ref}
        aria-labelledby="zf-modal-title"
        className={cn(
          "zf-modal m-auto max-h-[92dvh] text-left w-[min(94vw,40rem)] overflow-hidden rounded-lg border border-line bg-surface p-0 text-ink shadow-pop",
          size === "lg" && "w-[min(96vw,56rem)]",
        )}
        onClick={(e) => e.target === e.currentTarget && close()}
      >
        {open && (
          <ModalContext.Provider value={{ close }}>
            <div className="flex max-h-[92dvh] flex-col">
              <header className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
                <div>
                  <h2 id="zf-modal-title" className="text-lg font-semibold tracking-tight">
                    {title}
                  </h2>
                  {description && <p className="mt-0.5 text-sm text-ink-muted">{description}</p>}
                </div>
                <button type="button" onClick={close} aria-label="Close" className="grid size-8 place-items-center rounded-md text-ink-muted hover:bg-surface-2 hover:text-ink">
                  <X aria-hidden className="size-4" />
                </button>
              </header>
              <div className="overflow-y-auto px-6 py-5">{children}</div>
            </div>
          </ModalContext.Provider>
        )}
      </dialog>
    </>
  );
}
