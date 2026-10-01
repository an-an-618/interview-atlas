import type {
  Interview,
  MockInterviewFeedback,
  MockInterviewQuestionInput,
  MockInterviewSession,
  SyncBlock,
  Workspace,
} from "../domain/types";

export interface AIProviderConfig {
  protocol: "openai-compatible";
  endpoint: string;
  model: string;
}

export type AIProviderPresetId =
  | "kimi"
  | "openai"
  | "anthropic"
  | "glm"
  | "deepseek"
  | "qwen";

export type AIProviderCredentialId = AIProviderPresetId | "custom";

export interface AIProviderPreset {
  id: AIProviderPresetId;
  label: string;
  mark: string;
  description: string;
  endpoint: string;
  model: string;
  models: readonly string[];
  note: string;
  docsUrl: string;
  consoleUrl: string;
}

export interface AIExtractionCandidate {
  title: string;
  answer: string;
  tags: string[];
  sourceExcerpt: string;
  suggestedSyncBlockId: string | null;
  matchReason: string;
}

export interface AIExtractionInput {
  interview: Interview;
  syncBlocks: SyncBlock[];
}

export interface AIExtractionProgress {
  completed: number;
  total: number;
  phase: "extracting" | "retrying" | "splitting";
  stage?: "inventory" | "coverage" | "answers" | "matching";
}

export interface AIMockInterviewTurnInput {
  session: MockInterviewSession;
  workspace: Workspace;
}

export interface AIMockInterviewTurn {
  message: string;
  shouldEnd: boolean;
  endReason: string;
}

export interface AIMockInterviewReport {
  feedback: MockInterviewFeedback;
  questions: MockInterviewQuestionInput[];
}

export interface AIClient {
  testConnection(
    config: AIProviderConfig,
    apiKey: string,
    signal?: AbortSignal,
  ): Promise<void>;
  extractInterview(
    config: AIProviderConfig,
    apiKey: string,
    input: AIExtractionInput,
    signal?: AbortSignal,
    onProgress?: (progress: AIExtractionProgress) => void,
  ): Promise<AIExtractionCandidate[]>;
  continueMockInterview(
    config: AIProviderConfig,
    apiKey: string,
    input: AIMockInterviewTurnInput,
    signal?: AbortSignal,
  ): Promise<AIMockInterviewTurn>;
  generateMockInterviewReport(
    config: AIProviderConfig,
    apiKey: string,
    session: MockInterviewSession,
    signal?: AbortSignal,
  ): Promise<AIMockInterviewReport>;
}

export const defaultAIProviderConfig: AIProviderConfig = {
  protocol: "openai-compatible",
  endpoint: "https://api.openai.com/v1",
  model: "gpt-4.1-mini",
};

export const aiProviderPresets: AIProviderPreset[] = [
  {
    id: "kimi",
    label: "Kimi",
    mark: "K",
    description: "月之暗面",
    endpoint: "https://api.moonshot.cn/v1",
    model: "kimi-k3",
    models: ["kimi-k3"],
    note: "Kimi K3 使用低推理强度完成连接测试，正式拆解时仍保留结构化输出。",
    docsUrl: "https://platform.moonshot.cn/docs/api/chat",
    consoleUrl: "https://platform.moonshot.cn/console/api-keys",
  },
  {
    id: "openai",
    label: "OpenAI",
    mark: "O",
    description: "OpenAI Platform",
    endpoint: defaultAIProviderConfig.endpoint,
    model: defaultAIProviderConfig.model,
    models: ["gpt-4.1-mini", "gpt-4.1"],
    note: "使用 OpenAI 官方 Chat Completions 接口。",
    docsUrl: "https://platform.openai.com/docs/api-reference/chat",
    consoleUrl: "https://platform.openai.com/api-keys",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    mark: "A",
    description: "Claude",
    endpoint: "https://api.anthropic.com/v1",
    model: "claude-sonnet-4-6",
    models: ["claude-sonnet-4-6", "claude-opus-4-6"],
    note: "通过 Anthropic 的 OpenAI SDK 兼容层接入，部分 Claude 原生能力不在此模式中开放。",
    docsUrl: "https://docs.anthropic.com/en/api/openai-sdk",
    consoleUrl: "https://platform.claude.com/settings/keys",
  },
  {
    id: "glm",
    label: "GLM",
    mark: "G",
    description: "智谱开放平台",
    endpoint: "https://open.bigmodel.cn/api/paas/v4",
    model: "glm-5.3",
    models: ["glm-5.3", "glm-5.2"],
    note: "使用智谱 OpenAI 兼容接口，模型需先在开放平台获得调用权限。",
    docsUrl: "https://docs.bigmodel.cn/cn/guide/develop/openai/introduction",
    consoleUrl: "https://bigmodel.cn/usercenter/proj-mgmt/apikeys",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    mark: "D",
    description: "DeepSeek Platform",
    endpoint: "https://api.deepseek.com",
    model: "deepseek-flash",
    models: ["deepseek-flash", "deepseek-v4-pro"],
    note: "使用 DeepSeek 官方 OpenAI 兼容接口。",
    docsUrl: "https://api-docs.deepseek.com/",
    consoleUrl: "https://platform.deepseek.com/api_keys",
  },
  {
    id: "qwen",
    label: "千问",
    mark: "Q",
    description: "阿里云百炼",
    endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: "qwen-plus",
    models: ["qwen-plus", "qwen-flash"],
    note: "API Key 与服务地域需一致；如使用业务空间专属域名，可在高级设置中替换。",
    docsUrl:
      "https://help.aliyun.com/zh/model-studio/compatibility-of-openai-with-dashscope",
    consoleUrl: "https://bailian.console.aliyun.com/model/settings/api-key",
  },
];

function normalizeEndpoint(endpoint: string): string {
  return endpoint.trim().replace(/\/+$/, "").toLowerCase();
}

export function matchAIProviderPreset(
  config: AIProviderConfig,
): AIProviderPreset | undefined {
  const endpoint = normalizeEndpoint(config.endpoint);
  return aiProviderPresets.find(
    (preset) => normalizeEndpoint(preset.endpoint) === endpoint,
  );
}
