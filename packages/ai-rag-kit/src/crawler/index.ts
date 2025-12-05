// packages/ai-rag-kit/src/crawler/index.ts
// 크롤러 모듈 exports

export {
  clipWebPage,
  clipMultiplePages,
  type ClipResult,
  type ClipOptions,
} from './web-clipper'

export {
  splitIntoChunks,
  splitMarkdownIntoChunks,
  getChunkStats,
  CHUNK_DEFAULTS,
  type Chunk,
  type ChunkOptions,
} from './chunk-strategy'

export {
  extractImagesFromPage,
  filterValidImages,
  type ExtractedImage,
  type ImageExtractOptions,
} from './image-extractor'

export { crawlRecursively } from './recursive-crawler'
export type {
  RecursiveCrawlOptions,
  RecursiveCrawlResult,
  CrawlProgress,
  CrawlFailure,
  ExtractedLink,
} from '../types'
