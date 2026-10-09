# Písma

Obě písma jsou stažená z oficiálního repozitáře Google Fonts (github.com/google/fonts, větev main, 2026-10-09)
a jsou pod licencí SIL Open Font License 1.1 (viz OFL-*.txt). Nic se nenačítá z cizích serverů.

- `Boldonse-Regular-latin-ext.woff2` – `ofl/boldonse/Boldonse-Regular.ttf`, podmnožina znaků latinky (vč. češtiny), WOFF2.
- `GoogleSansFlex-latin-ext.woff2` – `ofl/googlesansflex/GoogleSansFlex[GRAD,ROND,opsz,slnt,wdth,wght].ttf`,
  instance s osou `wght` 400–700 (wdth 100, opsz 18, GRAD/ROND/slnt 0), podmnožina latinky, WOFF2.
  Název „Google Sans Flex“ je ochranná známka Google LLC (viz TRADEMARKS-GoogleSansFlex.md); aplikace ho nepoužívá
  jako označení produktu.

Úpravy (instance a podmnožina) jsou udělané nástrojem fontTools:

```
fonttools varLib.instancer GoogleSansFlex[...].ttf wght=400:700 wdth=100 opsz=18 GRAD=0 ROND=0 slnt=0 -o gsf-inst.ttf
fonttools subset <font> --unicodes="U+0000-00FF,U+0100-017F,U+2000-206F,U+2190-21FF,U+2212,U+2248,…" \
  --layout-features='*' --flavor=woff2
```
