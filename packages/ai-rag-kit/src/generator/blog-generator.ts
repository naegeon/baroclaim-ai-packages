// packages/ai-rag-kit/src/generator/blog-generator.ts
// RAG 기반 AI 블로그 자동 생성

import type { ImageSearchService } from '../rag/image-search'
import type {
  BlogGeneratorOptions,
  GeneratedBlogPost,
  GeminiClientLike,
  ImageSearchResult,
  PrismaClientLike,
  RAGContext,
  TipTapContent,
  TipTapNode,
} from '../types'

import { postProcessContent } from './post-processor'

export type { BlogGeneratorOptions, GeneratedBlogPost, TipTapContent, TipTapNode }

/** Blog Generator 서비스 옵션 */
export interface BlogGeneratorServiceOptions {
  /** Gemini 클라이언트 */
  geminiClient: GeminiClientLike
  /** Prisma 클라이언트 */
  prisma: PrismaClientLike
  /** 이미지 검색 서비스 (선택) */
  imageSearchService?: ImageSearchService
  /** 프롬프트 서비스 (선택) */
  promptService?: {
    getFullPrompt: (key: string) => Promise<{
      systemInstruction: string | null
      taskPrompt: string | null
      outputFormat: string | null
    }>
  }
}

/**
 * Blog Generator 서비스 클래스
 */
export class BlogGeneratorService {
  private geminiClient: GeminiClientLike
  private prisma: PrismaClientLike
  private imageSearchService?: ImageSearchService
  private promptService?: BlogGeneratorServiceOptions['promptService']

  constructor(options: BlogGeneratorServiceOptions) {
    this.geminiClient = options.geminiClient
    this.prisma = options.prisma
    this.imageSearchService = options.imageSearchService
    this.promptService = options.promptService
  }

  /**
   * AI 블로그 포스트 생성
   */
  async generateBlogPost(options: BlogGeneratorOptions): Promise<GeneratedBlogPost> {
    const {
      topic,
      category = '보험지식',
      tone = 'friendly',
      minWords = 800,
      includeImages = false,
      maxImagesPerPost = 3,
      removeCitations: shouldRemoveCitations = true,
    } = options

    // 1. RAG 검색으로 관련 지식 수집
    console.log(`[블로그 생성] RAG 검색 중: ${topic}`)
    const ragContexts = await this.searchKnowledge(topic)
    const contextText = this.formatRAGContext(ragContexts)

    // 2. 프롬프트 조회 (있는 경우)
    let systemInstruction: string | null = null
    let taskPrompt: string | null = null
    let outputFormat: string | null = null

    if (this.promptService) {
      console.log('[블로그 생성] DB 프롬프트 조회 중...')
      const prompts = await this.promptService.getFullPrompt('BLOG_GENERATOR')
      systemInstruction = prompts.systemInstruction
      taskPrompt = prompts.taskPrompt
      outputFormat = prompts.outputFormat
    }

    // 3. 프롬프트 변수 대체
    const variables: Record<string, string> = {
      topic,
      context: contextText,
      category,
      tone: tone === 'formal' ? '격식체' : tone === 'expert' ? '전문가 어조' : '친근한 어조',
      minWords: String(minWords),
    }

    // 시스템 인스트럭션
    const finalSystemPrompt = systemInstruction
      ? this.replacePlaceholders(systemInstruction, variables)
      : this.getDefaultSystemPrompt(minWords)

    // 태스크 프롬프트
    const finalTaskPrompt = taskPrompt
      ? this.replacePlaceholders(taskPrompt, variables)
      : this.getDefaultTaskPrompt(topic, contextText)

    // 출력 형식
    const finalOutputFormat = outputFormat || this.getDefaultOutputFormat()

    // 4. 최종 프롬프트 조합
    const fullPrompt = `${finalTaskPrompt}

[출력 형식]
중요: 반드시 아래 JSON 형식을 준수해야 하며, content 필드에 블로그 본문 전체를 포함해야 합니다.

${finalOutputFormat}

반드시 유효한 JSON만 출력하세요. 다른 텍스트 없이 JSON만 출력합니다.`

    // 5. AI 생성
    console.log('[블로그 생성] AI 호출 중...')
    const response = await this.geminiClient.generateWithFallback(fullPrompt, {
      systemInstruction: finalSystemPrompt,
    })

    // 6. JSON 파싱
    let parsed: Omit<GeneratedBlogPost, 'slug'>
    try {
      const jsonMatch =
        response.match(/```json\s*([\s\S]*?)\s*```/) ||
        response.match(/\{[\s\S]*\}/)

      const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : response
      parsed = JSON.parse(jsonStr.trim())
    } catch (error) {
      console.error('[블로그 생성] JSON 파싱 오류:', error)
      console.log('[블로그 생성] AI 응답 (처음 500자):', response.slice(0, 500))
      throw new Error('AI 응답을 파싱할 수 없습니다.')
    }

    // 7. 후처리 (인용문구 제거)
    let finalContent = parsed.content
    if (shouldRemoveCitations) {
      console.log('[블로그 생성] 인용문구 제거 중...')
      finalContent = postProcessContent(finalContent, { removeCitations: true })
    }

    // 8. 이미지 삽입 (옵션)
    if (includeImages && this.imageSearchService) {
      console.log('[블로그 생성] 이미지 삽입 중...')
      const { content: contentWithImages, insertedCount } = await this.insertImagesToContent(
        finalContent,
        { maxImages: maxImagesPerPost }
      )
      finalContent = contentWithImages
      console.log(`[블로그 생성] ${insertedCount}개 이미지 삽입 완료`)
    }

    // 9. 결과 반환
    console.log('[블로그 생성] 완료!')
    return {
      title: parsed.title,
      slug: this.generateSlug(parsed.title),
      content: finalContent,
      excerpt: parsed.excerpt,
      seoTitle: parsed.seoTitle,
      seoDescription: parsed.seoDescription,
      suggestedTags: parsed.suggestedTags || [],
    }
  }

