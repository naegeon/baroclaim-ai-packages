// packages/ai-rag-kit/src/rag/file-search.ts
// Google File Search API 연동 (텍스트/PDF용 RAG)
// ai-core의 GeminiClient를 주입받아 사용

import type { GeminiClientLike } from '../types'

/** File Search 서비스 팩토리 */
export interface FileSearchServiceOptions {
  /** Gemini 클라이언트 */
  geminiClient: GeminiClientLike
  /** File Search Store 이름 */
  storeName?: string
}

/**
 * File Search 서비스 클래스
 * Google File Search API를 사용한 RAG 검색
 */
export class FileSearchService {
  private client: GeminiClientLike
  private storeName: string

  constructor(options: FileSearchServiceOptions) {
    this.client = options.geminiClient
    this.storeName = options.storeName || 'rag-kit-knowledge-base'
  }

  /**
   * File Search를 사용하여 RAG 검색 + 응답 생성
   */
  async searchAndGenerate(
    query: string,
    options: {
      systemInstruction?: string
    } = {}
  ): Promise<{
    answer: string
    sources: Array<{ title: string; snippet: string }>
  }> {
    const { systemInstruction } = options

    // ai-core의 generateWithFallback 사용
    const answer = await this.client.generateWithFallback(query, {
      systemInstruction: systemInstruction || `
당신은 지식베이스를 기반으로 질문에 답변하는 AI 어시스턴트입니다.
주어진 참고 자료를 바탕으로 정확하고 유용한 답변을 제공하세요.
출처를 명시적으로 언급하지 마세요.
      `.trim(),
    })

    // 참조 소스는 별도로 추출해야 함 (File Search 사용 시)
    // 현재는 빈 배열 반환 (실제 구현에서는 groundingMetadata에서 추출)
    const sources: Array<{ title: string; snippet: string }> = []

    return { answer, sources }
  }

  /**
   * 텍스트를 지식베이스에 업로드
   * Note: 실제 File Search Store 업로드는 호스트 앱에서 처리해야 함
   */
  async uploadText(
    content: string,
    displayName: string
  ): Promise<{ success: boolean; name: string }> {
    console.log(`[File Search] 업로드 요청: ${displayName}`)
    console.log(`[File Search] 콘텐츠 길이: ${content.length}자`)

    // 실제 업로드는 호스트 앱에서 처리
    // 패키지에서는 인터페이스만 제공
    return {
      success: true,
      name: `${this.storeName}/${displayName}`,
    }
  }

  /** Store 이름 반환 */
  getStoreName(): string {
    return this.storeName
  }
}

/**
 * File Search 서비스 생성 함수
 */
export function createFileSearchService(
  options: FileSearchServiceOptions
): FileSearchService {
  return new FileSearchService(options)
}
