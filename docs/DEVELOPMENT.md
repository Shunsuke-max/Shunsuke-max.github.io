# Morphē — 開発ガイド

## 構成

```text
index.html                    ページ構造・研究展示
assets/
  css/
    base.css                  共通トークン、ナビゲーション
    design/                   設計展示（HTMLの読み込み順を維持）
      stage.css               基本画面・操作・レスポンシブ
      atomic.css              原子の表示
      graph.css               残基グラフ・行列・RBF
      refinements.css         後続の表示調整
    exhibition.css            研究・開発展示
  js/
    design.js                 状態・操作・描画の統合エントリ
    design/
      copy.mjs                章の文言・凡例・数式説明
      reference.mjs           PDB解析・模式座標
      geometry.mjs            Å単位の幾何計算（純粋関数）
      schematic.mjs           側鎖・比較用の模式座標
      mesh.mjs                Three.js描画部品
    exhibition.js             作品ギャラリー・操作
  data/8znl-ab.pdb             実験座標
  morphe-favicon.png          アイコン
tests/                        数値・静的・ブラウザ・WebGLテスト
preview-rfd3/                 過去の公開プレビュー（独立）
docs/                         現在の仕様と開発履歴
```

## 設計原則

- 参照構造はPDB 8ZNL（鎖A 58残基、鎖B 114残基）。幾何計算にはÅ単位の座標を使い、描画座標と区別する。
- 実験座標と模式表現を分離し、AI推論・結合や機能の実証を主張しない。
- 参照データが取得できない場合は模式図に切り替える。WebGLが利用できない場合はCanvasで表示する。
- 静的GitHub Pagesのルート公開を維持。ビルド・サーバー・秘密鍵は不要。Three.jsはバージョン固定の外部CDNから読み込む。
- 現在のCSS分割はカスケードを保持するための第一段階。描画ループ・UI状態は今後の分割対象。過去プレビューは既存URLを維持するため変更しない。

## テスト

Node.js 22、Python 3 が必要。

```sh
node --test tests/static.test.mjs
npm install --no-save playwright@1.51.1 three@0.170.0
npx playwright install chromium
python3 -m http.server 4173
# 別のターミナルで
node tests/browser.mjs
mkdir -p /tmp/curiosity-pdb
curl -fsSL https://files.rcsb.org/download/8ZNL.pdb -o /tmp/curiosity-pdb/8ZNL.pdb
node tests/webgl.mjs
```

CIは静的・数値・フォールバック・実験座標の照合・WebGL・PC/モバイル画面を検証する。PRでスクリーンショットを比較し、実画面で確認してからマージする。Safari/iOSの実機検証は別途必要。

## 科学的な仕様

[GEOMETRY.md](GEOMETRY.md) を参照。過去の設計経緯は [archive/geometry-history.md](archive/geometry-history.md) に保存。
