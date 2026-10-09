import type { Workspace } from "./types";

export type SearchAssetType =
  | "interview"
  | "question"
  | "sync"
  | "resume";

export type SearchScope = "all" | SearchAssetType;

export interface GlobalSearchResult {
  id: string;
  type: SearchAssetType;
  title: string;
  excerpt: string;
  meta: string;
  updatedAt: string;
  score: number;
  matchKind: "title" | "content" | "metadata";
}

interface SearchField {
  text: string;
  weight: number;
  kind: GlobalSearchResult["matchKind"];
}

interface SearchEntry extends Omit<GlobalSearchResult, "score" | "matchKind"> {
  fields: SearchField[];
  order: number;
}

const typeOrder: Record<SearchAssetType, number> = {
  interview: 0,
  question: 1,
  sync: 2,
  resume: 3,
};

const normalize = (value: string) =>
  value.normalize("NFKC").toLocaleLowerCase("zh-CN").replace(/\s+/g, " ").trim();

function fieldScore(text: string, term: string, weight: number) {
  if (!text || !term) return 0;
  if (text === term) return 120 * weight;
  if (text.startsWith(term)) return 88 * weight;

  const index = text.indexOf(term);
  if (index < 0) return 0;

  const occurrences = text.split(term).length - 1;
  return (52 + Math.min(occurrences - 1, 2) * 4) * weight;
}

function scoreEntry(
  entry: SearchEntry,
  normalizedQuery: string,
  terms: string[],
): Pick<GlobalSearchResult, "score" | "matchKind"> | null {
  let score = 0;
  let strongestMatch: SearchField | null = null;
  let strongestScore = 0;

  for (const term of terms) {
    let termScore = 0;
    let termField: SearchField | null = null;

    for (const field of entry.fields) {
      const currentScore = fieldScore(normalize(field.text), term, field.weight);
      if (currentScore > termScore) {
        termScore = currentScore;
        termField = field;
      }
    }

    if (!termScore || !termField) return null;
    score += termScore;
    if (termScore > strongestScore) {
      strongestScore = termScore;
      strongestMatch = termField;
    }
  }

  for (const field of entry.fields) {
    const phraseScore = fieldScore(
      normalize(field.text),
      normalizedQuery,
      field.weight,
    );
    if (phraseScore) score += Math.round(phraseScore * 0.55);
  }

  return {
    score,
    matchKind: strongestMatch?.kind ?? "content",
  };
}

function buildEntries(workspace: Workspace): SearchEntry[] {
  const interviewById = new Map(
    workspace.interviews.map((interview) => [interview.id, interview]),
  );
  let order = 0;

  return [
    ...workspace.interviews.map((interview): SearchEntry => {
      const relatedTags = workspace.questions
        .filter((question) =>
          question.sourceInterviewIds.includes(interview.id),
        )
        .flatMap((question) => question.tags);
      return {
        id: interview.id,
        type: "interview",
        title: `${interview.company} · ${interview.role || "岗位未填写"}`,
        excerpt: interview.rawText || "尚未录入面试原文。",
        meta: [interview.round, interview.date, interview.source]
          .filter(Boolean)
          .join(" · "),
        updatedAt: interview.updatedAt,
        order: order++,
        fields: [
          {
            text: `${interview.company} ${interview.role}`,
            weight: 10,
            kind: "title",
          },
          {
            text: `${interview.round} ${interview.date} ${interview.source} ${relatedTags.join(" ")}`,
            weight: 5,
            kind: "metadata",
          },
          { text: interview.rawText, weight: 3, kind: "content" },
        ],
      };
    }),
    ...workspace.questions.map((question): SearchEntry => {
      const sources = question.sourceInterviewIds
        .map((id) => interviewById.get(id))
        .filter(Boolean)
        .flatMap((interview) =>
          interview
            ? [interview.company, interview.role, interview.round]
            : [],
        );
      return {
        id: question.id,
        type: "question",
        title: question.title,
        excerpt: question.answer || question.notes || "尚未填写回答。",
        meta: [
          question.tags.join(" / "),
          sources.join(" · ") || "独立创建",
        ]
          .filter(Boolean)
          .join(" · "),
        updatedAt: question.updatedAt,
        order: order++,
        fields: [
          { text: question.title, weight: 10, kind: "title" },
          {
            text: `${question.tags.join(" ")} ${sources.join(" ")}`,
            weight: 5,
            kind: "metadata",
          },
          {
            text: `${question.answer} ${question.notes}`,
            weight: 4,
            kind: "content",
          },
        ],
      };
    }),
    ...workspace.syncBlocks
      .filter((syncBlock) => !syncBlock.hidden)
      .map(
        (syncBlock): SearchEntry => ({
          id: syncBlock.id,
          type: "sync",
          title: syncBlock.title,
          excerpt:
            syncBlock.body || syncBlock.reviewNotes || "尚未填写稳定回答。",
          meta: `${syncBlock.linkedQuestionIds.length} 个关联问答${
            syncBlock.favorite ? " · 已收藏" : ""
          }`,
          updatedAt: syncBlock.updatedAt,
          order: order++,
          fields: [
            { text: syncBlock.title, weight: 10, kind: "title" },
            {
              text: `${syncBlock.body} ${syncBlock.reviewNotes}`,
              weight: 4,
              kind: "content",
            },
          ],
        }),
      ),
    ...workspace.resumeExperiences.map((experience): SearchEntry => ({
      id: experience.id,
      type: "resume",
      title: experience.title,
      excerpt: experience.bullets.join(" · ") || "尚未填写经历要点。",
      meta: [
        experience.type,
        experience.organization,
        experience.period,
      ]
        .filter(Boolean)
        .join(" · "),
      updatedAt: experience.updatedAt,
      order: order++,
      fields: [
        { text: experience.title, weight: 10, kind: "title" },
        {
          text: `${experience.type} ${experience.organization} ${experience.period}`,
          weight: 5,
          kind: "metadata",
        },
        {
          text: experience.bullets.join(" "),
          weight: 4,
          kind: "content",
        },
      ],
    })),
  ];
}

export function searchWorkspace(
  workspace: Workspace,
  query: string,
  scope: SearchScope = "all",
): GlobalSearchResult[] {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return [];
  const terms = [...new Set(normalizedQuery.split(" ").filter(Boolean))];

  return buildEntries(workspace)
    .filter((entry) => scope === "all" || entry.type === scope)
    .map((entry) => {
      const match = scoreEntry(entry, normalizedQuery, terms);
      return match ? { entry, match } : null;
    })
    .filter(
      (
        result,
      ): result is {
        entry: SearchEntry;
        match: Pick<GlobalSearchResult, "score" | "matchKind">;
      } => Boolean(result),
    )
    .sort(
      (left, right) =>
        right.match.score - left.match.score ||
        right.entry.updatedAt.localeCompare(left.entry.updatedAt) ||
        typeOrder[left.entry.type] - typeOrder[right.entry.type] ||
        left.entry.order - right.entry.order,
    )
    .map(({ entry, match }) => ({
      id: entry.id,
      type: entry.type,
      title: entry.title,
      excerpt: entry.excerpt,
      meta: entry.meta,
      updatedAt: entry.updatedAt,
      ...match,
    }));
}
