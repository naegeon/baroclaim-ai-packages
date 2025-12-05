// packages/ai-rag-kit/src/index.ts
// @baroclaim/ai-rag-kit - RAG 기반 콘텐츠 생성 도구 모음
//
// 이 패키지는 다음 기능을 제공합니다:
// - 웹 크롤링 및 청크 분할
// - Google File Search & pgvector 기반 RAG 검색
// - AI 블로그 자동 생성
// - 이미지 최적화 및 분석

// =============================================================================
// Types - 공통 타입 정의
// =============================================================================
export type {
  // Prisma 인터페이스
  PrismaClientLike,
  KnowledgeDocumentCreateData,
  KnowledgeDocumentRecord,
  BlogPostRecord,

  // RAG 관련
  RAGContext,
  ImageSearchResult,

  // 이미지 관련
  ImageAnalysisResult,
  ImagePipelineResult,
  ImagePipelineOptions,
  ImageUploadOptions,
  ImageUploadResult,
  ExtractedImage,
  ImageExtractOptions,

  // 크롤러 관련
  ClipResult,
  ClipOptions,
  Chunk,
  ChunkOptions,

  // 블로그 생성 관련
  GeneratedBlogPost,
  TipTapContent,
  TipTapNode,
  BlogGeneratorOptions,
  PostProcessOptions,

  // 지식베이스 관련
  SaveResult,
  AddToKnowledgeBaseOptions,
  BatchImageResult,

  // 설정 관련
  RAGKitConfig,
  R2Config,
  GeminiClientLike,
  KnowledgeBuilderOptions,
  BlogGeneratorFactoryOptions,
  ImagePipelineFactoryOptions,
} from './types'

// =============================================================================
// Crawler - 웹 크롤링 및 콘텐츠 처리
// =============================================================================
export {
  // 웹 클리퍼
  clipWebPage,
  clipMultiplePages,

  // 청크 분할
  splitIntoChunks,
  splitMarkdownIntoChunks,
  getChunkStats,
  CHUNK_DEFAULTS,

  // 이미지 추출
  extractImagesFromPage,
  filterValidImages,
} from './crawler'

// =============================================================================
// RAG - 검색 증강 생성
// =============================================================================
export {
  // File Search 서비스
  FileSearchService,
  createFileSearchService,
  type FileSearchServiceOptions,

  // Image Search 서비스
  ImageSearchService,
  createImageSearchService,
  type ImageSearchServiceOptions,
} from './rag'

// =============================================================================
// Generator - 콘텐츠 생성
// =============================================================================
export {
  // 블로그 생성 서비스
  BlogGeneratorService,
  createBlogGeneratorService,
  type BlogGeneratorServiceOptions,

  // 후처리
  removeCitations,
  removeCitationsFromContent,
  postProcessContent,
} from './generator'

// =============================================================================
// Image - 이미지 처리
// =============================================================================
export {
  // 이미지 처리
  getImageMetadata,
  processImage,
  isProcessableImage,
  getImageExtension,
  type ImageProcessOptions,
  type ProcessedImage,
  type ImageMetadata,

  // R2 업로더
  R2UploaderService,
  createR2UploaderService,
  type R2UploaderServiceOptions,

  // 이미지 파이프라인
  ImagePipelineService,
  createImagePipelineService,
  type ImagePipelineServiceOptions,
} from './image'
