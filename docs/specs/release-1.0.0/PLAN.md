# Release 1.0.0 execution checklist

The approved scope is public GitHub/npm publication, protected CI, immutable
prepare/publish CD, RC acceptance, installation in the existing DSH web profile
and a community-market submission. Node 24 and DSH 0.2.1-rc.2 stay supported.

- [x] Inspect the initial candidate files and scan for secrets.
- [x] Push the existing project before introducing CI/CD changes.
- [x] Generate an original DSH-style Tool Search logo; add it to README and plugin metadata, and verify light/dark presentation.
- [x] Match the settings page to native DSH styles using its public UI SDK and theme tokens; move plugin styles into separate files and verify light/dark themes.
- [x] Improve repository discoverability with an accurate GitHub description, topics, npm keywords, README search terms and project links; verify the public metadata.
- [x] Merge a separate CI/CD and publication-preparation PR after required checks.
- [x] Verify branch protection with a failing-check and invalid-title PR.
- [ ] Prepare rc.0; owner completes npm sign-in/2FA; publish the tested archive.
- [ ] Configure OIDC and release rc.1 through CD.
- [ ] Verify registry installation, browser behavior and available live providers.
- [ ] Repair failed candidates through separate PRs and new RC versions.
- [ ] Prepare/publish stable 1.0.0 and verify registry/release artifact identity.
- [ ] Back up and migrate the working web profile; verify or roll back.
- [ ] Submit the Marketplace entry and report its external review status.

Implementation, checks and publication are owned by the executing agent. npm
sign-in and two-factor confirmation are owned by the user. Catalog acceptance
is owned by its maintainers. Detailed release steps live in `docs/releases.md`;
private runtime evidence and backups remain outside the repository.
