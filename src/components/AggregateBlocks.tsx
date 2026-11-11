import {
  ChevronDown,
  ChevronRight,
  CircleHelp,
  FileUser,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Star,
  X,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import type {
  AtomicQuestion,
  ResumeExperience,
  SyncBlock,
  UpdateSyncBlockInput,
} from "../domain/types";
import {
  getFavoriteSyncBlocks,
  searchSyncBlocks,
  sortSyncBlocksByLinkedQuestionCount,
} from "../domain/workspace";
import { InlineAnswer } from "./InlineAnswer";
import { InlineText } from "./InlineText";
import { EmptyState, PageHeader } from "./PageLayout";
import { ShareButton } from "./Share";
import type { ShareTarget } from "../domain/share";

export function AggregateBlocksPage({
  syncBlocks,
  questions,
  resumeExperiences,
  selectedId,
  onSelect,
  onCreate,
  onOpenQuestion,
  onOpenResume,
  onUpdate,
  onShare,
}: {
  syncBlocks: SyncBlock[];
  questions: AtomicQuestion[];
  resumeExperiences: ResumeExperience[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onOpenQuestion: (id: string) => void;
  onOpenResume: (id: string) => void;
  onUpdate: (id: string, input: UpdateSyncBlockInput) => void;
  onShare: (target: ShareTarget) => void;
}) {
  const [query, setQuery] = useState("");
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [isListCollapsed, setIsListCollapsed] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);
  const sortedSyncBlocks = useMemo(
    () => sortSyncBlocksByLinkedQuestionCount(
      syncBlocks.filter((block) => !block.hidden),
    ),
    [syncBlocks],
  );
  const favoriteSyncBlocks = useMemo(
    () => getFavoriteSyncBlocks({ syncBlocks }),
    [syncBlocks],
  );
  const scopedSyncBlocks = showFavoritesOnly
    ? favoriteSyncBlocks
    : sortedSyncBlocks;
  const visibleSyncBlocks = useMemo(
    () => searchSyncBlocks(scopedSyncBlocks, query),
    [query, scopedSyncBlocks],
  );
  const selected =
    visibleSyncBlocks.find((item) => item.id === selectedId) ??
    visibleSyncBlocks[0];
  const questionById = useMemo(
    () => new Map(questions.map((question) => [question.id, question])),
    [questions],
  );
  const selectedQuestionIds = new Set(selected?.linkedQuestionIds);
  const linkedExperiences = selected
    ? resumeExperiences.filter(
        (experience) =>
          experience.linkedSyncBlockIds.includes(selected.id) ||
          experience.linkedQuestionIds.some((id) =>
            selectedQuestionIds.has(id),
          ),
      )
    : [];

  const clearSearch = () => {
    setQuery("");
    setIsListCollapsed(false);
    searchInput.current?.focus();
  };

  const changeScope = (favoritesOnly: boolean) => {
    setShowFavoritesOnly(favoritesOnly);
    setIsListCollapsed(false);
  };

  const listToggle = (
    <button
      className="button secondary sync-list-toggle"
      type="button"
      aria-label={isListCollapsed ? "展开聚合块列表" : "收起聚合块列表"}
      aria-expanded={!isListCollapsed}
      aria-controls="aggregate-block-list"
      onClick={() => setIsListCollapsed((collapsed) => !collapsed)}
    >
      {isListCollapsed ? (
        <PanelLeftOpen size={16} aria-hidden="true" />
      ) : (
        <PanelLeftClose size={16} aria-hidden="true" />
      )}
      {isListCollapsed ? "展开列表" : "收起列表"}
    </button>
  );

  return (
    <div className="page sync-page">
      <PageHeader
        eyebrow="Aggregated knowledge"
        title="聚合块"
        description="聚合相似的原子问答，沉淀可复用的回答"
        action={
          <button className="button primary" onClick={onCreate}>
            <Plus size={16} aria-hidden="true" />
            新建聚合块
          </button>
        }
      />
      {sortedSyncBlocks.length ? (
        <div className="toolbar sync-search-toolbar">
          <div className="search-field">
            <Search size={16} aria-hidden="true" />
            <input
              ref={searchInput}
              aria-label="搜索聚合块"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setIsListCollapsed(false);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape" && query) {
                  event.preventDefault();
                  clearSearch();
                }
              }}
              placeholder={
                showFavoritesOnly
                  ? "搜索收藏聚合块"
                  : "搜索内容，空格分隔关键词"
              }
            />
            {query ? (
              <button
                className="sync-search-clear"
                type="button"
                aria-label="清除聚合块搜索"
                onClick={clearSearch}
              >
                <X size={15} aria-hidden="true" />
              </button>
            ) : null}
          </div>
          <div className="sync-toolbar-options">
            <div className="segmented sync-scope-filter" aria-label="聚合块范围">
              <button
                className={showFavoritesOnly ? "" : "active"}
                type="button"
                aria-pressed={!showFavoritesOnly}
                onClick={() => changeScope(false)}
              >
                全部
              </button>
              <button
                className={showFavoritesOnly ? "active" : ""}
                type="button"
                aria-pressed={showFavoritesOnly}
                onClick={() => changeScope(true)}
              >
                <Star
                  size={14}
                  fill={showFavoritesOnly ? "currentColor" : "none"}
                  aria-hidden="true"
                />
                收藏
              </button>
            </div>
            {visibleSyncBlocks.length ? listToggle : null}
            <span className="sync-search-summary" aria-live="polite">
              显示 {visibleSyncBlocks.length} / {scopedSyncBlocks.length} 个
            </span>
          </div>
        </div>
      ) : null}
      {visibleSyncBlocks.length > 0 && selected ? (
        <div className={`sync-layout${isListCollapsed ? " is-list-collapsed" : ""}`}>
          <nav
            id="aggregate-block-list"
            className="sync-list"
            aria-label="聚合块列表"
            hidden={isListCollapsed}
          >
            <div className="sync-list-heading">
              <div className="sync-list-heading-copy">
                <strong>聚合块目录</strong>
                <span>按关联问答数排序</span>
              </div>
              {listToggle}
            </div>
            {visibleSyncBlocks.map((syncBlock) => (
              <div
                className={`sync-list-item${
                  syncBlock.id === selected.id ? " active" : ""
                }`}
                key={syncBlock.id}
              >
                <button
                  className="sync-list-select"
                  type="button"
                  aria-current={syncBlock.id === selected.id ? "true" : undefined}
                  title={syncBlock.title}
                  onClick={() => onSelect(syncBlock.id)}
                >
                  <strong>{syncBlock.title}</strong>
                  <small>{syncBlock.linkedQuestionIds.length} 个关联问答</small>
                </button>
                <button
                  className={`sync-favorite-button${
                    syncBlock.favorite ? " active" : ""
                  }`}
                  type="button"
                  aria-label={
                    syncBlock.favorite
                      ? `取消收藏「${syncBlock.title}」`
                      : `收藏「${syncBlock.title}」`
                  }
                  aria-pressed={syncBlock.favorite}
                  title={syncBlock.favorite ? "取消收藏" : "收藏"}
                  onClick={() =>
                    onUpdate(syncBlock.id, {
                      favorite: !syncBlock.favorite,
                    })
                  }
                >
                  <Star
                    size={17}
                    fill={syncBlock.favorite ? "currentColor" : "none"}
                    aria-hidden="true"
                  />
                </button>
              </div>
            ))}
          </nav>
          <article className="sync-detail" key={selected.id}>
            <header className="sync-detail-header">
              <div>
                <p className="eyebrow">聚合块详情</p>
                <h2>
                  <InlineText
                    value={selected.title}
                    label="聚合块标题"
                    placeholder="填写聚合块标题"
                    required
                    onSave={(title) => onUpdate(selected.id, { title })}
                  />
                </h2>
              </div>
              <div className="share-detail-actions">
                <ShareButton onClick={() => onShare({ kind: "aggregate", id: selected.id })} />
                <button
                  className={`sync-detail-favorite${
                    selected.favorite ? " active" : ""
                  }`}
                  type="button"
                  aria-label={selected.favorite ? "取消收藏聚合块" : "收藏聚合块"}
                  aria-pressed={selected.favorite}
                  title={selected.favorite ? "取消收藏" : "收藏"}
                  onClick={() =>
                    onUpdate(selected.id, { favorite: !selected.favorite })
                  }
                >
                  <Star
                    size={22}
                    fill={selected.favorite ? "currentColor" : "none"}
                    aria-hidden="true"
                  />
                </button>
              </div>
            </header>
            <section className="sync-answer-section" aria-label="聚合块回答">
              <div className="sync-section-heading">
                <h3>回答</h3>
                <span>点击正文编辑</span>
              </div>
              <div className="sync-body">
                <InlineAnswer
                  value={selected.body}
                  label="回答"
                  placeholder="点击填写回答"
                  onSave={(body) => onUpdate(selected.id, { body })}
                />
              </div>
            </section>
            <footer className="sync-detail-footer">
              <aside className="review-note">
                <h3>复习笔记</h3>
                <div className="review-note-content">
                  <InlineText
                    value={selected.reviewNotes}
                    label="复习笔记"
                    placeholder="点击填写复习笔记"
                    multiline
                    onSave={(reviewNotes) => onUpdate(selected.id, { reviewNotes })}
                  />
                </div>
              </aside>
              <details className="linked-section linked-questions-section">
                <summary className="linked-questions-toggle">
                  <h3>关联原子问答 · {selected.linkedQuestionIds.length}</h3>
                  <ChevronDown size={16} aria-hidden="true" />
                </summary>
                {selected.linkedQuestionIds.map((id) => {
                  const question = questionById.get(id);
                  return question ? (
                    <button
                      className="linked-question-row"
                      key={id}
                      onClick={() => onOpenQuestion(question.id)}
                    >
                      <CircleHelp size={14} aria-hidden="true" />
                      <span>{question.title}</span>
                      <ChevronRight size={14} aria-hidden="true" />
                    </button>
                  ) : null;
                })}
              </details>
              <div className="linked-section">
                <h3>关联简历经历 · {linkedExperiences.length}</h3>
                {linkedExperiences.length ? (
                  linkedExperiences.map((experience) => (
                    <button
                      className="linked-question-row"
                      key={experience.id}
                      onClick={() => onOpenResume(experience.id)}
                    >
                      <FileUser size={14} aria-hidden="true" />
                      <span>{experience.title}</span>
                      <ChevronRight size={14} aria-hidden="true" />
                    </button>
                  ))
                ) : (
                  <p className="relation-empty">尚未关联简历经历。</p>
                )}
              </div>
            </footer>
          </article>
        </div>
      ) : sortedSyncBlocks.length ? (
        <EmptyState
          title={
            showFavoritesOnly && !favoriteSyncBlocks.length
              ? "还没有收藏的聚合块"
              : showFavoritesOnly
                ? "没有匹配的收藏聚合块"
                : "没有匹配的聚合块"
          }
          description={
            showFavoritesOnly && !favoriteSyncBlocks.length
              ? "点亮聚合块右侧的星标，即可在这里集中查看。"
              : "调整关键词，或清除搜索查看当前范围内的聚合块。"
          }
          action={
            <button
              className="button secondary"
              type="button"
              onClick={() => {
                if (showFavoritesOnly && !favoriteSyncBlocks.length) {
                  changeScope(false);
                }
                clearSearch();
              }}
            >
              {showFavoritesOnly && !favoriteSyncBlocks.length
                ? "查看全部聚合块"
                : "清除搜索"}
            </button>
          }
        />
      ) : (
        <EmptyState
          title="还没有聚合块"
          description="把相似的原子问答关联到同一个聚合块，保留各次回答，并整理可复用的回答。"
          action={
            <button className="button primary" onClick={onCreate}>
              创建第一个聚合块
            </button>
          }
        />
      )}
    </div>
  );
}
