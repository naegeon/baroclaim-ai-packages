// packages/ai-rag-kit/src/crawler/chunk-strategy.ts
// RAG 검색 품질을 위한 청크 분할 전략

import type { Chunk, ChunkOptions } from '../types'

export type { Chunk, ChunkOptions }

/** 기본 청크 설정 (한국어 기준) */
export const CHUNK_DEFAULTS = {
  /** 청크 크기 (글자 수) - 한국어 기준 약 2-3 문단 */
  CHUNK_SIZE: 1000,
  /** 오버랩 크기 (글자 수) - 약 20% */
  OVERLAP_SIZE: 200,
  /** 최소 청크 크기 - 너무 작은 청크 방지 */
  MIN_CHUNK_SIZE: 100,
} as const

/**
 * 문단 경계 찾기 (우선순위: 빈 줄 > 문장 끝 > 공백)
 */
function findSplitPoint(text: string, targetPosition: number, searchRange: number = 100): number {
  const start = Math.max(0, targetPosition - searchRange)
  const end = Math.min(text.length, targetPosition + searchRange)
  const searchText = text.slice(start, end)

  // 1. 빈 줄 (문단 경계) 찾기
  const paragraphBreak = searchText.lastIndexOf('\n\n')
  if (paragraphBreak !== -1) {
    return start + paragraphBreak + 2 // 빈 줄 다음부터
  }

  // 2. 줄바꿈 찾기
  const lineBreak = searchText.lastIndexOf('\n')
  if (lineBreak !== -1) {
    return start + lineBreak + 1
  }

  // 3. 문장 끝 찾기 (마침표, 물음표, 느낌표 + 공백)
  const sentenceEnd = searchText.search(/[.!?。]\s/)
  if (sentenceEnd !== -1) {
    return start + sentenceEnd + 2
  }

  // 4. 한국어 문장 끝 (마침표 + 공백 또는 줄바꿈)
  const koreanSentenceEnd = searchText.search(/[.!?。](?=\s|$)/)
  if (koreanSentenceEnd !== -1) {
    return start + koreanSentenceEnd + 1
  }

  // 5. 공백에서 분할
  const space = searchText.lastIndexOf(' ')
  if (space !== -1) {
    return start + space + 1
  }

  // 6. 분할점을 찾지 못하면 정확한 위치에서 분할
  return targetPosition
}

/**
 * 텍스트를 청크로 분할
 *
 * 분할 우선순위:
 * 1. 문단 경계 (빈 줄)
 * 2. 줄바꿈
 * 3. 문장 끝 (마침표 등)
 * 4. 공백
 *
 * @param text 분할할 텍스트
 * @param options 청크 옵션
 * @returns 청크 배열
 */
export function splitIntoChunks(text: string, options: ChunkOptions = {}): Chunk[] {
  const {
    chunkSize = CHUNK_DEFAULTS.CHUNK_SIZE,
    overlapSize = CHUNK_DEFAULTS.OVERLAP_SIZE,
  } = options
  const minChunkSize = CHUNK_DEFAULTS.MIN_CHUNK_SIZE

  // 빈 텍스트 처리
  if (!text || text.trim().length === 0) {
    return []
  }

  // 텍스트가 청크 크기보다 작으면 단일 청크
  if (text.length <= chunkSize) {
    return [
      {
        index: 0,
        content: text.trim(),
        startOffset: 0,
        endOffset: text.length,
      },
    ]
  }

  const chunks: Chunk[] = []
  let currentPosition = 0
  let chunkIndex = 0

  while (currentPosition < text.length) {
    // 다음 청크의 대략적 끝 위치
    const targetEnd = currentPosition + chunkSize

    // 텍스트 끝에 도달
    if (targetEnd >= text.length) {
      const remaining = text.slice(currentPosition).trim()
      if (remaining.length >= minChunkSize) {
        chunks.push({
          index: chunkIndex,
          content: remaining,
          startOffset: currentPosition,
          endOffset: text.length,
        })
      } else if (chunks.length > 0) {
        // 마지막 청크와 합치기
        const lastChunk = chunks[chunks.length - 1]
        if (lastChunk) {
          lastChunk.content = lastChunk.content + ' ' + remaining
          lastChunk.endOffset = text.length
        }
      }
      break
    }

    // 분할 지점 찾기
    const splitPoint = findSplitPoint(text, targetEnd)
    const chunkContent = text.slice(currentPosition, splitPoint).trim()

    // 청크 추가
    if (chunkContent.length >= minChunkSize) {
      chunks.push({
        index: chunkIndex,
        content: chunkContent,
        startOffset: currentPosition,
        endOffset: splitPoint,
      })
      chunkIndex++
    }

    // 다음 청크 시작 위치 (오버랩 적용)
    const nextStart = splitPoint - overlapSize
    currentPosition = Math.max(nextStart, currentPosition + 1) // 무한 루프 방지
  }

  console.log(
    `[청크 분할] ${text.length}자 → ${chunks.length}개 청크 (평균 ${Math.round(text.length / chunks.length)}자)`
  )

  return chunks
}

/**
 * 청크 통계 계산
 */
export function getChunkStats(chunks: Chunk[]): {
  count: number
  totalLength: number
  avgLength: number
  minLength: number
  maxLength: number
} {
  if (chunks.length === 0) {
    return { count: 0, totalLength: 0, avgLength: 0, minLength: 0, maxLength: 0 }
  }

  const lengths = chunks.map((c) => c.content.length)
  const totalLength = lengths.reduce((a, b) => a + b, 0)

  return {
    count: chunks.length,
    totalLength,
    avgLength: Math.round(totalLength / chunks.length),
    minLength: Math.min(...lengths),
    maxLength: Math.max(...lengths),
  }
}

/**
 * 마크다운 콘텐츠를 의미 단위로 분할
 * 헤딩을 기준으로 섹션을 분리한 후 청크 분할
 */
export function splitMarkdownIntoChunks(
  markdown: string,
  options: ChunkOptions = {}
): Chunk[] {
  // 헤딩으로 섹션 분리 (##, ###, #### 등)
  const sections = markdown.split(/(?=^#{1,4}\s)/m)

  const allChunks: Chunk[] = []
  let globalIndex = 0
  let currentPosition = 0

  for (const section of sections) {
    if (section.trim().length === 0) continue

    // 각 섹션을 청크로 분할
    const sectionChunks = splitIntoChunks(section, options)

    // 전역 인덱스와 위치 조정
    for (const chunk of sectionChunks) {
      allChunks.push({
        ...chunk,
        index: globalIndex++,
        startOffset: currentPosition + chunk.startOffset,
        endOffset: currentPosition + chunk.endOffset,
      })
    }

    currentPosition += section.length
  }

  return allChunks
}
