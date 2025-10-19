// src/systems/SaveManager.ts

// ─────────────────────────────────────────────
// 型定義（後で図鑑や設定を拡張しやすい構造）
// ─────────────────────────────────────────────
export type CardSave = {
  discovered: boolean;   // 図鑑で開放済みか
  defeatCount: number;   // 撃退回数（カウンター成功数）
  favorite: boolean;     // お気に入り
};

export type SaveData = {
  version: number;       // スキーマバージョン
  best: {                // ベストスコア
    morning: number;
    night: number;
    day: number;         // 1日モード用（朝+夜）
  };
  cards: Record<string, CardSave>; // 図鑑（後で使う。今は空でOK）
  settings: {            // 設定（必要に応じて使う）
    bgm: number;         // 0..1
    sfx: number;         // 0..1
    lowEffects: boolean; // 低負荷モード
    colorBlind: "off" | "protan" | "deutan" | "tritan";
  };
};

// ─────────────────────────────────────────────
// 定数
// ─────────────────────────────────────────────
const KEY = "commute:save:v1";

const DEFAULT: SaveData = {
  version: 1,
  best: { morning: 0, night: 0, day: 0 },
  cards: {},
  settings: { bgm: 0.8, sfx: 1.0, lowEffects: false, colorBlind: "off" },
};

// ─────────────────────────────────────────────
// 内部ユーティリティ
// ─────────────────────────────────────────────
function safeParse(json: string | null): Partial<SaveData> {
  if (!json) return {};
  try { return JSON.parse(json) as Partial<SaveData>; }
  catch { return {}; }
}

function migrate(data: Partial<SaveData>): SaveData {
  // 将来 version を上げた時にここで変換
  const merged: SaveData = { ...DEFAULT, ...data } as SaveData;
  if (!merged.version) merged.version = 1;
  return merged;
}

// ─────────────────────────────────────────────
// 公開API
// ─────────────────────────────────────────────
export const Save = {
  load(): SaveData {
    const raw = localStorage.getItem(KEY);
    return migrate(safeParse(raw));
  },

  save(data: SaveData) {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* 容量制限など */ }
  },

  reset() { localStorage.removeItem(KEY); },

  // ーーーベストスコア操作（今すぐ使うところ）ーーー
  setBest(mode: "morning" | "night" | "day", score: number) {
    const s = this.load();
    s.best[mode] = Math.max(s.best[mode], score);
    this.save(s);
  },
  getBest(mode: "morning" | "night" | "day"): number {
    return this.load().best[mode];
  },

  // ーーー図鑑（あとで使う想定。今は未使用でもOK）ーーー
  unlockCard(cardId: number) {
    const s = this.load();
    const key = String(cardId);
    if (!s.cards[key]) s.cards[key] = { discovered: false, defeatCount: 0, favorite: false };
    s.cards[key].discovered = true;
    s.cards[key].defeatCount += 1;
    this.save(s);
  },
  setFavorite(cardId: number, fav: boolean) {
    const s = this.load();
    const key = String(cardId);
    if (!s.cards[key]) s.cards[key] = { discovered: false, defeatCount: 0, favorite: false };
    s.cards[key].favorite = fav;
    this.save(s);
  },

  // ーーー設定（必要になったら使う）ーーー
  setSetting<K extends keyof SaveData["settings"]>(key: K, value: SaveData["settings"][K]) {
    const s = this.load();
    s.settings[key] = value as any;
    this.save(s);
  },
  getSetting<K extends keyof SaveData["settings"]>(key: K): SaveData["settings"][K] {
    return this.load().settings[key];
  },
};
