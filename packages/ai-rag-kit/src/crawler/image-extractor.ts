// packages/ai-rag-kit/src/crawler/image-extractor.ts
// 웹페이지에서 이미지 추출

import { JSDOM } from 'jsdom'

import type { ExtractedImage, ImageExtractOptions } from '../types'

export type { ExtractedImage, ImageExtractOptions }

/** 기본 제외 패턴 */
const DEFAULT_EXCLUDE_PATTERNS = [
  'icon',
  'logo',
  'avatar',
  'sprite',
  'button',
  'badge',
  'emoji',
  'placeholder',
  'spacer',
  'blank',
  'pixel',
  '1x1',
  'tracking',
  'analytics',
  'ad-',
  'ads/',
  'banner/',
  'facebook.com',
  'twitter.com',
  'linkedin.com',
  'instagram.com',
  'google-analytics',
  'doubleclick',
]

/**
 * URL을 절대 경로로 변환
 */
function toAbsoluteUrl(url: string, baseUrl: string): string | null {
  try {
    // 이미 절대 URL인 경우
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url
    }
    // 프로토콜 상대 URL
    if (url.startsWith('//')) {
      return `https:${url}`
    }
    // 상대 URL
    return new URL(url, baseUrl).href
  } catch {
    return null
  }
}

/**
 * 이미지 URL이 유효한지 확인
 */
function isValidImageUrl(url: string, excludePatterns: string[]): boolean {
  // 데이터 URL은 제외
  if (url.startsWith('data:')) {
    return false
  }

  // SVG는 제외 (벡터 이미지)
  if (url.endsWith('.svg')) {
    return false
  }

  // 제외 패턴 확인
  const lowerUrl = url.toLowerCase()
  for (const pattern of excludePatterns) {
    if (lowerUrl.includes(pattern.toLowerCase())) {
      return false
    }
  }

  return true
}

/**
 * 이미지 요소에서 URL 추출 (다양한 속성 지원)
 */
function getImageUrl(img: Element): { url: string; attr: string } | null {
  // 일반 src
  const src = img.getAttribute('src')
  if (src && !src.startsWith('data:')) {
    return { url: src, attr: 'src' }
  }

  // Lazy loading 속성들
  const lazyAttrs = ['data-src', 'data-lazy-src', 'data-original', 'data-lazy']
  for (const attr of lazyAttrs) {
    const value = img.getAttribute(attr)
    if (value) {
      return { url: value, attr }
    }
  }

  // srcset에서 가장 큰 이미지 추출
  const srcset = img.getAttribute('srcset')
  if (srcset) {
    const sources = srcset.split(',').map((s) => {
      const parts = s.trim().split(/\s+/)
      const url = parts[0]
      const width = parts[1] ? parseInt(parts[1]) : 0
      return { url, width }
    })
    // 가장 큰 이미지 선택
    sources.sort((a, b) => b.width - a.width)
    if (sources[0]?.url) {
      return { url: sources[0].url, attr: 'srcset' }
    }
  }

  return null
}

/**
 * 이미지 주변 텍스트 컨텍스트 추출
 */
function extractContext(img: Element, maxLength: number): string | undefined {
  // 부모 요소의 텍스트 확인
  const parent = img.parentElement
  if (!parent) return undefined

  // 형제 요소 텍스트
  const siblings = Array.from(parent.children)
  const texts: string[] = []

  // figcaption 확인
  const figcaption = parent.querySelector('figcaption')
  if (figcaption) {
    texts.push(figcaption.textContent?.trim() || '')
  }

  // 이전/다음 형제 요소 텍스트
  for (const sibling of siblings) {
    if (sibling !== img && sibling.textContent) {
      const text = sibling.textContent.trim()
      if (text && text.length > 10 && text.length < 500) {
        texts.push(text)
      }
    }
  }

  // 부모의 부모 확인 (article, section 등)
  const grandparent = parent.parentElement
  if (grandparent) {
    // 근처 h1-h6 헤딩 찾기
    const heading = grandparent.querySelector('h1, h2, h3, h4, h5, h6')
    if (heading?.textContent) {
      texts.unshift(heading.textContent.trim())
    }

    // p 태그 텍스트
    const paragraph = grandparent.querySelector('p')
    if (paragraph?.textContent) {
      texts.push(paragraph.textContent.trim())
    }
  }

  const context = texts.join(' ').slice(0, maxLength)
  return context || undefined
}

/**
 * 웹페이지에서 이미지 추출
 */
export async function extractImagesFromPage(
  url: string,
  options: ImageExtractOptions = {}
): Promise<ExtractedImage[]> {
  const {
    minWidth = 200,
    minHeight = 150,
    excludePatterns = DEFAULT_EXCLUDE_PATTERNS,
    maxImages = 20,
  } = options
  const contextLength = 200

  console.log(`[이미지 추출] 페이지 분석: ${url}`)

  // 1. 페이지 가져오기
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; ImageExtractor/1.0)',
    },
  })

  if (!response.ok) {
    throw new Error(`페이지 로드 실패: ${response.status}`)
  }

  const html = await response.text()

  // 2. DOM 파싱
  const dom = new JSDOM(html, { url })
  const document = dom.window.document

  // 3. 모든 이미지 요소 수집
  const imgElements = document.querySelectorAll('img')
  const images: ExtractedImage[] = []

  for (const img of imgElements) {
    if (images.length >= maxImages) break

    // URL 추출
    const urlInfo = getImageUrl(img)
    if (!urlInfo) continue

    // 절대 URL로 변환
    const absoluteUrl = toAbsoluteUrl(urlInfo.url, url)
    if (!absoluteUrl) continue

    // 유효성 검사
    if (!isValidImageUrl(absoluteUrl, excludePatterns)) continue

    // 크기 확인 (가능한 경우)
    const width = parseInt(img.getAttribute('width') || '0')
    const height = parseInt(img.getAttribute('height') || '0')

    // 크기가 명시되어 있고 너무 작으면 제외
    if (width > 0 && width < minWidth) continue
    if (height > 0 && height < minHeight) continue

    // 컨텍스트 추출
    const context = extractContext(img, contextLength)

    // 중복 확인
    if (images.some((i) => i.url === absoluteUrl)) continue

    images.push({
      url: absoluteUrl,
      alt: img.getAttribute('alt') || undefined,
      context,
      width: width > 0 ? width : undefined,
      height: height > 0 ? height : undefined,
    })
  }

  console.log(`[이미지 추출] ${images.length}개 이미지 발견`)

  return images
}

/**
 * 이미지 URL 배열에서 유효한 것만 필터링
 */
export function filterValidImages(
  urls: string[],
  excludePatterns: string[] = DEFAULT_EXCLUDE_PATTERNS
): string[] {
  return urls.filter((url) => isValidImageUrl(url, excludePatterns))
}
