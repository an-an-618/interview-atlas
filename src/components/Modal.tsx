import { X } from "lucide-react";
import type { ReactNode } from "react";
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
  return createPortal(
    <div className="modal-layer" role="presentation">
      <button
        className="modal-backdrop"
        aria-label="关闭弹窗"
        onClick={onClose}
      />
      <section
        className={`modal ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <header className="modal-header">
          <div>
            <p className="eyebrow">{eyebrow}</p>
            <h2 id="modal-title">{title}</h2>
            {description ? <p className="muted">{description}</p> : null}
          </div>
          <button className="icon-button" onClick={onClose} title="关闭">
            <X size={18} aria-hidden="true" />
          </button>
        </header>
        {children}
      </section>
    </div>,
    document.body,
  );
}
