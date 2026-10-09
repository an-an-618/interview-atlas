import { useLayoutEffect, useRef, useState } from "react";
import { formatAnswer } from "../domain/answerFormat";
import { AnswerEditor } from "./AnswerEditor";
import { AnswerOutline } from "./AnswerOutline";

export function InlineAnswer({
  value,
  label,
  placeholder,
  onSave,
}: {
  value: string;
  label: string;
  placeholder: string;
  onSave: (value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const editor = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!editing) return;
    editor.current?.querySelector<HTMLTextAreaElement>("textarea")?.focus();
  }, [editing]);

  const cancel = () => {
    setDraft(value);
    setEditing(false);
    setError(null);
  };

  const commit = () => {
    const next = formatAnswer(draft);
    try {
      if (next !== value) onSave(next);
      setEditing(false);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "保存失败，请重试。");
    }
  };

  if (editing) {
    return (
      <div
        ref={editor}
        className="inline-answer editing"
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            commit();
          }
        }}
      >
        <AnswerEditor
          value={draft}
          onChange={setDraft}
          label={label}
          placeholder={placeholder}
          minRows={5}
          onCancel={cancel}
        />
        {error ? (
          <span className="inline-text-error" role="alert">
            {error}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className="inline-answer-value"
      role="button"
      tabIndex={0}
      aria-label={`编辑${label}`}
      title="点击文字编辑"
      onClick={() => {
        setDraft(value);
        setEditing(true);
        setError(null);
      }}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        setDraft(value);
        setEditing(true);
        setError(null);
      }}
    >
      <AnswerOutline answer={value} emptyText={placeholder} />
    </div>
  );
}
