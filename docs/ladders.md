# Built-in ladder sources / 内置 Ladder 出处

Every built-in ladder in [`js/ladders.js`](../js/ladders.js) comes from the manufacturer's own product page or datasheet, identified by the catalogue number below. A wrong size produces a wrong figure, so a ladder without a source cannot be added — see [CONTRIBUTING.md](../CONTRIBUTING.md).

内置 Ladder 的条带大小全部来自厂商自己的产品页或说明书，以下表中的货号为准。大小错了就会做出错图，所以没有出处的型号不会被收录。

The table below is generated from `js/ladders.js`. **ref** = the brighter indicator bands the datasheet marks; GelFigure uses them to anchor the fit and keeps their labels first when labels have to be thinned.

下表由代码生成。**ref** 是说明书标注的加亮参考带，用于锚定拟合，并在标签过密时优先保留。

| id | Ladder | Cat. no. | Bands | Range (bp) | ref |
|---|---|---|---|---|---|
| `gr1kb` | Thermo GeneRuler 1 kb | SM0311 | 14 | 250–10000 | 6000, 3000, 1000 |
| `gr1kbplus` | Thermo GeneRuler 1 kb Plus | SM1331 | 15 | 75–20000 | 5000, 1500, 500 |
| `gr100plus` | Thermo GeneRuler 100 bp Plus | SM0321 | 14 | 100–3000 | 1000, 500 |
| `gr100` | Thermo GeneRuler 100 bp | SM0241 | 10 | 100–1000 | 500 |
| `gr50` | Thermo GeneRuler 50 bp | SM0371 | 13 | 50–1000 | 500, 250 |
| `grmix` | Thermo GeneRuler DNA Ladder Mix | SM0331 | 21 | 100–10000 | 3000, 1000, 500 |
| `grlow` | Thermo GeneRuler Low Range | SM1191 | 10 | 25–700 | 300, 100 |
| `grulow` | Thermo GeneRuler Ultra Low Range | SM1211 | 11 | 10–300 | 50 |
| `grexpress` | Thermo GeneRuler Express | SM1553 | 9 | 100–5000 | 1500, 500 |
| `neb1kb` | NEB 1 kb DNA Ladder | N3232 | 10 | 500–10000 | 3000 |
| `neb100` | NEB 100 bp DNA Ladder | N3231 | 12 | 100–1517 | 1000, 500 |
| `neb1kbplus` | NEB 1 kb Plus DNA Ladder | N3200 | 19 | 100–10000 | 3000, 1000, 500 |
| `dl2000` | Takara DL2000 | 3427A | 6 | 100–2000 | 750 |
| `dl5000` | Takara DL5000 | 3428A | 9 | 100–5000 | 1000 |
| `dl15000` | Takara DL15000 | 3582A | 7 | 250–15000 | — |
| `trans2k` | TransGen Trans2K | BM101 | 6 | 100–2000 | 750 |
| `trans2kplus` | TransGen Trans2K Plus | BM111 | 8 | 100–5000 | 750 |
| `trans2kplus2` | TransGen Trans2K Plus II | BM121 | 9 | 100–8000 | 750 |
| `trans5k` | TransGen Trans5K | — | 8 | 300–5000 | 1500 |
| `trans15k` | TransGen Trans15K | BM161 | 8 | 500–15000 | 5000 |
| `tiangen2000` | Tiangen Marker D2000 | MD114 | 6 | 100–2000 | 750 |
| `yeasen1kb` | Yeasen GoldBand 1 kb | 10510ES | 13 | 250–12000 | 4000, 1500 |
| `yeasen100plus` | Yeasen GoldBand 100 bp Plus | 10516ES | 14 | 100–3000 | 1200, 500 |

