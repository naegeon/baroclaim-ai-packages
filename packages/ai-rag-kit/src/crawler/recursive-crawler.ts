// packages/ai-rag-kit/src/crawler/recursive-crawler.ts
// 재귀 크롤러 - 내부 링크 따라가며 사이트 전체 크롤링 + 폴백 시스템

import Defuddle from 'defuddle'
import { JSDOM } from 'jsdom'

import type {
  ClipResult,
  RecursiveCrawlOptions,
  RecursiveCrawlResult,
  CrawlFailure,
  CrawlProgress,
  ExtractedLink,
} from '../types'

/** 내부 설정 타입 */
interface CrawlConfig extends RecursiveCrawlOptions {
  maxDepth: number
  maxPages: number
  sameDomainOnly: boolean
  delayBetweenRequests: number
  timeout: number
  useFallback: boolean
}

/** 기본 설정 */
const DEFAULTS: CrawlConfig = {
  maxDepth: 2,
  maxPages: 50,
  sameDomainOnly: true,
  delayBetweenRequests: 1000,
  timeout: 15000,
  useFallback: true,
}

/** 폴백 User-Agent 목록 */
const USER_AGENTS: readonly string[] = [
  // Chrome Windows
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  // Chrome Mac
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  // Firefox
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  // Mobile Chrome
  'Mozilla/5.0 (Linux; Android 10; SM-G981B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  // Googlebot
  'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
] as const

/**
 * 재귀적으로 사이트 크롤링
 * 시작 URL에서 내부 링크를 따라가며 페이지들을 수집
 */
export async function crawlRecursively(
  startUrl: string,
  options: RecursiveCrawlOptions = {}
): Promise<RecursiveCrawlResult> {
  const startTime = Date.now()
  const config: CrawlConfig = { ...DEFAULTS, ...options }

  const visited = new Set<string>()
  const queue: Array<{ url: string; depth: number }> = []
  const success: ClipResult[] = []
  const failed: CrawlFailure[] = []

  // 시작 URL의 도메인 추출
  const startDomain = extractDomain(startUrl)

  // 시작 URL을 큐에 추가
  queue.push({ url: normalizeUrl(startUrl), depth: 0 })

  console.log(`[재귀 크롤러] 시작: ${startUrl}`)
  console.log(`[재귀 크롤러] 설정: 깊이=${config.maxDepth}, 최대페이지=${config.maxPages}`)

  while (queue.length > 0 && success.length + failed.length < config.maxPages) {
    const { url, depth } = queue.shift()!

    // 이미 방문했거나 깊이 초과
    if (visited.has(url) || depth > config.maxDepth) {
      continue
    }

    // URL 필터링
    if (!shouldCrawl(url, startDomain, config)) {
      continue
    }

    visited.add(url)

    // 진행 상황 콜백
    if (config.onProgress) {
      const progress: CrawlProgress = {
        currentUrl: url,
        processedCount: success.length + failed.length,
        queueLength: queue.length,
        successCount: success.length,
        failedCount: failed.length,
        currentDepth: depth,
      }
      config.onProgress(progress)
    }

    // 크롤링 시도 (폴백 포함)
    const result = await crawlWithFallback(url, config)

    if (result.success && result.data) {
      success.push(result.data)
      console.log(`[재귀 크롤러] ✓ ${result.data.title} (깊이: ${depth})`)

      // 다음 깊이의 링크 추출 및 큐에 추가
      if (depth < config.maxDepth) {
        const links = result.extractedLinks || []
        for (const link of links) {
          const normalizedLink = normalizeUrl(link.url)
          if (!visited.has(normalizedLink)) {
            queue.push({ url: normalizedLink, depth: depth + 1 })
          }
        }
      }
    } else {
      failed.push({
        url,
        error: result.error || '알 수 없는 오류',
        attemptedStrategies: result.attemptedStrategies,
        depth,
      })
      console.log(`[재귀 크롤러] ✗ ${url} - ${result.error}`)
    }

    // 요청 간 딜레이
    if (queue.length > 0) {
      await delay(config.delayBetweenRequests)
    }
  }

  const totalTime = Date.now() - startTime

  console.log(`[재귀 크롤러] 완료: 성공=${success.length}, 실패=${failed.length}, 시간=${totalTime}ms`)

  return {
    success,
    failed,
    totalTime,
    visitedUrls: Array.from(visited),
  }
}

