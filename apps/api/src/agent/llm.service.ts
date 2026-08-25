import { Injectable } from '@nestjs/common';
import { ChatOpenAI } from '@langchain/openai';

@Injectable()
export class LlmService {
  create(options?: { streaming?: boolean; jsonMode?: boolean }) {
    return new ChatOpenAI({
      apiKey: process.env.LLM_API_KEY,
      model: process.env.LLM_MODEL,
      temperature: 0,
      timeout: 60_000,
      maxRetries: 1,
      streaming: options?.streaming ?? false,
      configuration: {
        baseURL: process.env.LLM_API_BASE ?? 'https://api.openai.com/v1',
      },
      ...(options?.jsonMode
        ? { modelKwargs: { response_format: { type: 'json_object' } } }
        : {}),
    });
  }
}
