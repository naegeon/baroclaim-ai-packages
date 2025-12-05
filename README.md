# @baroclaim AI Packages

Gemini 기반 AI 패키지 모음 - RAG, 크롤링, 콘텐츠 생성

## 패키지

| 패키지 | 설명 | npm |
|--------|------|-----|
| `@baroclaim/ai-core` | Gemini API 클라이언트 (6가지 폴백) | [![npm](https://img.shields.io/npm/v/@baroclaim/ai-core)](https://www.npmjs.com/package/@baroclaim/ai-core) |
| `@baroclaim/ai-rag-kit` | RAG + 크롤러 + 블로그 생성 | [![npm](https://img.shields.io/npm/v/@baroclaim/ai-rag-kit)](https://www.npmjs.com/package/@baroclaim/ai-rag-kit) |

## 설치

```bash
# 코어만 설치
npm install @baroclaim/ai-core

# RAG Kit 설치 (ai-core 포함)
npm install @baroclaim/ai-core @baroclaim/ai-rag-kit

# peerDependencies (필요한 것만)
npm install @prisma/client  # RAG 사용 시
npm install sharp @aws-sdk/client-s3  # 이미지 처리 시
```

## 빠른 시작

### 1. Gemini 클라이언트

```typescript
import { GeminiClient, generateWithFallback } from '@baroclaim/ai-core'

// 클래스 방식
const client = new GeminiClient({
  apiKeys: [process.env.GEMINI_API_KEY!],
})
const result = await client.generateWithFallback('안녕하세요')

// 함수 방식 (환경변수 사용)
const result = await generateWithFallback('안녕하세요')
```

### 2. 웹 크롤링

```typescript
import { clipWebPage, splitIntoChunks } from '@baroclaim/ai-rag-kit'

const clip = await clipWebPage('https://example.com/article')
const chunks = splitIntoChunks(clip.content, {
  chunkSize: 1000,
  overlapSize: 200,
})
```

### 3. 블로그 생성

```typescript
import { createBlogGeneratorService } from '@baroclaim/ai-rag-kit'
import { GeminiClient } from '@baroclaim/ai-core'

const client = new GeminiClient({ apiKeys: [process.env.GEMINI_API_KEY!] })
const blogGenerator = createBlogGeneratorService({
  prisma: yourPrismaClient,
  geminiClient: client,
})

const post = await blogGenerator.generateBlogPost({
  topic: '인공지능 활용법',
  includeImages: true,
  removeCitations: true,
})
```

## 환경변수

```bash
# Gemini API (필수)
GEMINI_API_KEY=your-api-key
GEMINI_API_KEY_2=optional-fallback-key
GEMINI_API_KEY_3=optional-fallback-key

# R2 스토리지 (이미지 업로드 시)
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
R2_PUBLIC_URL=

# 데이터베이스 (pgvector 지원 필요)
DATABASE_URL=postgresql://...
```

## 폴백 시스템

ai-core는 6가지 폴백을 통해 API 할당량을 최대 활용합니다:

```
1군 (Pro):   키1-pro → 키2-pro → 키3-pro
    ↓ (3개 모두 막히면)
2군 (Flash): 키1-flash → 키2-flash → 키3-flash
```

## 개발

```bash
# 의존성 설치
pnpm install

# 빌드
pnpm build

# 변경사항 기록
pnpm changeset

# 배포
pnpm release
```

## 라이선스

MIT
