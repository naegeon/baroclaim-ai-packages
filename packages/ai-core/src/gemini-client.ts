// packages/ai-core/src/gemini-client.ts
// Gemini API 클라이언트 - 6가지 폴백 시스템 (3키 × 2모델)
// 설정 주입 방식으로 재사용 가능하게 설계

import { GoogleGenAI } from '@google/genai'

import type {
  GeminiModel,
  KeyModelStatus,
  AICoreConfig,
  GenerateOptions,
} from './types'

// 모델 티어 정의
export const MODEL_TIERS = {
  PRO: 'gemini-2.5-pro' as const,
  FLASH: 'gemini-2.5-flash' as const,
}

/** GeminiClient 클래스 - 설정 주입 기반 */
export class GeminiClient {
  private apiKeys: string[]
  private keyModelStatuses: KeyModelStatus[]
  private clientCache = new Map<string, GoogleGenAI>()

  constructor(config: AICoreConfig) {
    this.apiKeys = config.apiKeys.filter((key) => Boolean(key))

    if (this.apiKeys.length === 0) {
      throw new Error('최소 하나의 API 키가 필요합니다.')
    }

    // 6가지 조합 상태 초기화 (1군 Pro 3개 + 2군 Flash 3개)
    this.keyModelStatuses = [
      // 1군: Pro (우선 사용)
      ...this.apiKeys.map((key) => ({
        key,
        model: MODEL_TIERS.PRO,
        tier: 1 as const,
        available: true,
        errorCount: 0,
      })),
      // 2군: Flash (Pro 실패 시 폴백)
      ...this.apiKeys.map((key) => ({
        key,
        model: MODEL_TIERS.FLASH,
        tier: 2 as const,
        available: true,
        errorCount: 0,
      })),
    ]
  }

  /** 사용 가능한 키+모델 조합 선택 */
  private selectAvailableKeyModel(
    preferredTier?: 1 | 2
  ): KeyModelStatus | null {
    const tier1 = this.keyModelStatuses.filter(
      (s) => s.tier === 1 && s.available && s.errorCount < 3
    )
    const tier2 = this.keyModelStatuses.filter(
      (s) => s.tier === 2 && s.available && s.errorCount < 3
    )

    let candidates: KeyModelStatus[] = []

    if (preferredTier === 1) {
      candidates = tier1
    } else if (preferredTier === 2) {
      candidates = tier2
    } else {
      candidates = tier1.length > 0 ? tier1 : tier2
    }

    if (candidates.length === 0) {
      if (tier1.length === 0 && tier2.length === 0) {
        this.keyModelStatuses.forEach((s) => {
          s.errorCount = 0
          s.available = true
        })
        return this.keyModelStatuses[0] ?? null
      }
      return null
    }

    // 라운드 로빈: 가장 오래 안 쓴 것 선택
    candidates.sort((a, b) => {
      const aTime = a.lastUsed?.getTime() ?? 0
      const bTime = b.lastUsed?.getTime() ?? 0
      return aTime - bTime
    })

    return candidates[0] ?? null
  }

  /** 키+모델 사용 기록 */
  private markKeyModelUsed(key: string, model: GeminiModel): void {
    const status = this.keyModelStatuses.find(
      (s) => s.key === key && s.model === model
    )
    if (status) {
      status.lastUsed = new Date()
    }
  }

  /** 키+모델 에러 기록 */
  private markKeyModelError(key: string, model: GeminiModel): void {
    const status = this.keyModelStatuses.find(
      (s) => s.key === key && s.model === model
    )
    if (status) {
      status.errorCount++
      if (status.errorCount >= 3) {
        status.available = false
        // 5분 후 복구
        setTimeout(() => {
          status.available = true
          status.errorCount = 0
        }, 5 * 60 * 1000)
      }
    }
  }

  /** GoogleGenAI 클라이언트 가져오기 */
  private getClient(apiKey: string): GoogleGenAI {
    let client = this.clientCache.get(apiKey)
    if (!client) {
      client = new GoogleGenAI({ apiKey })
      this.clientCache.set(apiKey, client)
    }
    return client
  }

  /**
   * 6가지 폴백이 포함된 콘텐츠 생성
   * 1군(Pro) 3개 → 2군(Flash) 3개 순서로 시도
   */
  async generateWithFallback(
    prompt: string,
    options: GenerateOptions = {}
  ): Promise<string> {
    const { systemInstruction, maxRetries = 6 } = options

    let lastError: Error | null = null
    const triedCombos = new Set<string>()
    let currentTier: 1 | 2 = 1

    for (let i = 0; i < maxRetries; i++) {
      const keyModel = this.selectAvailableKeyModel(currentTier)

      if (!keyModel) {
        if (currentTier === 1) {
          currentTier = 2
          continue
        }
        break
      }

      const comboKey = `${keyModel.key}-${keyModel.model}`
      if (triedCombos.has(comboKey)) {
        if (currentTier === 1) {
          currentTier = 2
          continue
        }
        break
      }

      triedCombos.add(comboKey)
      this.markKeyModelUsed(keyModel.key, keyModel.model)

      const tierLabel = keyModel.tier === 1 ? 'Pro' : 'Flash'
      console.log(
        `Gemini API 시도: ${tierLabel} (키 ${this.apiKeys.indexOf(keyModel.key) + 1})`
      )

      try {
        const client = this.getClient(keyModel.key)
        const response = await client.models.generateContent({
          model: keyModel.model,
          contents: prompt,
          config: systemInstruction ? { systemInstruction } : undefined,
        })

        const text = response.text

        if (!text) {
          throw new Error('빈 응답')
        }

        return text
      } catch (error) {
        this.markKeyModelError(keyModel.key, keyModel.model)
        lastError = error instanceof Error ? error : new Error(String(error))
        console.error(
          `Gemini API 오류 (${tierLabel} 키${this.apiKeys.indexOf(keyModel.key) + 1}):`,
          lastError.message
        )
      }
    }

    throw lastError ?? new Error('모든 API 키와 모델 조합이 실패했습니다.')
  }

