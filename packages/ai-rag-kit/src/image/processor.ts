// packages/ai-rag-kit/src/image/processor.ts
// 이미지 최적화 모듈 (리사이징, WebP 변환, 압축)
// sharp는 peerDependency로 호스트 앱에서 설치해야 함

/** 이미지 처리 옵션 */
export interface ImageProcessOptions {
  /** 최대 너비 (기본: 1200) */
  maxWidth?: number
  /** 최대 높이 (기본: 자동) */
  maxHeight?: number
  /** 품질 (1-100, 기본: 80) */
  quality?: number
  /** 출력 형식 (기본: webp) */
  format?: 'webp' | 'jpeg' | 'png'
  /** 최소 너비 (이보다 작으면 처리하지 않음) */
  minWidth?: number
}

/** 이미지 처리 결과 */
export interface ProcessedImage {
  /** 처리된 이미지 버퍼 */
  buffer: Buffer
  /** 너비 */
  width: number
  /** 높이 */
  height: number
  /** 형식 */
  format: 'webp' | 'jpeg' | 'png'
  /** 파일 크기 (바이트) */
  size: number
  /** MIME 타입 */
  mimeType: string
}

/** 이미지 메타데이터 */
export interface ImageMetadata {
  width: number
  height: number
  format: string
  size: number
}

/** sharp 모듈 타입 (동적 로드) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SharpModule = any

/** sharp 모듈 캐시 */
let sharpModule: SharpModule | null = null

/**
 * sharp 모듈 동적 로드
 */
async function getSharp(): Promise<SharpModule> {
  if (sharpModule) return sharpModule

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    sharpModule = require('sharp')
    return sharpModule
  } catch {
    throw new Error(
      'sharp 패키지가 설치되지 않았습니다. pnpm add sharp 로 설치하세요.'
    )
  }
}

/**
 * 이미지 메타데이터 조회
 */
export async function getImageMetadata(
  source: Buffer | string
): Promise<ImageMetadata> {
  const sharp = await getSharp()
  let buffer: Buffer

  if (typeof source === 'string') {
    // URL인 경우 fetch
    const response = await fetch(source)
    if (!response.ok) {
      throw new Error(`이미지 다운로드 실패: ${response.status}`)
    }
    const arrayBuffer = await response.arrayBuffer()
    buffer = Buffer.from(arrayBuffer)
  } else {
    buffer = source
  }

  const metadata = await sharp(buffer).metadata()

  return {
    width: metadata.width ?? 0,
    height: metadata.height ?? 0,
    format: metadata.format ?? 'unknown',
    size: buffer.length,
  }
}

/**
 * 이미지 최적화 처리
 * - 리사이징 (maxWidth 초과 시)
 * - WebP 변환
 * - 압축
 */
export async function processImage(
  source: Buffer | string,
  options: ImageProcessOptions = {}
): Promise<ProcessedImage> {
  const sharp = await getSharp()

  const {
    maxWidth = 1200,
    maxHeight,
    quality = 80,
    format = 'webp',
    minWidth = 100,
  } = options

  let buffer: Buffer

  // 1. 소스 처리
  if (typeof source === 'string') {
    // URL인 경우 fetch
    const response = await fetch(source, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ImageProcessor/1.0)',
      },
    })
    if (!response.ok) {
      throw new Error(`이미지 다운로드 실패: ${response.status}`)
    }
    const arrayBuffer = await response.arrayBuffer()
    buffer = Buffer.from(arrayBuffer)
  } else {
    buffer = source
  }

  // 2. 메타데이터 확인
  const metadata = await sharp(buffer).metadata()
  const originalWidth = metadata.width ?? 0
  const originalHeight = metadata.height ?? 0

  // 최소 너비 미만이면 스킵
  if (originalWidth < minWidth) {
    throw new Error(`이미지 너비가 최소값(${minWidth}px) 미만입니다`)
  }

  // 3. sharp 파이프라인 구성
  let pipeline = sharp(buffer)

  // 리사이징 (필요한 경우)
  const needsResize = originalWidth > maxWidth || (maxHeight && originalHeight > maxHeight)
  if (needsResize) {
    pipeline = pipeline.resize({
      width: maxWidth,
      height: maxHeight,
      fit: 'inside',
      withoutEnlargement: true,
    })
  }

  // 4. 형식 변환 및 압축
  switch (format) {
    case 'webp':
      pipeline = pipeline.webp({ quality })
      break
    case 'jpeg':
      pipeline = pipeline.jpeg({ quality, mozjpeg: true })
      break
    case 'png':
      pipeline = pipeline.png({ compressionLevel: 9 })
      break
  }

  // 5. 처리 실행
  const outputBuffer = await pipeline.toBuffer()
  const outputMetadata = await sharp(outputBuffer).metadata()

  const mimeTypeMap = {
    webp: 'image/webp',
    jpeg: 'image/jpeg',
    png: 'image/png',
  }

  return {
    buffer: outputBuffer,
    width: outputMetadata.width ?? 0,
    height: outputMetadata.height ?? 0,
    format,
    size: outputBuffer.length,
    mimeType: mimeTypeMap[format],
  }
}

/**
 * 이미지가 처리 가능한지 확인
 */
export function isProcessableImage(
  mimeType: string | null | undefined
): boolean {
  if (!mimeType) return false

  const supportedTypes = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/tiff',
    'image/avif',
  ]

  return supportedTypes.includes(mimeType)
}

/**
 * URL에서 확장자 추출
 */
export function getImageExtension(url: string): string {
  try {
    const pathname = new URL(url).pathname
    const ext = pathname.split('.').pop()?.toLowerCase()
    return ext && ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)
      ? ext
      : 'jpg'
  } catch {
    return 'jpg'
  }
}
