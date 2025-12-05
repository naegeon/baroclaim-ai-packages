// packages/ai-rag-kit/src/generator/post-processor.ts
// AI 생성 콘텐츠 후처리 - 인용문구 제거

import type { PostProcessOptions, TipTapContent, TipTapNode } from '../types'

export type { PostProcessOptions, TipTapContent, TipTapNode }

/** 인용 패턴 정규식 목록 */
const CITATION_PATTERNS: RegExp[] = [
  // 금융감독원 관련
  /금융감독원\s*(자료|보도자료|발표|통계|조사)에\s*(의하면|따르면|서)/g,
  /금감원\s*(자료|보도자료|발표)에\s*(의하면|따르면)/g,

  // 일반 출처 표현
  /참고\s*자료에\s*(의하면|따르면|서)/g,
  /자료에서\s*(확인|알\s*수|볼\s*수)/g,
  /(해당|이|관련)\s*자료에\s*(의하면|따르면)/g,

  // ~에 따르면/의하면 패턴
  /[가-힣]+에\s*(의하면|따르면),?\s*/g,

  // 출처 표기
  /\[출처[^\]]*\]/g,
  /\(출처:[^)]*\)/g,
  /\(자료:[^)]*\)/g,
  /【[^】]*출처[^】]*】/g,

  // 참조 표현
  /위\s*자료에\s*(따르면|의하면)/g,
  /상기\s*자료에\s*(따르면|의하면)/g,
  /앞서\s*언급한\s*자료/g,

  // RAG 관련 표현
  /참고자료\s*\d*에\s*(따르면|의하면)/g,
  /\[참고자료\s*\d*\]/g,
]

/** 정리가 필요한 패턴 */
const CLEANUP_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  // 이중 공백 정리
  { pattern: /\s{2,}/g, replacement: ' ' },
  // 문장 시작 공백 정리
  { pattern: /^\s+/gm, replacement: '' },
  // 연속 마침표 정리
  { pattern: /\.{2,}/g, replacement: '.' },
  // 쉼표 후 마침표 정리
  { pattern: /,\s*\./g, replacement: '.' },
]

/**
 * 텍스트에서 인용문구 제거
 */
export function removeCitations(text: string): string {
  let result = text

  // 인용 패턴 제거
  for (const pattern of CITATION_PATTERNS) {
    result = result.replace(pattern, '')
  }

  // 정리
  for (const { pattern, replacement } of CLEANUP_PATTERNS) {
    result = result.replace(pattern, replacement)
  }

  return result.trim()
}

/**
 * TipTap 노드에서 텍스트 처리
 */
function processNode(node: TipTapNode): TipTapNode {
  // 텍스트 노드인 경우 인용문구 제거
  if (node.text) {
    return {
      ...node,
      text: removeCitations(node.text),
    }
  }

  // 자식 노드가 있는 경우 재귀 처리
  if (node.content) {
    return {
      ...node,
      content: node.content
        .map(processNode)
        .filter((n) => {
          // 빈 텍스트 노드 제거
          if (n.text !== undefined && n.text.trim() === '') {
            return false
          }
          return true
        }),
    }
  }

  return node
}

/**
 * TipTap 콘텐츠에서 인용문구 제거
 */
export function removeCitationsFromContent(content: TipTapContent): TipTapContent {
  if (!content.content) {
    return content
  }

  return {
    type: 'doc',
    content: content.content.map(processNode),
  }
}

/**
 * 콘텐츠 후처리 통합 함수
 */
export function postProcessContent(
  content: TipTapContent,
  options: PostProcessOptions = {}
): TipTapContent {
  const { removeCitations: shouldRemoveCitations = true } = options

  let result = content

  if (shouldRemoveCitations) {
    result = removeCitationsFromContent(result)
  }

  return result
}
