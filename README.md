# Conversations Woven

A local-first Angular chat workspace for experimenting with OpenRouter models and the context sent to them. Conversations and settings live in IndexedDB. Provider keys are encrypted by the existing passphrase-protected keychain.

## Development

Use a Node version allowed by `package.json`, then:

```sh
npm install
npm start
npm run build
npm test -- --watch=false --browsers=ChromeHeadless
```

The tests use Jasmine/Karma and Chrome. They mock generation requests: no API key or OpenRouter credits are needed. The production build currently reports warnings for the initial bundle and some existing component style budgets.

## Chat workflow

- **Edit** changes a user or assistant message in place for future requests. Existing replies are retained. Ctrl/Cmd+Enter saves; Escape cancels. Failed saves keep the edit draft. Editing an assistant response clears its original reasoning and token metadata.
- **Branch** in the message menu creates a conversation through that message and opens it. The branch retains its model, instructions, temperature, output budget, reasoning preferences, and folder.
- **Full history / Curated** controls which completed messages are sent next. An empty curated selection sends no history. **Preview context** shows the text before the draft, in request order.
- **Attach text** imports UTF-8 `.md` and `.txt` files into the editable draft. Limits: 256 KB per file, 512 KB and 10 files per import. Text is sent as ordinary message content; it participates in token estimates, editing, backups, and Markdown export. There is no separate file upload API or parsing fee. Large text still consumes model tokens.
- **Stop generation** aborts the active streaming connection and keeps partial text. Stopped responses are excluded from later requests; edit and save one to include it. Whether aborting also stops provider billing depends on the provider.
- **Export .md** downloads a conversation with system instructions and model information. Selecting messages exposes **Export selected** and **Copy**. Encrypted reasoning is never included in Markdown exports.
- On small screens, **Conversations** and **Run settings** open one panel at a time.

## OpenRouter integration

`ChatAdaptersService` loads the public model catalog. `utils/openrouter-models.ts` validates entries and defines the capability policy used by both UI controls and outgoing requests. Unsupported options are omitted. The adapter requests providers that support the supplied parameters. Batch variants and models without text output are excluded from this interactive workspace.

Temperature can use the model default. Maximum output defaults to up to 4,096 tokens, capped by the model's advertised limit. Explicit output budgets are reserved in the context check. Reasoning effort values, token-budget availability, and mandatory reasoning come from catalog metadata rather than model-name heuristics. A selected model that becomes unavailable is not silently replaced.

`OpenRouterAdapter` owns the wire format, error handling, cancellation signal, and usage decoding. The SDK is loaded on demand. Streamed text is published to the UI at most about every 50 ms, with immediate completion and periodic persistence. Avoid reintroducing a full-history sort or a database write per token.

`ContextEngineService` is the source of truth for request history and estimates. It preserves the existing system-prompt sandwich: system instructions, selected history, system instructions, then the new user draft. Estimates are approximate, not tokenizer-exact. Captured reasoning is replayed only to the same model and only when supported; formats and signatures survive persistence and backups.

`utils/markdown-export.ts`, `utils/text-attachments.ts`, and `utils/reasoning-details.ts` hold pure formatting and protocol helpers. Optional persisted fields must also be added to `src/app/models/validators.ts` so IndexedDB and backup validation do not strip them.

## Current boundaries

This is a text chat workflow. Model badges may describe image/tool capabilities, but native image/audio/PDF uploads, tool execution, and generated media are not implemented here. Drafts and curated selections remain session state. Automatic regeneration and revision history are future work; branching preserves an original conversation before experimenting.

The regression suite covers capability filtering, reasoning serialization, SSE errors and usage, cancellation, context isolation, text imports, editor save failures, and Markdown output. Browser checks were performed with synthetic local conversations at desktop and mobile widths. Actual generation with a real key still needs a live smoke test.

References: [model catalog](https://openrouter.ai/docs/guides/overview/models), [reasoning controls and blocks](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens), [streaming and cancellation](https://openrouter.ai/docs/api_reference/streaming), [provider routing](https://openrouter.ai/docs/guides/routing/provider-selection).
