// packages/ai-rag-kit/src/image/r2-uploader.ts
// 이미지 전용 R2 업로더 (최적화 + 업로드 통합)
// R2 설정은 호스트 앱에서 주입받음

import type { ImageUploadOptions, ImageUploadResult, R2Config } from '../types'

import { processImage, type ProcessedImage } from './processor'

export type { ImageUploadOptions, ImageUploadResult }

/** R2 업로더 서비스 옵션 */
export interface R2UploaderServiceOptions {
  /** R2 설정 */
  r2Config: R2Config
}

/**
 * R2 업로더 서비스 클래스
 */
export class R2UploaderService {
  private r2Config: R2Config
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private s3Client: any = null

  constructor(options: R2UploaderServiceOptions) {
    this.r2Config = options.r2Config
  }

  /**
   * S3 클라이언트 초기화 (지연 로드)
   */
  private async getS3Client() {
    if (this.s3Client) return this.s3Client

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { S3Client } = require('@aws-sdk/client-s3')

      this.s3Client = new S3Client({
        region: 'auto',
        endpoint: `https://${this.r2Config.accountId}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: this.r2Config.accessKeyId,
          secretAccessKey: this.r2Config.secretAccessKey,
        },
      })

      return this.s3Client
    } catch {
      throw new Error(
        '@aws-sdk/client-s3 패키지가 설치되지 않았습니다. pnpm add @aws-sdk/client-s3 로 설치하세요.'
      )
    }
  }

  /**
   * R2에 업로드
   */
  private async uploadToR2(
    buffer: Buffer,
    key: string,
    mimeType: string
  ): Promise<{ url: string; key: string }> {
    const client = await this.getS3Client()

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PutObjectCommand } = require('@aws-sdk/client-s3')

    await client.send(
      new PutObjectCommand({
        Bucket: this.r2Config.bucketName,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
      })
    )

    return {
      url: `${this.r2Config.publicUrl}/${key}`,
      key,
    }
  }

  /**
   * 고유한 이미지 키 생성
   */
  private generateImageKey(
    folder: string,
    format: string,
    prefix?: string
  ): string {
    const timestamp = Date.now()
    const random = Math.random().toString(36).substring(2, 8)
    const prefixPart = prefix ? `${prefix}-` : ''
    return `${folder}/${prefixPart}${timestamp}-${random}.${format}`
  }

  /**
   * 이미지 최적화 후 R2에 업로드
   */
  async uploadOptimizedImage(
    source: Buffer | string,
    options: ImageUploadOptions = {}
  ): Promise<ImageUploadResult> {
    const {
      folder = 'images/knowledge',
      maxWidth,
      maxHeight,
      quality,
    } = options

    let processed: ProcessedImage

    // 최적화 처리
    processed = await processImage(source, { maxWidth, maxHeight, quality })

    // R2에 업로드
    const key = this.generateImageKey(folder, processed.format)
    const result = await this.uploadToR2(processed.buffer, key, processed.mimeType)

    return {
      url: result.url,
      key: result.key,
      width: processed.width,
      height: processed.height,
      format: processed.format,
      size: processed.size,
    }
  }

  /**
   * URL에서 이미지 다운로드 후 최적화 + R2 업로드
   */
  async downloadAndUploadImage(
    imageUrl: string,
    options: ImageUploadOptions = {}
  ): Promise<ImageUploadResult> {
    console.log(`[이미지 업로드] URL 다운로드: ${imageUrl}`)

    try {
      const result = await this.uploadOptimizedImage(imageUrl, options)
      console.log(`[이미지 업로드] 완료: ${result.url} (${result.width}x${result.height})`)
      return result
    } catch (error) {
      console.error(`[이미지 업로드] 실패: ${imageUrl}`, error)
      throw error
    }
  }

  /**
   * 여러 이미지 배치 업로드
   */
  async batchUploadImages(
    sources: Array<{ source: Buffer | string; options?: ImageUploadOptions }>,
    onProgress?: (current: number, total: number) => void
  ): Promise<Array<{ success: boolean; result?: ImageUploadResult; error?: string }>> {
    const results: Array<{ success: boolean; result?: ImageUploadResult; error?: string }> = []

    for (let i = 0; i < sources.length; i++) {
      const item = sources[i]
      if (!item) continue

      const { source, options } = item

      try {
        const result = await this.uploadOptimizedImage(source, options)
        results.push({ success: true, result })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        results.push({ success: false, error: message })
      }

      onProgress?.(i + 1, sources.length)

      // 요청 간 딜레이 (Rate Limiting 방지)
      if (i < sources.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500))
      }
    }

    return results
  }
}

/**
 * R2 업로더 서비스 생성 함수
 */
export function createR2UploaderService(
  options: R2UploaderServiceOptions
): R2UploaderService {
  return new R2UploaderService(options)
}
