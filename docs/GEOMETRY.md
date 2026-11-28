# Morphē — 科学的データと計算

参照: [RCSB PDB 8ZNL](https://www.rcsb.org/structure/8ZNL)。58残基のバインダー（鎖A）と114残基のPD-L1（鎖B）の共結晶構造（1.77 Å）。同梱座標はCIでRCSBの座標と照合する。

| 工程 | 計算・表示 | 注意 |
|---|---|---|
| 01 | 重原子のvan der Waals球、4 Å以内の接触残基（17個） | 厳密な溶媒排除表面、結合エネルギー、AI条件ではない |
| 02 | 実験重原子座標、距離から推定した結合・3.5 Å未満のN/O間近接 | 水素結合を断定しない |
| 03 | 58残基のCα距離、自己を除く有向k近傍、25原子間距離、16 RBF値 | 学習された特徴量や実推論ではない |
| 04 | 参照配列、主鎖から算出した仮想Cβ方向による側鎖模式例 | 配列選択や側鎖の最適化は行わない |
| 05 | 人工変位したCα座標との標的固定RMSD・残基別距離 | 最適重ね合わせなし、予測構造ではない |

## 工程03

既定: Arg8、Val46、k=8。Cα距離5.66 Å、配列番号差38。kは1〜57、自己を除く。距離の同値は入力順で決定。実験座標から得た幾何情報を使い、近傍選択を切り替えても距離を再計算しない。ProteinMPNNの実装そのものではない。

## 検証

`tests/geometry.test.mjs`、`tests/reference.test.mjs`、`tests/geometry-reference.mjs`。実験座標と模式座標を混同しない。過去の1CRNを用いた設計履歴は [archive/geometry-history.md](archive/geometry-history.md)。

参考: [ProteinMPNN原著](https://pmc.ncbi.nlm.nih.gov/articles/PMC9997061/) ・ [RFdiffusion3公式資料](https://rosettacommons.github.io/foundry/models/rfd3/input.html)