  /**
   * 콘텐츠에 이미지 삽입
   */
  async insertImagesToContent(
    content: TipTapContent,
    options: {
      maxImages?: number
      minSimilarity?: number
    } = {}
  ): Promise<{ content: TipTapContent; insertedCount: number }> {
    const { maxImages = 3, minSimilarity = 0.35 } = options

    if (!content.content || content.content.length === 0 || !this.imageSearchService) {
      return { content, insertedCount: 0 }
    }

    const newContent: TipTapNode[] = []
    let insertedCount = 0
    const usedImageUrls = new Set<string>()

    // 섹션 (heading + 후속 paragraphs) 단위로 처리
    let currentSection: TipTapNode[] = []
    let currentHeading: TipTapNode | null = null

    for (const node of content.content) {
      if (node.type === 'heading') {
        // 이전 섹션 처리
        if (currentHeading && currentSection.length > 0 && insertedCount < maxImages) {
          const sectionText = currentSection.map(this.extractTextFromNode).join(' ')

          if (sectionText.length >= 50) {
            const images = await this.imageSearchService.searchImagesForParagraph(sectionText, {
              limit: 1,
              minSimilarity,
            })

            // 중복되지 않은 이미지만 삽입
            const validImage = images.find((img: ImageSearchResult) => !usedImageUrls.has(img.imageUrl))

            if (validImage) {
              newContent.push(currentHeading)
              newContent.push(...currentSection)
              newContent.push(this.createImageNode(validImage.imageUrl, validImage.description))
              usedImageUrls.add(validImage.imageUrl)
              insertedCount++
              currentSection = []
              currentHeading = node
              continue
            }
          }
        }

        // 이전 섹션 그대로 추가
        if (currentHeading) {
          newContent.push(currentHeading)
          newContent.push(...currentSection)
        }

        currentHeading = node
        currentSection = []
      } else {
        currentSection.push(node)
      }
    }

    // 마지막 섹션 처리
    if (currentHeading) {
      newContent.push(currentHeading)
      newContent.push(...currentSection)
    } else {
      newContent.push(...currentSection)
    }

    console.log(`[이미지 삽입] ${insertedCount}개 이미지 삽입 완료`)

    return {
      content: { type: 'doc', content: newContent },
      insertedCount,
    }
  }

  /**
   * 주제 추천 생성
   */
  async suggestBlogTopics(count: number = 5): Promise<string[]> {
    const contexts = await this.searchKnowledge('보험 청구 손해사정')

    const prompt = `
다음 자료들을 참고하여, 보험 소비자에게 유용한 블로그 주제 ${count}개를 추천해주세요.

참고자료:
${this.formatRAGContext(contexts)}

조건:
- 소비자가 실제로 궁금해할 만한 주제
- 검색 유입이 잘 될 수 있는 주제
- 최신 트렌드 반영

JSON 배열 형식으로만 출력하세요:
["주제1", "주제2", "주제3", ...]
`

    const response = await this.geminiClient.generateWithFallback(prompt)

    try {
      const jsonMatch = response.match(/\[[\s\S]*\]/)
      if (!jsonMatch) throw new Error('배열 형식 아님')
      return JSON.parse(jsonMatch[0])
    } catch {
      console.warn('[주제 추천] 파싱 실패, 기본값 반환')
      return [
        '자동차 사고 보험금 청구 방법',
        '실손보험 청구 시 주의사항',
        '손해사정사 선임 가이드',
        '보험금 분쟁 해결 절차',
        '보험 약관 해석 팁',
      ]
    }
  }

