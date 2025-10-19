// src/main.ts
import Phaser from "phaser";
import TitleScene from "./scenes/TitleScene";
import GameScene from "./scenes/GameScene";
import ResultScene from "./scenes/ResultScene";

new Phaser.Game({
  type: Phaser.AUTO,
  backgroundColor: "#0e0f12",

  // スマホ縦画面を前提にフィット表示
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 360,
    height: 640,
  },

  // ここに使うシーンを並べる（遷移順に依存しない）
  scene: [TitleScene, GameScene, ResultScene],
});
