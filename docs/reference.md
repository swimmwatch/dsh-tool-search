# Tool and provider reference

## Tools

`tool_search({query, limit?, mode?})` finds and loads tools. Use an exact tool name
or focused task keywords. `mode` is `hybrid` (default), `bm25`, or `pattern`;
`limit` defaults to 3 and must be an integer from 1 to 5. Queries are limited to
500 characters. Exact names use the existing literal matcher without embedding
requests. An empty query returns a compact inventory rather than every tool.

An original MCP identifier, such as `specification_review_submit_batch`, also
resolves the shortened, hashed name registered by DSH. Resolution forward-maps
the supplied identifier using the pinned DSH 0.2.1-rc.2 naming contract and
requires that exact result in the calling agent's catalog. It does not reverse
hashes, register aliases, bypass access checks, or change tool schemas. Multiple
matching servers remain distinct results, subject to the requested limit. An
explicit identifier containing `workflow` is not an exact reference to the
built-in `workflow` tool. Natural-language and embedding search remain available.

In BM25 and embedding-outage fallback, an unambiguous explicit reference such as
`Call workflow task_id` or `Используй «sentinel_list»` ranks before ordinary keyword
matches, before either result limit is applied. Exact whole-query names still
rank first. Only complete registered names receive this phrase priority; the
existing whole-query MCP identity mapping is unchanged. Negated clauses,
conflicting provider qualifiers and multiple named tools do not force a winner.
This is a conservative syntactic hint, not a general intent parser: those queries
retain ordinary BM25 evidence and can still return lexical matches. Pattern and
successful semantic hybrid ranking are unchanged.

Search results contain short descriptions and loading state. Full, unchanged
native schemas appear on the next model step. Finish the search call before
invoking a newly loaded capability. Invocation uses DSH's existing execution,
validation, approval and sandbox pipeline.

`tool_unload({names?})` unloads named additional tools. Omit `names` to unload all
additional tools. Each agent has its own active set, bounded to 16 extra tools;
the least recently used entries are evicted when the limit is exceeded. A fresh
agent must discover its own additional tools. Removal, replacement or schema
mutation invalidates an activated tool and requires discovery again.

## Embedding providers

Open **Plugins → @swimmwatch/dsh-tool-search → dsh-tool-search → Configure**.
**Use embeddings** is enabled by default and **Ollama** remains the default provider.
Existing profiles retain their `embeddingModel`, defaulting to `qwen3-embedding:4b`.
Install the selected model in local Ollama yourself; the plugin does not download models.

Select **OpenAI-compatible** to use OpenAI or a compatible embeddings server.
Set the model (default `text-embedding-3-small`) and API base URL (default
`https://api.openai.com/v1`). The plugin appends `/embeddings`; keep the API prefix
such as `/v1` in the base URL. Remote URLs require HTTPS; HTTP is allowed only on
loopback. Credentials in URLs, query parameters, fragments and redirects are rejected.
Compatibility requires the OpenAI embeddings request and indexed float-vector response.

The API key reference defaults to `DSH_TOOL_SEARCH_OPENAI_API_KEY`. Use **Save API key**
to store a new value through DSH credentials, separately from **Save** for settings.
Only credential presence and writability are returned to the browser; saved keys are
never displayed. Existing DSH credential/environment references can also be selected.
No other provider's key is selected automatically. Official OpenAI needs a key;
compatible servers may operate without one. A missing official key falls back to BM25
without an HTTP request. Key changes take effect on the next search.

Disabling **Use embeddings** makes `hybrid` requests run as BM25, returning
`mode: "bm25"` and `degraded: false`, with no embedding client or HTTP requests.
An embedding failure while enabled still falls back to BM25 with `degraded: true`.
Exact-name, BM25, pattern and empty queries never request embeddings.

```yaml
config:
  embeddingEnabled: true
  embeddingProvider: ollama
  embeddingModel: qwen3-embedding:4b
  openaiEmbeddingModel: text-embedding-3-small
  openaiBaseUrl: https://api.openai.com/v1
  openaiApiKeyRef: DSH_TOOL_SEARCH_OPENAI_API_KEY
```

Settings are live: the next search uses the selected provider and model without
unloading tools or resetting agents. An in-flight search retains its settings and
credential snapshot. Each provider's settings are retained when switching away.
Saving settings alone does not call an embeddings endpoint.

## Search engine and privacy

The plugin reuses the original `tool-search-mcp` controller, BM25 index,
hybrid ranker, catalog/receipt verification and embedding implementation. The
original TypeScript snapshot and hashes are recorded in `PROVENANCE.json`. The MCP
server entry point and transport are not included. Original project files are
not modified.

By default, hybrid mode uses the installed Ollama `qwen3-embedding:4b` model at
`http://127.0.0.1:11434/api/embed`. Selecting OpenAI-compatible explicitly enables
requests to the configured server, including search queries and prepared tool
descriptions (with names and argument information). If embeddings fail, the existing BM25 fallback is returned with
`degraded: true`. Each embedding HTTP request has an 8-second timeout; the first
uncached catalog can require multiple batches. BM25 and pattern are fully local.

Agent cancellation stops in-flight embedding HTTP requests and prevents further
batches and schema activation. Disabling the plugin also cancels its in-flight
searches. Cancellation is not a provider outage and does not trigger BM25
fallback. Independent searches retain their own cancellation lifetimes.

Only hashed definition vectors are cached under
`$DSH_HOME/cache/dsh-tool-search` (normally `~/.dsh/cache/dsh-tool-search`). Queries,
catalogs, receipts and API keys are not persisted in this cache. Cache identity includes
provider, normalized endpoint, model and text-format versions. Older cache files are
left intact but are not reused across incompatible identities. The original core's Codex cache default
is overridden by the plugin's explicit DSH cache factory.
