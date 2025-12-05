// packages/ai-core/src/prompt-service.ts
// AI 프롬프트 관리 서비스 - Prisma 주입 방식

import type { PrismaClientLike, PromptRecord, PromptData } from './types'

// 메모리 캐시 (5분 TTL)
const promptCache = new Map<string, { data: PromptRecord; expires: number }>()
const DEFAULT_CACHE_TTL = 5 * 60 * 1000 // 5분

/** 프롬프트 서비스 클래스 - Prisma 주입 기반 */
export class PromptService {
  private prisma: PrismaClientLike
  private cacheTTL: number
  private useCache: boolean

  constructor(options: {
    prisma: PrismaClientLike
    cacheTTL?: number
    useCache?: boolean
  }) {
    this.prisma = options.prisma
    this.cacheTTL = options.cacheTTL ?? DEFAULT_CACHE_TTL
    this.useCache = options.useCache ?? true
  }

  /**
   * 프롬프트 키로 조회 (캐싱 포함)
   */
  async getPrompt(key: string): Promise<PromptRecord | null> {
    // 캐시 확인
    if (this.useCache) {
      const cached = promptCache.get(key)
      if (cached && cached.expires > Date.now()) {
        return cached.data
      }
    }

    // DB 조회
    const prompt = await this.prisma.aIPrompt.findUnique({
      where: { key, isActive: true },
    })

    if (prompt && this.useCache) {
      promptCache.set(key, {
        data: prompt,
        expires: Date.now() + this.cacheTTL,
      })
    }

    return prompt
  }

  /**
   * 프롬프트 키로 시스템 인스트럭션 조회
   */
  async getSystemInstruction(key: string): Promise<string> {
    const prompt = await this.getPrompt(key)
    return prompt?.systemInstruction ?? ''
  }

  /**
   * 프롬프트 키로 태스크 프롬프트 조회
   */
  async getTaskPrompt(key: string): Promise<string> {
    const prompt = await this.getPrompt(key)
    return prompt?.taskPrompt ?? ''
  }

  /**
   * 전체 프롬프트 내용 조회 (시스템 + 태스크 + 출력형식)
   */
  async getFullPrompt(key: string): Promise<PromptData> {
    const prompt = await this.getPrompt(key)
    return {
      key,
      systemInstruction: prompt?.systemInstruction ?? '',
      taskPrompt: prompt?.taskPrompt ?? '',
      outputFormat: prompt?.outputFormat ?? '',
    }
  }

  /**
   * 카테고리별 프롬프트 목록 조회
   */
  async getPromptsByCategory(category: string): Promise<PromptRecord[]> {
    return this.prisma.aIPrompt.findMany({
      where: { category, isActive: true },
      orderBy: { name: 'asc' },
    })
  }

  /**
   * 모든 활성 프롬프트 조회
   */
  async getAllPrompts(): Promise<PromptRecord[]> {
    return this.prisma.aIPrompt.findMany({
      where: { isActive: true },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    })
  }

  /**
   * 프롬프트 업데이트
   */
  async updatePrompt(
    key: string,
    data: {
      systemInstruction?: string
      taskPrompt?: string
      outputFormat?: string
      name?: string
      description?: string
    },
    updatedBy?: string
  ): Promise<PromptRecord> {
    // 캐시 무효화
    this.invalidateCache(key)

    return this.prisma.aIPrompt.update({
      where: { key },
      data: {
        ...data,
        updatedBy,
        version: { increment: 1 },
      },
    })
  }

  /**
   * 프롬프트 기본값으로 복원
   */
  async resetPromptToDefault(
    key: string,
    updatedBy?: string
  ): Promise<PromptRecord> {
    // 캐시 무효화
    this.invalidateCache(key)

    const prompt = await this.prisma.aIPrompt.findUnique({ where: { key } })
    if (!prompt) {
      throw new Error(`Prompt not found: ${key}`)
    }

    return this.prisma.aIPrompt.update({
      where: { key },
      data: {
        systemInstruction: prompt.defaultSystemInstruction,
        taskPrompt: prompt.defaultTaskPrompt,
        outputFormat: prompt.defaultOutputFormat,
        updatedBy,
        version: { increment: 1 },
      },
    })
  }

  /**
   * 특정 프롬프트 캐시 무효화
   */
  invalidateCache(key: string): void {
    promptCache.delete(key)
  }

  /**
   * 캐시 전체 무효화
   */
  clearCache(): void {
    promptCache.clear()
  }
}

// 싱글턴 인스턴스 (호스트 앱에서 설정)
let defaultService: PromptService | null = null

/** 기본 프롬프트 서비스 설정 */
export function initPromptService(prisma: PrismaClientLike): PromptService {
  defaultService = new PromptService({ prisma })
  return defaultService
}

/** 기본 프롬프트 서비스 가져오기 */
export function getPromptService(): PromptService {
  if (!defaultService) {
    throw new Error(
      'PromptService가 초기화되지 않았습니다. initPromptService()를 먼저 호출하세요.'
    )
  }
  return defaultService
}

// 프롬프트 키 상수
export const PROMPT_KEYS = {
  CHAT_SYSTEM: 'chat_system',
  CLAIM_REFINER: 'claim_refiner',
  BLOG_GENERATOR: 'blog_generator',
  INTRO_GENERATOR: 'intro_generator',
  IMAGE_ANALYZER: 'image_analyzer',
} as const

export type PromptKey = (typeof PROMPT_KEYS)[keyof typeof PROMPT_KEYS]

/** 편의 함수들 - 기본 서비스 사용 */
export async function getPrompt(key: string): Promise<PromptRecord | null> {
  return getPromptService().getPrompt(key)
}

export async function getSystemInstruction(key: string): Promise<string> {
  return getPromptService().getSystemInstruction(key)
}

export async function getTaskPrompt(key: string): Promise<string> {
  return getPromptService().getTaskPrompt(key)
}

export async function getFullPrompt(key: string): Promise<PromptData> {
  return getPromptService().getFullPrompt(key)
}

export function clearPromptCache(): void {
  if (defaultService) {
    defaultService.clearCache()
  }
}

export function invalidatePromptCache(key: string): void {
  if (defaultService) {
    defaultService.invalidateCache(key)
  }
}
