import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  FileUser,
  Link2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import type {
  AtomicQuestion,
  CreateResumeExperienceInput,
  ResumeExperience,
  SyncBlock,
} from "../domain/types";
import { Modal } from "./Modal";

export interface ResumeDiffLine {
  kind: "same" | "added" | "removed";
  value: string;
}

export function buildResumeBulletDiff(
  before: string[],
  after: string[],
): ResumeDiffLine[] {
  const rows = before.length + 1;
  const columns = after.length + 1;
  const lengths = Array.from({ length: rows }, () =>
    Array<number>(columns).fill(0),
  );

  for (let left = before.length - 1; left >= 0; left -= 1) {
    for (let right = after.length - 1; right >= 0; right -= 1) {
      lengths[left]![right] =
        before[left] === after[right]
          ? lengths[left + 1]![right + 1]! + 1
          : Math.max(
              lengths[left + 1]![right]!,
              lengths[left]![right + 1]!,
            );
    }
  }

  const result: ResumeDiffLine[] = [];
  let left = 0;
  let right = 0;
  while (left < before.length && right < after.length) {
    if (before[left] === after[right]) {
      result.push({ kind: "same", value: before[left]! });
      left += 1;
      right += 1;
    } else if (
      lengths[left + 1]![right]! >= lengths[left]![right + 1]!
    ) {
      result.push({ kind: "removed", value: before[left]! });
      left += 1;
    } else {
      result.push({ kind: "added", value: after[right]! });
      right += 1;
    }
  }
  while (left < before.length) {
    result.push({ kind: "removed", value: before[left]! });
    left += 1;
  }
  while (right < after.length) {
    result.push({ kind: "added", value: after[right]! });
    right += 1;
  }
  return result;
}

function normalizeLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function equalIds(left: string[], right: string[]) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function toggleId(current: string[], id: string): string[] {
  return current.includes(id)
    ? current.filter((value) => value !== id)
    : [...current, id];
}

interface ResumeCreateFormProps {
  questions: AtomicQuestion[];
  syncBlocks: SyncBlock[];
  onCancel: () => void;
  onSubmit: (input: CreateResumeExperienceInput) => void;
}

function ResumeCreateForm({
  questions,
  syncBlocks,
  onCancel,
  onSubmit,
}: ResumeCreateFormProps) {
  const [type, setType] = useState("项目");
  const [title, setTitle] = useState("");
  const [organization, setOrganization] = useState("");
  const [period, setPeriod] = useState("");
  const [bullets, setBullets] = useState("");
  const [questionIds, setQuestionIds] = useState<string[]>([]);
  const [syncBlockIds, setSyncBlockIds] = useState<string[]>([]);
  const [relationTab, setRelationTab] = useState<"questions" | "sync">(
    "questions",
  );

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    onSubmit({
      type,
      title,
      organization,
      period,
      bullets: normalizeLines(bullets),
      linkedQuestionIds: questionIds,
      linkedSyncBlockIds: syncBlockIds,
    });
  };

  return (
    <form className="resume-create-form" onSubmit={submit}>
      <div className="resume-create-scroll">
        <div className="form-grid">
          <label>
            <span>经历类型</span>
            <select
              value={type}
              onChange={(event) => setType(event.target.value)}
            >
              <option>实习</option>
              <option>工作</option>
              <option>项目</option>
              <option>教育</option>
              <option>其他</option>
            </select>
          </label>
          <label>
            <span>标题</span>
            <input
              autoFocus
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="例如：抖音电商前端 · 实习"
              required
            />
          </label>
          <label>
            <span>组织</span>
            <input
              value={organization}
              onChange={(event) => setOrganization(event.target.value)}
              placeholder="公司、学校或个人项目"
            />
          </label>
          <label>
            <span>时间</span>
            <input
              value={period}
              onChange={(event) => setPeriod(event.target.value)}
              placeholder="2025-11 → 2026-06"
            />
          </label>
        </div>
        <label>
          <span>经历要点 · 每行一条</span>
          <textarea
            value={bullets}
            onChange={(event) => setBullets(event.target.value)}
            placeholder={
              "负责的事项、采取的行动和可验证结果\n每行保存为一个要点"
            }
            rows={6}
          />
        </label>

        <div className="resume-relation-tabs" aria-label="关联对象">
          <button
            className={relationTab === "questions" ? "active" : ""}
            type="button"
            onClick={() => setRelationTab("questions")}
          >
            原子问答
            <small>{questionIds.length}</small>
          </button>
          <button
            className={relationTab === "sync" ? "active" : ""}
            type="button"
            onClick={() => setRelationTab("sync")}
          >
            同步块
            <small>{syncBlockIds.length}</small>
          </button>
        </div>

        {relationTab === "questions" ? (
          <fieldset className="question-picker resume-picker">
            <legend>选择关联原子问答</legend>
            {questions.length ? (
              questions.map((question) => {
                const checked = questionIds.includes(question.id);
                return (
                  <label className="question-option" key={question.id}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setQuestionIds((current) =>
                          toggleId(current, question.id),
                        )
                      }
                    />
                    <span className="check-box" aria-hidden="true">
                      {checked ? <Check size={13} /> : null}
                    </span>
                    <span>
                      <strong>{question.title}</strong>
                    </span>
                  </label>
                );
              })
            ) : (
              <p className="empty-inline">暂无可关联的原子问答。</p>
            )}
          </fieldset>
        ) : (
          <fieldset className="question-picker resume-picker">
            <legend>选择直接关联的同步块</legend>
            {syncBlocks.length ? (
              syncBlocks.map((syncBlock) => {
                const checked = syncBlockIds.includes(syncBlock.id);
                return (
                  <label className="question-option" key={syncBlock.id}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setSyncBlockIds((current) =>
                          toggleId(current, syncBlock.id),
                        )
                      }
                    />
                    <span className="check-box" aria-hidden="true">
                      {checked ? <Check size={13} /> : null}
                    </span>
                    <span>
                      <strong>{syncBlock.title}</strong>
                      <small>
                        关联 {syncBlock.linkedQuestionIds.length} 个原子问答
                      </small>
                    </span>
                  </label>
                );
              })
            ) : (
              <p className="empty-inline">暂无可关联的同步块。</p>
            )}
          </fieldset>
        )}
      </div>
      <footer className="form-actions">
        <button className="button quiet" type="button" onClick={onCancel}>
          取消
        </button>
        <button className="button primary" type="submit">
          <Plus size={15} aria-hidden="true" />
          创建经历
        </button>
      </footer>
    </form>
  );
}