/** 폴백 전략을 사용한 크롤링 */
interface CrawlAttemptResult {
  success: boolean
  data?: ClipResult
  extractedLinks?: ExtractedLink[]
  error?: string
  attemptedStrategies: string[]
}

async function crawlWithFallback(
  url: string,
  config: CrawlConfig
): Promise<CrawlAttemptResult> {
  const attemptedStrategies: string[] = []

  // 폴백 전략 정의
  const strategies = [
    { name: 'default', headers: getHeaders(USER_AGENTS[0]!) },
    { name: 'chrome-mac', headers: getHeaders(USER_AGENTS[1]!) },
    { name: 'firefox', headers: getHeaders(USER_AGENTS[2]!) },
    { name: 'mobile', headers: getHeaders(USER_AGENTS[3]!) },
    { name: 'googlebot', headers: getHeaders(USER_AGENTS[4]!) },
  ]

  // 폴백 미사용 시 첫 번째 전략만
  const strategiesToTry = config.useFallback ? strategies : [strategies[0]!]

  for (const strategy of strategiesToTry) {
    const currentStrategy = strategy!
    attemptedStrategies.push(currentStrategy.name)

    try {
      const result = await attemptCrawl(url, {
        timeout: config.timeout,
        headers: { ...currentStrategy.headers, ...(config.headers || {}) },
        includeImages: config.includeImages,
      })

      return {
        success: true,
        data: result.clip,
        extractedLinks: result.links,
        attemptedStrategies,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.log(`[재귀 크롤러] 전략 '${currentStrategy.name}' 실패: ${message}`)

      // 마지막 전략이면 실패 반환
      if (strategy === strategiesToTry[strategiesToTry.length - 1]) {
        return {
          success: false,
          error: message,
          attemptedStrategies,
        }
      }

      // 다음 전략 시도 전 짧은 딜레이
      await delay(500)
    }
  }

  return {
    success: false,
    error: '모든 폴백 전략 실패',
    attemptedStrategies,
  }
}

/** 단일 크롤링 시도 */
async function attemptCrawl(
  url: string,
  options: { timeout: number; headers: Record<string, string>; includeImages?: boolean }
): Promise<{ clip: ClipResult; links: ExtractedLink[] }> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), options.timeout)

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: options.headers,
      redirect: 'follow',
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const contentType = response.headers.get('content-type') || ''
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      throw new Error(`HTML이 아님: ${contentType}`)
    }

    const html = await response.text()
    const dom = new JSDOM(html, { url })
    const document = dom.window.document

    // Defuddle로 콘텐츠 추출
    const result = new Defuddle(document).parse()

    if (!result || !result.content) {
      throw new Error('콘텐츠 추출 실패')
    }

    // 마크다운 변환
    const markdown = htmlToMarkdown(result.content, {
      includeImages: options.includeImages ?? false,
    })

    if (markdown.length < 100) {
      throw new Error(`콘텐츠 너무 짧음: ${markdown.length}자`)
    }

    // 링크 추출
    const links = extractLinks(document, url)

    const clip: ClipResult = {
      title: result.title || 'Untitled',
      content: markdown,
      url,
      wordCount: countWords(markdown),
      publishedTime: result.published || undefined,
      author: result.author || undefined,
      siteName: result.site || undefined,
    }

    return { clip, links }
  } finally {
    clearTimeout(timeoutId)
  }
}

/** 페이지에서 링크 추출 */
function extractLinks(document: Document, baseUrl: string): ExtractedLink[] {
  const links: ExtractedLink[] = []
  const seen = new Set<string>()

  const anchors = document.querySelectorAll('a[href]')

  for (const anchor of anchors) {
    try {
      const href = anchor.getAttribute('href')
      if (!href) continue

      // 상대 URL을 절대 URL로 변환
      const absoluteUrl = new URL(href, baseUrl).href

      // 중복 제거
      if (seen.has(absoluteUrl)) continue
      seen.add(absoluteUrl)

      // 유효한 HTTP(S) URL만
      if (!absoluteUrl.startsWith('http://') && !absoluteUrl.startsWith('https://')) {
        continue
      }

      // 파일 확장자 제외
      if (isFileUrl(absoluteUrl)) continue

      // 앵커, 쿼리 제거
      const urlWithoutHash = absoluteUrl.split('#')[0] ?? absoluteUrl
      const cleanUrl = urlWithoutHash.split('?')[0] ?? urlWithoutHash

      links.push({
        url: cleanUrl,
        text: (anchor.textContent || '').trim().slice(0, 100),
        depth: 0, // 현재는 0, 실제 깊이는 큐에서 관리
      })
    } catch {
      // URL 파싱 실패 무시
    }
  }

  return links
}

