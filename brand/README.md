# Brand source assets (NOT published — outside public/)

- `logo-master.png` — the original 1196x412 full-colour master logo (transparent PNG).
  Kept out of `public/` so the 311 KB original is never served to visitors.

## How the web assets were derived (ImageMagick)

```bash
# square mark (globe glyph padded to a square) — source for all icons
convert brand/logo-master.png -crop 420x412+0+0 +repage \
  -background none -gravity center -extent 460x460 /tmp/mark.png

# display logo (header/footer) -> public/assets/images/logo.png
convert brand/logo-master.png -resize 512x -strip -colors 128 \
  -define png:compression-level=9 public/assets/images/logo.png

# favicon / apple-touch-icon / manifest icons
convert /tmp/mark.png -resize 16x16 ... favicon.ico
convert /tmp/mark.png -resize 180x180 -colors 96 -background white -flatten apple-touch-icon.png
convert /tmp/mark.png -resize 192x192 -colors 96 android-chrome-192.png
convert /tmp/mark.png -resize 512x512 -colors 96 android-chrome-512.png
```

To re-brand: replace `logo-master.png`, re-run the commands, commit.
