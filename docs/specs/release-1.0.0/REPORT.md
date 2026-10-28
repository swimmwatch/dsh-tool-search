# Release verification

## Preparation completed on 2026-10-28

- [CI/CD PR #1](https://github.com/swimmwatch/dsh-tool-search/pull/1) merged
  after all [hosted gates](https://github.com/swimmwatch/dsh-tool-search/actions/runs/40740545434)
  passed: quality, 192 tests, packaging, clean DSH installation, all seven
  benchmark suites, policy, secrets, dependency audit and both CodeQL languages.
- [Disposable protection probe #2](https://github.com/swimmwatch/dsh-tool-search/pull/2)
  failed its intentional test and invalid commit-title checks. The aggregate gate
  failed and GitHub reported `BLOCKED` despite no merge conflicts. It was closed
  without merging. Main requires an up-to-date successful `Required checks`, a PR
  and resolved conversations, including for administrators.
- The `npm-release` environment accepts protected branches only. npm Trusted
  Publishing is configured for `release.yml` and `npm-release`. rc.2 was published
  through GitHub OIDC with signed npm provenance; no permanent npm publishing
  secret is configured in the repository.
- The scoped package preserves the installed plugin row. Runtime compatibility
  remains Node 24 and DSH 0.2.1-rc.2.
- The first main-branch run rejected a long squash description although the PR
  title passed. [Fix #3](https://github.com/swimmwatch/dsh-tool-search/pull/3)
  makes the post-merge gate validate the Git subject, matching the agreed PR
  title policy. All hosted checks passed before this fix was merged.

## Browser and artwork

The packed plugin was installed into an isolated DSH profile. Browser checks
confirmed settings load, provider selection, saving and reloading disabled
embeddings, and light/dark appearance. Disabling removed the stylesheet;
re-enabling mounted exactly one stylesheet and restored the page. Screenshots:
`assets/settings-light.png` and `assets/settings-dark.png`. These are pre-candidate
checks, not proof of a published npm candidate.

The original logo was generated with the built-in image generation tool. Design
brief: a minimal white whale inside a magnifying glass, a dark rounded square,
transparent outer corners and no lettering. The 256-pixel PNG is 40,445 bytes.
Theme-aware layout uses DSH primitives and CSS tokens in `src/client/settings.css`.

Clean installation exposed a schema portability defect: browser CSP prevented
DSH from restoring an executable URL transform. The schema now uses declarative
validation; URL parsing and normalization remain at the provider-settings boundary.
A wire-serialization regression test covers this path.

## Limitations and remaining work

The dependency audit has two Low findings in development-only KaTeX/math
dependencies used by the DSH UI test SDK; npm reports no available fix. There are
no High/Critical findings. No benchmark baseline or threshold was weakened.

The clean profile has no writable credential provider, so the OpenAI key control
reports unavailable; the documented environment-variable path remains available.
Live model/provider calls are not implied by offline tests.

## Candidate publication and acceptance

- rc.0 was published from Prepare [40743883855](https://github.com/swimmwatch/dsh-tool-search/actions/runs/40743883855); its registry archive matched SHA-256 `fc4b914b8c65c029843b927842565dd8258f309ea655cbc6ad31d3d7053bef46`.
- Bootstrap metadata was completed by Publish [40754386794](https://github.com/swimmwatch/dsh-tool-search/actions/runs/40754386794).
- [PR #5](https://github.com/swimmwatch/dsh-tool-search/pull/5) added bounded propagation checks. [PR #7](https://github.com/swimmwatch/dsh-tool-search/pull/7) corrected the candidate channel invariant for npm's bootstrap behavior. npm assigns `latest` on first publication and rejected deleting it with HTTP 400; deletion was abandoned, not passed. Later candidates must preserve the existing `latest` exactly while moving `next`.
- rc.1 was prepared but never published. rc.2 passed all gates, including **198 tests** and all **seven benchmark suites**, in [Prepare 40761501446](https://github.com/swimmwatch/dsh-tool-search/actions/runs/40761501446).
- [Publish 40762118518](https://github.com/swimmwatch/dsh-tool-search/actions/runs/40762118518) published rc.2 through OIDC, recorded signed provenance, verified npm bytes and channels, and created the GitHub prerelease. Registry SHA-256: `0fee628dce852840cd29e2ee4bb952d53ba829d56100ce324bb715489b7c7d2d`.
- The published rc.2 installed through `dsh plugin --profile release-ui add @swimmwatch/dsh-tool-search@1.0.0-rc.2`. Runtime payloads across candidates match in all 97 checked files.
- Browser GPT-6-Luna checks in the isolated profile exercised Native and PTC search, `working_directory`, the installed Sentinel's `sentinel_list`, a real stdio MCP probe and schema unloading. A hybrid phrase with embeddings disabled returned BM25 and `degraded: false`.
- Packed-plugin SDK checks covered loading, non-execution by search, child isolation, PTC, unloading and disposal. Actual local Ollama succeeded; an unavailable model fell back to BM25 with `degraded: true`. OpenAI-compatible HTTP behavior was mocked; no live OpenAI embedding call is claimed.

The isolated profile reused the installed Codex Connect and Sentinel packages.
A clean Codex Connect install encountered an unavailable AWS SDK transitive
version; this was a test-provider setup limitation, not a Tool Search install
failure. The first chat attempt also rejected an incomplete test credential
record; the corrected isolated setup passed. Production credentials were not
modified. Private screenshots, logs and acceptance records are kept outside Git.

Stable publication, working-profile migration and Marketplace submission remain
owned by the executing agent. Marketplace review is external; its minimum
repository-age rule may delay acceptance. Follow `PLAN.md` and `docs/releases.md`.
