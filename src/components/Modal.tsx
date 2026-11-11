import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface ModalProps {
  title: string;
  eyebrow?: string;
  description?: string;
  className?: string;
  children: ReactNode;
  onClose: () => void;
}

export function Modal({
  title,
  eyebrow = "本地编辑",
  description,
  className = "",
  children,
  onClose,
}: ModalProps) {
  const titleId = useId();
  const panel = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    const focusable = () => [...(panel.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex="0"]',
    ) ?? [])].filter(element => element.getClientRects().length && !element.closest("[inert]"));
    (panel.current?.querySelector<HTMLElement>("[autofocus]") ?? focusable()[0] ?? panel.current)?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); close.current(); }
      if (event.key !== "Tab") return;
      const targets = focusable(), first = targets[0], last = targets.at(-1);
      if (!first) { event.preventDefault(); panel.current?.focus(); return; }
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    panel.current?.addEventListener("keydown", keyboard);
    const element = panel.current;
    return () => {
      element?.removeEventListener("keydown", keyboard);
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);
  return createPortal(
    <div className="modal-layer" role="presentation">
      <button
        className="modal-backdrop"
        aria-label="关闭弹窗背景"
        onClick={onClose}
      />
      <section
        ref={panel}
        tabIndex={-1}
        className={`modal ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="modal-header">
          <div>
            <p className="eyebrow">{eyebrow}</p>
            <h2 id={titleId}>{title}</h2>
            {description ? <p className="muted">{description}</p> : null}
          </div>
          <button className="icon-button" onClick={onClose} aria-label="关闭弹窗" title="关闭">
            <X size={18} aria-hidden="true" />
          </button>
        </header>
        {children}
      </section>
    </div>,
    document.body,
  );
}
