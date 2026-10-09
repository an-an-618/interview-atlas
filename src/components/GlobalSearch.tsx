import {
  ArrowUpRight,
  CircleHelp,
  FileText,
  FileUser,
  Link2,
  Search,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  searchWorkspace,
  type GlobalSearchResult,
  type SearchAssetType,
  type SearchScope,
} from "../domain/globalSearch";
import type { Workspace } from "../domain/types";

interface GlobalSearchPageProps {
  workspace: Workspace;
  query: string;
  onQueryChange: (query: string) => void;
  onOpenInterview: (id: string) => void;
  onOpenQuestion: (id: string) => void;
  onOpenSync: (id: string) => void;
  onOpenResume: (id: string) => void;
  onOpenAssetPage: (type: SearchAssetType) => void;
}

const assetTypes: Array<{
  id: SearchScope;
  label: string;
  shortLabel: string;
}> = [
  { id: "all", label: "全部资产", shortLabel: "全部" },
  { id: "interview", label: "面试记录", shortLabel: "面试" },
  { id: "question", label: "原子问答", shortLabel: "问答" },
  { id: "sync", label: "同步块", shortLabel: "同步块" },
  { id: "resume", label: "简历经历", shortLabel: "简历" },
];

const resultLabels: Record<
  SearchAssetType,
  { label: string; icon: typeof FileText }
> = {
  interview: { label: "面试记录", icon: FileText },
  question: { label: "原子问答", icon: CircleHelp },
  sync: { label: "同步块", icon: Link2 },
  resume: { label: "简历经历", icon: FileUser },
};

const matchLabels: Record<GlobalSearchResult["matchKind"], string> = {
  title: "标题匹配",
  content: "内容匹配",
  metadata: "信息匹配",
};

function shortenExcerpt(value: string, query: string, maxLength = 156) {
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;

  const terms = query
    .trim()
    .toLocaleLowerCase("zh-CN")
    .split(/\s+/)
    .filter(Boolean);
  const normalized = text.toLocaleLowerCase("zh-CN");
  const positions = terms
    .map((term) => normalized.indexOf(term))
    .filter((position) => position >= 0);
  const matchStart = positions.length ? Math.min(...positions) : 0;
  const start = Math.max(0, matchStart - 42);
  const end = Math.min(text.length, start + maxLength);

  return `${start > 0 ? "…" : ""}${text.slice(start, end)}${
    end < text.length ? "…" : ""
  }`;
}

function Highlight({ text, query }: { text: string; query: string }) {
  const terms = [
    ...new Set(query.trim().split(/\s+/).filter(Boolean)),
  ].sort((left, right) => right.length - left.length);
  if (!terms.length) return text;

  const pattern = terms
    .map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  const parts = text.split(new RegExp(`(${pattern})`, "giu"));
  const normalizedTerms = new Set(
    terms.map((term) => term.toLocaleLowerCase("zh-CN")),
  );

  return parts.map((part, index) =>
    normalizedTerms.has(part.toLocaleLowerCase("zh-CN")) ? (
      <mark key={`${part}-${index}`}>{part}</mark>
    ) : (
      part
    ),
  );
}

