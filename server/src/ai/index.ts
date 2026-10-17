import { config } from "../config.js";
import { aiUnavailable } from "../lib/errors.js";
import { AnthropicProvider } from "./anthropic.js";
import { MockProvider } from "./mock.js";
import { OllamaProvider } from "./ollama.js";
import type { LLMProvider } from "./provider.js";

let provider: LLMProvider | null | undefined;

function build(): LLMProvider | null {
  if (config.AI_PROVIDER === "mock") return new MockProvider();
  if (config.AI_PROVIDER === "anthropic" && config.ANTHROPIC_API_KEY)
    return new AnthropicProvider(config.ANTHROPIC_API_KEY, config.ANTHROPIC_MODEL, config.ANTHROPIC_EFFORT, config.ANTHROPIC_FALLBACKS);
  if (config.AI_PROVIDER === "ollama") return new OllamaProvider(config.OLLAMA_BASE_URL.replace(/\/+$/, ""), config.OLLAMA_MODEL, config.OLLAMA_NUM_CTX);
  return null;
}

/** The configured provider, or a 503 "AI not configured" error. */
export function getProvider(): LLMProvider {
  if (provider === undefined) provider = build();
  if (!provider) throw aiUnavailable();
  return provider;
}

/** Test hook. */
export function setProvider(p: LLMProvider | null) {
  provider = p;
}
