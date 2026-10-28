# GitHub repository settings

The repository is `swimmwatch/dsh-tool-search`, with `main` as its default branch.
The public package is `@swimmwatch/dsh-tool-search`, licensed under Apache-2.0.
These settings must be checked through GitHub; a committed YAML file alone does
not enable a repository policy.

## Required protections

- Allow squash merge only; use the PR title for the squash commit title.
- Require PRs, resolved conversations and the `Required checks` CI job on an
  up-to-date branch. Apply protection to administrators; disable force pushes
  and branch deletion. A second human reviewer is not required for this project.
- Confirm protection with a deliberately failing PR and an invalid PR title;
  close the probe without merging. Do not bypass protection to finish a release.
- Run fork PRs with `pull_request`, never privileged `pull_request_target`.
- Pin third-party actions to reviewed commit SHAs. Runtime CI uses read-only
  repository permissions; only CodeQL upload and the publishing job receive
  their narrowly required extra permissions.

## Security and community

Enable Issues, private vulnerability reporting, dependency graph, Dependabot
alerts/security updates, secret scanning and push protection where available.
Verify the private reporting entry point and the repository's actual settings.
Maintain the existing issue forms and weekly Dependabot updates; do not silently
upgrade pinned DSH/React host contracts. Do not create placeholder contacts,
CODEOWNERS teams, funding links or external chat channels.

## Release environment

Create `npm-release`, restricted to the protected `main` branch, without an
additional human-review requirement. Configure npm Trusted Publishing to this
repository and `release.yml`, using this exact environment name. Publishing is
an explicit workflow dispatch; it is not triggered by PR code or arbitrary tags.
No permanent npm publishing token is required after the first bootstrap release.

See [the release procedure](../docs/releases.md) for artifact binding, acceptance,
rollback and immutable version rules. Report actual configured state and hosted
workflow results separately from local checks.
