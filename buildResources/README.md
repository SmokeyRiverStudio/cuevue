# CueVue Build Resources

`icon-source.svg` is the editable 1024 x 1024 app icon source.

`icon-source.png` is the 1024 x 1024 raster source used to generate `icon.icns`.

`icon.icns` is referenced by `electron-builder` for macOS `.app` and `.dmg` packaging.

For a final production icon, replace `icon-source.svg` with the approved artwork, export a 1024 x 1024 PNG, regenerate `icon.icns`, then run:

```bash
npm run build
```
