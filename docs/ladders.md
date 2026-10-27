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
| `biorad_dual` | Bio-Rad Precision Plus Dual Color | 161-0374 | 10 | 10–250 | 75, 25 |
| `biorad_allblue` | Bio-Rad Precision Plus All Blue | 161-0373 | 10 | 10–250 | 75, 50, 25 |
| `biorad_kaleido` | Bio-Rad Precision Plus Kaleidoscope | 161-0375 | 10 | 10–250 | 150, 75, 37, 25, 10 |
| `biorad_unstained` | Bio-Rad Precision Plus Unstained | 161-0363 | 10 | 10–250 | 75, 50, 25 |
| `biorad_dualxtra` | Bio-Rad Precision Plus Dual Xtra | 161-0377 | 12 | 2–250 | 75, 25, 2 |
| `thermo_26616` | Thermo PageRuler Prestained 10–180 kDa | 26616 | 10 | 10–180 | 70, 25, 10 |
| `thermo_26619` | Thermo PageRuler Plus Prestained 10–250 kDa | 26619 | 9 | 10–250 | 70, 25, 10 |
| `thermo_26614` | Thermo PageRuler Unstained 10–200 kDa | 26614 | 14 | 10–200 | 50 |
| `thermo_26610` | Thermo Pierce Unstained Protein MW Marker 14.4–116 kDa | 26610 | 7 | 14.4–116 | — |
| `thermo_26632` | Thermo PageRuler Unstained Low Range 3.4–100 kDa | 26632 | 8 | 3.4–100 | 25 |
| `thermo_26634` | Thermo Spectra Multicolor Broad Range | 26634 | 10 | 10–260 | 260, 70, 50, 40, 10 |
| `thermo_26625` | Thermo Spectra Multicolor High Range | 26625 | 8 | 40–300 | 300, 70, 50 |
| `thermo_26628` | Thermo Spectra Multicolor Low Range | 26628 | 6 | 1.7–40 | 40, 10 |
| `novex_lc5800` | Invitrogen Novex Sharp Pre-stained | LC5800 | 12 | 3.5–260 | — |
| `seeblue_lc5925` | Invitrogen SeeBlue Plus2 | LC5925 | 10 | 4–250 | — |
| `neb_p7719` | NEB Color Prestained Broad Range | P7719 | 11 | 10–250 | 72, 26 |
| `neb_p7717` | NEB Unstained Broad Range | P7717 | 13 | 10–200 | — |
| `abcam_ab116028` | Abcam Prestained Broad Range | ab116028 | 12 | 11–245 | 75, 25 |
| `genscript_m00624` | GenScript Broad Multi Color | M00624 | 10 | 10–270 | 270, 50, 30 |
| `yeasen_p180` | Yeasen GoldBand Plus 3-color 10–180 kDa | 26616ES | 10 | 10–180 | 70, 25, 10 |
| `epizyme_wj101` | Epizyme 15–150 kDa | WJ101 | 9 | 15–150 | 70, 25 |
| `epizyme_wj102` | Epizyme Two-color 10–250 kDa | WJ102 | 11 | 10–250 | 70, 25 |
| `epizyme_wj103` | Epizyme Three-color 10–250 kDa | WJ103 | 11 | 10–250 | 70, 25 |
| `epizyme_wj106` | Epizyme NIR 10–250 kDa | WJ106 | 11 | 10–250 | 70, 25 |
| `epizyme_wj107` | Epizyme Three-color 10–180 kDa | WJ107 | 10 | 10–180 | 70, 10 |
| `beyotime_p0068` | Beyotime Prestained 10–180 kDa | P0068/P0069 | 10 | 10–180 | 72, 10 |
| `beyotime_p0071` | Beyotime BeyoColor 6.5–270 kDa | P0071/P0072 | 10 | 6.5–270 | 270, 52, 30 |
| `beyotime_p0075` | Beyotime BeyoColor 10–170 kDa | P0075/P0076/P0077 | 10 | 10–170 | 70, 15 |
| `beyotime_p0776` | Beyotime BeyoColor 10–250 kDa | P0776 | 11 | 10–250 | 70, 25 |
| `beyotime_p0773` | Beyotime BeyoColor 8–180 kDa | P0773 | 10 | 8–180 | 70, 8 |
| `beyotime_p0779` | Beyotime BeyoColor 25–300 kDa | P0779 | 9 | 25–300 | 70, 25 |
| `beyotime_p0771` | Beyotime BeyoColor 2.7–40 kDa | P0771 | 9 | 2.7–40 | 40, 10 |
| `beyotime_p0060` | Beyotime Unstained 10–150 kDa | P0060 | 10 | 10–150 | — |
| `beyotime_p0063` | Beyotime Unstained 10–200 kDa | P0063 | 14 | 10–200 | 50 |
| `transgen_dm111` | TransGen Blue Plus II | DM111 | 8 | 14–120 | 120, 50, 14 |
| `transgen_dm141` | TransGen Blue Plus V | DM141 | 11 | 10–190 | 70, 20 |
| `transgen_dm151` | TransGen Blue Plus VI | DM151 | 11 | 10–250 | 72, 25 |
| `transgen_dr201` | TransGen ProteinRuler II unstained | DR201 | 9 | 12–120 | 50 |
| `solarbio_pr1910` | Solarbio Rainbow 180 | PR1910 | 10 | 11–180 | 75, 25 |
| `solarbio_pr1920` | Solarbio Rainbow 245 | PR1920 | 12 | 11–245 | 75, 25 |
| `sangon_c610110` | Sangon RealBand Marker II | C610110 | 10 | 10–180 | 72, 10 |
| `sangon_c610210` | Sangon RealBand Two-color 10–250 kDa | C610210 | 11 | 10–250 | 70, 25 |

