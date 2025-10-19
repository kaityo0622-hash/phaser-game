import { defineConfig } from 'vite'

// Viteの設定
export default defineConfig({
  base: '/phaser-game/',   // ← ここをGitHubのリポジトリ名に！
  build: {
    outDir: 'dist',
  },
  server: {
    host: true,   // ← スマホなど他端末からアクセスできるようにする
    port: 5173,   // ← 好きなポート番号
  },
})