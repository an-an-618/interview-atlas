import { useId, useLayoutEffect, useRef, useState } from "react";

/** Plain text at rest; edits commit on blur and can be cancelled with Escape. */
export function InlineText({
  value,
  label,
  placeholder,
  multiline = false,
  required = false,
  onSave,
}: {
  value: string;
  label: string;
  placeholder: string;
  multiline?: boolean;
  required?: boolean;
  onSave: (value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const active = useRef(false);
  const editor = useRef<HTMLTextAreaElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const hintId = useId();
  const errorId = useId();

  useLayoutEffect(() => {
    if (editing && editor.current) {
      editor.current.focus();
      const end = editor.current.value.length;
      editor.current.setSelectionRange(end, end);
    }
  }, [editing]);

  useLayoutEffect(() => {
    if (editing && editor.current) {
      editor.current.style.height = "auto";
      editor.current.style.height = `${editor.current.scrollHeight}px`;
    }
  }, [editing, draft]);

  function commit() {
    if (!active.current) return;
    const next = draft.trim();
    if (required && !next) {
      setError(`${label}不能为空。`);
      return;
    }
    try {
      if (next !== value) onSave(next);
      active.current = false;
      setEditing(false);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "保存失败，请重试。");
    }
  }

  return (
    <span className="inline-text">
      {editing ? (
        <>
          <textarea
            ref={editor}
            className="inline-text-editor"
            aria-label={label}
            aria-invalid={Boolean(error)}
            aria-describedby={`${hintId}${error ? ` ${errorId}` : ""}`}
            value={draft}
            rows={1}
            onChange={(event) => {
              setDraft(
                multiline ? event.target.value : event.target.value.replace(/\r?\n/g, " "),
              );
              setError(null);
            }}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing || event.keyCode === 229) return;
              if (event.key === "Escape") {
                event.preventDefault();
                active.current = false;
                setEditing(false);
                setError(null);
                requestAnimationFrame(() => trigger.current?.focus());
              } else if (
                event.key === "Enter" &&
                (!multiline || event.metaKey || event.ctrlKey)
              ) {
                event.preventDefault();
                commit();
              }
            }}
          />
          <span className="inline-text-hint" id={hintId}>
            点击其他位置保存 · Esc 取消
          </span>
        </>
      ) : (
        <button
          ref={trigger}
          type="button"
          className={`inline-text-value${value ? "" : " is-empty"}`}
          aria-label={`编辑${label}`}
          title="点击文字编辑"
          onClick={() => {
            setDraft(value);
            active.current = true;
            setEditing(true);
            setError(null);
          }}
        >
          {value || placeholder}
        </button>
      )}
      {error ? (
        <span className="inline-text-error" id={errorId} role="alert">
          {error}
        </span>
      ) : null}
    </span>
  );
}
