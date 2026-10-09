import {
  useLayoutEffect,
  useRef,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";

function AnswerPointField({
  value,
  index,
  label,
  placeholder,
  rows,
  disabled,
  onChange,
  onKeyDown,
}: {
  value: string;
  index: number;
  label: string;
  placeholder: string;
  rows: number;
  disabled: boolean;
  onChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
}) {
  const editor = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    if (!editor.current) return;
    editor.current.style.height = "auto";
    editor.current.style.height = `${editor.current.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={editor}
      data-answer-point-index={index}
      aria-label={`${label}第 ${index + 1} 点`}
      value={value}
      rows={rows}
      disabled={disabled}
      placeholder={placeholder}
      onChange={onChange}
      onKeyDown={onKeyDown}
    />
  );
}

export function AnswerEditor({
  value,
  onChange,
  label = "回答",
  placeholder = "写下这道问题的回答。",
  minRows = 3,
  disabled = false,
  onCancel,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  minRows?: number;
  disabled?: boolean;
  onCancel?: () => void;
  className?: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const points = value.split(/\r?\n/);
  const multiple = points.length > 1;
  const classes = [
    "answer-editor",
    multiple ? "multiple" : "single",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const focusPoint = (index: number, position = 0) => {
    requestAnimationFrame(() => {
      const editor = container.current?.querySelector<HTMLTextAreaElement>(
        `[data-answer-point-index="${index}"]`,
      );
      editor?.focus();
      editor?.setSelectionRange(position, position);
    });
  };

  return (
    <div ref={container} className={classes} role="group" aria-label={label}>
      {points.map((point, index) => (
        <div className="answer-editor-row" key={index}>
          {multiple ? (
            <span className="answer-outline-node" aria-hidden="true" />
          ) : null}
          <AnswerPointField
            value={point}
            index={index}
            label={label}
            placeholder={index === 0 ? placeholder : ""}
            rows={multiple ? 1 : minRows}
            disabled={disabled}
            onChange={(event) => {
              const inserted = event.target.value.split(/\r?\n/);
              const next = [...points];
              next.splice(index, 1, ...inserted);
              onChange(next.join("\n"));
            }}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing || event.keyCode === 229) return;
              const editor = event.currentTarget;
              if (event.key === "Escape" && onCancel) {
                event.preventDefault();
                onCancel();
              } else if (event.key === "Enter") {
                event.preventDefault();
                const before = point.slice(0, editor.selectionStart);
                const after = point.slice(editor.selectionEnd);
                const next = [...points];
                next.splice(index, 1, before, after);
                onChange(next.join("\n"));
                focusPoint(index + 1);
              } else if (
                event.key === "Backspace" &&
                multiple &&
                editor.selectionStart === 0 &&
                editor.selectionEnd === 0
              ) {
                event.preventDefault();
                const previous = points[index - 1];
                if (previous === undefined) {
                  const next = points.slice(1);
                  onChange(next.join("\n"));
                  focusPoint(0);
                  return;
                }
                const next = [...points];
                next.splice(index - 1, 2, previous + point);
                onChange(next.join("\n"));
                focusPoint(index - 1, previous.length);
              }
            }}
          />
        </div>
      ))}
    </div>
  );
}
