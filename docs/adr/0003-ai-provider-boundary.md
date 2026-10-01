# ADR 0003: AI provider and credential boundary

- Status: Accepted
- Date: 2026-09-30
- Owners: repository maintainers

## Context

千面需要在保持本地优先和人工最终决策的前提下接入用户自备模型。当前交付形态是纯浏览器静态客户端，没有产品后端、系统钥匙串或可信的服务端代理。

首个 AI 闭环需要测试连接、面经结构化和同步块匹配建议，同时不能让 Provider 协议、凭据处理或模型响应格式散落在 React 页面中。

## Decision

### Provider boundary

Define a typed AI client boundary and implement an OpenAI-compatible `POST /chat/completions` adapter first. The adapter owns:

- endpoint normalization;
- authorization and request construction;
- timeout and cancellation;
- response extraction;
- JSON parsing and runtime validation;
- sanitized provider errors.

UI components consume domain-level operations such as `testConnection` and `extractInterview`; they do not construct provider payloads.

The endpoint setting accepts either an API base URL or a full `chat/completions` URL. Public endpoints must use HTTPS. Plain HTTP is accepted only for loopback hosts so users can connect to local model runtimes.

### Configuration and credentials

Non-secret configuration is stored in the IndexedDB `preferences` store:

- protocol identifier;
- endpoint;
- model.

In the browser milestone, API Key is stored only in `sessionStorage`. It is removed when the user clears it and normally disappears when the browser tab session ends. It is never written to IndexedDB, workspace export, source files, prompts, analytics, or application logs.

`sessionStorage` is not a system secret store and does not protect against malicious script running in the same origin. The settings UI must state this limitation. Persistent secure credential storage requires a future desktop runtime with an OS keychain; that decision will receive a separate ADR.

### User control

Every content-bearing request requires an explicit user action. Before the first request in a workflow, the UI shows the destination endpoint and the categories of data being sent.

Validated AI output is saved locally as pending review candidates. Only explicit user acceptance creates atomic questions or relationships. AI never silently overwrites user answers or merges synchronized blocks.

As of 2026-10-01 (issue #15), user-initiated interview extraction belongs to an application-level FIFO queue with one active interview at a time. Closing the import dialog or navigating detaches the view without cancelling work. Explicit cancellation aborts the request and removes queued work. Tasks snapshot source text, provider configuration and credentials in memory; only task ID, status, progress, error and unread notification state are persisted on the interview. Duplicate starts for the same active interview reuse its task.

Overview's pending review queue includes queued/running, failed and interrupted interviews. Active interviews appear first in the interview list, with newest imports first. Successful review persistence produces a lasting, clickable in-app completion notification. Failure also produces a notification and an explicit retry action. Notifications remain until dismissed; notification clicks open the interview's existing review UI. No browser notification permission is required.

The queue lives for the application session, not in a cloud service or service worker. Refreshing, closing the tab or quitting the desktop app stops execution; persisted queued/running states become interrupted on next load. The original draft survives. Workspace replacement aborts work, and result writes verify both task ID and unchanged source to prevent stale writes. Credentials are never added to task metadata or exports. Restored backups do not restore runnable jobs.

As of issue #18, extraction uses a full-transcript, staged harness. System messages contain only stage instructions; user messages contain structured evidence. Source text is losslessly addressed as numbered units, all supplied together on every identification, coverage and answer request. There is no independent 3,000-character extraction or 500-character context window. Unit numbering is for verifiable citations only.

Identification returns question titles, exact source quotes and an explicit pagination flag, initially at most 24 questions per page. A filled page triggers another request even if the model reports completion. A second full-transcript pass checks for omissions. Source quotes must resolve to their cited occurrence; duplicate title/position entries are removed while distinct occurrences remain. The program assigns stable task-local question IDs, sorts by source position and requests answers in batches of four, with the entire transcript available to every batch. Each target ID must return exactly once, including empty answers when none are attributable. This removes the whole-interview 40-question cap without treating a parseable JSON as evidence of full answer-batch completion.

Matching is a separate stage. Local lexical retrieval ranks all visible synchronized blocks, with at most six options per question (bounded titles and 1,200-character summaries). Only those options and the question/answer preview are sent to the matcher. No transcript is sent in matching; no synchronized-block content is sent in identification or answer generation. Match responses must refer to their own provided option IDs, and cannot alter question content.

Structured-output failures receive one regeneration with an output budget of 16,000 instead of 8,000 tokens. On persistent output limits/timeouts, inventory page sizes can halve to one; answer batches can halve to one after validation failures. Input evidence is never shortened during these retries. Other HTTP, network and refusal errors stop the operation. Each request has a 180-second deadline; the operation checks a 45-minute deadline between requests and rejects late responses, with at most 240 completion attempts (JSON compatibility fallback may add one HTTP request per attempt). A pending request may run up to its individual deadline. More than 100,000 source UTF-16 code units or 400 identified questions fails explicitly instead of silently truncating. Provider context-capacity errors require a larger-context model; the harness does not silently fall back to partial input.

Explicit cancellation or application shutdown stops further requests; dismissing a dialog does not. Progress includes the current stage. All required stages must complete before results enter review. Intermediate successful work remains transient and is not resumable after failure/reload. Full-text repetition increases input cost; lexical retrieval can miss synonyms; model self-checking does not guarantee recall or factuality. Real-model evaluation and user review remain necessary. See [implementation and evaluation](../engineering/ai-extraction-harness.md).

Structured requests use JSON mode. If a provider explicitly rejects `response_format` / `json_object` as unsupported (HTTP 400 or 422), the adapter may resend that request once without this optional parameter, retaining the JSON instructions. Partial JSON is rejected rather than repaired into apparently complete results.

### Data minimization

Interview extraction sends the selected interview as evidence; matching separately sends only locally retrieved synchronized-block options. It does not send the complete workspace, unrelated interviews, review notes or credentials in model messages.

## Alternatives considered

### Product backend proxy

Deferred. A proxy simplifies CORS and can hide provider differences, but it makes the product an intermediary for private content and user credentials, introduces operating cost, and contradicts the first local-first milestone.

### Persist API Key in IndexedDB or localStorage

Rejected. Both are readable by same-origin JavaScript and would silently turn a temporary browser credential into long-lived application data.

### Provider-specific SDKs

Deferred. SDKs increase bundle size and couple the UI to provider semantics. A small fetch adapter is sufficient for the first protocol and keeps a future provider registry possible.

### Local model only

Deferred as the sole option. Browser and desktop local inference require separate runtime, model distribution, performance, and storage decisions. The provider boundary can support a localhost-compatible endpoint now without claiming that all inference is local.

## Consequences

- Users can choose a compatible cloud or local endpoint without a 千面 account.
- Browser requests may fail because a provider does not allow CORS; the UI must explain this rather than retry through an undisclosed proxy.
- Closing the browser session may require the user to enter the API Key again.
- Provider output is untrusted and must pass runtime validation before rendering or saving.
- Future desktop and local-model adapters can implement the same domain-level operations.

## Validation

- Workspace export never contains the API Key.
- Reloading the same tab restores session credentials; a new browser session does not rely on persistent application storage.
- Unknown or malformed model fields do not enter the workspace.
- An unknown synchronized-block ID is discarded.
- Cancellation and timeout preserve the original draft and existing knowledge; only task status changes.
- Confirming selected extraction candidates creates only those atomic questions and preserves the source interview.