  /**
   * 범용 6가지 폴백 실행 함수
   */
  async executeWithFallback<T>(
    operation: (client: GoogleGenAI, model: GeminiModel) => Promise<T>,
    options: { maxRetries?: number; preferredTier?: 1 | 2 } = {}
  ): Promise<T> {
    const { maxRetries = 6, preferredTier } = options

    let lastError: Error | null = null
    const triedCombos = new Set<string>()
    let currentTier: 1 | 2 = preferredTier ?? 1

    for (let i = 0; i < maxRetries; i++) {
      const keyModel = this.selectAvailableKeyModel(currentTier)

      if (!keyModel) {
        if (currentTier === 1 && !preferredTier) {
          currentTier = 2
          continue
        }
        break
      }

      const comboKey = `${keyModel.key}-${keyModel.model}`
      if (triedCombos.has(comboKey)) {
        if (currentTier === 1 && !preferredTier) {
          currentTier = 2
          continue
        }
        break
      }

      triedCombos.add(comboKey)
      this.markKeyModelUsed(keyModel.key, keyModel.model)

      try {
        const client = this.getClient(keyModel.key)
        return await operation(client, keyModel.model)
      } catch (error) {
        this.markKeyModelError(keyModel.key, keyModel.model)
        lastError = error instanceof Error ? error : new Error(String(error))
        const tierLabel = keyModel.tier === 1 ? 'Pro' : 'Flash'
        console.error(
          `Gemini API 오류 (${tierLabel} 키${this.apiKeys.indexOf(keyModel.key) + 1}):`,
          lastError.message
        )
      }
    }

    throw lastError ?? new Error('모든 API 키와 모델 조합이 실패했습니다.')
  }

  /**
   * 키만 폴백하는 실행 함수 (모델 고정)
   */
  async executeWithKeyFallback<T>(
    operation: (client: GoogleGenAI) => Promise<T>,
    maxRetries = 3
  ): Promise<T> {
    let lastError: Error | null = null
    const triedKeys = new Set<string>()

    for (let i = 0; i < maxRetries; i++) {
      const availableKeys = this.apiKeys.filter((key) => !triedKeys.has(key))
      if (availableKeys.length === 0) break

      const apiKey = availableKeys[0]
      if (!apiKey) break

      triedKeys.add(apiKey)

      try {
        const client = this.getClient(apiKey)
        return await operation(client)
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        console.error(
          `Gemini API 오류 (키 ${i + 1}/${this.apiKeys.length}):`,
          lastError.message
        )
      }
    }

    throw lastError ?? new Error('모든 API 키가 실패했습니다.')
  }

  /** API 키+모델 상태 조회 */
  getKeyModelStatuses(): Omit<KeyModelStatus, 'key'>[] {
    return this.keyModelStatuses.map((s) => ({
      model: s.model,
      tier: s.tier,
      available: s.available,
      errorCount: s.errorCount,
      lastUsed: s.lastUsed,
    }))
  }

  /** API 키 개수 */
  getKeyCount(): number {
    return this.apiKeys.length
  }
}

// 싱글턴 인스턴스 (환경변수 기반 - 기존 호환성)
let defaultClient: GeminiClient | null = null

/** 기본 클라이언트 가져오기 (환경변수 사용) */
export function getDefaultClient(): GeminiClient {
  if (!defaultClient) {
    const apiKeys = [
      process.env.GEMINI_API_KEY,
      process.env.GEMINI_API_KEY_2,
      process.env.GEMINI_API_KEY_3,
    ].filter((key): key is string => Boolean(key))

    if (apiKeys.length === 0) {
      throw new Error('GEMINI_API_KEY 환경변수가 설정되지 않았습니다.')
    }

    defaultClient = new GeminiClient({ apiKeys })
  }
  return defaultClient
}

/** 기존 호환성을 위한 함수들 */
export async function generateWithFallback(
  prompt: string,
  options: GenerateOptions = {}
): Promise<string> {
  return getDefaultClient().generateWithFallback(prompt, options)
}

export async function executeWithFallback<T>(
  operation: (client: GoogleGenAI, model: GeminiModel) => Promise<T>,
  options: { maxRetries?: number; preferredTier?: 1 | 2 } = {}
): Promise<T> {
  return getDefaultClient().executeWithFallback(operation, options)
}

export async function executeWithKeyFallback<T>(
  operation: (client: GoogleGenAI) => Promise<T>,
  maxRetries = 3
): Promise<T> {
  return getDefaultClient().executeWithKeyFallback(operation, maxRetries)
}

export function getKeyModelStatuses(): Omit<KeyModelStatus, 'key'>[] {
  return getDefaultClient().getKeyModelStatuses()
}

export function hasAvailableKeys(): boolean {
  try {
    return getDefaultClient().getKeyCount() > 0
  } catch {
    return false
  }
}

export function getGeminiClient(): GoogleGenAI | null {
  try {
    // 기본 클라이언트가 있는지 확인 (API 키 유효성 검사)
    getDefaultClient()
    // 첫 번째 API 키로 클라이언트 생성
    return new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY ?? '',
    })
  } catch {
    return null
  }
}
