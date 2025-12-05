import { defineConfig } from 'tsup'

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/crawler/index.ts',
    'src/rag/index.ts',
    'src/generator/index.ts',
    'src/image/index.ts',
  ],
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  external: [
    '@baroclaim/ai-core',
    '@prisma/client',
    '@aws-sdk/client-s3',
    'sharp',
  ],
})
