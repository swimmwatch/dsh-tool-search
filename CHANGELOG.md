# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and releases follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0-rc.1] - 2026-10-28

### Fixed

- Wait for npm archive and channel propagation during publication, and reject release candidates assigned to `latest`.

## [1.0.0-rc.0] - 2026-10-28

### Added

- Native `tool_search` and `tool_unload` for built-in, plugin and MCP tools.
- Exact-name, BM25, pattern and hybrid retrieval with explicit-name priority.
- Per-agent schema loading, 16 additional-tool slots and Native/PTC support.
- Native settings for always-available tools and optional Ollama or
  OpenAI-compatible embeddings, including local-only search.
- Deterministic regression tests and seven benchmark suites with per-case gates.
- Original project logo and theme-aware settings styles in a separate stylesheet.
- Protected CI gates and a prepare/publish release workflow that preserves the
  tested archive, its checksum and source commit.

### Changed

- Publish the package as `@swimmwatch/dsh-tool-search` under Apache-2.0 while
  preserving the plugin row, configuration fields and cache location.
- Document the public contract, installation, migration and release process.

### Fixed

- Keep the settings schema declarative so DSH can validate it under the browser
  Content Security Policy, including on a fresh profile.

### Security

- Pin the project dependency tree to Zod 4.6.6 to remove the vulnerable SDK
  dependency copies. This does not patch a separately installed DSH host.

[Unreleased]: https://github.com/swimmwatch/dsh-tool-search/compare/v1.0.0-rc.1...HEAD
[1.0.0-rc.1]: https://github.com/swimmwatch/dsh-tool-search/compare/v1.0.0-rc.0...v1.0.0-rc.1
[1.0.0-rc.0]: https://github.com/swimmwatch/dsh-tool-search/releases/tag/v1.0.0-rc.0
