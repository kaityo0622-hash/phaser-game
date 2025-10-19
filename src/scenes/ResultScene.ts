// src/scenes/ResultScene.ts
import Phaser from "phaser";
import { Save } from "../systems/SaveManager";
import { GameMode } from "./TitleScene";

export default class ResultScene extends Phaser.Scene {
  constructor() { super("Result"); }

  create(data: { score: number; mode: GameMode }) {
    const { width: w, height: h } = this.scale;
    const score = data?.score ?? 0;
    const mode = data?.mode ?? GameMode.MORNING;

    this.cameras.main.setBackgroundColor("#0e0f12");

    // タイトル
    this.add.text(w / 2, 110, "リザルト", {
      color: "#ffffff",
      fontSize: "22px",
      fontFamily: "sans-serif",
    }).setOrigin(0.5);

    // スコア
    this.add.text(w / 2, 170, `SCORE: ${score}`, {
      color: "#ffffff",
      fontSize: "26px",
      fontFamily: "sans-serif",
    }).setOrigin(0.5);

    // ベストスコア（モード別）
    const bestKey =
      mode === GameMode.MORNING ? "morning" :
      mode === GameMode.NIGHT   ? "night"   : "day";
    const best = Save.getBest(bestKey as "morning"|"night"|"day");
    const modeLabel =
      mode === GameMode.DAY ? "1日" :
      mode === GameMode.MORNING ? "朝だけ" : "夜だけ";

    this.add.text(w / 2, 210, `Best（${modeLabel}）: ${best}`, {
      color: "#9aa1a9",
      fontSize: "14px",
      fontFamily: "sans-serif",
    }).setOrigin(0.5);

    // ボタン：同じモードで再挑戦
    const retry = this.add.text(w / 2, h - 120, "同じモードでもう一度", {
      color: "#151a1f",
      backgroundColor: "#e9ecef",
      padding: { x: 12, y: 8 },
      fontSize: "16px",
      fontFamily: "sans-serif",
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    retry.on("pointerup", () => this.scene.start("Game", { mode }));
    retry.on("pointerover", () => retry.setStyle({ backgroundColor: "#dee2e6" }));
    retry.on("pointerout",  () => retry.setStyle({ backgroundColor: "#e9ecef" }));

    // ボタン：タイトルへ戻る
    const back = this.add.text(w / 2, h - 70, "タイトルへ戻る", {
      color: "#151a1f",
      backgroundColor: "#e9ecef",
      padding: { x: 12, y: 8 },
      fontSize: "16px",
      fontFamily: "sans-serif",
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    back.on("pointerup", () => this.scene.start("Title"));
    back.on("pointerover", () => back.setStyle({ backgroundColor: "#dee2e6" }));
    back.on("pointerout",  () => back.setStyle({ backgroundColor: "#e9ecef" }));
  }
}
