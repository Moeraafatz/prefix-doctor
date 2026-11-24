---
name: prefix-doctor
description: KV Prompt-Cache Hygiene & Cost Optimization protocol for building and debugging AI agents (Anthropic, OpenAI, Gemini, DeepSeek). Prevents silent 5-10x API overbilling from broken prefix caches.
---

# prefix-doctor — The 7 Laws of KV Prompt-Cache Hygiene

Follow these rules whenever authoring system prompts, MCP tool definitions, agent loops, or LLM API wrappers:

1. **Freeze Wire-Order Prefix (`tools[]` → `system` → `messages[0..k]`)**
   - Keep `tools[]` sorted lexicographically by tool name with recursively canonicalized JSON Schema keys. Unsorted MCP tool discovery busts 100% of your KV cache at token 0.

2. **Never Put Clocks, UUIDs, or Turn Counters in `system`**
   - Live timestamps (`new Date().toISOString()`), random `request_id`s, and turn counters belong at the **tail of the latest user turn**, never in `system` or early history.

3. **Treat Conversation History as Append-Only (`arXiv:2611.22238`)**
   - Avoid `messages.unshift(...)`, splicing, or rewriting earlier turns. Append newly retrieved RAG chunks or repository state at the tail so the prior prefix stays warm.

4. **Place Explicit `cache_control` Breakpoints on Anthropic**
   - Attach `cache_control: { type: "ephemeral" }` at the end of `tools[]`, the static `system` block, and the penultimate conversation turn once prompts exceed 512 tokens.

5. **Respect the Write-Tax Break-Even Threshold ($p^* = \frac{w - 1}{w - r}$)**
   - Anthropic 5m TTL (`1.25x` write / `0.10x` read) breaks even at **21.7%** hit rate; 1h TTL (`2.0x` write / `0.10x` read) breaks even at **52.6%**. Do not pay write tax on volatile prefixes.

6. **Avoid Mid-Session Model Ping-Pong (`arXiv:2611.13176`)**
   - Switching models mid-conversation forces a full cold prefill on the target model. Isolate sub-tasks cleanly rather than bouncing one growing thread across models.

7. **Audit Before Shipping**
   - Call `prefix_audit_code` on prompt-builder source files, `prefix_diagnose_trace` on recorded `.json`/`.jsonl` API traces, and `prefix_heal_trace` to measure exact before/after dollar savings.
