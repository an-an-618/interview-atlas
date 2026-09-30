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

AI output remains transient until the user edits and confirms selected candidates. The first version does not automatically create relationships, overwrite answers, merge synchronized blocks, or retry in the background.

Within an active, user-initiated extraction, malformed or length-limited output may trigger one regeneration using the original evidence and the same provider. A length-limited response increases the output budget from 8,000 to 16,000 tokens for that retry. Closing or cancelling the operation stops further requests. HTTP, network, timeout, and refusal errors do not trigger regeneration. The import dialog discloses this retry; no failed model output is stored or included in the next prompt.

Structured requests use JSON mode. If a provider explicitly rejects `response_format` / `json_object` as unsupported (HTTP 400 or 422), the adapter may resend that request once without this optional parameter, retaining the JSON instructions. Partial JSON is rejected rather than repaired into apparently complete results.

### Data minimization

Interview extraction sends the selected interview and only truncated synchronized-block context required for match suggestions. It does not send the complete workspace.

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
- Cancellation and timeout leave the workspace unchanged.
- Confirming selected extraction candidates creates only those atomic questions and preserves the source interview.
