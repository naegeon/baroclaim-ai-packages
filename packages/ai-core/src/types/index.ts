// packages/ai-core/src/types/index.ts
// AI Core 타입 정의

/** Gemini 모델 타입 */
export type GeminiModel =
  | 'gemini-2.5-pro'
  | 'gemini-2.5-flash'
  | 'gemini-2.0-flash'

/** 채팅 메시지 역할 */
export type ChatRole = 'user' | 'model' | 'system'

/** 채팅 메시지 */
export interface ChatMessage {
  id: string
  role: ChatRole
  content: string
  createdAt: Date
}

/** AI 응답 결과 */
export interface AIResponse {
  success: boolean
  content?: string
  error?: string
}

/** API 키 상태 */
export interface APIKeyStatus {
  key: string
  available: boolean
  lastUsed?: Date
  errorCount: number
}

/** 키+모델 상태 */
export interface KeyModelStatus {
  key: string
  model: GeminiModel
  tier: 1 | 2 // 1군(Pro), 2군(Flash)
  available: boolean
  lastUsed?: Date
  errorCount: number
}

/** AI Core 설정 */
export interface AICoreConfig {
  apiKeys: string[]
  defaultModel?: GeminiModel
  maxRetries?: number
  cacheEnabled?: boolean
  cacheTTL?: number
}

/** 프롬프트 데이터 */
export interface PromptData {
  key: string
  systemInstruction: string
  taskPrompt: string
  outputFormat: string
}

/** Prisma 클라이언트 인터페이스 (주입용) */
export interface PrismaClientLike {
  aIPrompt: {
    findUnique: (args: {
      where: { key: string; isActive?: boolean }
    }) => Promise<PromptRecord | null>
    findMany: (args: {
      where?: { category?: string; isActive?: boolean }
      orderBy?: unknown
    }) => Promise<PromptRecord[]>
    update: (args: {
      where: { key: string }
      data: Record<string, unknown>
    }) => Promise<PromptRecord>
  }
}

/** 프롬프트 레코드 (DB 스키마 기반) */
export interface PromptRecord {
  id: string
  key: string
  name: string
  description: string | null
  category: string
  systemInstruction: string
  taskPrompt: string
  outputFormat: string
  defaultSystemInstruction: string
  defaultTaskPrompt: string
  defaultOutputFormat: string
  isActive: boolean
  version: number
  updatedBy: string | null
  createdAt: Date
  updatedAt: Date
}

/** 생성 옵션 */
export interface GenerateOptions {
  systemInstruction?: string
  maxRetries?: number
}

/** 스트리밍 청크 */
export interface StreamChunk {
  type: 'text' | 'error' | 'done'
  content: string
}