/** URL이 파일인지 확인 */
function isFileUrl(url: string): boolean {
  const fileExtensions = [
    '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
    '.zip', '.rar', '.tar', '.gz',
    '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg',
    '.mp3', '.mp4', '.avi', '.mov',
    '.css', '.js', '.json', '.xml',
  ]
  const lowercaseUrl = url.toLowerCase()
  return fileExtensions.some(ext => lowercaseUrl.endsWith(ext))
}

/** URL 정규화 */
function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url)
    // 끝 슬래시 제거, 소문자
    let normalized = `${parsed.protocol}//${parsed.host}${parsed.pathname}`
    if (normalized.endsWith('/') && normalized.length > 1) {
      normalized = normalized.slice(0, -1)
    }
    return normalized.toLowerCase()
  } catch {
    return url.toLowerCase()
  }
}

/** 도메인 추출 */
function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return ''
  }
}

/** 크롤링 여부 판단 */
function shouldCrawl(
  url: string,
  startDomain: string,
  config: RecursiveCrawlOptions
): boolean {
  // 같은 도메인 체크
  if (config.sameDomainOnly !== false) {
    const urlDomain = extractDomain(url)
    if (urlDomain !== startDomain) {
      return false
    }
  }

  // 제외 패턴
  if (config.excludePatterns?.length) {
    for (const pattern of config.excludePatterns) {
      if (pattern.test(url)) {
        return false
      }
    }
  }

  // 포함 패턴 (설정 시 이 패턴에 맞는 것만)
  if (config.includePatterns?.length) {
    const matches = config.includePatterns.some(pattern => pattern.test(url))
    if (!matches) {
      return false
    }
  }

  return true
}

/** 헤더 생성 */
function getHeaders(userAgent: string): Record<string, string> {
  return {
    'User-Agent': userAgent,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
    'Accept-Encoding': 'gzip, deflate, br',
    Connection: 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
  }
}

/** HTML을 마크다운으로 변환 */
function htmlToMarkdown(html: string, options: { includeImages?: boolean }): string {
  let text = html

  // 스크립트, 스타일 제거
  text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')

  // 헤딩 변환
  text = text.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n# $1\n')
  text = text.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n## $1\n')
  text = text.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n### $1\n')
  text = text.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '\n#### $1\n')

  // 문단, 줄바꿈
  text = text.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '\n$1\n')
  text = text.replace(/<br\s*\/?>/gi, '\n')

  // 리스트
  text = text.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '- $1\n')
  text = text.replace(/<ul[^>]*>|<\/ul>/gi, '\n')
  text = text.replace(/<ol[^>]*>|<\/ol>/gi, '\n')

  // 강조
  text = text.replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, '**$1**')
  text = text.replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, '**$1**')
  text = text.replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, '*$1*')

  // 링크
  text = text.replace(/<a[^>]*>([\s\S]*?)<\/a>/gi, '$1')

  // 이미지
  if (options.includeImages) {
    text = text.replace(/<img[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*\/?>/gi, '![$2]($1)')
    text = text.replace(/<img[^>]*src="([^"]*)"[^>]*\/?>/gi, '![]($1)')
  } else {
    text = text.replace(/<img[^>]*\/?>/gi, '')
  }

  // 나머지 태그 제거
  text = text.replace(/<[^>]+>/g, '')

  // HTML 엔티티
  text = decodeHtmlEntities(text)

  // 정리
  text = text.replace(/\n{3,}/g, '\n\n')
  text = text.replace(/[ \t]+/g, ' ')

  return text.trim()
}

/** HTML 엔티티 디코딩 */
function decodeHtmlEntities(text: string): string {
  const entities: Record<string, string> = {
    '&nbsp;': ' ',
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
  }

  let result = text
  for (const [entity, char] of Object.entries(entities)) {
    result = result.replace(new RegExp(entity, 'g'), char)
  }

  result = result.replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)))

  return result
}

/** 단어 수 계산 */
function countWords(text: string): number {
  const korean = (text.match(/[가-힣]/g) || []).length
  const english = (text.match(/[a-zA-Z]+/g) || []).length
  return korean + english
}

/** 딜레이 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
