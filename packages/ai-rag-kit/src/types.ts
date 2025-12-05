// packages/ai-rag-kit/src/types.ts
// 공통 타입 정의 및 Prisma 주입 인터페이스

// =============================================================================
// Prisma 인터페이스 (호스트 앱에서 주입)
// =============================================================================

/**
 * Prisma 클라이언트 인터페이스
 * 호스트 앱에서 실제 PrismaClient를 주입받습니다.
 */
export interface PrismaClientLike {
  knowledgeDocument: {
    create: (args: { data: KnowledgeDocumentCreateData }) => Promise<KnowledgeDocumentRecord>
    findFirst: (args: { where: Record<string, unknown> }) => Promise<KnowledgeDocumentRecord | null>
    findMany: (args: {
      where?: Record<string, unknown>
      select?: Record<string, boolean>
      orderBy?: Record<string, 'asc' | 'desc'>
      take?: number
      skip?: number
    }) => Promise<KnowledgeDocumentRecord[]>
    count: (args: { where?: Record<string, unknown> }) => Promise<number>
    delete: (args: { where: { id: string } }) => Promise<KnowledgeDocumentRecord>
  }
  blogPost: {
    findMany: (args: {
      where?: Record<string, unknown>
      select?: Record<string, boolean>
      take?: number
    }) => Promise<BlogPostRecord[]>
  }
  $queryRaw: <T>(query: TemplateStringsArray, ...values: unknown[]) => Promise<T>
}

/** 지식 문서 생성 데이터 */
export interface KnowledgeDocumentCreateData {
  title: string
  content: string
  source: string
  metadata: Record<string, unknown>
}

/** 지식 문서 레코드 */
export interface KnowledgeDocumentRecord {
  id: string
  title: string | null
  content: string
  source: string
  metadata: unknown
  createdAt: Date
}

/** 블로그 포스트 레코드 */
export interface BlogPostRecord {
  id: string
  title: string
  excerpt: string | null
}

// =============================================================================
// RAG Context 타입
// =============================================================================

/** RAG 검색 컨텍스트 */
export interface RAGContext {
  documentId: string
  title: string
  content: string
  source: string
  similarity: number
}

// =============================================================================
// 이미지 관련 타입
// =============================================================================

/** 이미지 검색 결과 */
export interface ImageSearchResult {
  id: string
  imageUrl: string
  description: string
  tags: string[]
  category: string
  suggestedTitle: string | null
  usageContext?: string | null
  similarity: number
}

/** 이미지 분석 결과 */
export interface ImageAnalysisResult {
  description: string
  tags: string[]
  category: string
  suggestedTitle: string
  usageContext?: string
}

/** 이미지 파이프라인 결과 */
export interface ImagePipelineResult {
  id: string
  url: string
  originalUrl?: string
  analysis: ImageAnalysisResult
  dimensions: {
    width: number
    height: number
  }
  size: number
}

/** 이미지 파이프라인 옵션 */
export interface ImagePipelineOptions {
  imageOptions?: ImageUploadOptions
  context?: string
  uploadedBy?: string
  skipR2Upload?: boolean
}

/** 이미지 업로드 옵션 */
export interface ImageUploadOptions {
  folder?: string
  maxWidth?: number
  maxHeight?: number
  quality?: number
}

/** 이미지 업로드 결과 */
export interface ImageUploadResult {
  url: string
  key: string
  width: number
  height: number
  format: string
  size: number
}

/** 추출된 이미지 */
export interface ExtractedImage {
  url: string
  alt?: string
  context?: string
  width?: number
  height?: number
}

/** 이미지 추출 옵션 */
export interface ImageExtractOptions {
  minWidth?: number
  minHeight?: number
  excludePatterns?: string[]
  maxImages?: number
}

// =============================================================================
// 크롤러 관련 타입
// =============================================================================

/** 웹 클리핑 결과 */
export interface ClipResult {
  title: string
  content: string
  url: string
  wordCount: number
  publishedTime?: string
  author?: string
  siteName?: string
}

/** 클리핑 옵션 */
export interface ClipOptions {
  timeout?: number
  includeImages?: boolean
  headers?: Record<string, string>
}

/** 청크 */
export interface Chunk {
  index: number
  content: string
  startOffset: number
  endOffset: number
}

/** 청크 옵션 */
export interface ChunkOptions {
  chunkSize?: number
  overlapSize?: number
  preserveParagraphs?: boolean
}

// =============================================================================
// 재귀 크롤러 관련 타입
// =============================================================================

/** 재귀 크롤링 옵션 */
export interface RecursiveCrawlOptions extends ClipOptions {
  /** 최대 탐색 깊이 (기본: 2) */
  maxDepth?: number
  /** 최대 페이지 수 (기본: 50) */
  maxPages?: number
  /** 같은 도메인만 크롤링 (기본: true) */
  sameDomainOnly?: boolean
  /** 제외할 URL 패턴 */
  excludePatterns?: RegExp[]
  /** 포함할 URL 패턴 (설정 시 이 패턴만 크롤링) */
  includePatterns?: RegExp[]
  /** 요청 간 딜레이 ms (기본: 1000) */
  delayBetweenRequests?: number
  /** 폴백 전략 사용 (기본: true) */
  useFallback?: boolean
  /** 진행 콜백 */
  onProgress?: (progress: CrawlProgress) => void
}

