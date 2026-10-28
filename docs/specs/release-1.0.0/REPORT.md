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
  Publishing is not configured yet; bootstrap publication remains pending.
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

Next: the executing agent prepares rc.0, the owner completes npm sign-in and any
required two-factor confirmation, then the agent verifies OIDC publication,
candidate acceptance, stable release, installation and Marketplace submission
according to `PLAN.md` and `docs/releases.md`.
