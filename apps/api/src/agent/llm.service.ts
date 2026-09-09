import { Injectable } from '@nestjs/common';
import { ChatOpenAI } from '@langchain/openai';

function parseFallbackModels(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

@Injectable()
export class LlmService {
  create(options?: {
    streaming?: boolean;
    jsonMode?: boolean;
    timeout?: number;
    maxTokens?: number;
    model?: string;
    maxRetries?: number;
  }) {
    const fallbackModels = parseFallbackModels(process.env.LLM_FALLBACK_MODELS);
    const modelKwargs: Record<string, unknown> = {};
    if (options?.jsonMode) {
      modelKwargs.response_format = { type: 'json_object' };
    }
    // OpenRouter model fallbacks: tried when the primary provider fails pre-stream.
    if (fallbackModels.length > 0) {
      modelKwargs.models = fallbackModels;
    }

    return new ChatOpenAI({
      apiKey: process.env.LLM_API_KEY,
      model: options?.model ?? process.env.LLM_MODEL,
      temperature: 0,
      timeout: options?.timeout ?? 60_000,
      // Application-level withLlmRetry covers transient OpenRouter/provider failures.
      maxRetries: options?.maxRetries ?? 0,
      streaming: options?.streaming ?? false,
      configuration: {
        baseURL: process.env.LLM_API_BASE ?? 'https://api.openai.com/v1',
      },
      ...(options?.maxTokens != null ? { maxTokens: options.maxTokens } : {}),
      ...(Object.keys(modelKwargs).length > 0 ? { modelKwargs } : {}),
    });
  }
}
