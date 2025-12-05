// packages/ai-rag-kit/src/crawler/web-clipper.ts
// defuddle 기반 웹 클리퍼 - URL을 깔끔한 마크다운으로 변환

import Defuddle from 'defuddle'
import { JSDOM } from 'jsdom'

import type { ClipOptions, ClipResult } from '../types'

export type { ClipOptions, ClipResult }

/**
 * URL에서 콘텐츠를 클리핑하여 마크다운으로 변환
 */
export async function clipWebPage(
  url: string,
  options: ClipOptions = {}
): Promise<ClipResult> {
  const { timeout = 10000 } = options

  console.log(`[웹 클리퍼] 크롤링 시작: ${url}`)

  // 1. 웹페이지 fetch
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
      },
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      throw new Error(`HTTP 오류: ${response.status} ${response.statusText}`)
    }

    const html = await response.text()

    // 2. JSDOM으로 파싱
    const dom = new JSDOM(html, { url })

    // 3. Defuddle로 콘텐츠 추출
    const result = new Defuddle(dom.window.document).parse()

    if (!result || !result.content) {
      throw new Error('콘텐츠를 추출할 수 없습니다.')
    }

    // 4. HTML을 마크다운으로 변환
    const markdown = htmlToMarkdown(result.content, {
      includeImages: options.includeImages ?? false,
    })

    // 5. 최소 길이 검증 (기본 100자)
    const minLength = 100
    if (markdown.length < minLength) {
      throw new Error(`콘텐츠가 너무 짧습니다: ${markdown.length}자 (최소: ${minLength}자)`)
    }

    const wordCount = countWords(markdown)

    console.log(`[웹 클리퍼] 완료: ${result.title} (${wordCount}단어)`)

    return {
      title: result.title || 'Untitled',
      content: markdown,
      url,
      wordCount,
      publishedTime: result.published || undefined,
      author: result.author || undefined,
      siteName: result.site || undefined,
    }
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * HTML을 간단한 마크다운으로 변환
 */
function htmlToMarkdown(
  html: string,
  options: { includeImages?: boolean } = {}
): string {
  const { includeImages = false } = options

  let text = html

  // 스크립트, 스타일 제거
  text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')

  // 헤딩 변환
  text = text.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n# $1\n')
  text = text.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n## $1\n')
  text = text.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n### $1\n')
  text = text.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '\n#### $1\n')
  text = text.replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, '\n##### $1\n')
  text = text.replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, '\n###### $1\n')

  // 문단
  text = text.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '\n$1\n')

  // 줄바꿈
  text = text.replace(/<br\s*\/?>/gi, '\n')

  // 리스트
  text = text.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '- $1\n')
  text = text.replace(/<ul[^>]*>|<\/ul>/gi, '\n')
  text = text.replace(/<ol[^>]*>|<\/ol>/gi, '\n')

  // 강조
  text = text.replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, '**$1**')
  text = text.replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, '**$1**')
  text = text.replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, '*$1*')
  text = text.replace(/<i[^>]*>([\s\S]*?)<\/i>/gi, '*$1*')

  // 링크 텍스트만
  text = text.replace(/<a[^>]*>([\s\S]*?)<\/a>/gi, '$1')

  // 이미지 처리
  if (includeImages) {
    text = text.replace(/<img[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*\/?>/gi, '![$2]($1)')
    text = text.replace(/<img[^>]*src="([^"]*)"[^>]*\/?>/gi, '![]($1)')
  } else {
    text = text.replace(/<img[^>]*\/?>/gi, '')
  }

  // 나머지 태그 제거
  text = text.replace(/<[^>]+>/g, '')

  // HTML 엔티티 디코딩
  text = decodeHtmlEntities(text)

  // 연속 공백/줄바꿈 정리
  text = text.replace(/\n{3,}/g, '\n\n')
  text = text.replace(/[ \t]+/g, ' ')

  return text.trim()
}

/**
 * HTML 엔티티 디코딩
 */
function decodeHtmlEntities(text: string): string {
  const entities: Record<string, string> = {
    '&nbsp;': ' ',
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&ndash;': '–',
    '&mdash;': '—',
    '&hellip;': '…',
  }

  let result = text
  for (const [entity, char] of Object.entries(entities)) {
    result = result.replace(new RegExp(entity, 'g'), char)
  }

  // 숫자 엔티티
  result = result.replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)))
  result = result.replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))

  return result
}

/**
 * 단어 수 계산 (한글 + 영문)
 */
function countWords(text: string): number {
  // 한글은 글자 수, 영문은 단어 수로 계산
  const korean = (text.match(/[가-힣]/g) || []).length
  const english = (text.match(/[a-zA-Z]+/g) || []).length
  return korean + english
}

/**
 * 여러 URL 배치 클리핑
 */
export async function clipMultiplePages(
  urls: string[],
  options: ClipOptions = {}
): Promise<{ success: ClipResult[]; failed: Array<{ url: string; error: string }> }> {
  const success: ClipResult[] = []
  const failed: Array<{ url: string; error: string }> = []

  for (const url of urls) {
    try {
      const result = await clipWebPage(url, options)
      success.push(result)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`[웹 클리퍼] 실패: ${url} - ${message}`)
      failed.push({ url, error: message })
    }

    // 요청 간 딜레이 (rate limiting 방지)
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }

  return { success, failed }
}
