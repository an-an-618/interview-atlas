import { Check, Link2, Plus, Search } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { AnswerEditor } from "./AnswerEditor";
import type {
  AtomicQuestion,
  CreateInterviewInput,
  CreateQuestionInput,
  CreateSyncBlockInput,
  ResumeExperience,
  SyncBlock,
} from "../domain/types";

interface QuestionFormProps {
  initialValue?: CreateQuestionInput;
  onSubmit: (input: CreateQuestionInput) => void;
  onCancel: () => void;
}

export function QuestionForm({ initialValue, onSubmit, onCancel }: QuestionFormProps) {
  const [title, setTitle] = useState(initialValue?.title ?? "");
  const [answer, setAnswer] = useState(initialValue?.answer ?? "");
  const [notes, setNotes] = useState(initialValue?.notes ?? "");
  const [tags, setTags] = useState(initialValue?.tags.join("，") ?? "");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    onSubmit({
      title,
      answer,
      notes,
      tags: [...new Set(tags.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean))],
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
      <div className="form-field">
        <span>回答</span>
        <AnswerEditor
          value={answer}
          onChange={setAnswer}
          placeholder="可以先留空，之后再完善。"
          minRows={7}
        />
      </div>
      <label>
        <span>笔记</span>
        <textarea
          aria-label="笔记"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="记录补充思路、待查资料或下次需要改进的地方。"
          rows={4}
        />
      </label>
      <label>
        <span>标签</span>
        <input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="多个标签用逗号分隔" />
      </label>
      <footer className="form-actions">
        <button className="button quiet" type="button" onClick={onCancel}>
          取消
        </button>
        <button className="button primary" type="submit">
          {initialValue ? <Check size={15} aria-hidden="true" /> : <Plus size={15} aria-hidden="true" />}
          {initialValue ? "保存原子问答" : "添加原子问答"}
        </button>
      </footer>
    </form>
  );
}

export function InterviewForm({
  initialValue,
  onSubmit,
  onCancel,
}: {
  initialValue: CreateInterviewInput;
  onSubmit: (input: CreateInterviewInput) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  return (
    <form onSubmit={(event) => {
      event.preventDefault();
      onSubmit({ ...value, company: value.company.trim() || "未命名面试" });
    }}>
      <div className="interview-metadata-fields">
        {([
          ["company", "公司名"], ["role", "岗位名"], ["round", "面试轮次"],
          ["date", "面试日期"], ["source", "来源"],
        ] as const).map(([field, label], index) => (
          <label key={field}>
            <span>{label}</span>
            <input
              autoFocus={index === 0}
              type={field === "date" ? "date" : "text"}
              value={value[field]}
              onChange={(event) => setValue({ ...value, [field]: event.target.value })}
            />
          </label>
        ))}
      </div>
      <footer className="form-actions">
        <button className="button quiet" type="button" onClick={onCancel}>取消</button>
        <button className="button primary" type="submit">保存基础信息</button>
      </footer>
    </form>
  );
}

interface SyncBlockFormProps {
  questions: AtomicQuestion[];
  resumeExperiences: ResumeExperience[];
  syncBlocks: SyncBlock[];
  initialQuestionId?: string;
  onSubmit: (input: CreateSyncBlockInput) => void;
  onLinkExisting?: (syncBlockId: string) => void;
  onCancel: () => void;
}

export function SyncBlockForm({
  questions,
  resumeExperiences,
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
  const [questionQuery, setQuestionQuery] = useState("");
  const [selectedResumeExperienceIds, setSelectedResumeExperienceIds] =
    useState<string[]>([]);
  const visibleQuestions = useMemo(() => {
    const normalizedQuery = questionQuery
      .trim()
      .toLocaleLowerCase("zh-CN");

    return [...questions]
      .sort(
        (left, right) =>
          right.updatedAt.localeCompare(left.updatedAt) ||
          right.createdAt.localeCompare(left.createdAt),
      )
      .filter((question) =>
        normalizedQuery
          ? [
              question.title,
              question.answer,
              question.notes,
              question.tags.join(" "),
            ]
              .join(" ")
              .toLocaleLowerCase("zh-CN")
              .includes(normalizedQuery)
          : true,
      );
  }, [questionQuery, questions]);

  const toggleQuestion = (id: string) => {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  };

  const toggleResumeExperience = (id: string) => {
    setSelectedResumeExperienceIds((current) =>
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
      resumeExperienceIds: selectedResumeExperienceIds,
    });
  };

  return (
    <form className="sync-block-form" onSubmit={submit}>
      <div className="sync-block-form-body">
        {initialQuestionId ? (
          <div
            className="sync-association-tabs"
            role="tablist"
            aria-label="关联方式"
          >
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
            <div className="form-field">
              <span>稳定回答</span>
              <AnswerEditor
                value={body}
                onChange={setBody}
                label="稳定回答"
                placeholder="写下跨面试可复用、仍能持续修订的回答。"
                minRows={8}
              />
            </div>
            <label>
              <span>复习笔记</span>
              <textarea
                value={reviewNotes}
                onChange={(event) => setReviewNotes(event.target.value)}
                placeholder="记录下次需要补充或验证的地方。"
                rows={3}
              />
            </label>
            <fieldset className="question-picker question-association-picker">
              <legend>关联原子问答 · 已选 {selected.length}</legend>
              {questions.length ? (
                <>
                  <label className="question-picker-search">
                    <Search size={15} aria-hidden="true" />
                    <input
                      aria-label="搜索可关联的原子问答"
                      value={questionQuery}
                      onChange={(event) => setQuestionQuery(event.target.value)}
                      placeholder="搜索问题、回答或标签"
                    />
                  </label>
                  <div className="question-picker-options">
                    {visibleQuestions.length ? (
                      visibleQuestions.map((question) => {
                        const checked = selected.includes(question.id);
                        return (
                          <label className="question-option" key={question.id}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleQuestion(question.id)}
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
                      <p className="empty-inline">没有匹配的原子问答。</p>
                    )}
                  </div>
                </>
              ) : (
                <p className="empty-inline">先创建原子问答，再建立同步块。</p>
              )}
            </fieldset>
            <fieldset className="question-picker resume-experience-picker">
              <legend>
                关联简历经历 · 已选 {selectedResumeExperienceIds.length}
              </legend>
              {resumeExperiences.length ? (
                resumeExperiences.map((experience) => {
                  const checked = selectedResumeExperienceIds.includes(
                    experience.id,
                  );
                  return (
                    <label className="question-option" key={experience.id}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          toggleResumeExperience(experience.id)
                        }
                      />
                      <span className="check-box" aria-hidden="true">
                        {checked ? <Check size={13} /> : null}
                      </span>
                      <span>
                        <strong>{experience.title}</strong>
                        <small>
                          {[experience.organization, experience.type]
                            .filter(Boolean)
                            .join(" · ") || "未填写组织与类型"}
                        </small>
                      </span>
                    </label>
                  );
                })
              ) : (
                <p className="empty-inline">暂无可关联的简历经历。</p>
              )}
            </fieldset>
          </div>
        )}
      </div>
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
