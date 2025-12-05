# @baroclaim/ai-core

AI Core - Gemini API 클라이언트 (6가지 폴백 시스템)

## 설치

```bash
pnpm add @baroclaim/ai-core
```

## 특징

- **6가지 폴백 시스템**: 3개 API 키 × 2개 모델 (Pro → Flash)
- **Prisma 주입 방식**: 호스트 앱에서 Prisma 클라이언트 주입
- **프롬프트 캐싱**: DB 프롬프트 5분 메모리 캐싱
- **TypeScript**: 완전한 타입 지원

## 사용법

### 기본 사용 (환경변수)

```typescript
import { generateWithFallback } from '@baroclaim/ai-core'

// 환경변수: GEMINI_API_KEY, GEMINI_API_KEY_2, GEMINI_API_KEY_3
const result = await generateWithFallback('안녕하세요', {
  systemInstruction: '친절한 AI 어시스턴트입니다.',
})
```

### 클라이언트 인스턴스 사용

```typescript
import { GeminiClient } from '@baroclaim/ai-core'

const client = new GeminiClient({
  apiKeys: ['key1', 'key2', 'key3'],
})

const result = await client.generateWithFallback('질문')
```

### 임베딩 생성

```typescript
import { generateEmbedding } from '@baroclaim/ai-core'

const vector = await generateEmbedding('텍스트')
// 768차원 벡터 반환
```

### 프롬프트 서비스 (Prisma 주입)

```typescript
import { initPromptService, getFullPrompt, PROMPT_KEYS } from '@baroclaim/ai-core'
import { prisma } from '@/lib/db'

// 앱 초기화 시 한 번 호출
initPromptService(prisma)

// 이후 사용
const prompt = await getFullPrompt(PROMPT_KEYS.CHAT_SYSTEM)
```

## 환경변수

```env
GEMINI_API_KEY=your-api-key
GEMINI_API_KEY_2=optional-fallback-key
GEMINI_API_KEY_3=optional-fallback-key
```

## 폴백 순서

```
1군 (Pro):   키1-pro → 키2-pro → 키3-pro
    ↓ (3개 모두 막히면)
2군 (Flash): 키1-flash → 키2-flash → 키3-flash
```

## 라이선스

MIT
