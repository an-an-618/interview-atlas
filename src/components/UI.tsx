import {
  ArrowLeft, ArrowRight, ArrowUpRight, BookOpen, Check, Download, FileText, FileUser,
  Layers, Link2, LoaderCircle, MessageSquareText, Mic, Plus, Rotate3D, RotateCcw,
  Save, Search, Settings, Share2, Shuffle, Sparkles, Star, Trash2, Upload, X,
  type LucideProps,
} from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

/** Semantic names are stable even when the underlying drawing changes. */
export const uiIcons = {
  add: Plus, import: Upload, export: Download, save: Save, confirm: Check,
  ai: Sparkles, record: Mic, retry: RotateCcw, share: Share2, delete: Trash2,
  next: ArrowRight, back: ArrowLeft, external: ArrowUpRight, close: X,
  search: Search, settings: Settings, compare: BookOpen, relation: Link2,
  favorite: Star, flip: Rotate3D, shuffle: Shuffle, loading: LoaderCircle,
  interview: FileText, question: MessageSquareText, sync: Layers, resume: FileUser,
} as const;
export type UIIconName = keyof typeof uiIcons;
export type UIControlSize = "compact" | "default" | "prominent";
export function UIIcon({ name, scale = "action", className = "", ...props }:
  Omit<LucideProps, "size" | "strokeWidth"> & {
    name: UIIconName; scale?: "meta" | "action" | "control" | "nav";
  }) {
  const Glyph = uiIcons[name];
  return <Glyph {...props} className={`ui-icon ui-icon-${scale} ${className}`.trim()}
    strokeWidth={1.75} aria-hidden="true" focusable="false" data-ui-icon={name}/>;
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "quiet" | "danger" | "text";
  size?: UIControlSize; icon?: UIIconName; trailingIcon?: UIIconName;
  loading?: boolean; children: ReactNode;
};
export function Button({ variant = "secondary", size = "default", icon, trailingIcon,
  loading = false, disabled, className = "", children, type = "button", ...props }: ButtonProps) {
  return <button {...props} type={type} disabled={disabled || loading}
    aria-busy={loading || props["aria-busy"] || undefined} data-ui-size={size}
    className={`ui-button ${variant === "text" ? "text-button" : `button ${variant}`} ${className}`.trim()}>
    {icon ? <UIIcon name={loading ? "loading" : icon} className={loading ? "ui-loading" : ""}/> : null}
    <span className="ui-button-label">{children}</span>
    {trailingIcon ? <UIIcon name={trailingIcon}/> : null}
  </button>;
}
export function IconButton({ icon, label, size = "default", className = "", selected = false, ...props }:
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "aria-label"> & {
    icon: UIIconName; label: string; size?: "compact" | "default"; selected?: boolean;
  }) {
  return <button type="button" title={label} {...props} aria-label={label} data-ui-size={size}
    className={`icon-button ${className}`.trim()}>
    <UIIcon name={icon} scale="control" fill={selected ? "currentColor" : "none"}/>
  </button>;
}
