import { Check, Link2, Plus } from "lucide-react";
import { useState, type FormEvent } from "react";
import type {
  AtomicQuestion,
  CreateQuestionInput,
  CreateSyncBlockInput,
  SyncBlock,
} from "../domain/types";

interface QuestionFormProps {
  onSubmit: (input: CreateQuestionInput) => void;
  onCancel: () => void;
}

export function QuestionForm({ onSubmit, onCancel }: QuestionFormProps) {
  const [title, setTitle] = useState("");
  const [answer, setAnswer] = useState("");
  const [notes, setNotes] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    onSubmit({
      title,
      answer,
      notes,
      tags: [],
    });
  };

  return (
    <form onSubmit={submit}>
      <label>
        <span>问题</span>
        <input
          autoFocus
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="保留面试官的真实问题"
          required
        />
      </label>
      <label>
        <span>答案</span>
        <textarea
          value={answer}
          onChange={(event) => setAnswer(event.target.value)}
          placeholder="可以先留空，之后再完善。"
          rows={7}
        />
      </label>
      <label>
        <span>笔记</span>
        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="记录补充思路、待查资料或下次需要改进的地方。"
          rows={4}
        />
      </label>
      <footer className="form-actions">
        <button className="button quiet" type="button" onClick={onCancel}>
          取消
        </button>
        <button className="button primary" type="submit">
          <Plus size={15} aria-hidden="true" />
          添加原子问答
        </button>
      </footer>
    </form>
  );
}

interface SyncBlockFormProps {
  questions: AtomicQuestion[];
  syncBlocks: SyncBlock[];
  initialQuestionId?: string;
  onSubmit: (input: CreateSyncBlockInput) => void;
  onLinkExisting?: (syncBlockId: string) => void;
  onCancel: () => void;
}

export function SyncBlockForm({
  questions,
  syncBlocks,
  initialQuestionId,
  onSubmit,
  onLinkExisting,
  onCancel,
}: SyncBlockFormProps) {
  const canLinkExisting = Boolean(
    initialQuestionId && syncBlocks.length && onLinkExisting,
  );
  const [mode, setMode] = useState<"existing" | "create">(
    canLinkExisting ? "existing" : "create",
  );
  const [selectedSyncBlockId, setSelectedSyncBlockId] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [reviewNotes, setReviewNotes] = useState("");
  const [selected, setSelected] = useState<string[]>(
    initialQuestionId ? [initialQuestionId] : [],
  );

  const toggle = (id: string) => {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (mode === "existing") {
      if (!selectedSyncBlockId || !onLinkExisting) return;
      onLinkExisting(selectedSyncBlockId);
      return;
    }
    if (!title.trim() || !body.trim()) return;
    onSubmit({
      title,
      body,
      reviewNotes,
      questionIds: selected,
    });
  };

  return (
    <form onSubmit={submit}>
      {initialQuestionId ? (
        <div className="sync-association-tabs" role="tablist" aria-label="关联方式">
          <button
            className={mode === "existing" ? "active" : ""}
            type="button"
            role="tab"
            aria-selected={mode === "existing"}
            aria-controls="existing-sync-block-panel"
            disabled={!canLinkExisting}
            onClick={() => setMode("existing")}
          >
            <Link2 size={15} aria-hidden="true" />
            选择已有
            <small>{syncBlocks.length}</small>
          </button>
          <button
            className={mode === "create" ? "active" : ""}
            type="button"
            role="tab"
            aria-selected={mode === "create"}
            aria-controls="create-sync-block-panel"
            onClick={() => setMode("create")}
          >
            <Plus size={15} aria-hidden="true" />
            新建同步块
          </button>
        </div>
      ) : null}

      {mode === "existing" ? (
        <fieldset
          className="sync-block-picker"
          id="existing-sync-block-panel"
          role="tabpanel"
        >
          <legend>选择要关联的同步块</legend>
          {syncBlocks.map((syncBlock, index) => {
            const checked = selectedSyncBlockId === syncBlock.id;
            return (
              <label
                className={`sync-block-option${checked ? " selected" : ""}`}
                key={syncBlock.id}
              >
                <input
                  autoFocus={index === 0}
                  type="radio"
                  name="sync-block"
                  checked={checked}
                  onChange={() => setSelectedSyncBlockId(syncBlock.id)}
                />
                <span className="sync-block-radio" aria-hidden="true">
                  {checked ? <Check size={13} /> : null}
                </span>
                <span>
                  <strong>{syncBlock.title}</strong>
                  <span>{syncBlock.body}</span>
                  <small>
                    已关联 {syncBlock.linkedQuestionIds.length} 个原子问答
                  </small>
                </span>
              </label>
            );
          })}
        </fieldset>
      ) : (
        <div id="create-sync-block-panel" role="tabpanel">
          <label>
            <span>稳定问题</span>
            <input
              autoFocus
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="例如：React Fiber 的调度机制"
              required
            />
          </label>
          <label>
            <span>稳定回答</span>
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="写下跨面试可复用、仍能持续修订的回答。"
              rows={8}
              required
            />
          </label>
          <label>
            <span>复习笔记</span>
            <textarea
              value={reviewNotes}
              onChange={(event) => setReviewNotes(event.target.value)}
              placeholder="记录下次需要补充或验证的地方。"
              rows={3}
            />
          </label>
          <fieldset className="question-picker">
            <legend>关联原子问答 · 已选 {selected.length}</legend>
            {questions.length ? (
              questions.map((question) => {
                const checked = selected.includes(question.id);
                return (
                  <label className="question-option" key={question.id}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(question.id)}
                    />
                    <span className="check-box" aria-hidden="true">
                      {checked ? <Check size={13} /> : null}
                    </span>
                    <span>
                      <strong>{question.title}</strong>
                      <small>
                        {question.linkedSyncBlockId
                          ? "已连接其他同步块，保存后将移动"
                          : "尚未连接同步块"}
                      </small>
                    </span>
                  </label>
                );
              })
            ) : (
              <p className="empty-inline">先创建原子问答，再建立同步块。</p>
            )}
          </fieldset>
        </div>
      )}
      <footer className="form-actions">
        <button className="button quiet" type="button" onClick={onCancel}>
          取消
        </button>
        <button
          className="button primary"
          type="submit"
          disabled={mode === "existing" && !selectedSyncBlockId}
        >
          <Link2 size={15} aria-hidden="true" />
          {mode === "existing" ? "确认关联" : "保存同步块"}
        </button>
      </footer>
    </form>
  );
}
