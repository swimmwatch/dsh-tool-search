# GitHub Repository Setup

These are owner actions after the intended GitHub repository is created.
Adding these files locally does not create a repository, enable security
reporting, change branch protection, or grant redistribution rights.

## Before Public Publication

- [ ] Decide the license for the plugin and reused source. The current
      [LICENSE](../LICENSE) and `UNLICENSED` metadata do not grant public
      redistribution. Do not replace them with an arbitrary open-source license.
- [ ] Confirm the repository owner, URL and default branch. Only then add the
      verified `repository`, `bugs` and `homepage` URLs to `package.json` and any
      repository-specific badges or links.
- [ ] Review the actual Git candidate list for credentials, private data, logs,
      `.local/`, generated bundles and benchmark output. Keep source provenance.
- [ ] Publish only after explicit authorization. This setup does not commit,
      push, publish a package, or install the plugin in DSH.

## Community And Private Reports

- [ ] Enable Issues. Verify the four public forms appear on the default branch.
      Do not enable public vulnerability issue templates.
- [ ] Enable private vulnerability reporting where GitHub supports it, verify
      **Security → Advisories → Report a vulnerability**, and review the custom
      `.github/VULNERABILITY_REPORT.yml` form. If unavailable, designate a real
      private security contact in [SECURITY.md](../SECURITY.md) before inviting
      vulnerability reports.
- [ ] Configure security notifications for the people responsible for triage.
      Do not assume that adding the policy subscribes anyone to notifications.
- [ ] Enable reporting content to repository admins and review the moderation
      process in [CODE_OF_CONDUCT.md](../CODE_OF_CONDUCT.md). Add a verified
      private moderation contact if one is established.
- [ ] Add `CODEOWNERS` only after responsible users/teams and repository access
      are confirmed. Do not use placeholder accounts. Funding links and citation
      metadata also require real owner-supplied information.

## CI And Repository Rules

- [ ] Enable GitHub Actions and allow the pinned official `actions/checkout` and
      `actions/setup-node` actions. Leave workflow permissions read-only.
- [ ] Run **CI** on the default branch and a pull request. The expected job is
      **Node 24 quality**. Confirm the actual check name before making it required.
- [ ] Require pull requests and the successful quality check in a default-branch
      ruleset. Require review if another reviewer is available; protect against
      force pushes/deletion according to the repository's ownership model.
- [ ] Keep fork PR workflows free of secrets and privileged tokens. Do not
      replace `pull_request` with `pull_request_target` to run contributor code.
- [ ] CI runs `npm ci`, `npm run check`, `npm run package:verify` and
      `npm run benchmark` on Ubuntu with Node 24. No Ollama service, provider key,
      personal DSH profile, live benchmark or release upload is needed.

## Dependency And Security Maintenance

- [ ] Enable the dependency graph and Dependabot alerts/security updates when
      available. Review advisories; do not treat the configuration as a clean
      vulnerability scan.
- [ ] Review the weekly Dependabot PRs. npm version updates are lockfile-only;
      DSH/Cordis and React host-contract packages are excluded from automated
      updates. Their advisories and compatibility upgrades require manual triage.
      Major npm updates are also deliberately excluded. There is no auto-merge.
- [ ] If appropriate for the repository's visibility and plan, enable secret
      scanning/push protection and CodeQL through GitHub settings. They are not
      silently assumed to be available or enabled by these files.

## First Release

- [ ] Choose an explicit release scope and update [CHANGELOG.md](../CHANGELOG.md)
      with the accepted changes. Do not infer a tag or release date from `0.1.0`.
- [ ] Run the documented checks and inspect the packed files. Keep agent guides,
      templates, development tests and private artifacts out of the runtime package.
- [ ] Perform any required installed-DSH/browser or live-provider acceptance.
      Offline CI is not evidence that those checks passed.
- [ ] Publish or distribute only under the agreed license and explicit approval.

Reference: GitHub's
[private-reporting configuration](https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/configure-vulnerability-reporting/configure-for-a-repository),
[Actions security guidance](https://docs.github.com/en/actions/reference/security/secure-use),
and [Dependabot options](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference).
