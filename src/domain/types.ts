export type InterviewStatus = "draft" | "pending" | "reviewed" | "archived";

export interface Interview {
  id: string;
  company: string;
  role: string;
  round: string;
  date: string;
  source: string;
  rawText: string;
  status: InterviewStatus;
  questionIds: string[];
  createdAt: string;
  updatedAt: string;
  sample?: boolean;
}

export interface AtomicQuestion {
  id: string;
  title: string;
  answer: string;
  notes: string;
  tags: string[];
  sourceInterviewIds: string[];
  linkedSyncBlockId: string | null;
  createdAt: string;
  updatedAt: string;
  sample?: boolean;
}

export interface SyncBlock {
  id: string;
  title: string;
  body: string;
  reviewNotes: string;
  linkedQuestionIds: string[];
  pinned: boolean;
  hidden: boolean;
  createdAt: string;
  updatedAt: string;
  sample?: boolean;
}

export interface ResumeExperience {
  id: string;
  type: string;
  title: string;
  organization: string;
  period: string;
  bullets: string[];
  linkedQuestionIds: string[];
  linkedSyncBlockIds: string[];
  createdAt: string;
  updatedAt: string;
}

export type AIReviewDecision = "pending" | "accepted" | "ignored";

export interface AIReviewCandidate {
  id: string;
  title: string;
  answer: string;
  tags: string[];
  sourceExcerpt: string;
  suggestedSyncBlockId: string | null;
  matchReason: string;
  decision: AIReviewDecision;
  connectToSuggested: boolean;
  createdQuestionId: string | null;
}

export interface InterviewAIReview {
  id: string;
  interviewId: string;
  candidates: AIReviewCandidate[];
  createdAt: string;
  updatedAt: string;
}

export interface ReviewEvent {
  id: string;
  syncBlockId: string;
  result: "remembered" | "fuzzy" | "forgotten" | "skipped";
  reviewedAt: string;
  nextReviewAt: string | null;
}

export interface Preference {
  key: string;
  value: unknown;
}

export interface Workspace {
  interviews: Interview[];
  questions: AtomicQuestion[];
  syncBlocks: SyncBlock[];
  resumeExperiences: ResumeExperience[];
  aiReviews: InterviewAIReview[];
  reviewEvents: ReviewEvent[];
}

export interface WorkspaceExport extends Workspace {
  formatVersion: 4;
  exportedAt: string;
}

export interface CreateInterviewInput {
  company: string;
  role: string;
  round: string;
  date: string;
  source: string;
  rawText: string;
}

export interface CreateQuestionInput {
  title: string;
  answer: string;
  notes?: string;
  tags: string[];
}

export interface CreateSyncBlockInput {
  title: string;
  body: string;
  reviewNotes: string;
  questionIds: string[];
}

export interface CreateResumeExperienceInput {
  type: string;
  title: string;
  organization: string;
  period: string;
  bullets: string[];
  linkedQuestionIds: string[];
  linkedSyncBlockIds: string[];
}

export interface SaveAIReviewCandidateInput {
  title: string;
  answer: string;
  tags: string[];
  sourceExcerpt: string;
  suggestedSyncBlockId: string | null;
  matchReason: string;
  selected?: boolean;
  connectToSuggested?: boolean;
}

export interface UpdateAIReviewCandidateInput {
  title?: string;
  answer?: string;
  tags?: string[];
  connectToSuggested?: boolean;
}