export function GlobalSearchPage({
  workspace,
  query,
  onQueryChange,
  onOpenInterview,
  onOpenQuestion,
  onOpenSync,
  onOpenResume,
  onOpenAssetPage,
}: GlobalSearchPageProps) {
  const [scope, setScope] = useState<SearchScope>("all");
  const inputRef = useRef<HTMLInputElement>(null);
  const allResults = useMemo(
    () => searchWorkspace(workspace, query),
    [query, workspace],
  );
  const results = useMemo(
    () =>
      scope === "all"
        ? allResults
        : allResults.filter((result) => result.type === scope),
    [allResults, scope],
  );
  const counts = useMemo(
    () =>
      allResults.reduce<Record<SearchAssetType, number>>(
        (current, result) => ({
          ...current,
          [result.type]: current[result.type] + 1,
        }),
        { interview: 0, question: 0, sync: 0, resume: 0 },
      ),
    [allResults],
  );
  const assetCounts: Record<SearchAssetType, number> = {
    interview: workspace.interviews.length,
    question: workspace.questions.length,
    sync: workspace.syncBlocks.filter((item) => !item.hidden).length,
    resume: workspace.resumeExperiences.length,
  };
  const normalizedQuery = query.trim();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const openResult = (result: GlobalSearchResult) => {
    if (result.type === "interview") onOpenInterview(result.id);
    if (result.type === "question") onOpenQuestion(result.id);
    if (result.type === "sync") onOpenSync(result.id);
    if (result.type === "resume") onOpenResume(result.id);
  };

  return (
    <div className="page global-search-page">
      <header className="global-search-header">
        <p className="eyebrow">全局搜索 · Search</p>
        <h1>定位你想找的知识资产</h1>
      </header>

      <div className="global-search-box">
        <Search size={22} strokeWidth={1.7} aria-hidden="true" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="搜索问题、回答、公司、岗位、经历关键词"
          aria-label="全局搜索知识库"
        />
        {query ? (
          <button
            className="icon-button"
            type="button"
            onClick={() => {
              onQueryChange("");
              setScope("all");
            }}
            aria-label="清除搜索"
            title="清除"
          >
            <X size={18} aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {normalizedQuery ? (
        <div className="global-search-scopes" aria-label="搜索结果分类">
          {assetTypes.map((assetType) => {
            const count =
              assetType.id === "all"
                ? allResults.length
                : counts[assetType.id];
            return (
              <button
                className={scope === assetType.id ? "active" : ""}
                type="button"
                key={assetType.id}
                onClick={() => setScope(assetType.id)}
                aria-pressed={scope === assetType.id}
              >
                <span>{assetType.shortLabel}</span>
                <small>{count}</small>
              </button>
            );
          })}
        </div>
      ) : null}

      {!normalizedQuery ? (
        <section className="global-search-index" aria-label="知识库资产索引">
          <header>
            <span>知识库索引</span>
            <strong>
              {Object.values(assetCounts).reduce(
                (total, count) => total + count,
                0,
              )}{" "}
              项资产
            </strong>
          </header>
          <div>
            {assetTypes.slice(1).map((assetType) => {
              const type = assetType.id as SearchAssetType;
              const Icon = resultLabels[type].icon;
              return (
                <button
                  type="button"
                  key={type}
                  onClick={() => onOpenAssetPage(type)}
                >
                  <Icon size={18} aria-hidden="true" />
                  <span>
                    <strong>{assetType.label}</strong>
                    <small>{assetCounts[type]} 项</small>
                  </span>
                  <ArrowUpRight size={15} aria-hidden="true" />
                </button>
              );
            })}
          </div>
        </section>
      ) : results.length ? (
        <section className="global-search-results">
          <header className="global-search-results-summary" aria-live="polite">
            <span>
              “{normalizedQuery}”
              {scope === "all"
                ? " 的全部结果"
                : ` · ${assetTypes.find((item) => item.id === scope)?.label}`}
            </span>
            <strong>{results.length} 项</strong>
          </header>
          <div className="global-search-result-list">
            {results.map((result) => {
              const { icon: Icon, label } = resultLabels[result.type];
              return (
                <button
                  className="global-search-result"
                  type="button"
                  key={`${result.type}-${result.id}`}
                  onClick={() => openResult(result)}
                >
                  <span className={`global-result-icon ${result.type}`}>
                    <Icon size={19} aria-hidden="true" />
                  </span>
                  <span className="global-result-main">
                    <span className="global-result-heading">
                      <span>
                        <small>{label}</small>
                        <small>{matchLabels[result.matchKind]}</small>
                      </span>
                      <strong>
                        <Highlight text={result.title} query={query} />
                      </strong>
                    </span>
                    <span className="global-result-excerpt">
                      <Highlight
                        text={shortenExcerpt(result.excerpt, query)}
                        query={query}
                      />
                    </span>
                    <span className="global-result-meta">
                      <Highlight text={result.meta} query={query} />
                    </span>
                  </span>
                  <ArrowUpRight
                    className="global-result-arrow"
                    size={18}
                    aria-hidden="true"
                  />
                </button>
              );
            })}
          </div>
        </section>
      ) : (
        <section className="global-search-empty" aria-live="polite">
          <Search size={28} strokeWidth={1.4} aria-hidden="true" />
          <h2>没有匹配的资产</h2>
          <p>
            “{normalizedQuery}”在
            {scope === "all"
              ? "全部知识库"
              : assetTypes.find((item) => item.id === scope)?.label}
            中没有结果。
          </p>
          <button
            className="button secondary"
            type="button"
            onClick={() => {
              onQueryChange("");
              setScope("all");
              inputRef.current?.focus();
            }}
          >
            清除搜索
          </button>
        </section>
      )}
    </div>
  );
}
