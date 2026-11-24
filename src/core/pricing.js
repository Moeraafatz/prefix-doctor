/**
 * Provider KV Prompt-Caching Economics & Write-Tax Break-Even Model.
 *
 * Grounded in:
 * - "Don't Break the Cache" (arXiv:2601.06007, Jan 2026)
 * - "Cache-Aware Prompt Compression (CAPC)" (arXiv:2607.15516, Jul 2026)
 * - "Context Has a Price" (arXiv:2611.22238, Nov 2026)
 *
 * Break-even cache hit probability p* where caching beats uncached billing:
 *   w * (1 - p) + r * p = 1  ==>  p* = (w - 1) / (w - r)
 */

export const PROVIDER_PROFILES = {
  anthropic_5m: {
    id: 'anthropic_5m',
    name: 'Anthropic Claude (5m TTL)',
    inputPerMillionUsd: 3.0,
    writeMultiplier: 1.25,
    readMultiplier: 0.1,
    minCacheTokens: 512,
    ttlSeconds: 300,
    mode: 'explicit'
  },
  anthropic_1h: {
    id: 'anthropic_1h',
    name: 'Anthropic Claude (1h TTL)',
    inputPerMillionUsd: 3.0,
    writeMultiplier: 2.0,
    readMultiplier: 0.1,
    minCacheTokens: 512,
    ttlSeconds: 3600,
    mode: 'explicit'
  },
  anthropic_opus_5m: {
    id: 'anthropic_opus_5m',
    name: 'Anthropic Opus (5m TTL)',
    inputPerMillionUsd: 15.0,
    writeMultiplier: 1.25,
    readMultiplier: 0.1,
    minCacheTokens: 512,
    ttlSeconds: 300,
    mode: 'explicit'
  },
  openai_std: {
    id: 'openai_std',
    name: 'OpenAI GPT (Auto Prefix)',
    inputPerMillionUsd: 2.5,
    writeMultiplier: 1.0,
    readMultiplier: 0.1,
    minCacheTokens: 1024,
    ttlSeconds: 1800,
    mode: 'automatic'
  },
  gemini_implicit: {
    id: 'gemini_implicit',
    name: 'Google Gemini (Implicit)',
    inputPerMillionUsd: 1.25,
    writeMultiplier: 1.0,
    readMultiplier: 0.1,
    minCacheTokens: 1024,
    ttlSeconds: 1800,
    mode: 'automatic'
  },
  deepseek_auto: {
    id: 'deepseek_auto',
    name: 'DeepSeek (Auto Prefix)',
    inputPerMillionUsd: 0.55,
    writeMultiplier: 1.0,
    readMultiplier: 0.1,
    minCacheTokens: 512,
    ttlSeconds: 1800,
    mode: 'automatic'
  }
};

export function getProviderProfile(id = 'anthropic_5m') {
  return PROVIDER_PROFILES[id] || PROVIDER_PROFILES.anthropic_5m;
}

/**
 * Computes the mathematical Write-Tax Break-Even hit rate p* in [0, 1].
 * Below p*, enabling write-taxed caching costs MORE than no caching at all.
 */
export function computeBreakEvenHitRate(profileInput) {
  const p = typeof profileInput === 'string' ? getProviderProfile(profileInput) : profileInput;
  if (p.writeMultiplier <= 1.0) return 0;
  const denom = p.writeMultiplier - p.readMultiplier;
  if (denom <= 0) return 1;
  return Number(((p.writeMultiplier - 1.0) / denom).toFixed(4));
}

export function computeTurnCost({
  cachedReadTokens = 0,
  cacheWriteTokens = 0,
  uncachedInputTokens = 0,
  profile = PROVIDER_PROFILES.anthropic_5m
}) {
  const rate = profile.inputPerMillionUsd / 1_000_000;
  const readUsd = cachedReadTokens * rate * profile.readMultiplier;
  const writeUsd = cacheWriteTokens * rate * profile.writeMultiplier;
  const uncachedUsd = uncachedInputTokens * rate;
  const totalUsd = readUsd + writeUsd + uncachedUsd;
  const rawNoCacheUsd = (cachedReadTokens + cacheWriteTokens + uncachedInputTokens) * rate;
  return {
    read_usd: Number(readUsd.toFixed(6)),
    write_usd: Number(writeUsd.toFixed(6)),
    uncached_usd: Number(uncachedUsd.toFixed(6)),
    total_usd: Number(totalUsd.toFixed(6)),
    no_cache_usd: Number(rawNoCacheUsd.toFixed(6)),
    saved_vs_nocache_usd: Number((rawNoCacheUsd - totalUsd).toFixed(6))
  };
}
