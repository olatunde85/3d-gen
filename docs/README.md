# Ara 3D Gen documentation

Guides and reference for [Ara 3D Gen](../README.md), the open-source generator for realistic, rigged and animated 3D human characters. Try it at [ara3dgen.com](https://ara3dgen.com).

**Getting started**

- [Self-hosting](self-hosting.md): install, update, build, deploy, the command line, and the tests
- [Command line (ara3d)](cli.md): `npx ara3d` builds characters in any project, no clone needed; character files and schemas
- [JavaScript library (ara3d)](library.md): `createCharacter()` builds rigged, animated three.js characters in your own web app or game
- [Embed a character](embed.md): `<ara-character>` puts a live, animated character on any web page with one tag
- [AI assistants (MCP)](mcp.md): Claude, Cursor and VS Code make characters for you with `npx ara3d mcp`
- [Using characters in your engine](engines.md): Unity, Unreal, Godot, Blender and the web

**Making characters**

- [Bodies, clothing and looks](characters.md): the data behind the bodies, detail levels, clothing, hair, beards, tattoos and earrings
- [Faces, expressions and lip-sync](faces.md): blend shapes, expressions, teeth, blinking, talking and lip-sync mappings
- [Animations](animations.md): every clip, motion capture, vehicles and props, weapons
- [Content packs](packs.md): add your own animations (Mixamo, Blender, motion capture) to the builder, Studio, Play, the library and the command line
- [Your own characters](import-characters.md): open a rigged GLB or FBX character from Mixamo, Ready Player Me or Blender, play Ara's animations on it and export it with them
- [Rigging](rigging.md): skeletons, skin weights, rest poses and the weapon socket
- [Exporting](exporting.md): the Export panel and the file formats

**Making films**

- [Ara Studio](studio.md): direct films of up to five scenes, with up to five characters in 71 sets, with dialogue, sound effects, music and Assist, and export an MP4
- [Your own sets](studio-sets.md): make sets in Blender with their light baked in, export them with the Export for Ara Studio add-on, and import them into Studio

**Playing games**

- [Ara Play](play.md): missions, campaigns, arcade races and endless runs, with downloadable games
- [Hosting your game](hosting-games.md): Publish online and its limits, and other places to host a downloaded game
- [Publishing service](publishing.md): the Cloudflare Worker behind Publish online, its guardrails and how to deploy it

**AI and voices**

- [Your own AI and voices](keys.md): connect your own Gemini, Claude, OpenAI, OpenRouter or ElevenLabs key for Assist, Ask Ara and natural voices

**Under the hood**

- [Architecture](architecture.md): how the code is organised and how a character is built

Questions and showcases go in [GitHub Discussions](https://github.com/olatunde85/3d-gen/discussions); bugs and feature requests go in [Issues](https://github.com/olatunde85/3d-gen/issues). To contribute garments, hairstyles, animations or docs, see [CONTRIBUTING.md](../CONTRIBUTING.md).
