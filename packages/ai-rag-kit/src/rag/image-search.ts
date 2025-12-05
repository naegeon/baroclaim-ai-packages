// packages/ai-rag-kit/src/rag/image-search.ts
// pgvector 기반 이미지 시맨틱 검색

import type {
  GeminiClientLike,
  ImageSearchResult,
  PrismaClientLike,
} from '../types'

/** 이미지 검색 서비스 옵션 */
export interface ImageSearchServiceOptions {
  /** Prisma 클라이언트 */
  prisma: PrismaClientLike
  /** Gemini 클라이언트 (임베딩용) */
  geminiClient: GeminiClientLike
}

/**
 * 이미지 검색 서비스 클래스
 * pgvector 코사인 유사도 검색
 */
export class ImageSearchService {
  private prisma: PrismaClientLike
  private geminiClient: GeminiClientLike

  constructor(options: ImageSearchServiceOptions) {
    this.prisma = options.prisma
    this.geminiClient = options.geminiClient
  }

  /**
   * 이미지 검색 (pgvector 코사인 유사도)
   */
  async searchImages(
    query: string,
    options: {
      limit?: number
      category?: string
      minSimilarity?: number
    } = {}
  ): Promise<ImageSearchResult[]> {
    const { limit = 5, category, minSimilarity = 0.4 } = options

    if (!query.trim()) {
      return []
    }

    try {
      // 쿼리 텍스트를 벡터로 변환
      const queryEmbedding = await this.geminiClient.generateEmbedding(query)
      const vectorStr = this.vectorToString(queryEmbedding)

      // 카테고리 필터 조건
      const categoryFilter = category
        ? this.prisma.$queryRaw`AND category = ${category}`
        : this.prisma.$queryRaw``

      // pgvector 코사인 유사도 검색
      const results = await this.prisma.$queryRaw<
        Array<{
          id: string
          image_url: string
          description: string
          tags: string[]
          category: string
          suggested_title: string | null
          usage_context: string | null
          similarity: number
        }>
      >`
        SELECT
          id,
          image_url,
          description,
          tags,
          category,
          suggested_title,
          usage_context,
          1 - (embedding <=> ${vectorStr}::vector) as similarity
        FROM image_documents
        WHERE embedding IS NOT NULL
          AND 1 - (embedding <=> ${vectorStr}::vector) > ${minSimilarity}
          ${categoryFilter}
        ORDER BY embedding <=> ${vectorStr}::vector
        LIMIT ${limit}
      `

      return results.map((r) => ({
        id: r.id,
        imageUrl: r.image_url,
        description: r.description,
        tags: r.tags,
        category: r.category,
        suggestedTitle: r.suggested_title,
        usageContext: r.usage_context,
        similarity: Number(r.similarity),
      }))
    } catch (error) {
      console.error('이미지 RAG 검색 오류:', error)
      return []
    }
  }

  /**
   * 문단/섹션에 적합한 이미지 검색
   * 블로그 본문의 각 섹션에 이미지를 삽입할 때 사용
   */
  async searchImagesForParagraph(
    paragraphText: string,
    options: {
      limit?: number
      minSimilarity?: number
    } = {}
  ): Promise<ImageSearchResult[]> {
    const { limit = 1, minSimilarity = 0.35 } = options

    if (!paragraphText.trim() || paragraphText.length < 20) {
      return []
    }

    // 핵심 키워드 추출 (처음 150자 정도)
    const queryText = paragraphText.slice(0, 150)

    try {
      return await this.searchImages(queryText, { limit, minSimilarity })
    } catch (error) {
      console.warn('문단 이미지 검색 오류:', error)
      return []
    }
  }

  /**
   * 이미지 문서 추가 (분석 결과 + 임베딩)
   */
  async addImageDocument(
    imageUrl: string,
    description: string,
    tags: string[],
    category: string,
    suggestedTitle: string,
    uploadedBy: string,
    usageContext?: string
  ): Promise<string> {
    // 설명 텍스트로 임베딩 생성
    const embeddingText = `${suggestedTitle}. ${description}. 태그: ${tags.join(', ')}`
    const embedding = await this.geminiClient.generateEmbedding(embeddingText)
    const vectorStr = this.vectorToString(embedding)

    // 문서 저장 (임베딩 포함)
    const result = await this.prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO image_documents (
        id, image_url, description, tags, category,
        suggested_title, usage_context, embedding, uploaded_by, created_at
      )
      VALUES (
        gen_random_uuid(),
        ${imageUrl},
        ${description},
        ${tags}::text[],
        ${category},
        ${suggestedTitle},
        ${usageContext || null},
        ${vectorStr}::vector,
        ${uploadedBy},
        NOW()
      )
      RETURNING id
    `

    const firstResult = result[0]
    if (!firstResult) {
      throw new Error('이미지 문서 저장 실패')
    }
    return firstResult.id
  }

  /**
   * 벡터를 PostgreSQL 형식 문자열로 변환
   */
  private vectorToString(vector: number[]): string {
    return `[${vector.join(',')}]`
  }
}

/**
 * 이미지 검색 서비스 생성 함수
 */
export function createImageSearchService(
  options: ImageSearchServiceOptions
): ImageSearchService {
  return new ImageSearchService(options)
}

export type { ImageSearchResult }
