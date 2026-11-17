# Ara starter templates

Small projects to copy and build on. Each one opens and runs in your browser on StackBlitz, with nothing to install.

| Template | What it shows | Open |
|---|---|---|
| [three-starter](three-starter) | A character you steer with the keyboard or by clicking the ground. It walks, runs and looks at you when it stops (`locomotion()` and `lookAt()`). | [StackBlitz](https://stackblitz.com/github/olatunde85/3d-gen/tree/main/examples/three-starter) |
| [react-three-fiber](react-three-fiber) | A reusable `<Character>` component for React Three Fiber. Pick a preset, click to walk there, double-click to run. | [StackBlitz](https://stackblitz.com/github/olatunde85/3d-gen/tree/main/examples/react-three-fiber) |
| [html-embed](html-embed) | Characters on a plain web page with the `<ara-character>` tag, with no build step: one follows the pointer, one plays a sequence. | [StackBlitz](https://stackblitz.com/github/olatunde85/3d-gen/tree/main/examples/html-embed) |

To run one on your machine, copy its folder, then:

```bash
npm install
npm run dev
```

The character data loads from jsDelivr, so the first character takes a few seconds. See the [library guide](https://ara3dgen.com/docs/library/) and the [embed guide](https://ara3dgen.com/docs/embed/) for everything else.
