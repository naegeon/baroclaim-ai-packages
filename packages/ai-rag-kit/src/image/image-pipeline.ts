// packages/ai-rag-kit/src/image/image-pipeline.ts
// 이미지 인제스트 통합 파이프라인
// 이미지 소스 → 최적화 → R2 저장 → AI 분석 → 임베딩 → pgvector

import { extractImagesFromPage, type ExtractedImage } from '../crawler/image-extractor'
import { ImageSearchService } from '../rag/image-search'
import type {
  BatchImageResult,
  GeminiClientLike,
  ImageAnalysisResult,
  ImageExtractOptions,
  ImagePipelineOptions,
  ImagePipelineResult,
  PrismaClientLike,
  R2Config,
} from '../types'

import { R2UploaderService } from './r2-uploader'

export type { ImagePipelineOptions, ImagePipelineResult, BatchImageResult }

/** Image Pipeline 서비스 옵션 */
export interface ImagePipelineServiceOptions {
  /** Prisma 클라이언트 */
  prisma: PrismaClientLike
  /** Gemini 클라이언트 */
  geminiClient: GeminiClientLike
  /** R2 설정 (선택) */
  r2Config?: R2Config
}

/**
 * Image Pipeline 서비스 클래스
 * 전체 파이프라인: 최적화 → R2 저장 → AI 분석 → 임베딩 → pgvector
 */
export class ImagePipelineService {
  private geminiClient: GeminiClientLike
  private r2Uploader?: R2UploaderService
  private imageSearchService: ImageSearchService

  constructor(options: ImagePipelineServiceOptions) {
    this.geminiClient = options.geminiClient

    // R2 업로더 초기화 (있는 경우)
    if (options.r2Config) {
      this.r2Uploader = new R2UploaderService({ r2Config: options.r2Config })
    }

    // 이미지 검색 서비스 초기화
    this.imageSearchService = new ImageSearchService({
      prisma: options.prisma,
      geminiClient: options.geminiClient,
    })
  }

  /**
   * 단일 이미지를 지식베이스에 추가
   * 전체 파이프라인: 최적화 → R2 저장 → AI 분석 → 임베딩 → pgvector
   */
  async addImageToKnowledgeBase(
    imageSource: Buffer | string,
    options: ImagePipelineOptions = {}
  ): Promise<ImagePipelineResult> {
    const {
      context,
      uploadedBy = 'system',
      skipR2Upload = false,
    } = options

    console.log('[이미지 파이프라인] 시작')

    let imageUrl: string
    let width = 0
    let height = 0
    let size = 0

    // 1. R2 업로드 (설정된 경우)
    if (this.r2Uploader && !skipR2Upload) {
      const r2Result = await this.r2Uploader.uploadOptimizedImage(imageSource, options.imageOptions)
      imageUrl = r2Result.url
      width = r2Result.width
      height = r2Result.height
      size = r2Result.size
      console.log(`[이미지 파이프라인] R2 업로드 완료: ${imageUrl}`)
    } else if (typeof imageSource === 'string') {
      // URL 그대로 사용
      imageUrl = imageSource
      console.log('[이미지 파이프라인] R2 업로드 건너뜀')
    } else {
      throw new Error('R2 설정 없이 Buffer를 업로드할 수 없습니다.')
    }

    // 2. AI 분석 (Gemini 멀티모달)
    const analysis = await this.analyzeImage(imageUrl, context)
    console.log(`[이미지 파이프라인] AI 분석 완료: ${analysis.category}`)

    // 3. pgvector에 저장 (임베딩 포함)
    const id = await this.imageSearchService.addImageDocument(
      imageUrl,
      analysis.description,
      analysis.tags,
      analysis.category,
      analysis.suggestedTitle,
      uploadedBy,
      analysis.usageContext
    )
    console.log(`[이미지 파이프라인] DB 저장 완료: ${id}`)

    return {
      id,
      url: imageUrl,
      originalUrl: typeof imageSource === 'string' ? imageSource : undefined,
      analysis,
      dimensions: { width, height },
      size,
    }
  }

