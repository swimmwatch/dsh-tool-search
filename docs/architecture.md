# DSH Plugin Architecture

This package targets DeepSeek Harness `0.2.1-rc.2` and Node.js 24. The public
contracts below were checked against the upstream `dsh-v0.2.1-rc.2` tag
(`687f282e8625c6b8d11ff58211a90524be2e4317`) and the installed npm packages.
Recommendations from a newer DSH branch do not extend this compatibility range.

## Package Shape

This is one installable bundle with a Host plugin and a browser companion. It
does not own a DSH profile, application launcher, MCP server, or model provider.
The retrieval engine remains private implementation code in the same package.

```text
dsh-tool-search/
├── package.json              # Bundle, client module, exports and compatibility
├── cordis.patch.yml          # Mounts the package-root Host plugin
├── src/
│   ├── index.ts              # Cordis lifecycle, registry, prompt filter, guards
│   ├── config.ts             # Host-validated live Config values
│   ├── discovery.ts          # Native registry to retrieval-engine boundary
│   ├── embedding-provider.ts # Provider selection and credential snapshot
│   ├── embedding-settings.ts # Browser-safe defaults and validation
│   ├── constants.ts          # Shared limits and default tool names
│   ├── schemas.ts            # Native tool input/output contracts
│   ├── messages.ts           # Tool descriptions and model instructions
│   ├── client/               # Settings UI and remote credential operations
│   └── core/                 # Ranking, catalogs, receipts, providers and cache
├── test/                     # Unit, Cordis, provider and UI contract checks
├── benchmarks/               # Offline quality, scale, Native and PTC gates
├── scripts/                  # Build and packed-artifact verification
├── docs/                     # Architecture and pinned upstream references
└── dist/                     # Generated runtime and declarations; not committed
```

The upstream monorepo's `packages/<group>/<package>` layout and shared build
configuration are internal repository conventions. An external single-purpose
plugin does not need that monorepo structure or its private build helpers. The
existing ESM `dist/` exports are valid public entry points; their directory name
does not need to match upstream's `lib/`.

## Host Integration

`name`, `Config`, `inject`, and `apply` are exported from the package root.
Required `tools` and `systemPrompt` services are declared through `inject`.
Discovery uses the calling agent's public registry view; original tool schemas
and DSH execution policies remain authoritative. Search does not execute found
tools or grant permission to use them.

The plugin registers two tools, a prompt section, assembly middleware, an
execution guard, and a registry-change listener. Registrations belong to the
Cordis effect lifetime. Disposal removes these contributions and invalidates
plugin-owned state. Tool selection is scoped to each agent. Registry changes,
tool replacement, and cancellation are rechecked before activating schemas.

Native mode filters the next request's function schemas. PTC mode renders the
same visible capabilities through DSH's public TypeScript or Python tool
renderers. Existing instructions and conversation history are preserved except
for MCP instruction sections whose tools are not currently visible.

The `src/core/mcp/` name records the reused engine's internal response and receipt
contracts. It contains no MCP transport or server registration. Changing those
internal contracts is separate from adopting the DSH plugin lifecycle.

## Live Settings And Credentials

`Config` uses `@deepseek-ai/schemastery` and `Volatile` values. Each embedding
operation takes a settings snapshot. A later save affects subsequent operations
without replacing the plugin or clearing the agents' selected schemas.

The browser registers its page in `plugins.row.config`. It receives DSH's
revisioned form scope from the page owner and uses public UI primitives. The
Host validates and persists mutations. Shared modules contain no Node APIs,
network clients, environment access, or credential resolution.

Credential references are configuration; secret values belong to DSH
credentials. The browser can describe whether a key exists and save a newly
entered value through `remote.credentials`. It cannot retrieve the saved value.
The Host resolves credentials for the operation. Keys are excluded from ordinary
settings, cache identities, diagnostics, and artifacts.

## Browser Module And Distribution

`dsh.client` declares a Web companion. Its `inject` field is descriptive metadata
in this release; runtime `inject` controls service readiness, while the platform
table and `external` declarations determine available module requests. The `./client`
export is a lazy CommonJS factory registered with DSH's module loader, not a
standalone browser ESM entry. React and DSH UI modules are supplied by the Host.
The build validates both the browser-safe source graph and the available Host
module contract before emitting the bundle.

Framework packages shared by Node code with the Host are peer dependencies and
also have matching development dependencies for standalone checks. Browser and
type-only imports stay in development dependencies; the browser module loader
supplies their runtime identity. Stateless validators remain ordinary
dependencies. No workstation paths or sibling source checkouts are required.

The `prepare` lifecycle builds the entry points for Git-source installation and
packing. The published file allowlist contains compiled runtime code,
declarations, the bundle patch, and package documentation. Development files,
private artifacts, and source maps pointing outside the archive are excluded.
`package:verify` checks the actual packed artifact and its public entry points.

## Model Context And Limits

The model sees `tool_search`, `tool_unload`, configured always-available tools,
and up to 16 additional schemas selected by its agent. Empty search returns a
compact summary; search results contain short descriptions and loading state.
Full schemas appear on the next model step. Model-facing prose is maintained in
[`src/messages.ts`](../src/messages.ts), avoiding a second literal copy here.

Changing the visible schemas or PTC declarations can replace request-prefix
tokens and affect provider cache reuse. Unloading a schema does not erase earlier
messages. Neither smaller requests nor an offline retrieval benchmark alone
prove lower end-to-end task cost.

Only DSH `0.2.1-rc.2` and Node.js 24 are supported. Mock HTTP, real Cordis/DSH
contract tests, and offline benchmarks are automated checks. Browser behavior,
installed-profile activation, and live-provider quality require separate
verification. No upstream monorepo gate, hosted CI run, or browser acceptance is
implied by a successful local build.

## Official References

All links are pinned to the supported release tag:

- [Packaging, dependencies, Git prepare and profile installation](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-rc.2/docs/user/develop/basic/publish.md)
- [Cordis dependency injection, events and reversible effects](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-rc.2/docs/cordis-primer.md)
- [Live Config and browser settings pages](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-rc.2/docs/cookbook/adding-a-settings-card.md)
- [Browser module loading and companion exports](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-rc.2/packages/client/modules/README.md)
- [Client module boundaries and shared modules](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-rc.2/packages/client/AGENTS.md)
- [Tool execution and cancellation](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-rc.2/packages/core/tools/README.md)
- [Package topology and upstream monorepo conventions](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-rc.2/docs/cookbook/adding-a-package.md)
