# ara3d-data

The character data that [ara3d](https://www.npmjs.com/package/ara3d) builds characters from: the base body, body shapes, clothing, hair and textures. The ara3d browser library loads it from jsDelivr by default, so you don't usually install this package.

To serve the data yourself, install it and copy `node_modules/ara3d-data/assets/` to your site, then pass that address as `assetsUrl`:

```js
const hero = await createCharacter('The Soldier', { assetsUrl: '/ara3d-assets/' });
```

Use the ara3d-data version that your ara3d version expects (`DEFAULT_ASSETS_URL` shows it).

The data comes from MakeHuman and is CC0; `assets/LICENSE.txt` lists the sources. Docs: [ara3dgen.com/docs/library](https://ara3dgen.com/docs/library/).
