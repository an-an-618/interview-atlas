# Codex Cloud and Two-Computer Workflow

This workflow lets Codex Cloud, the work computer, and the personal computer continue the same project without sharing local files or chat history.

## Source of truth

| Information | Authoritative location |
| --- | --- |
| Product requirements and reviews | Feishu documents |
| Executable task specification | GitHub Issue |
| Code and current implementation | Git branch and Draft Pull Request |
| Tests and review status | Pull Request checks and comments |
| Durable architecture decisions | GitHub ADR, linked to the Feishu review |

Local Codex conversations are temporary context, not project records.

## Standard flow

1. Discuss and approve the requirement in Feishu.
2. Create a GitHub Issue using the **Codex Cloud task** template.
3. Copy the implementation-critical requirement summary and acceptance criteria into the Issue.
4. Assign the Issue to Codex Cloud or start it from one local computer.
5. Work on one branch and create a Draft Pull Request early.
6. Before stopping, commit and push all useful work.
7. Update the Draft PR with completed work, remaining work, validation, risks, and the exact next action.
8. Continue from the same PR in Codex Web or on the other computer.
9. Merge only after review and required checks pass.
10. Record the released result and important decisions back in Feishu.

Local checkout is optional. Codex Cloud can push directly to GitHub; a local computer is needed only for work that depends on local desktop behavior, local files, or interactive debugging.

## Starting a Codex Cloud task

Use a prompt like:

```text
Implement GitHub Issue #<number>.

Read AGENTS.md and the complete Issue before changing files.
Stay within the Issue scope. Create a Draft PR early.
Run the required validation. Before stopping, update the PR with:
completed work, remaining work, test results, risks, and the exact next action.
Do not use real resumes, interview records, credentials, or private user data.
```

## Continuing on another computer

```powershell
git clone https://github.com/an-an-618/interview-atlas.git
cd interview-atlas
gh pr checkout <PR_NUMBER>
```

Then tell Codex:

```text
Continue the current Draft PR.
Read AGENTS.md, the linked Issue, the PR description, checks, and review comments.
Verify the current branch before editing. Continue from the documented next action.
Do not expand the Issue scope.
```

## Rules

- One Issue maps to one branch and one Pull Request.
- Do not edit the same branch concurrently from two environments.
- Parallel tasks use separate branches and Pull Requests.
- Never leave unfinished work only in a local working tree.
- Never commit `.env`, API keys, real resumes, transcripts, recordings, or local databases.
- Scheduled jobs may report stale handoffs or run tests, but they do not replace commits, pushes, Issues, or Pull Requests.