Product pages checked when the entry was added (others: look the catalogue number up on the vendor's site):

- Yeasen GoldBand 1 kb, 10510ES — [yeasen.com](https://www.yeasen.com/products/detail/492) · [EN](https://www.yeasenbio.com/products/10510)
- Yeasen GoldBand 100 bp Plus, 10516ES — [yeasen.com](https://www.yeasen.com/products/detail/2693) · [EN](https://www.yeasenbio.com/products/10516)

## Protein ladders / 蛋白 Ladder

Protein ladders are stored in kDa: the **apparent** molecular weights of the prestained bands, as the manufacturer prints them. They are calibrated in a Tris-glycine (Laemmli) system and shift with gel percentage, buffer and running conditions, so a size read from a prestained marker is an estimate — the export pre-flight check reminds you to write "apparent molecular weight" in the legend.

蛋白 Ladder 以 kDa 记录：预染条带的**表观**分子量，与厂商标注一致。这些数值在 Tris-glycine（Laemmli）体系下标定，换胶浓度、缓冲体系或电泳条件都会偏移，因此从预染 Marker 读出的数值是估算值——导出前的预检会提醒在图注中注明 "apparent molecular weight"。

| id | Ladder | Cat. no. | Bands | Range (kDa) | ref |
|---|---|---|---|---|---|
| `thermo_26616` | Thermo PageRuler 10–180 kDa | 26616 | 10 | 10–180 | 70, 25, 10 |
| `thermo_26619` | Thermo PageRuler Plus 10–250 kDa | 26619 | 9 | 10–250 | 70, 25, 10 |
| `biorad_dual` | Bio-Rad Precision Plus Dual Color | 161-0374 | 10 | 10–250 | 75, 25 |
| `yeasen_p180` | Yeasen GoldBand Plus 3-color 10–180 kDa | 26616ES | 10 | 10–180 | 70, 25, 10 |
| `yeasen_p250` | Yeasen 3-color 10–250 kDa | — | 11 | 10–250 | 70, 25 |

- Thermo PageRuler 10–180, 26616 — [thermofisher.com](https://www.thermofisher.com/order/catalog/product/26616)
- Thermo PageRuler Plus 10–250, 26619 — [thermofisher.com](https://www.thermofisher.com/order/catalog/product/26619)
- Bio-Rad Precision Plus Protein Dual Color Standards, 161-0374 — [bio-rad.com](https://www.bio-rad.com/en-us/sku/1610374-precision-plus-protein-dual-color-standards)
- Yeasen GoldBand Plus 3-color 10–180 kDa, 26616ES — [yeasen.com](https://www.yeasen.com/)

Yeasen 26616ES and Thermo 26616 have identical band sizes (10–180 kDa, 10 bands): automatic detection cannot tell them apart, so mark the tube you use as a favourite. The same applies to any other pair with identical lists.

翌圣 26616ES 与 Thermo 26616 的条带大小完全相同（10–180 kDa，10 条带），自动识别无法区分，请把你实际使用的设为常用型号。其他条带表相同的型号同理。

## Ladders that cannot be told apart / 无法自动区分的型号

Some products have **exactly the same band sizes**. Automatic detection cannot distinguish them — it can only tell you which sizes fit, not which vendor's tube you loaded. Mark the one you actually use as a favourite (★ on the marker card) and detection will prefer it; otherwise the figure may name a different vendor's equivalent ladder.

有些产品的条带大小**完全相同**，自动识别无法区分它们——算法只能判断哪些大小吻合，无法知道你上样的是哪家的管子。把你实际用的型号点 ★ 设为常用，识别时就会优先选它；否则成图上可能标成另一家的同规格 Ladder。

- Thermo GeneRuler 100 bp Plus (SM0321) ≡ Yeasen GoldBand 100 bp Plus (10516ES) — both 100–3000 bp, 14 bands
- Takara DL2000 (3427A) ≡ TransGen Trans2K (BM101) ≡ Tiangen Marker D2000 (MD114) — all 100–2000 bp, 6 bands
- Thermo PageRuler 10–180 (26616) ≡ Yeasen GoldBand Plus 3-color 10–180 (26616ES) — both 10–180 kDa, 10 bands (protein)

The reference (brighter) bands still differ between them, so picking the right one changes which labels survive thinning — and it is what the figure legend will say.

它们的加亮参考带仍然不同，所以选对型号会影响标签精简时保留哪几条，也决定图注里写的是哪家的 Ladder。

## Adding one / 添加新型号

Open an issue with the [ladder template](https://github.com/poplarity/GelFigure/issues/new?template=ladder_request.yml), or send a pull request that adds the entry to `js/ladders.js` **and** a row here, with the catalogue number and a link to the datasheet.

Watch out for near-identical names: a vendor's "100 bp" and "100 bp Plus" usually differ in both band count and range — Yeasen 10507ES has 12 bands up to 1500 bp, while 10516ES has 14 bands up to 3000 bp. Always go by the catalogue number, not the marketing name.

注意区分名字相近的型号：同一厂商的「100 bp」和「100 bp Plus」条带数和范围通常不同 —— 翌圣 10507ES 是 12 条带、到 1500 bp，10516ES 是 14 条带、到 3000 bp。请以货号为准，不要只看名字。