interface ResumeCardProps {
  experience: ResumeExperience;
  questions: AtomicQuestion[];
  syncBlocks: SyncBlock[];
  expanded: boolean;
  onToggle: () => void;
  onOpenQuestion: (id: string) => void;
  onOpenSync: (id: string) => void;
  onUpdate: (input: CreateResumeExperienceInput) => void;
  onDelete: () => void;
}

function ResumeCard({
  experience,
  questions,
  syncBlocks,
  expanded,
  onToggle,
  onOpenQuestion,
  onOpenSync,
  onUpdate,
  onDelete,
}: ResumeCardProps) {
  const [type, setType] = useState(experience.type);
  const [title, setTitle] = useState(experience.title);
  const [organization, setOrganization] = useState(experience.organization);
  const [period, setPeriod] = useState(experience.period);
  const [bulletText, setBulletText] = useState(experience.bullets.join("\n"));
  const [questionIds, setQuestionIds] = useState(
    experience.linkedQuestionIds,
  );
  const [syncBlockIds, setSyncBlockIds] = useState(
    experience.linkedSyncBlockIds,
  );
  const [showMetadata, setShowMetadata] = useState(false);
  const [showRelations, setShowRelations] = useState(false);
  const [showDiff, setShowDiff] = useState(false);

  useEffect(() => {
    setType(experience.type);
    setTitle(experience.title);
    setOrganization(experience.organization);
    setPeriod(experience.period);
    setBulletText(experience.bullets.join("\n"));
    setQuestionIds(experience.linkedQuestionIds);
    setSyncBlockIds(experience.linkedSyncBlockIds);
  }, [experience]);

  useEffect(() => {
    if (!expanded) {
      setShowMetadata(false);
      setShowRelations(false);
      setShowDiff(false);
    }
  }, [expanded]);

  const draftBullets = normalizeLines(bulletText);
  const hasChanges =
    type.trim() !== experience.type ||
    title.trim() !== experience.title ||
    organization.trim() !== experience.organization ||
    period.trim() !== experience.period ||
    !equalIds(draftBullets, experience.bullets) ||
    !equalIds(questionIds, experience.linkedQuestionIds) ||
    !equalIds(syncBlockIds, experience.linkedSyncBlockIds);
  const linkedQuestions = experience.linkedQuestionIds
    .map((id) => questions.find((question) => question.id === id))
    .filter((item): item is AtomicQuestion => Boolean(item));
  const relatedSyncIds = useMemo(
    () =>
      [
        ...new Set([
          ...experience.linkedSyncBlockIds,
          ...linkedQuestions
            .map((question) => question.linkedSyncBlockId)
            .filter((id): id is string => Boolean(id)),
        ]),
      ],
    [experience.linkedSyncBlockIds, linkedQuestions],
  );
  const relatedSyncBlocks = relatedSyncIds
    .map((id) => syncBlocks.find((syncBlock) => syncBlock.id === id))
    .filter((item): item is SyncBlock => Boolean(item));

  const resetDraft = () => {
    setType(experience.type);
    setTitle(experience.title);
    setOrganization(experience.organization);
    setPeriod(experience.period);
    setBulletText(experience.bullets.join("\n"));
    setQuestionIds(experience.linkedQuestionIds);
    setSyncBlockIds(experience.linkedSyncBlockIds);
    setShowDiff(false);
  };

  const save = () => {
    onUpdate({
      type,
      title,
      organization,
      period,
      bullets: draftBullets,
      linkedQuestionIds: questionIds,
      linkedSyncBlockIds: syncBlockIds,
    });
    setShowDiff(false);
  };

  const metadataChanges = [
    ["类型", experience.type, type.trim()],
    ["标题", experience.title, title.trim()],
    ["组织", experience.organization, organization.trim()],
    ["时间", experience.period, period.trim()],
  ].filter(([, before, after]) => before !== after);
  const questionAdds = questionIds.filter(
    (id) => !experience.linkedQuestionIds.includes(id),
  );
  const questionRemoves = experience.linkedQuestionIds.filter(
    (id) => !questionIds.includes(id),
  );
  const syncAdds = syncBlockIds.filter(
    (id) => !experience.linkedSyncBlockIds.includes(id),
  );
  const syncRemoves = experience.linkedSyncBlockIds.filter(
    (id) => !syncBlockIds.includes(id),
  );

  return (
    <article
      id={`resume-${experience.id}`}
      className={`resume-card ${expanded ? "expanded" : ""}`}
    >
      <div className="resume-card-main" onClick={onToggle}>
        <header>
          <div>
            <span className="resume-type">{experience.type}</span>
            <h2>{experience.title}</h2>
            <p>
              {[experience.organization, experience.period]
                .filter(Boolean)
                .join(" · ") || "组织和时间尚未填写"}
            </p>
          </div>
          <button
            className="button secondary"
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onToggle();
            }}
          >
            {expanded ? (
              <ChevronDown size={14} aria-hidden="true" />
            ) : (
              <Pencil size={14} aria-hidden="true" />
            )}
            {expanded ? "收起" : "编辑"}
          </button>
        </header>
        <div className="resume-bullets">
          {experience.bullets.length ? (
            experience.bullets.map((bullet, index) => (
              <p key={`${index}-${bullet}`}>{bullet}</p>
            ))
          ) : (
            <p className="muted">尚未填写经历要点。</p>
          )}
        </div>
      </div>

      {expanded ? (
        <div className="resume-expanded" onClick={(event) => event.stopPropagation()}>
          {!showDiff ? (
            <>
              <div className="resume-editor-heading">
                <strong>手动编辑经历要点</strong>
                <div>
                  <button
                    className="button quiet"
                    type="button"
                    onClick={() => setShowMetadata((current) => !current)}
                  >
                    <Pencil size={13} aria-hidden="true" />
                    基本信息
                  </button>
                  <button
                    className="button secondary"
                    type="button"
                    onClick={() =>
                      setBulletText((current) =>
                        current ? `${current}\n` : "",
                      )
                    }
                  >
                    <Plus size={13} aria-hidden="true" />
                    新增要点
                  </button>
                </div>
              </div>

              {showMetadata ? (
                <div className="resume-metadata-editor">
                  <label>
                    <span>类型</span>
                    <select
                      value={type}
                      onChange={(event) => setType(event.target.value)}
                    >
                      <option>实习</option>
                      <option>工作</option>
                      <option>项目</option>
                      <option>教育</option>
                      <option>其他</option>
                    </select>
                  </label>
                  <label>
                    <span>标题</span>
                    <input
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                    />
                  </label>
                  <label>
                    <span>组织</span>
                    <input
                      value={organization}
                      onChange={(event) => setOrganization(event.target.value)}
                    />
                  </label>
                  <label>
                    <span>时间</span>
                    <input
                      value={period}
                      onChange={(event) => setPeriod(event.target.value)}
                    />
                  </label>
                </div>
              ) : null}

              <textarea
                className="resume-bullet-editor"
                value={bulletText}
                onChange={(event) => setBulletText(event.target.value)}
                placeholder="每行一条经历要点"
                rows={Math.max(4, draftBullets.length + 1)}
              />

              <div className="resume-editor-heading relation-heading">
                <strong>关联同步块 · {relatedSyncBlocks.length}</strong>
                <button
                  className="text-button"
                  type="button"
                  onClick={() => setShowRelations((current) => !current)}
                >
                  管理关联
                </button>
              </div>
              <div className="resume-relation-list">
                {relatedSyncBlocks.length ? (
                  relatedSyncBlocks.map((syncBlock) => (
                    <button
                      key={syncBlock.id}
                      onClick={() => onOpenSync(syncBlock.id)}
                    >
                      <Link2 size={14} aria-hidden="true" />
                      <span>{syncBlock.title}</span>
                      <small>×{syncBlock.linkedQuestionIds.length}</small>
                      <ChevronRight size={14} aria-hidden="true" />
                    </button>
                  ))
                ) : (
                  <p>暂无关联同步块</p>
                )}
              </div>

              <div className="resume-editor-heading relation-heading">
                <strong>关联原子问答 · {linkedQuestions.length}</strong>
              </div>
              <div className="resume-relation-list">
                {linkedQuestions.length ? (
                  linkedQuestions.map((question) => (
                    <button
                      key={question.id}
                      onClick={() => onOpenQuestion(question.id)}
                    >
                      <CircleHelp size={14} aria-hidden="true" />
                      <span>{question.title}</span>
                      <ChevronRight size={14} aria-hidden="true" />
                    </button>
                  ))
                ) : (
                  <p>暂无关联原子问答</p>
                )}
              </div>

              {showRelations ? (
                <div className="resume-relation-editor">
                  <section>
                    <strong>选择原子问答</strong>
                    {questions.map((question) => (
                      <label key={question.id}>
                        <input
                          type="checkbox"
                          checked={questionIds.includes(question.id)}
                          onChange={() =>
                            setQuestionIds((current) =>
                              toggleId(current, question.id),
                            )
                          }
                        />
                        <span>{question.title}</span>
                      </label>
                    ))}
                    {!questions.length ? <p>暂无原子问答。</p> : null}
                  </section>
                  <section>
                    <strong>选择直接关联的同步块</strong>
                    {syncBlocks.map((syncBlock) => (
                      <label key={syncBlock.id}>
                        <input
                          type="checkbox"
                          checked={syncBlockIds.includes(syncBlock.id)}
                          onChange={() =>
                            setSyncBlockIds((current) =>
                              toggleId(current, syncBlock.id),
                            )
                          }
                        />
                        <span>{syncBlock.title}</span>
                      </label>
                    ))}
                    {!syncBlocks.length ? <p>暂无同步块。</p> : null}
                  </section>
                </div>
              ) : null}

              <footer className="resume-edit-actions">
                <button
                  className="button danger"
                  type="button"
                  onClick={onDelete}
                  title="删除这条简历经历"
                >
                  <Trash2 size={14} aria-hidden="true" />
                  删除
                </button>
                <div>
                  <button
                    className="button quiet"
                    type="button"
                    onClick={resetDraft}
                    disabled={!hasChanges}
                  >
                    撤销修改
                  </button>
                  <button
                    className="button primary"
                    type="button"
                    onClick={() => setShowDiff(true)}
                    disabled={!hasChanges || !title.trim()}
                  >
                    预览修改
                  </button>
                </div>
              </footer>
            </>
          ) : (
            <div className="resume-diff">
              <header>
                <div>
                  <p className="eyebrow">Diff preview</p>
                  <h3>确认本次修改</h3>
                </div>
                <button
                  className="button quiet"
                  type="button"
                  onClick={() => setShowDiff(false)}
                >
                  <ArrowLeft size={13} aria-hidden="true" />
                  返回编辑
                </button>
              </header>
              <p className="resume-diff-note">
                确认后只更新这条简历经历，不会改写已关联的原子问答或同步块正文。
              </p>

              {metadataChanges.length ? (
                <section>
                  <h4>基本信息</h4>
                  {metadataChanges.map(([label, before, after]) => (
                    <div className="resume-meta-diff" key={label}>
                      <strong>{label}</strong>
                      <span className="removed">{before || "未填写"}</span>
                      <ChevronRight size={13} aria-hidden="true" />
                      <span className="added">{after || "未填写"}</span>
                    </div>
                  ))}
                </section>
              ) : null}

              <section>
                <h4>经历要点</h4>
                <div className="resume-line-diff">
                  {buildResumeBulletDiff(
                    experience.bullets,
                    draftBullets,
                  ).map((line, index) => (
                    <div className={line.kind} key={`${index}-${line.value}`}>
                      <span>
                        {line.kind === "added"
                          ? "+"
                          : line.kind === "removed"
                            ? "−"
                            : " "}
                      </span>
                      {line.value}
                    </div>
                  ))}
                </div>
              </section>

              {questionAdds.length ||
              questionRemoves.length ||
              syncAdds.length ||
              syncRemoves.length ? (
                <section>
                  <h4>关联变化</h4>
                  <div className="resume-link-diff">
                    {questionRemoves.map((id) => (
                      <p className="removed" key={`remove-question-${id}`}>
                        − 解除原子问答：
                        {questions.find((item) => item.id === id)?.title ?? id}
                      </p>
                    ))}
                    {questionAdds.map((id) => (
                      <p className="added" key={`add-question-${id}`}>
                        + 关联原子问答：
                        {questions.find((item) => item.id === id)?.title ?? id}
                      </p>
                    ))}
                    {syncRemoves.map((id) => (
                      <p className="removed" key={`remove-sync-${id}`}>
                        − 解除同步块：
                        {syncBlocks.find((item) => item.id === id)?.title ?? id}
                      </p>
                    ))}
                    {syncAdds.map((id) => (
                      <p className="added" key={`add-sync-${id}`}>
                        + 关联同步块：
                        {syncBlocks.find((item) => item.id === id)?.title ?? id}
                      </p>
                    ))}
                  </div>
                </section>
              ) : null}

              <footer>
                <button
                  className="button quiet"
                  type="button"
                  onClick={() => setShowDiff(false)}
                >
                  返回继续编辑
                </button>
                <button className="button primary" type="button" onClick={save}>
                  <Check size={14} aria-hidden="true" />
                  确认应用修改
                </button>
              </footer>
            </div>
          )}
        </div>
      ) : null}
    </article>
  );
}

