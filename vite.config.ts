import { defineConfig } from 'vite'

// Viteの設定
export default defineConfig({
  base: '/phaser-game/',   // ← ここをGitHubのリポジトリ名に！
  server: {
    host: true,
    port: 5173,
  },
  build: {
    outDir: 'docs',
  },
})