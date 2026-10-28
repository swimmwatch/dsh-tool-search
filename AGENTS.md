# DSH Tool Search Agent Router

Adapted from the GPT-Voice agent router for this native DeepSeek Harness plugin.
Keep this file concise. Load detailed guidance only when the task needs it.
Higher-priority instructions and the user's explicit scope take precedence.

## Skill Selection

- Treat the runtime skill catalog as an index, not permission to read every skill.
- Use an explicitly requested skill. Otherwise select by its narrow trigger; do not infer a full development lifecycle from a code change.
- Prefer one primary skill and at most one essential supporting skill unless the requested workflow or higher-priority instructions require more.
- Read selected skills fully. Do not load unrelated skills, references, or personas.
- Do not add specification, planning, TDD, review, documentation, or shipping stages merely because code is changing.

## Focused Context

- If this repository has `.codegraph/`, use its CodeGraph before broad code search. Do not create an index without authorization or use another project's index as evidence.
- Start with the affected source, direct callers, related tests/types, and one relevant precedent. Expand only to resolve a concrete dependency or uncertainty.
- For approved packet-based work, read the current checklist entry and its linked packet. Read a specification section only for a missing conditional detail or conflict; do not reconstruct an incomplete packet during implementation.
- Read the relevant sections of [CONTRIBUTING.md](CONTRIBUTING.md) for commands, architecture, verification, and publication constraints. Use [README.md](README.md) for supported behavior and settings.
- Keep command output focused. Do not reread unchanged files or repeat successful checks without new evidence.

## Project Boundaries

- Maintain strict TypeScript, English code identifiers/comments and repository text, ESM, and explicit `.js` relative import specifiers. Use public, version-pinned DSH contracts; never import a workstation's DSH installation by absolute path.
- Keep UI in `src/client/`. Use DSH's public UI SDK and remote services. Shared configuration/constants must stay browser-safe; UI must not depend on server provider implementations, Node built-ins, or environment access.
- Keep provider HTTP calls, environment access, filesystem caches, and DSH registry/agent integration on the server. Preserve the common embedding-provider interface.
- Store API keys through DSH credentials. The UI may stage a new key for a write-only save; never read a stored plaintext value or place keys in ordinary settings, logs, search results, cache identities, or artifacts.
- Search discovers tools; it does not execute them or grant permissions. Preserve registry scope, original schemas, agent isolation, revalidation before activation, and cancellation preventing activation.
- Use one source for shared constants and validation. Preserve defaults, error handling, and compatibility when moving code.
- Do not add dependencies, change versions/licenses, update installed DSH, restart services, or alter packaging targets unless the task authorizes that work. Generate `dist/` through the build; do not edit it by hand.
- Preserve unrelated dirty work. Do not commit, push, publish, or contact external parties without authorization.

## State And Handoffs

- Use the workflow and authoritative task store selected for the task. Do not create parallel local state for MCP-managed workflows or edit their state files by hand.
- For substantial file-based work, keep one `docs/specs/<slug>/` bundle with a durable specification, compact plan/checklist/handoff, and self-contained numbered packets. Do not create an empty bundle for routine work.
- Execute only authorized packets. When an explicitly invoked incremental workflow requires one packet and a review stop, honor that boundary; do not infer permission to commit or continue.
- Keep handoffs to completed work, changed files, checks, exact next action and owner, and blockers. Repair an incomplete packet through its planning workflow before dependent implementation.

## Questions And Decisions

- Use the host's available interactive question tool for unresolved user-owned decisions. If an invoked workflow supplies a decision store, use that store and its actual tool schemas instead of inventing a second one.
- Reuse existing answers and verify discoverable facts yourself. Do not ask for confirmation of already-authorized work.
- A cancellation, timeout, tool failure, pending state, or silence is not an answer or approval.
- Never request secret values or private session data in questions or task artifacts; use the application's credential UI when a key is needed.

## Verification

- Run the smallest meaningful checks for the affected behavior. Before completing code changes, use the applicable checks from [CONTRIBUTING.md](CONTRIBUTING.md).
- Add focused regression coverage for non-trivial behavior changes. Use deterministic fixtures and mocked HTTP; live providers and real DSH/browser checks require their own explicit scope and evidence.
- Preserve benchmark baselines and thresholds. Report cold, first-query, repeated-query, memory, and end-to-end measurements separately when relevant; do not claim whole-task savings from a smaller first request or faster isolated function.
- Keep private logs, credentials, sessions, generated bundles, and benchmark results out of Git. Record necessary manual checks and unresolved limitations in the task artifact, not as pasted logs in chat.
- Report failed or skipped required checks honestly with the next action and its owner. Build, SDK, or mock tests are not browser acceptance.
