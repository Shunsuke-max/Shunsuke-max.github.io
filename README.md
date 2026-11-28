# Morphē

AIによるタンパク質設計の流れを、実験構造とインタラクティブな可視化で学ぶサイト。研究・開発のポートフォリオも掲載しています。

公開サイト: https://shunsuke-max.github.io/

## 開発

ビルド不要の静的サイトです。Node.js 22 と Python 3 を使います。

```sh
node --test tests/static.test.mjs
python3 -m http.server 4173
```

- [開発・構成ガイド](docs/DEVELOPMENT.md)
- [科学的なデータと計算](docs/GEOMETRY.md)

PDB 8ZNL の実験構造を参照しています。生成・情報伝達・側鎖候補・再予測の表示は模式表現であり、AIモデルの実推論ではありません。
