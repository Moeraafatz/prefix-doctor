# KV Prompt-Cache Physics & Formal Cost Model (`prefix-doctor`)

## 1. Wire-Order Prefix Hashing

Provider KV prefix caches operate over an exact, deterministic token prefix sequence:

$$\text{Prefix} = \text{ModelID} \;\|\; \text{Tools}[0..m] \;\|\; \text{System} \;\|\; \text{Messages}[0..n]$$

A single changed byte at position $k$ invalidates **100% of KV state for all tokens at positions $\ge k$**. Consequently:
- Shuffling `tools[]` (e.g. non-deterministic MCP server discovery) invalidates from token `0`.
- Interpolating a live timestamp or UUID at the start of `system` invalidates the entire system prompt AND every historical conversation turn.
- Prepending dynamic RAG chunks into `system` or calling `messages.unshift(...)` (*Context Has a Price*, `arXiv:2611.22238`) destroys all downstream message cache hits.

---

## 2. Explicit vs. Automatic Breakpoint Semantics

### Explicit Caching (Anthropic Claude)
Anthropic evaluates cache hits strictly at explicit `cache_control: { type: "ephemeral" }` breakpoints (up to 4 per request, minimum 512 tokens):
- On Turn $t$, a cache read is credited ONLY up to the furthest explicit breakpoint offset $b \le \text{LCP}(\text{Turn}_{t-1}, \text{Turn}_t)$.
- Putting `cache_control` solely on `system` without protecting `tools[]` causes a complete `0%` miss whenever `system` mutates.
- Optimal multi-turn rolling placement (`src/core/canonicalizer.js`):
  1. End of lexicographically sorted, key-canonicalized `tools[]`
  2. End of frozen static `system` block
  3. Rolling history boundary (`messages[N-3]`) and stable content block of `messages[N-1]`
  4. Volatile per-turn metadata (`<turn_volatile_metadata>`) placed **strictly after** the final `cache_control` breakpoint so it never mutates the cached prefix of Turn $t+1$!

### Automatic Caching (OpenAI, Gemini, DeepSeek)
Providers automatically match the longest common token prefix above their minimum threshold (`1,024` tokens on OpenAI, `512` on DeepSeek) without explicit markers—meaning strict static-first wire ordering is equally decisive.

---

## 3. Write-Tax Break-Even Derivation

Let $c$ be base input price per token, $w$ be cache-write multiplier, $r$ be cache-read multiplier, and $p \in [0, 1]$ be effective prefix hit rate. The expected effective multiplier per token is:

$$E(p) = w(1 - p) + r p$$

Caching beats uncached billing ($E(p) < 1$) if and only if:

$$w - (w - r)p < 1 \iff p > p^* = \frac{w - 1}{w - r}$$

| Provider Profile | $w$ (Write) | $r$ (Read) | Break-Even $p^*$ | Consequence When $p < p^*$ |
| :--- | :---: | :---: | :---: | :--- |
| Anthropic 5m TTL | `1.25x` | `0.10x` | **21.7%** | Up to **+25% bill penalty** vs no cache |
| Anthropic 1h TTL | `2.00x` | `0.10x` | **52.6%** | Up to **+100% bill penalty** vs no cache |
| OpenAI / Gemini / DeepSeek | `1.00x` | `0.10x` | **0.0%** | Never loses money vs uncached |

When `prefix-doctor` observes $E(p) > 1.0$, it flags `WRITE_TAX_LOSS` in **RED** so engineering teams immediately know their cache is actively losing money.
