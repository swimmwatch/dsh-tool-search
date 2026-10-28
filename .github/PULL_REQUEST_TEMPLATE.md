## Problem and resulting behavior

<!-- Explain the concrete problem, the resulting behavior, and any intentional
compatibility change. Link a related issue when one exists. -->

## Verification

<!-- List the checks actually run and their results. Explain relevant checks
that failed, were skipped, or need a follow-up. Do not paste private logs.

Use CONTRIBUTING.md to choose the checks:
- Documentation only: formatting, commands, and links.
- Code: npm run check.
- Client/SDK boundary or packaging: also npm run package:verify.
- Retrieval, providers, search settings, or lifecycle: also npm run benchmark.

Live providers and installed-DSH/browser checks are separate. Do not label mock,
SDK, or deterministic benchmark results as live acceptance. Do not run paid or
live-provider checks merely to fill this template. -->

## Compatibility and privacy

<!-- For affected behavior, explain how this preserves or intentionally changes
Native/PTC discovery, per-agent isolation, permissions, schema integrity,
cancellation before activation, unloading/LRU, provider fallback, and cache
privacy. Document provider/settings changes in README. Unrelated items need no
extra testing or prose. -->

- [ ] The change is focused; unrelated files, dependencies, versions, and licenses are unchanged.
- [ ] Examples and fixtures are public or synthetic. No credentials, private queries/catalogs, profiles, sessions, or generated installation artifacts are included.
- [ ] Benchmark baselines and thresholds were not weakened to obtain a passing result.
- [ ] Applicable documentation is updated, or this change does not affect documented behavior.

<!-- Suspected vulnerabilities belong in the private reporting process described
in SECURITY.md, not a public PR. Do not claim that approval of this PR authorizes
publication, deployment, or changes to an installed DSH profile. -->
