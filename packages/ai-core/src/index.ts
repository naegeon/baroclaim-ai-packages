// packages/ai-core/src/index.ts
// AI Core - 메인 export

// Gemini 클라이언트
export {
  GeminiClient,
  MODEL_TIERS,
  getDefaultClient,
  generateWithFallback,
  executeWithFallback,
  executeWithKeyFallback,
  getKeyModelStatuses,
  hasAvailableKeys,
  getGeminiClient,
} from './gemini-client'

// 임베딩
export {
  generateEmbedding,
  generateEmbeddingWithClient,
  generateEmbeddings,
  generateEmbeddingsWithClient,
  vectorToString,
  EMBEDDING_MODEL,
} from './embedding'

// 프롬프트 서비스
export {
  PromptService,
  initPromptService,
  getPromptService,
  getPrompt,
  getSystemInstruction,
  getTaskPrompt,
  getFullPrompt,
  clearPromptCache,
  invalidatePromptCache,
  PROMPT_KEYS,
} from './prompt-service'
export type { PromptKey } from './prompt-service'

// 타입
export type {
  GeminiModel,
  ChatRole,
  ChatMessage,
  AIResponse,
  APIKeyStatus,
  KeyModelStatus,
  AICoreConfig,
  PromptData,
  PrismaClientLike,
  PromptRecord,
  GenerateOptions,
  StreamChunk,
} from './types'
