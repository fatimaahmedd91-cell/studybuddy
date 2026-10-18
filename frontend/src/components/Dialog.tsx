"use client";

// An accessible pop-up window built on the browser's <dialog>: it traps keyboard focus,
// closes with Escape, and returns focus to the button that opened it.
import { useEffect, useId, useRef } from "react";

export default function Dialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  // Open as a modal when shown. No cleanup: when the parent stops showing the dialog, the
  // element is removed and the browser ends the modal by itself. (Closing it here would fire
  // onClose during React's development double-run and shut the dialog straight away.)
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose(); // click on the dark background
      }}
      className="m-auto max-h-[90vh] w-[min(94vw,520px)] overflow-y-auto rounded-frame bg-bark p-2.5 text-bark backdrop:bg-bark/60"
    >
      <div className="rounded-inner bg-sky p-5 sm:p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 id={titleId} className="text-2xl font-bold">
            {title}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-2xl hover:bg-cream"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
