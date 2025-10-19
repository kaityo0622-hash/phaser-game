// src/scenes/TitleScene.ts
import Phaser from "phaser";
import { Save } from "../systems/SaveManager";

export const GameMode = {
  MORNING: "morning",
  NIGHT: "night",
  DAY: "day",
} as const;
export type GameMode = typeof GameMode[keyof typeof GameMode];

export default class TitleScene extends Phaser.Scene {
  constructor() { super("Title"); }

  create() {
    const { width: w, height: h } = this.scale;

    // 背景
    this.cameras.main.setBackgroundColor("#0e0f12");

    // タイトル
    this.add
      .text(w / 2, 96, "phaser-game（試作）", {
        color: "#ffffff",
        fontSize: "20px",
        fontFamily: "sans-serif",
      })
      .setOrigin(0.5);

    // 縦一列ボタン
    const items: { label: string; mode: GameMode }[] = [
      { label: "3分モード", mode: GameMode.DAY },
      { label: "2分モード", mode: GameMode.MORNING },
      { label: "1分モード", mode: GameMode.NIGHT },
    ];

    let y = 160;
    for (const it of items) {
      const btn = this.add
        .text(w / 2, y, it.label, {
          color: "#151a1f",
          backgroundColor: "#e9ecef",
          padding: { x: 12, y: 8 },
          fontSize: "16px",
          fontFamily: "sans-serif",
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });

      btn.on("pointerup", () => {
        // GameScene へ遷移（mode を渡す）
        this.scene.start("Game", { mode: it.mode });
      });

      // ちょっとしたホバー演出（PC向け）
      btn.on("pointerover", () => btn.setStyle({ backgroundColor: "#dee2e6" }));
      btn.on("pointerout", () => btn.setStyle({ backgroundColor: "#e9ecef" }));

      y += 52;
    }

    // フッター：ベストスコアの表示
    const s = Save.load();
    this.add
      .text(
        w / 2,
        h - 30,
        `BEST! 3分:${s.best.day} 2分:${s.best.morning} 1分:${s.best.night} `,
        { color: "#9aa1a9", fontSize: "12px", fontFamily: "sans-serif" }
      )
      .setOrigin(0.5);
  }
}
