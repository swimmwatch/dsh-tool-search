# Security Policy

## Scope And Supported Configuration

Security reports are welcome for the current development version, `0.1.0`, on
Node.js 24 and DeepSeek Harness `0.2.1-rc.2`. Native and PTC presets are covered.
Other DSH/Node versions are not verified compatibility targets. There is no
published maintenance or backport schedule.

Local builds can share the same package version. Identify the affected commit
or the SHA-256 of the installed package, not only its version number.

## Reporting A Vulnerability

**Do not disclose vulnerabilities through public issues, pull requests, or
discussion comments.** Do not send production credentials or session exports.

When this project is hosted on GitHub and private vulnerability reporting is
enabled, use **Security → Advisories → Report a vulnerability**. The private
report form in `.github/VULNERABILITY_REPORT.yml` asks for project-specific
reproduction details. The file alone does not enable private reporting.

If that option is unavailable, do not publish the vulnerability. Ask the
repository owner to enable private reporting or provide a private channel,
without including technical details. No project security email is currently
designated. The owner setup steps are in
[REPOSITORY_SETUP.md](.github/REPOSITORY_SETUP.md).

Include in a private report:

- Affected commit/package hash, DSH and Node versions, and Native/PTC preset.
- The affected trust boundary and potential impact.
- Minimal reproduction steps using synthetic tools, queries and credentials.
- Whether embeddings were disabled, Ollama, or OpenAI-compatible; give the model
  and server implementation if relevant, without private hostnames or keys.
- Expected behavior, actual behavior, and any safe mitigation already tested.

Maintainers will assess scope and coordinate fixes and disclosure through the
private report. This project does not promise a response deadline, bounty or
automatic backport. Test only systems and data you are authorized to use.

## Trust Boundaries

- Search selects and loads schemas; it must not execute discovered tools or
  grant permissions. DSH remains responsible for approval and execution.
- Catalog access and loaded schemas are scoped to the calling agent. Changes
  to a tool or its schema require revalidation. Cancellation must prevent later
  activation, but does not currently promise immediate abort of embedding HTTP.
- The UI uses public DSH client APIs. Credential status and writes go through
  `remote.credentials`; stored plaintext values must not be returned to the UI.
- Raw private queries, catalogs, descriptions, keys and provider response bodies
  must not leak into diagnostics, cache identities or persistent vector files.
- OpenAI-compatible embeddings intentionally send the query and prepared tool
  descriptions to the configured server. The user chooses that endpoint.
  Remote endpoints require HTTPS; HTTP is limited to loopback. Redirects and
  credentials embedded in URLs are rejected.
- With embeddings disabled, hybrid search uses BM25 without embedding HTTP.
  An enabled provider failure normally produces BM25 fallback with `degraded: true`.

Report suspected permission bypass, cross-agent disclosure, credential leakage,
endpoint-validation bypass or unintended persistence privately. Ordinary ranking
errors, documented provider fallback and non-security failures on unverified
versions belong in the public issue forms after removing private data. Suspected
security issues always use the private route, regardless of the affected version.

Dependency advisories still require review. Dependabot configuration does not
guarantee fixes for pinned DSH/React dependencies; those upgrades need coordinated
compatibility testing. See [CONTRIBUTING.md](CONTRIBUTING.md).

GitHub documents how owners
[enable private reporting](https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/configure-vulnerability-reporting/configure-for-a-repository).
