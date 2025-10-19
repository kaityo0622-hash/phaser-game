// src/scenes/GameScene.ts
import Phaser from "phaser";
import { Save } from "../systems/SaveManager";
import { GameMode } from "./TitleScene";

type Enemy = Phaser.GameObjects.Arc & {
  vy: number;
  tagged?: boolean;
  defeated?: boolean;
  armedAt?: number;
};

export default class GameScene extends Phaser.Scene {
  private lanes = [90, 180, 270];

  private player!: Phaser.GameObjects.Arc;
  private playerStar!: Phaser.GameObjects.Star;       // ULT用スター
  private starPulseTw?: Phaser.Tweens.Tween;          // パルスTween
  private starRotateTw?: Phaser.Tweens.Tween;         // 回転Tween
  private npcs!: Phaser.GameObjects.Group;

  private laneIdx = 1;
  private score = 0;
  private remain = 180;
  private mode: GameMode = GameMode.MORNING;

  // スワイプ（移動＋カウンター方向）
  private swipeStart?: Phaser.Math.Vector2;
  private lastSwipeDir = new Phaser.Math.Vector2(0, 0);
  private lastSwipeAt = 0;
  private swipeConsumed = false; // スワイプ1回で多重移動させない

  // UI
  private scoreText!: Phaser.GameObjects.Text;
  private timeText!: Phaser.GameObjects.Text;

  // ゲージ本体
  private ultBar!: Phaser.GameObjects.Rectangle; // ULT（左基準）
  private ergBar!: Phaser.GameObjects.Rectangle; // RUSH（右基準）

  // ゲージの見た目幅（※3/4に短縮）
  private ultWidth = 160;
  private rushWidth = 160;

  // 無敵（ULT）
  private ultGauge = 0;         // 0..100
  private ultActive = false;
  private ultEndsAt = 0;
  private readonly ULT_DURATION_MS = 10_000;

  // ERG（被弾で上昇→ラッシュ）
  private erg = 0;              // 0..100
  private ergLockUntil = 0;     // クールダウン
  private isRush = false;
  private rushEndsAt = 0;
  private rushSpawnEvent?: Phaser.Time.TimerEvent;
  private readonly RUSH_DURATION_MS = 6_000;
  private readonly RUSH_COOLDOWN_MS = 1_000;

  // ボム（長押し 0.4s / CD 10s）
  private bombCooldownUntil = 0;
  private bombHoldStarted = 0;
  private bombBtn!: Phaser.GameObjects.Container;
  private bombBtnLabel!: Phaser.GameObjects.Text;
  private bombCdMask!: Phaser.GameObjects.Rectangle;
  // ★ 追加：起爆後に新規出現も巻き込む“余熱ウィンドウ”
  private bombBlastWindowUntil = 0;

  // キーボード
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;

  // ステータス表示
  private statusUlt!: Phaser.GameObjects.Text;
  private statusRush!: Phaser.GameObjects.Text;
  private statusUltTw?: Phaser.Tweens.Tween;
  private statusRushTw?: Phaser.Tweens.Tween;

  // 敵色
  private readonly NORMAL_ENEMY_COLOR = 0x2dd4bf;
  private readonly RUSH_ENEMY_COLOR   = 0xff4d4d;

  // スマホ用移動ボタンの表示切替
  private readonly ENABLE_MOVE_BUTTONS = false;

  // 移動ボタン（必要時のみ生成）
  private leftBtn?: Phaser.GameObjects.Container;
  private rightBtn?: Phaser.GameObjects.Container;
  private leftHoldEv?: Phaser.Time.TimerEvent;
  private rightHoldEv?: Phaser.Time.TimerEvent;

  constructor() { super("Game"); }