Sizes are the **Tris-glycine (Laemmli)** values except where the system is named: PageRuler Unstained Low Range, Spectra Low Range and BeyoColor 2.7–40 are Tricine markers. Spectra Broad / High Range, SeeBlue Plus2 and Abcam ab116028 read quite differently on Bis-Tris (NuPAGE MES / MOPS) gels — for those, use a custom ladder with the values for your system. Beyotime notes that prestained sizes can vary between lots; check the sheet that came with yours.

除注明的体系外，大小均为 **Tris-glycine（Laemmli）** 体系的数值：PageRuler Unstained Low Range、Spectra Low Range 和 BeyoColor 2.7–40 是 Tricine 体系的 Marker。Spectra Broad / High Range、SeeBlue Plus2 和 Abcam ab116028 在 Bis-Tris（NuPAGE MES / MOPS）胶上的数值差别很大——用这类胶请按你的体系建自定义 Ladder。碧云天说明预染条带大小可能随批次略有不同，请以随货说明书为准。

Sources (vendor product pages and manuals, read 2026-10):
- Thermo / Invitrogen: catalogue pages thermofisher.com/order/catalog/product/<cat. no.> (Specifications); Spectra manuals MAN0011774 / MAN0011775 ("Migration Patterns"); Novex Sharp MAN0005693; SeeBlue Plus2 NuPAGE Technical Guide ("Assigned Apparent Molecular Weights", Tris-glycine 4–20 % column); Pierce Unstained Protein MW Marker MAN0011769, p. 2 (band table for the 8–16 % Tris-glycine gel)
- Bio-Rad: bulletins 4110024 (All Blue), 4110182 (Kaleidoscope), 4110023 (Unstained), 10018393 (Dual Xtra), product page 161-0374 (Dual Color)
- NEB: protein marker flyer (P7719, P7717 lanes) · Abcam: ab116028 product page
- Beyotime: product manuals P0068, P0071, P0075, P0060, P0063 and product pages P0776, P0773, P0779, P0771
- Epizyme: epizyme.cn product pages (WJ101/WJ102, WJ103, WJ106, WJ107) · TransGen: DM111, DM141, DM151 manuals, DR201 product page
- Solarbio: PR1910 / PR1920 manuals · GenScript: M00624 product page · Sangon: C610110, C610210 manuals
- Yeasen GoldBand Plus 3-color 10–180, 26616ES — yeasen.com
## Ladders that cannot be told apart / 无法自动区分的型号

Some products have **exactly the same band sizes**. Automatic detection cannot distinguish them — it can only tell you which sizes fit, not which vendor's tube you loaded. Mark the one you actually use as a favourite (★ on the marker card) and detection will prefer it; otherwise the figure may name a different vendor's equivalent ladder.

有些产品的条带大小**完全相同**，自动识别无法区分它们——算法只能判断哪些大小吻合，无法知道你上样的是哪家的管子。把你实际用的型号点 ★ 设为常用，识别时就会优先选它；否则成图上可能标成另一家的同规格 Ladder。

- Thermo GeneRuler 100 bp Plus (SM0321) ≡ Yeasen GoldBand 100 bp Plus (10516ES) — both 100–3000 bp, 14 bands
- Takara DL2000 (3427A) ≡ TransGen Trans2K (BM101) ≡ Tiangen Marker D2000 (MD114) — all 100–2000 bp, 6 bands
- Protein: Bio-Rad Precision Plus Dual Color (161-0374) ≡ All Blue (161-0373) ≡ Kaleidoscope (161-0375) ≡ Unstained (161-0363) — 10–250 kDa, 10 bands
- Protein: Thermo PageRuler 10–180 (26616) ≡ Yeasen 26616ES ≡ Epizyme WJ107 — 10–180 kDa, 10 bands
- Protein: Epizyme WJ102 ≡ WJ103 ≡ WJ106 ≡ Sangon C610210 — 10–250 kDa, 11 bands
- Protein: Thermo PageRuler Unstained (26614) ≡ Beyotime P0063 — 10–200 kDa, 14 bands
- Protein: Abcam ab116028 ≡ Solarbio PR1920 — 11–245 kDa, 12 bands

The reference (brighter) bands still differ between them, so picking the right one changes which labels survive thinning — and it is what the figure legend will say.

它们的加亮参考带仍然不同，所以选对型号会影响标签精简时保留哪几条，也决定图注里写的是哪家的 Ladder。

## Adding one / 添加新型号

Open an issue with the [ladder template](https://github.com/poplarity/GelFigure/issues/new?template=ladder_request.yml), or send a pull request that adds the entry to `js/ladders.js` **and** a row here, with the catalogue number and a link to the datasheet.

Watch out for near-identical names: a vendor's "100 bp" and "100 bp Plus" usually differ in both band count and range — Yeasen 10507ES has 12 bands up to 1500 bp, while 10516ES has 14 bands up to 3000 bp. Always go by the catalogue number, not the marketing name.

注意区分名字相近的型号：同一厂商的「100 bp」和「100 bp Plus」条带数和范围通常不同 —— 翌圣 10507ES 是 12 条带、到 1500 bp，10516ES 是 14 条带、到 3000 bp。请以货号为准，不要只看名字。
