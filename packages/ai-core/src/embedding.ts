// packages/ai-core/src/embedding.ts
// 임베딩 생성 (Gemini Embedding API)
// 3키 폴백 시스템 적용 (임베딩은 모델 고정)

import { executeWithKeyFallback, GeminiClient } from './gemini-client'

// 임베딩 모델 (고정)
const EMBEDDING_MODEL = 'gemini-embedding-001'

/**
 * 텍스트를 벡터로 임베딩 (기본 클라이언트 사용)
 * Gemini gemini-embedding-001 모델 사용 (통합 임베딩 모델)
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  if (!text.trim()) {
    throw new Error('임베딩할 텍스트가 비어있습니다.')
  }

  return executeWithKeyFallback(async (client) => {
    const result = await client.models.embedContent({
      model: EMBEDDING_MODEL,
      contents: text,
    })

    const embedding = result.embeddings?.[0]?.values

    if (!embedding || !embedding.length) {
      throw new Error('임베딩 생성 실패')
    }

    return embedding
  })
}

/**
 * 클라이언트를 지정하여 텍스트를 벡터로 임베딩
 */
export async function generateEmbeddingWithClient(
  client: GeminiClient,
  text: string
): Promise<number[]> {
  if (!text.trim()) {
    throw new Error('임베딩할 텍스트가 비어있습니다.')
  }

  return client.executeWithKeyFallback(async (genaiClient) => {
    const result = await genaiClient.models.embedContent({
      model: EMBEDDING_MODEL,
      contents: text,
    })

    const embedding = result.embeddings?.[0]?.values

    if (!embedding || !embedding.length) {
      throw new Error('임베딩 생성 실패')
    }

    return embedding
  })
}

/**
 * 여러 텍스트를 배치로 임베딩
 */
export async function generateEmbeddings(
  texts: string[]
): Promise<number[][]> {
  const results = await Promise.all(
    texts.map((text) => generateEmbedding(text))
  )
  return results
}

/**
 * 클라이언트를 지정하여 여러 텍스트를 배치로 임베딩
 */
export async function generateEmbeddingsWithClient(
  client: GeminiClient,
  texts: string[]
): Promise<number[][]> {
  const results = await Promise.all(
    texts.map((text) => generateEmbeddingWithClient(client, text))
  )
  return results
}

/**
 * 벡터 배열을 PostgreSQL 형식 문자열로 변환
 */
export function vectorToString(vector: number[]): string {
  return `[${vector.join(',')}]`
}

/** 임베딩 모델 상수 export */
export { EMBEDDING_MODEL }