/** 크롤링 진행 상태 */
export interface CrawlProgress {
  /** 현재 URL */
  currentUrl: string
  /** 처리된 페이지 수 */
  processedCount: number
  /** 총 대기열 수 */
  queueLength: number
  /** 성공 수 */
  successCount: number
  /** 실패 수 */
  failedCount: number
  /** 현재 깊이 */
  currentDepth: number
}

/** 재귀 크롤링 결과 */
export interface RecursiveCrawlResult {
  /** 성공한 페이지들 */
  success: ClipResult[]
  /** 실패한 페이지들 */
  failed: CrawlFailure[]
  /** 총 처리 시간 (ms) */
  totalTime: number
  /** 방문한 URL 목록 */
  visitedUrls: string[]
}

/** 크롤링 실패 정보 */
export interface CrawlFailure {
  url: string
  error: string
  /** 사용된 폴백 전략들 */
  attemptedStrategies: string[]
  /** 깊이 */
  depth: number
}

/** 링크 추출 결과 */
export interface ExtractedLink {
  url: string
  text: string
  /** 링크 발견 깊이 */
  depth: number
}

// =============================================================================
// 블로그 생성 관련 타입
// =============================================================================

/** 생성된 블로그 포스트 */
export interface GeneratedBlogPost {
  title: string
  slug: string
  content: TipTapContent
  excerpt: string
  seoTitle: string
  seoDescription: string
  suggestedTags: string[]
}

/** TipTap 콘텐츠 구조 */
export interface TipTapContent {
  type: 'doc'
  content: TipTapNode[]
}

/** TipTap 노드 */
export interface TipTapNode {
  type: string
  attrs?: Record<string, unknown>
  content?: TipTapNode[]
  text?: string
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>
}

/** 블로그 생성 옵션 */
export interface BlogGeneratorOptions {
  topic: string
  category?: string
  tone?: 'formal' | 'friendly' | 'expert'
  minWords?: number
  maxWords?: number
  includeImages?: boolean
  maxImagesPerPost?: number
  removeCitations?: boolean
}

/** 후처리 옵션 */
export interface PostProcessOptions {
  removeCitations?: boolean
  patterns?: RegExp[]
}

// =============================================================================
// 지식베이스 관련 타입
// =============================================================================

/** 지식베이스 저장 결과 */
export interface SaveResult {
  documentId: string
  title: string
  chunkCount: number
  fileSearchUploaded: boolean
  imageResult?: BatchImageResult
}

/** 지식베이스 추가 옵션 */
export interface AddToKnowledgeBaseOptions extends ClipOptions {
  chunkOptions?: ChunkOptions
  uploadToFileSearch?: boolean
  source?: string
  category?: string
  processImages?: boolean
  imageExtractOptions?: ImageExtractOptions
}

/** 배치 이미지 결과 */
export interface BatchImageResult {
  success: ImagePipelineResult[]
  failed: Array<{
    url?: string
    error: string
  }>
  totalProcessed: number
}

// =============================================================================
// RAG Kit 설정 타입
// =============================================================================

/** RAG Kit 전역 설정 */
export interface RAGKitConfig {
  /** Prisma 클라이언트 (필수) */
  prisma: PrismaClientLike
  /** Gemini 클라이언트 (ai-core에서 생성) */
  geminiClient?: GeminiClientLike
  /** R2 설정 (이미지 업로드 시 필요) */
  r2Config?: R2Config
  /** 테이블명 커스터마이징 */
  tables?: {
    knowledgeDocument?: string
    imageDocument?: string
    blogPost?: string
  }
}

/** R2 설정 */
export interface R2Config {
  accountId: string
  accessKeyId: string
  secretAccessKey: string
  bucketName: string
  publicUrl: string
}

/** Gemini 클라이언트 인터페이스 (ai-core에서 제공) */
export interface GeminiClientLike {
  generate: (prompt: string, options?: { systemInstruction?: string }) => Promise<string>
  generateWithFallback: (prompt: string, options?: { systemInstruction?: string }) => Promise<string>
  generateEmbedding: (text: string) => Promise<number[]>
}

// =============================================================================
// 팩토리 함수 타입
// =============================================================================

/** Knowledge Builder 팩토리 옵션 */
export interface KnowledgeBuilderOptions {
  prisma: PrismaClientLike
  geminiClient?: GeminiClientLike
  fileSearchConfig?: {
    storeName?: string
  }
}

/** Blog Generator 팩토리 옵션 */
export interface BlogGeneratorFactoryOptions {
  prisma: PrismaClientLike
  geminiClient: GeminiClientLike
  promptService?: {
    getFullPrompt: (key: string) => Promise<{
      systemInstruction: string | null
      taskPrompt: string | null
      outputFormat: string | null
    }>
  }
}

/** Image Pipeline 팩토리 옵션 */
export interface ImagePipelineFactoryOptions {
  prisma: PrismaClientLike
  geminiClient: GeminiClientLike
  r2Config?: R2Config
}
