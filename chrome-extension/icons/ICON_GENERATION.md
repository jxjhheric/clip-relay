# Icon Generation Instructions

The extension requires PNG icons in the following sizes:
- 16x16 (icon16.png)
- 32x32 (icon32.png)
- 48x48 (icon48.png)
- 128x128 (icon128.png)

## Option 1: Use Online Converter
1. Open `icon128.svg` in a browser
2. Use an online SVG to PNG converter (e.g., https://cloudconvert.com/svg-to-png)
3. Generate PNG files at the required sizes
4. Save them in the `icons/` directory

## Option 2: Use ImageMagick (Command Line)
If you have ImageMagick installed:

```bash
cd chrome-extension/icons
magick icon128.svg -resize 16x16 icon16.png
magick icon128.svg -resize 32x32 icon32.png
magick icon128.svg -resize 48x48 icon48.png
magick icon128.svg -resize 128x128 icon128.png
```

## Option 3: Use Inkscape (Command Line)
If you have Inkscape installed:

```bash
cd chrome-extension/icons
inkscape icon128.svg -w 16 -h 16 -o icon16.png
inkscape icon128.svg -w 32 -h 32 -o icon32.png
inkscape icon128.svg -w 48 -h 48 -o icon48.png
inkscape icon128.svg -w 128 -h 128 -o icon128.png
```

## Option 4: Use a Design Tool
1. Open `icon128.svg` in Figma, Adobe Illustrator, or similar
2. Export as PNG at the required sizes
3. Save in the `icons/` directory

## Temporary Placeholder
For testing purposes, you can use any PNG images with the correct dimensions. The extension will work with placeholder icons until you create proper ones.
