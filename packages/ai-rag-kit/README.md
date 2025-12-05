# @baroclaim/ai-rag-kit

> RAG (Retrieval-Augmented Generation) 기반 콘텐츠 생성 도구 모음

## 설치

```bash
pnpm add @baroclaim/ai-rag-kit

# Peer Dependencies
pnpm add @baroclaim/ai-core @prisma/client

# 선택적 의존성 (이미지 처리 시)
pnpm add sharp @aws-sdk/client-s3
```

## 기능

- **Crawler**: 웹 크롤링 및 청크 분할
- **RAG**: Google File Search & pgvector 기반 검색
- **Generator**: AI 블로그 자동 생성
- **Image**: 이미지 최적화, R2 업로드, AI 분석

## 사용법

### 1. 웹 크롤링

```typescript
import { clipWebPage, splitIntoChunks } from '@baroclaim/ai-rag-kit'

// 웹페이지 클리핑
const clip = await clipWebPage('https://example.com/article')
console.log(clip.title, clip.content)

// 청크 분할
const chunks = splitIntoChunks(clip.content, {
  chunkSize: 1000,
  overlapSize: 200,
})
```

### 2. 이미지 검색 서비스

```typescript
import { createImageSearchService } from '@baroclaim/ai-rag-kit'
import { createGeminiClient } from '@baroclaim/ai-core'
import { prisma } from './db'

const imageSearch = createImageSearchService({
  prisma,
  geminiClient: createGeminiClient({ apiKey: process.env.GEMINI_API_KEY }),
})

// 이미지 검색
const images = await imageSearch.searchImages('보험금 청구 방법', {
  limit: 5,
  minSimilarity: 0.4,
})

// 이미지 추가
await imageSearch.addImageDocument(
  'https://cdn.example.com/image.webp',
  '보험금 청구 절차를 설명하는 인포그래픽',
  ['보험', '청구', '절차'],
  '보험',
  '보험금 청구 5단계 가이드',
  'admin'
)
```

### 3. 블로그 생성 서비스

```typescript
import { createBlogGeneratorService, createImageSearchService } from '@baroclaim/ai-rag-kit'

const imageSearch = createImageSearchService({ prisma, geminiClient })

const blogGenerator = createBlogGeneratorService({
  prisma,
  geminiClient,
  imageSearchService: imageSearch,
})

// 블로그 생성
const post = await blogGenerator.generateBlogPost({
  topic: '실손보험 청구 방법',
  category: '보험지식',
  tone: 'friendly',
  minWords: 800,
  includeImages: true,
  removeCitations: true,
})

console.log(post.title, post.content)
```

### 4. 이미지 파이프라인

```typescript
import { createImagePipelineService } from '@baroclaim/ai-rag-kit'

const imagePipeline = createImagePipelineService({
  prisma,
  geminiClient,
  r2Config: {
    accountId: process.env.R2_ACCOUNT_ID,
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    bucketName: process.env.R2_BUCKET_NAME,
    publicUrl: process.env.R2_PUBLIC_URL,
  },
})

// 단일 이미지 처리
const result = await imagePipeline.addImageToKnowledgeBase(imageBuffer, {
  context: '보험 청구 관련 이미지',
  uploadedBy: 'admin',
})

// URL에서 이미지 추출 후 배치 처리
const batchResult = await imagePipeline.addImagesFromUrl('https://example.com/article', {
  extractOptions: { minWidth: 200, maxImages: 10 },
})
```

## Prisma 스키마 요구사항

이 패키지를 사용하려면 다음 테이블이 필요합니다:

```prisma
model KnowledgeDocument {
  id        String   @id @default(cuid())
  title     String?
  content   String
  source    String
  metadata  Json?
  createdAt DateTime @default(now())
}

model ImageDocument {
  id             String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  imageUrl       String   @map("image_url")
  description    String
  tags           String[]
  category       String
  suggestedTitle String?  @map("suggested_title")
  usageContext   String?  @map("usage_context")
  embedding      Unsupported("vector(768)")?
  uploadedBy     String   @map("uploaded_by")
  createdAt      DateTime @default(now()) @map("created_at")

  @@map("image_documents")
}
```

## 환경변수

```bash
# Gemini API (필수)
GEMINI_API_KEY=your-api-key

# R2 스토리지 (이미지 업로드 시 필요)
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
R2_PUBLIC_URL=

# 데이터베이스 (pgvector 지원 필요)
DATABASE_URL=postgresql://...
```

## API 레퍼런스

### Crawler

| 함수 | 설명 |
|------|------|
| `clipWebPage(url, options)` | 웹페이지 클리핑 |
| `splitIntoChunks(text, options)` | 텍스트 청크 분할 |
| `extractImagesFromPage(url, options)` | 이미지 추출 |

### RAG

| 클래스 | 설명 |
|--------|------|
| `FileSearchService` | Google File Search 기반 RAG |
| `ImageSearchService` | pgvector 기반 이미지 검색 |

### Generator

| 클래스 | 설명 |
|--------|------|
| `BlogGeneratorService` | AI 블로그 생성 |
| `removeCitations()` | 인용문구 제거 |

### Image

| 클래스 | 설명 |
|--------|------|
| `ImagePipelineService` | 이미지 처리 파이프라인 |
| `R2UploaderService` | R2 업로드 |

## 라이선스

MIT