  create(data: { mode: GameMode }) {
    this.mode = data?.mode ?? GameMode.MORNING;

    const { width: w, height: h } = this.scale;
    this.cameras.main.setBackgroundColor("#121417");

    // モード別時間
    if (this.mode === GameMode.MORNING) this.remain = 120;
    else if (this.mode === GameMode.NIGHT) this.remain = 60;
    else this.remain = 180;

    // レーンガイド
    this.lanes.forEach((x) => this.add.rectangle(x, h / 2, 2, h, 0x1d2430, 0.5).setOrigin(0.5));

    // プレイヤー（位置は h - 106 を維持）
    this.player = this.add.circle(this.lanes[this.laneIdx], h - 106, 16, 0x64d9ff);

    // ULT時に表示する黄色い星（最初は非表示）
    this.playerStar = this.add.star(this.player.x, this.player.y, 5, 7, 20, 0xFFE066)
      .setVisible(false)
      .setDepth(this.player.depth + 1);
    this.playerStar.setStrokeStyle(2, 0xFFF2A8, 1);

    // スコア/時間
    this.scoreText = this.add.text(10, 10, "SCORE 0", { color: "#fff" });
    this.timeText  = this.add.text(w - 10, 10, String(this.remain), { color: "#fff" }).setOrigin(1, 0);

    // ゲージ可視幅（ベース160px → 3/4）
    this.ultWidth  = Math.floor(160 * 0.75);
    this.rushWidth = Math.floor(160 * 0.75);

    // 文字幅基準でバーをオフセット（3文字ぶん移動）
    const charW = 10;
    const movePx = charW * 3;

    // ── ULTゲージ（左→右）＋ラベル左端 ──
    const baseUltX = 20;
    const ultX = baseUltX + movePx;
    const ultY = 36;
    this.add.text(baseUltX - 5, ultY, "ULT", { color: "#a8b0bb", fontSize: "10px" })
      .setOrigin(0, 0.5);
    this.add.rectangle(ultX, ultY, this.ultWidth, 16, 0x2a2f3a).setOrigin(0, 0.5);
    this.ultBar = this.add.rectangle(ultX, ultY, 0, 16, 0x7CFFB2).setOrigin(0, 0.5);

    // ── RUSHゲージ（右→左）＋ラベル右端 ──
    const baseRushRight = w - 20;
    const rushRight = baseRushRight - movePx;
    const rushY = 36;
    this.add.rectangle(rushRight, rushY, this.rushWidth, 16, 0x2a2f3a).setOrigin(1, 0.5);
    this.ergBar = this.add.rectangle(rushRight, rushY, this.rushWidth, 16, 0xFF7676).setOrigin(1, 0.5);
    this.ergBar.displayWidth = 0;
    this.add.text(w - 8, rushY, "RUSH", { color: "#ff9898", fontSize: "10px" })
      .setOrigin(1, 0.5);

    // 入力（スワイプ：即時移動＋指を離したとき方向確定）
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      this.swipeStart = new Phaser.Math.Vector2(p.worldX, p.worldY);
      this.swipeConsumed = false;
    });

    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      if (!this.swipeStart || this.swipeConsumed) return;
      const cur = new Phaser.Math.Vector2(p.worldX, p.worldY);
      const v = cur.clone().subtract(this.swipeStart);
      const absX = Math.abs(v.x);
      const absY = Math.abs(v.y);
      // 横が優勢で閾値超えたら即移動
      if (absX > 14 && absX > absY * 1.2) {
        const dir = Math.sign(v.x) as -1 | 1;
        this.moveLane(dir);
        this.lastSwipeDir = v.clone().normalize();
        this.lastSwipeAt = this.time.now;
        this.swipeConsumed = true; // 多重移動防止
      }
    });

    this.input.on("pointerup", (p: Phaser.Input.Pointer) => {
      if (!this.swipeStart) return;
      const end = new Phaser.Math.Vector2(p.worldX, p.worldY);
      const v = end.clone().subtract(this.swipeStart);
      if (v.length() > 6) {
        // カウンター方向のみ更新（移動はしない）
        this.lastSwipeDir = v.clone().normalize();
        this.lastSwipeAt = this.time.now;
      }
      this.swipeStart = undefined;
      this.swipeConsumed = false;
    });

    // 敵グループ
    this.npcs = this.add.group();

    // スポーン（夜は密度UP）
    const baseInterval = (this.mode === GameMode.NIGHT) ? 750 : 900;
    this.time.addEvent({ delay: baseInterval, loop: true, callback: () => this.spawnEnemy() });

    // 残り時間タイマー
    this.time.addEvent({
      delay: 1000,
      loop: true,
      callback: () => {
        this.remain--;
        this.timeText.setText(String(this.remain));
        if (this.remain <= 0) this.finish();
      },
    });

    // ボムUI（左下）
    this.createBombButton(10, h - 64);

    // キーボード
    const keyboard = this.input.keyboard as Phaser.Input.Keyboard.KeyboardPlugin;
    this.cursors = keyboard.createCursorKeys();

    // Space長押し（PCボム）
    keyboard.on("keydown-SPACE", () => {
      if (this.time.now < this.bombCooldownUntil) return;
      if (this.bombHoldStarted === 0) {
        this.bombHoldStarted = this.time.now;
        this.bombBtnLabel.setText("HOLD...");
      }
    });
    keyboard.on("keyup-SPACE", () => {
      if (this.time.now < this.bombCooldownUntil) { this.bombHoldStarted = 0; return; }
      if (this.bombHoldStarted === 0) return;
      const heldMs = this.time.now - this.bombHoldStarted;
      this.bombHoldStarted = 0;
      if (heldMs >= 400) this.useBomb();
      else this.bombBtnLabel.setText("BOMB");
    });

    // ステータスバッジ
    this.createStatusBadges();

    // スマホ向け：左右ボタン（OFF）
    if (this.ENABLE_MOVE_BUTTONS) {
      this.createMoveButtons(w, h);
    }
  }

  // ─────────────────────────────
  // 毎フレーム更新
  // ─────────────────────────────
  update(_: number, delta: number) {
    const dt = delta / 1000;

    // ★ ボム“余熱”中：新規出現含め画面内の敵を追撃爆破
    if (this.time.now < this.bombBlastWindowUntil) {
      for (const obj of this.npcs.getChildren()) {
        const e = obj as Enemy;
        if (!e || e.defeated) continue;
        e.defeated = true;
        this.addScore(1);
        this.explodeEnemyBomb(e.x, e.y);
        e.destroy();
      }
    }

    // 矢印キー移動
    if (this.cursors?.left && Phaser.Input.Keyboard.JustDown(this.cursors.left)) {
      this.moveLane(-1);
      this.lastSwipeDir.set(-1, 0); this.lastSwipeAt = this.time.now;
    }
    if (this.cursors?.right && Phaser.Input.Keyboard.JustDown(this.cursors.right)) {
      this.moveLane(1);
      this.lastSwipeDir.set(1, 0); this.lastSwipeAt = this.time.now;
    }

    // ULT中は円と星の位置同期（保険）
    if (this.ultActive && this.playerStar.visible) {
      this.playerStar.setPosition(this.player.x, this.player.y);
    }

    // ULT発動中：残り時間バー更新
    if (this.ultActive) this.updateUltBar();

    // 無敵の終了
    if (this.ultActive && this.time.now >= this.ultEndsAt) {
      this.ultActive = false;
      this.ultGauge = 0;
      this.ultBar.setFillStyle(0x7CFFB2);
      this.updateUltBar();
      this.showUltStatus(false);

      // 見た目を戻す：星→非表示、円→表示
      this.starPulseTw?.stop(); this.starRotateTw?.stop();
      this.playerStar.setVisible(false).setScale(1).setAngle(0);
      this.player.setVisible(true).setPosition(this.playerStar.x, this.playerStar.y);
    }

    // RUSH発動中：残り時間バー更新
    if (this.isRush) this.updateErgBar();

    // ERG 減衰（ラッシュ中以外＆クールダウン外）
    if (!this.isRush && this.time.now >= this.ergLockUntil && this.erg > 0) {
      this.erg = Math.max(0, this.erg - 6 * dt); // −6%/秒
      this.updateErgBar();
    }

    // ラッシュ終了判定
    if (this.isRush && this.time.now >= this.rushEndsAt) {
      this.endRush();
    }

    // ボムのクールダウン可視化更新
    this.updateBombCooldownVisual();

    // 敵更新
    for (const obj of this.npcs.getChildren()) {
      const e = obj as Enemy;
      if (!e) continue;

      // 落下
      e.y += e.vy * dt;

      // プレイヤーとの距離
      const d = Phaser.Math.Distance.Between(e.x, e.y, this.player.x, this.player.y);

      // 無敵中：接触＝小爆発で即消滅（スコア+3据え置き）
      if (this.ultActive && d < 22 && !e.defeated) {
        e.defeated = true;
        this.explodeEnemy(e.x, e.y, e.fillColor ?? this.NORMAL_ENEMY_COLOR);
        e.destroy();
        this.addScore(3);
        continue;
      }

      // 近接でカウンター受付開始
      if (d <= 30 && !e.armedAt) e.armedAt = this.time.now;

      // カウンター判定（120ms/35°）
      if (
        e.armedAt &&
        (this.time.now - e.armedAt) <= 120 &&
        (this.time.now - this.lastSwipeAt) <= 120 &&
        !e.defeated
      ) {
        const toEnemy = new Phaser.Math.Vector2(e.x - this.player.x, e.y - this.player.y).normalize();
        const dot = Phaser.Math.Clamp(this.lastSwipeDir.dot(toEnemy), -1, 1);
        const angle = Phaser.Math.RadToDeg(Math.acos(dot));
        if (angle <= 35) {
          // 通常カウンター：RUSH中は+1点 / それ以外は+3点
          this.defeatEnemyBounceFade(e);
          this.addScore(this.isRush ? 1 : 3);
          // RUSH中はULTを貯めない
          if (!this.ultActive && !this.isRush) this.addUlt(25);
          continue;
        }
      }

      // 接触（カウンター失敗時）：RUSH中は-1点 / それ以外は-1点
      if (d < 22 && !e.defeated) {
        this.addScore(-1);
        e.destroy();
        this.cameras.main.shake(100, 0.002);
        this.onHitForErg();
        continue;
      }

      // 画面外（回避）：RUSH中はスコア増減なし / それ以外は+1
      if (!e.tagged && e.y > this.scale.height + 20) {
        e.tagged = true;
        if (!this.isRush) this.addScore(1);
        e.destroy();
      }
    }
  }

  // ─────────────────────────────
  // レーン移動
  // ─────────────────────────────
  private moveLane(dir: -1 | 1) {
    const next = Phaser.Math.Clamp(this.laneIdx + dir, 0, this.lanes.length - 1);
    if (next !== this.laneIdx) {
      this.laneIdx = next;
      this.tweens.add({
        targets: [this.player, this.playerStar], // 星も一緒に動かす
        x: this.lanes[this.laneIdx],
        duration: 90,
        ease: "Quad.easeOut",
      });
    }
  }

  // ─────────────────────────────
  // 敵演出
  // ─────────────────────────────
  private defeatEnemyBounceFade(e: Enemy) {
    e.defeated = true;
    e.vy = 0;
    e.setFillStyle(0x888888, 1);

    const halfH = this.scale.height * 0.5;
    const targetY = Math.max(-20, e.y - halfH);
    const dirX = Math.sign(e.x - this.player.x) || (Math.random() < 0.5 ? -1 : 1);
    const knockX = 80;
    const targetX = Phaser.Math.Clamp(e.x + dirX * knockX, 24, this.scale.width - 24);

    this.tweens.add({
      targets: e,
      x: targetX,
      y: targetY,
      alpha: 0,
      scale: { from: 1.0, to: 0.9 },
      angle: { from: 0, to: 18 * dirX },
      duration: 520,
      ease: "Quart.easeOut",
      onComplete: () => e.destroy(),
    });
  }

  // 無敵中：小さな爆発エフェクトで消滅（ULT）
  private explodeEnemy(x: number, y: number, _baseColor: number) {
    const ring = this.add.circle(x, y, 10, 0xFFE066).setAlpha(0.9);
    this.tweens.add({
      targets: ring,
      radius: { from: 10, to: 26 },
      alpha: { from: 0.9, to: 0 },
      duration: 220,
      ease: "Cubic.easeOut",
      onComplete: () => ring.destroy(),
    });

    const shards = 7;
    for (let i = 0; i < shards; i++) {
      const ang = (i / shards) * Math.PI * 2;
      const s = this.add.circle(x, y, 3, 0xFFD36E);
      const dist = Phaser.Math.Between(60, 90);
      const tx = x + Math.cos(ang) * dist;
      const ty = y + Math.sin(ang) * dist;
      this.tweens.add({
        targets: s,
        x: tx, y: ty,
        alpha: { from: 1, to: 0 },
        scale: { from: 1, to: 0.6 },
        duration: 260,
        ease: "Quad.easeOut",
        onComplete: () => s.destroy(),
      });
    }
  }

  // ★ ボム専用：ULTより激しい爆発（多重衝撃波＋多数の破片＋煙）
  private explodeEnemyBomb(x: number, y: number) {
    // 多重リング（衝撃波）
    const ring1 = this.add.circle(x, y, 16, 0xFFF0B3).setAlpha(0.95);
    const ring2 = this.add.circle(x, y, 10, 0xFFC76E).setAlpha(0.9);
    this.tweens.add({
      targets: ring1,
      radius: { from: 16, to: 54 },
      alpha: { from: 0.95, to: 0 },
      duration: 260,
      ease: "Cubic.easeOut",
      onComplete: () => ring1.destroy(),
    });
    this.tweens.add({
      targets: ring2,
      radius: { from: 10, to: 38 },
      alpha: { from: 0.9, to: 0 },
      duration: 300,
      ease: "Cubic.easeOut",
      onComplete: () => ring2.destroy(),
    });

    // 破片（炎色＋金色）たっぷり
    const shards = Phaser.Math.Between(16, 22);
    for (let i = 0; i < shards; i++) {
      const ang = (i / shards) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.08, 0.08);
      const c = (i % 3 === 0) ? 0xFFE066 : (i % 3 === 1 ? 0xFFB347 : 0xFFD36E);
      const s = this.add.circle(x, y, Phaser.Math.Between(3, 4), c).setAlpha(1);
      const dist = Phaser.Math.Between(90, 140);
      const tx = x + Math.cos(ang) * dist;
      const ty = y + Math.sin(ang) * dist;
      this.tweens.add({
        targets: s,
        x: tx, y: ty,
        scale: { from: 1, to: 0.5 },
        alpha: { from: 1, to: 0 },
        duration: Phaser.Math.Between(360, 460),
        ease: "Quad.easeOut",
        onComplete: () => s.destroy(),
      });
    }

    // 煙（残留感）…灰色パフがふわっと上に
    const smokes = 6;
    for (let i = 0; i < smokes; i++) {
      const dx = Phaser.Math.Between(-16, 16);
      const puff = this.add.circle(x + dx, y + Phaser.Math.Between(-6, 6), Phaser.Math.Between(10, 14), 0x60656d)
        .setAlpha(0.35);
      this.tweens.add({
        targets: puff,
        y: puff.y - Phaser.Math.Between(24, 40),
        alpha: { from: 0.35, to: 0 },
        scale: { from: 1, to: 1.2 },
        duration: Phaser.Math.Between(500, 700),
        ease: "Sine.easeOut",
        onComplete: () => puff.destroy(),
      });
    }
  }

  // ─────────────────────────────
  // フローティングテキスト（+/-表示）
  // ─────────────────────────────
  private showFloatingText(x: number, y: number, text: string, color: string) {
    const t = this.add.text(x, y, text, {
      color,
      fontSize: "18px",
      fontStyle: "bold",
      stroke: "#000",
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(1000);

    this.tweens.add({
      targets: t,
      y: y - 40,
      alpha: 0,
      duration: 600,
      ease: "Cubic.easeOut",
      onComplete: () => t.destroy(),
    });
  }

  // ─────────────────────────────
  // ボム関連
  // ─────────────────────────────
  private createBombButton(x: number, y: number) {
    const bg = this.add.rectangle(0, 0, 96, 28, 0x2a2f3a).setOrigin(0, 0.5).setStrokeStyle(1, 0x3a4150);
    this.bombCdMask = this.add.rectangle(0, 0, 96, 28, 0x000000, 0.45).setOrigin(0, 0.5).setScrollFactor(0);
    this.bombBtnLabel = this.add.text(8, 0, "BOMB", { color: "#ffffff", fontSize: "14px" }).setOrigin(0, 0.5);

    this.bombBtn = this.add.container(x, y, [bg, this.bombCdMask, this.bombBtnLabel]).setSize(96, 28);
    this.bombBtn.setInteractive({ useHandCursor: true });

    // タッチ/マウスの長押し（0.4秒）
    this.bombBtn.on("pointerdown", () => {
      if (this.time.now < this.bombCooldownUntil) return;
      this.bombHoldStarted = this.time.now;
      this.bombBtnLabel.setText("HOLD...");
    });
    this.bombBtn.on("pointerup", () => {
      if (this.time.now < this.bombCooldownUntil) return;
      const heldMs = this.time.now - this.bombHoldStarted;
      this.bombHoldStarted = 0;
      if (heldMs >= 400) {
        this.useBomb();
      } else {
        this.bombBtnLabel.setText("BOMB");
      }
    });
    this.bombBtn.on("pointerout", () => {
      if (this.bombHoldStarted > 0) {
        this.bombHoldStarted = 0;
        if (this.time.now >= this.bombCooldownUntil) this.bombBtnLabel.setText("BOMB");
      }
    });

    this.updateBombCooldownVisual(true);
  }

  private useBomb() {
    // 画面演出：強めのフラッシュ＋シェイク＋一瞬ズーム
    this.cameras.main.flash(160, 255, 245, 210);
    this.cameras.main.shake(200, 0.012);
    this.cameras.main.zoomTo(1.04, 120, "Quad.easeOut", true, (_cam, progress: number) => {
      if (progress === 1) this.cameras.main.zoomTo(1.0, 160, "Quad.easeOut");
    });

    // 画面内の未処理敵を一掃（+1/体）＋強爆発
    for (const obj of this.npcs.getChildren()) {
      const e = obj as Enemy;
      if (!e || e.defeated) continue;
      e.defeated = true;
      this.addScore(1);
      this.explodeEnemyBomb(e.x, e.y); // ULTより激しい専用爆発
      e.destroy();
    }

    // クールダウン10秒
    this.bombCooldownUntil = this.time.now + 10_000;
    this.bombBtnLabel.setText("COOL...");
    this.updateBombCooldownVisual(true);

    // ★ 追加：起爆後 220ms は新規湧きも巻き込む“余熱ウィンドウ”
    this.bombBlastWindowUntil = this.time.now + 220;
  }

  private updateBombCooldownVisual(reset = false) {
    const w = 96;
    if (this.time.now >= this.bombCooldownUntil) {
      this.bombCdMask.width = 0;
      if (!reset && this.bombHoldStarted === 0) this.bombBtnLabel.setText("BOMB");
    } else {
      const remain = this.bombCooldownUntil - this.time.now;
      const ratio = Phaser.Math.Clamp(remain / 10_000, 0, 1);
      this.bombCdMask.width = w * ratio;
    }

    // 長押し進捗（タッチ/Space共通表示）
    if (this.bombHoldStarted > 0 && this.time.now >= this.bombCooldownUntil) {
      const ratioHold = Phaser.Math.Clamp((this.time.now - this.bombHoldStarted) / 400, 0, 1);
      this.bombBtnLabel.setText(ratioHold >= 1 ? "RELEASE!" : `HOLD ${Math.round(ratioHold * 100)}%`);
    }
  }

  // ─────────────────────────────
  // ステータス（無敵／ラッシュ）表示
  // ─────────────────────────────
  private createStatusBadges() {
    const { width:w } = this.scale;

    this.statusUlt = this.add.text(w/2, 54, "無敵モード", {
      color: "#0b2e13",
      backgroundColor: "#b7f5c8",
      fontSize: "16px",
      fontFamily: "sans-serif",
      padding: { x: 10, y: 4 },
    }).setOrigin(0.5).setDepth(1000).setVisible(false);

    this.statusRush = this.add.text(w/2, 86, "ラッシュ！", {
      color: "#3b0a06",
      backgroundColor: "#ffb3a8",
      fontSize: "16px",
      fontFamily: "sans-serif",
      padding: { x: 10, y: 4 },
    }).setOrigin(0.5).setDepth(1000).setVisible(false);
  }

  private showUltStatus(on: boolean) {
    this.statusUlt.setVisible(on);
    this.statusUltTw?.stop();
    if (on) {
      this.statusUltTw = this.tweens.add({
        targets: this.statusUlt,
        scale: { from: 1.0, to: 1.06 },
        yoyo: true,
        duration: 500,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    }
  }

  private showRushStatus(on: boolean) {
    this.statusRush.setVisible(on);
    this.statusRushTw?.stop();
    if (on) {
      this.statusRushTw = this.tweens.add({
        targets: this.statusRush,
        scale: { from: 1.0, to: 1.06 },
        yoyo: true,
        duration: 500,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    }
  }

  // ─────────────────────────────
  // スコア/ゲージ/ラッシュ管理
  // ─────────────────────────────
  private addScore(v: number) {
    this.score += v;
    this.scoreText.setText("SCORE " + this.score);

    // スコア変化のフローティング表示（プレイヤー頭上）
    const color = v >= 0 ? "#66FF99" : "#FF6666";
    const text = (v > 0 ? "+" : "") + v.toString();
    this.showFloatingText(this.player.x, this.player.y - 40, text, color);
  }

  private onHitForErg() {
    if (this.ultActive) return;
    if (this.isRush) return;
    if (this.time.now < this.ergLockUntil) return;

    this.erg = Math.min(100, this.erg + 33);
    this.updateErgBar();

    if (this.erg >= 100) this.startRush();
  }

  private startRush() {
    this.isRush = true;
    this.rushEndsAt = this.time.now + this.RUSH_DURATION_MS;

    // 視覚：満タンから残り時間で減る（右端固定で左へ）
    this.ergBar.setFillStyle(0xFFB3A8);
    this.ergBar.displayWidth = this.rushWidth;

    // 既存の敵も赤化
    this.applyRushVisualToAll(true);

    // ラッシュ開始の演出（軽フラッシュが不要なら削除可）
    this.cameras.main.flash(120, 255, 120, 120);

    // ラッシュ時は湧き増し
    this.rushSpawnEvent?.remove(false);
    this.rushSpawnEvent = this.time.addEvent({
      delay: 350,
      loop: true,
      callback: () => this.spawnEnemy(true),
    });
    this.showRushStatus(true);
  }

  private endRush() {
    this.isRush = false;
    this.rushSpawnEvent?.remove(false);
    this.rushSpawnEvent = undefined;

    // 値リセット＆色戻し
    this.erg = 0;
    this.ergBar.setFillStyle(0xFF7676);
    this.updateErgBar();

    // ラッシュ後は短いクールダウン
    this.ergLockUntil = this.time.now + this.RUSH_COOLDOWN_MS;

    // 既存の敵を通常色へ戻す
    this.applyRushVisualToAll(false);

    this.showRushStatus(false);
  }

  private addUlt(amount: number) {
    this.ultGauge = Phaser.Math.Clamp(this.ultGauge + amount, 0, 100);
    if (!this.ultActive) this.updateUltBar();
    if (this.ultGauge >= 100 && !this.ultActive) this.activateUlt();
  }

  private activateUlt() {
    this.ultActive = true;
    this.ultEndsAt = this.time.now + this.ULT_DURATION_MS;
    this.ultGauge = 100;
    this.cameras.main.flash(120, 255, 255, 255);
    this.showUltStatus(true);
    this.ultBar.setFillStyle(0xFFE066);
    this.updateUltBar();

    // 見た目切替：円→非表示、星→表示＆座標同期
    this.player.setVisible(false);
    this.playerStar.setPosition(this.player.x, this.player.y).setVisible(true).setScale(1).setAngle(0);

    // 力みなぎる演出：スケール脈動＋ゆる回転
    this.starPulseTw?.stop(); this.starRotateTw?.stop();
    this.starPulseTw = this.tweens.add({
      targets: this.playerStar,
      scale: { from: 1.0, to: 1.2 },
      duration: 420,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
    this.starRotateTw = this.tweens.add({
      targets: this.playerStar,
      angle: "+=360",
      duration: 4000,
      repeat: -1,
      ease: "Linear",
    });
  }

  private updateUltBar() {
    if (this.ultActive) {
      const left = Math.max(0, this.ultEndsAt - this.time.now);
      const ratio = left / this.ULT_DURATION_MS;
      this.ultBar.width = this.ultWidth * ratio;
    } else {
      this.ultBar.width = (this.ultGauge / 100) * this.ultWidth;
    }
  }

  private updateErgBar() {
    if (this.isRush) {
      const left = Math.max(0, this.rushEndsAt - this.time.now);
      const ratio = Phaser.Math.Clamp(left / this.RUSH_DURATION_MS, 0, 1);
      this.ergBar.displayWidth = this.rushWidth * ratio;
    } else {
      const ratio = Phaser.Math.Clamp(this.erg / 100, 0, 1);
      this.ergBar.displayWidth = this.rushWidth * ratio;
    }
  }

  // ─────────────────────────────
  // 敵生成
  // ─────────────────────────────
  private spawnEnemy(isRush = false) {
    const lane = Phaser.Math.Between(0, 2);
    const color = (this.isRush || isRush) ? this.RUSH_ENEMY_COLOR : this.NORMAL_ENEMY_COLOR;
    const e = this.add.circle(this.lanes[lane], -20, 14, color) as Enemy;
    e.vy = isRush ? Phaser.Math.Between(200, 260) : Phaser.Math.Between(170, 230);
    this.npcs.add(e);
  }

  // 既存の敵を一括で赤/通常色へ
  private applyRushVisualToAll(on: boolean) {
    const col = on ? this.RUSH_ENEMY_COLOR : this.NORMAL_ENEMY_COLOR;
    for (const obj of this.npcs.getChildren()) {
      const e = obj as Enemy;
      if (!e || e.defeated) continue;
      e.setFillStyle(col, 1);
    }
  }

  // ─────────────────────────────
  // 移動ボタン（スマホ補助）※ ENABLE_MOVE_BUTTONS=true のときのみ使用
  // ─────────────────────────────
  private createMoveButtons(w: number, h: number) {
    const makeBtn = (label: string) => {
      const c = this.add.container(0, 0);
      const bg = this.add.circle(0, 0, 36, 0x2a2f3a).setStrokeStyle(2, 0x3a4150);
      const tx = this.add.text(0, 0, label, { color: "#ffffff", fontSize: "20px" }).setOrigin(0.5);
      c.add([bg, tx]);
      c.setSize(72, 72).setInteractive({ useHandCursor: true });
      c.setScrollFactor(0);
      return c;
    };

    this.leftBtn = makeBtn("◀");
    this.rightBtn = makeBtn("▶");

    const padY = h - 80;
    this.leftBtn.setPosition(80, padY);
    this.rightBtn.setPosition(w - 80, padY);

    const startHold = (dir: -1 | 1) => {
      this.moveLane(dir);
      if (dir < 0) {
        this.leftHoldEv?.remove(false);
        this.leftHoldEv = this.time.addEvent({ delay: 140, loop: true, callback: () => this.moveLane(-1) });
      } else {
        this.rightHoldEv?.remove(false);
        this.rightHoldEv = this.time.addEvent({ delay: 140, loop: true, callback: () => this.moveLane(1) });
      }
      // 軽いカウンター方向記録
      this.lastSwipeDir.set(dir, 0);
      this.lastSwipeAt = this.time.now;
    };
    const stopHold = (dir: -1 | 1) => {
      if (dir < 0) { this.leftHoldEv?.remove(false); this.leftHoldEv = undefined; }
      else { this.rightHoldEv?.remove(false); this.rightHoldEv = undefined; }
    };

    this.leftBtn.on("pointerdown", () => startHold(-1));
    this.leftBtn.on("pointerup",   () => stopHold(-1));
    this.leftBtn.on("pointerout",  () => stopHold(-1));

    this.rightBtn.on("pointerdown", () => startHold(1));
    this.rightBtn.on("pointerup",   () => stopHold(1));
    this.rightBtn.on("pointerout",  () => stopHold(1));
  }

  // ─────────────────────────────
  // 終了→リザルトへ
  // ─────────────────────────────
  private finish() {
    const bestKey =
      this.mode === GameMode.MORNING ? "morning" :
      this.mode === GameMode.NIGHT   ? "night"   : "day";
    Save.setBest(bestKey as "morning" | "night" | "day", this.score);
    this.scene.start("Result", { score: this.score, mode: this.mode });
  }
}