interface ResumePageProps {
  experiences: ResumeExperience[];
  questions: AtomicQuestion[];
  syncBlocks: SyncBlock[];
  focusedId: string | null;
  onFocus: (id: string | null) => void;
  onOpenQuestion: (id: string) => void;
  onOpenSync: (id: string) => void;
  onCreate: (input: CreateResumeExperienceInput) => ResumeExperience;
  onUpdate: (
    experienceId: string,
    input: CreateResumeExperienceInput,
  ) => void;
  onDelete: (experienceId: string) => void;
}

export function ResumePage({
  experiences,
  questions,
  syncBlocks,
  focusedId,
  onFocus,
  onOpenQuestion,
  onOpenSync,
  onCreate,
  onUpdate,
  onDelete,
}: ResumePageProps) {
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!focusedId) return;
    requestAnimationFrame(() =>
      document
        .getElementById(`resume-${focusedId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  }, [focusedId]);

  return (
    <div className="page resume-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">简历经历 · Resume</p>
          <h1>
            举一反三，<em>不离其宗</em>
          </h1>
          <p className="page-description">
            用真实经历支撑面试回答，并保持每条关联可追溯。
          </p>
        </div>
        <button className="button primary" onClick={() => setCreating(true)}>
          <Plus size={15} aria-hidden="true" />
          新增经历
        </button>
      </header>

      {experiences.length ? (
        <div className="resume-list">
          {experiences.map((experience) => (
            <ResumeCard
              key={experience.id}
              experience={experience}
              questions={questions}
              syncBlocks={syncBlocks}
              expanded={focusedId === experience.id}
              onToggle={() =>
                onFocus(focusedId === experience.id ? null : experience.id)
              }
              onOpenQuestion={onOpenQuestion}
              onOpenSync={onOpenSync}
              onUpdate={(input) => onUpdate(experience.id, input)}
              onDelete={() => onDelete(experience.id)}
            />
          ))}
        </div>
      ) : (
        <div className="resume-empty">
          <FileUser size={30} strokeWidth={1.4} aria-hidden="true" />
          <h2>还没有简历经历</h2>
          <p>先录入一段实习、工作或项目经历，再把它关联到真实问答。</p>
          <button className="button primary" onClick={() => setCreating(true)}>
            <Plus size={15} aria-hidden="true" />
            新增经历
          </button>
        </div>
      )}

      {creating ? (
        <Modal
          eyebrow="本地编辑 · Resume"
          title="新增简历经历"
          description="经历要点与关联关系只保存在当前本地工作区。"
          onClose={() => setCreating(false)}
        >
          <ResumeCreateForm
            questions={questions}
            syncBlocks={syncBlocks}
            onCancel={() => setCreating(false)}
            onSubmit={(input) => {
              const experience = onCreate(input);
              setCreating(false);
              onFocus(experience.id);
            }}
          />
        </Modal>
      ) : null}
    </div>
  );
}