  /**
   * Gemini 멀티모달 이미지 분석
   */
  private async analyzeImage(
    imageUrl: string,
    context?: string
  ): Promise<ImageAnalysisResult> {
    const contextPrompt = context
      ? `\n\n추가 컨텍스트: ${context}`
      : ''

    const prompt = `
다음 이미지를 분석하고 JSON 형식으로 응답해주세요.

이미지 URL: ${imageUrl}
${contextPrompt}

다음 정보를 추출해주세요:
1. description: 이미지에 대한 상세 설명 (2-3문장)
2. tags: 관련 키워드 태그 배열 (5-10개)
3. category: 카테고리 (보험, 금융, 의료, 법률, 일반 중 하나)
4. suggestedTitle: 이미지 제목 추천
5. usageContext: 이 이미지가 사용될 수 있는 맥락

JSON 형식:
{
  "description": "...",
  "tags": ["...", "..."],
  "category": "...",
  "suggestedTitle": "...",
  "usageContext": "..."
}

반드시 유효한 JSON만 출력하세요.
`

    const response = await this.geminiClient.generateWithFallback(prompt)

    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error('JSON 형식 아님')
      return JSON.parse(jsonMatch[0])
    } catch {
      // 기본값 반환
      return {
        description: '이미지 분석 실패',
        tags: [],
        category: '일반',
        suggestedTitle: '이미지',
        usageContext: '',
      }
    }
  }

  /**
   * 여러 이미지를 배치로 지식베이스에 추가
   */
  async batchAddImagesToKnowledgeBase(
    sources: Array<{
      source: Buffer | string
      context?: string
    }>,
    options: Omit<ImagePipelineOptions, 'context'> = {},
    onProgress?: (current: number, total: number) => void
  ): Promise<BatchImageResult> {
    const result: BatchImageResult = {
      success: [],
      failed: [],
      totalProcessed: 0,
    }

    for (let i = 0; i < sources.length; i++) {
      const item = sources[i]
      if (!item) continue

      const { source, context } = item

      try {
        const pipelineResult = await this.addImageToKnowledgeBase(source, {
          ...options,
          context,
        })
        result.success.push(pipelineResult)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        result.failed.push({
          url: typeof source === 'string' ? source : undefined,
          error: message,
        })
        console.error(`[이미지 파이프라인] 실패:`, message)
      }

      result.totalProcessed++
      onProgress?.(i + 1, sources.length)

      // 요청 간 딜레이 (Rate Limiting 방지)
      if (i < sources.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }
    }

    console.log(
      `[이미지 파이프라인] 배치 완료: 성공 ${result.success.length}, 실패 ${result.failed.length}`
    )

    return result
  }

  /**
   * 웹페이지에서 이미지 추출 후 지식베이스에 추가
   */
  async addImagesFromUrl(
    pageUrl: string,
    options: {
      extractOptions?: ImageExtractOptions
      pipelineOptions?: Omit<ImagePipelineOptions, 'context'>
      onProgress?: (current: number, total: number) => void
    } = {}
  ): Promise<BatchImageResult> {
    const { extractOptions = {}, pipelineOptions = {}, onProgress } = options

    console.log(`[이미지 파이프라인] URL에서 이미지 추출: ${pageUrl}`)

    // 1. 이미지 추출
    const extractedImages = await extractImagesFromPage(pageUrl, extractOptions)

    if (extractedImages.length === 0) {
      console.log('[이미지 파이프라인] 추출된 이미지 없음')
      return {
        success: [],
        failed: [],
        totalProcessed: 0,
      }
    }

    // 2. 배치 처리
    const sources = extractedImages.map((img: ExtractedImage) => ({
      source: img.url,
      context: img.context || img.alt,
    }))

    return this.batchAddImagesToKnowledgeBase(sources, pipelineOptions, onProgress)
  }

  /**
   * 단일 이미지 URL을 지식베이스에 추가 (간편 API)
   */
  async addImageUrlToKnowledgeBase(
    imageUrl: string,
    context?: string,
    uploadedBy?: string
  ): Promise<ImagePipelineResult> {
    return this.addImageToKnowledgeBase(imageUrl, {
      context,
      uploadedBy,
    })
  }
}

/**
 * Image Pipeline 서비스 생성 함수
 */
export function createImagePipelineService(
  options: ImagePipelineServiceOptions
): ImagePipelineService {
  return new ImagePipelineService(options)
}
