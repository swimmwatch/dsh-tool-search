# Release procedure

Only reviewed commits on protected `main` may be released. Use Node.js 24 and
the lockfile. Do not release by rebuilding a previously tested archive.

## Version and changelog PR

1. Choose a SemVer version. Candidates use `MAJOR.MINOR.PATCH-rc.N`; stable
   versions use `MAJOR.MINOR.PATCH`. Candidates publish to `next`, stable to
   `latest`. Do not reuse an existing version or move a published Git tag.
2. Update package.json and both root version entries in package-lock.json in a
   release PR. Move accepted changes from `[Unreleased]` to a dated Keep a
   Changelog section, retaining comparison links and earlier release history.
3. Use a Conventional Commit title such as `chore(release): prepare 1.0.0-rc.1`.
   Wait for every required check, then squash merge. The squash title must stay
   compliant; do not bypass protection.

## Prepare

Run **Release** from `main` with `mode=prepare`. The workflow runs the full CI,
builds once, packs with lifecycle scripts disabled, verifies the packed Host/UI
and installs it into a clean DSH profile. It uploads `release-<run-id>` with:

- the `.tgz`;
- `SHA256SUMS`;
- `release.json` binding package, version, source commit, run ID and hashes;
- `RELEASE_NOTES.md` extracted from that version's changelog section.

Use only a successful Prepare run for the current `main` commit. A newer main
commit requires another Prepare. Artifacts expire after 30 days; regenerate an
expired candidate rather than substituting a local build.

## First npm publication

The owner signs into npm as `swimmwatch` and completes any required two-factor
confirmation. Publish the downloaded, verified `1.0.0-rc.0` archive with:

```sh
npm publish /absolute/path/swimmwatch-dsh-tool-search-1.0.0-rc.0.tgz --ignore-scripts --access public --tag next
```

Configure npm Trusted Publishing for GitHub owner `swimmwatch`, repository
`dsh-tool-search`, workflow `release.yml`, environment `npm-release`, with direct
publish allowed. The first OIDC publication must occur within npm's validation
window. Never put an npm token in source, logs or chat. Later releases use OIDC;
no permanent npm publishing token is stored in GitHub.

## Publish

Run **Release** from `main` with `mode=publish` and the successful Prepare run ID.
The publisher verifies the run's repository, workflow, ref, commit and success,
then checks the archive and notes. It publishes that archive without building,
downloads the npm artifact and checks its hash and channel. Finally it creates
the Git tag and GitHub Release with the archive, hashes and notes.

The publisher uses the GitHub-hosted runner and `npm-release` environment.
Only its job has write and OIDC permissions. Publication runs are serialized.
An already-published npm version is accepted only when its bytes match exactly;
an existing GitHub Release is checked, never silently overwritten. A partial
failure is still a failure and must be resolved before advancing.

For bootstrap `rc.0`, the same Publish path verifies the manually published
archive and completes GitHub metadata. Publish `rc.1` through OIDC to prove CD.

## Candidate acceptance and stable release

Install the published candidate into an isolated profile and verify in the
browser: settings, built-in/plugin/MCP discovery and invocation, unloading,
disable/re-enable, Native/PTC isolation and embedding-disabled behavior. Test
local Ollama and outage fallback separately; OpenAI-compatible HTTP contracts
are mocked unless a real provider is already configured. Record evidence and
limitations without uploading private prompts, credentials or catalogs.

Any failed candidate requires a separate fixing PR, regression coverage and a
new candidate version. Between the accepted candidate and stable, only release
metadata/documentation may change. Runtime changes require another candidate.

Prepare and validate the final stable archive, then publish it through the same
workflow. Verify npm `latest`, release assets and checksums before installing it
in the working profile. Stable publication is not proof of browser acceptance.

## Working-profile migration and rollback

Back up the profile manifest, lockfile, workspace settings, Cordis patch and the
previous plugin archive outside Git. Keep sessions, credentials, core versions
and unrelated bundles intact. Use the existing DSH launcher and service.

For the initial scoped-package migration, remove the old local bundle with
`dsh plugin --profile web remove dsh-tool-search` and add
`@swimmwatch/dsh-tool-search@<exact-version>`. Preserve the `dsh-tool-search` row
ID/config and update any explicit old package-name override. Check the composed
profile contains one active search plugin before restarting the service.

Verify the installed version and browser behavior after restart. On a
regression, restore the backed-up profile and previous archive, restart the same
service and verify recovery. Published versions remain immutable; a stable fix
requires a new version rather than replacement of 1.0.0.