  /** 지식 검색 */
  private async searchKnowledge(query: string, limit = 5): Promise<RAGContext[]> {
    try {
      // DB에서 키워드 검색
      const docs = await this.prisma.knowledgeDocument.findMany({
        where: {
          OR: [
            { title: { contains: query, mode: 'insensitive' as const } },
            { content: { contains: query, mode: 'insensitive' as const } },
          ],
        },
        take: limit,
      })

      return docs.map((d: { id: string; title: string | null; content: string; source: string }) => ({
        documentId: d.id,
        title: d.title ?? '',
        content: d.content.slice(0, 500),
        source: d.source,
        similarity: 0.7,
      }))
    } catch (error) {
      console.error('지식 검색 오류:', error)
      return []
    }
  }

  /** RAG 컨텍스트 포맷팅 */
  private formatRAGContext(contexts: RAGContext[]): string {
    if (contexts.length === 0) {
      return '관련 참고 자료가 없습니다.'
    }

    return contexts
      .map(
        (ctx, i) =>
          `[참고자료 ${i + 1}] ${ctx.title}\n${ctx.content.slice(0, 500)}...`
      )
      .join('\n\n')
  }

  /** 슬러그 생성 */
  private generateSlug(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^가-힣a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 100)
  }

  /** 플레이스홀더 대체 */
  private replacePlaceholders(template: string, variables: Record<string, string>): string {
    let result = template
    for (const [key, value] of Object.entries(variables)) {
      result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value)
    }
    return result
  }

  /** 노드에서 텍스트 추출 */
  private extractTextFromNode(node: TipTapNode): string {
    if (node.text) return node.text
    if (!node.content) return ''
    return node.content.map((n) => {
      if (n.text) return n.text
      if (!n.content) return ''
      return n.content.map((c) => c.text || '').join(' ')
    }).join(' ')
  }

  /** 이미지 노드 생성 */
  private createImageNode(imageUrl: string, alt: string): TipTapNode {
    return {
      type: 'image',
      attrs: {
        src: imageUrl,
        alt,
        title: alt,
      },
    }
  }

  /** 기본 시스템 프롬프트 */
  private getDefaultSystemPrompt(minWords: number): string {
    return `당신은 전문 콘텐츠 에디터입니다.
사용자가 제공한 [참고 자료(RAG Context)]를 바탕으로 일반 소비자가 이해하기 쉬운 블로그 포스팅을 작성해야 합니다.

핵심 작성 원칙:
- 구조화된 가독성: 글머리 기호, 번호 매기기, 소제목(H2, H3)을 적극 활용
- 최소 ${minWords}자 이상 작성
- 실제 사례나 통계를 포함
- 소비자 관점에서 실용적인 팁 제공
- 출처를 명시적으로 언급하지 마세요`
  }

  /** 기본 태스크 프롬프트 */
  private getDefaultTaskPrompt(topic: string, contextText: string): string {
    return `입력된 **주제(Topic)**와 **참고 지식(Context)**을 바탕으로 블로그 글을 작성해 주세요.

[입력 데이터]
주제: ${topic}
참고 지식(RAG): ${contextText}

[중요 규칙]
1. title, excerpt, seoTitle, seoDescription은 별도 JSON 필드에만 작성
2. content 안에는 순수 본문만 작성 (제목, 요약 절대 중복 금지!)
3. content는 소제목(h2)으로 시작하여 본문 전개
4. h1 태그는 사용하지 않음 (제목은 title 필드에만)`
  }

  /** 기본 출력 형식 */
  private getDefaultOutputFormat(): string {
    return `{
  "title": "블로그 메인 제목 (40자 이내)",
  "seoTitle": "검색 엔진용 제목 (60자 이내)",
  "excerpt": "블로그 요약문 (150자 이내)",
  "seoDescription": "검색 엔진용 설명 (160자 이내)",
  "suggestedTags": ["태그1", "태그2", "태그3", "태그4", "태그5"],
  "content": {
    "type": "doc",
    "content": [
      { "type": "heading", "attrs": { "level": 2 }, "content": [{ "type": "text", "text": "소제목" }] },
      { "type": "paragraph", "content": [{ "type": "text", "text": "본문..." }] }
    ]
  }
}`
  }
}

/**
 * Blog Generator 서비스 생성 함수
 */
export function createBlogGeneratorService(
  options: BlogGeneratorServiceOptions
): BlogGeneratorService {
  return new BlogGeneratorService(options)
}
