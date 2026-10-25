# Bodies, clothing and looks

## The data behind the bodies

Realism comes from data, not hand-built shapes. The generator uses the MakeHuman anatomy dataset, which has been CC0 (public domain) since 2020:

- **Base mesh:** an artist-made, animation-ready human (13,378 quads).
- **Morph targets:** 935 targets.
  - Macro controls (gender, age, muscle, weight, height, proportions, ethnicity, breast) blend across a lattice of targets, exactly like MakeHuman.
  - 219 detail sliders (head shape, nose, mouth, eyes, ears, chin, cheeks, torso, limbs…) add targets on top.
  - Left/right pairs are merged into one symmetric slider.
- **Proxies:** eyes, eyebrows, eyelashes, teeth, tongue, 10 hairstyles, 12 outfits, 6 shoes and 2 hats. Each vertex is fitted to a triangle of body vertices (`.mhclo`), so clothing follows any body shape. Skin under clothing is removed to prevent poke-through.
- **Textures:**
  - 20 photo-based skins (young / middle-aged / old × African / Asian / Caucasian × male / female), picked automatically
  - diffuse and normal maps for clothes, and alpha textures for hair and lashes
  - 11 eye colours: MakeHuman's 9, plus dark brown and black-brown, the most common shades

There are 19 presets (athletes, a detective, a secret agent, a soldier, a cyberpunk hacker, a wasteland survivor, African warriors and Nigerian Police and FRSC officers), and *Randomize* makes reproducible random characters from a seed. Random eye colours follow the ethnicity mix.

## Detail levels

| Level | Body | Typical triangles |
| --- | --- | --- |
| Low | MakeHuman game proxy (~1.6k quads) | ~5–10k |
| Medium | Full base mesh | ~30–40k |
| High (HD) | Catmull-Clark subdivided body + clothing | ~100–120k |

## Clothing

Choose a full MakeHuman outfit, or **Separate pieces**:

- **Tops:** tank top, fatigue shirt, uniform shirt (short or long sleeves, with epaulettes), techwear jacket, tattered shirt, sleeveless tunic, woven tunic (buba), or none (shirtless/topless).
- **Bottoms:** briefs, cargo shorts, fatigue/uniform/techwear/tattered pants, loose trousers (sokoto), wrappers (knee or ankle length), Zulu hide aprons, a loincloth with front and back panels, or none.
- **Accessories:**
  - belts and straps: belts, utility belt, waist sash, crossed straps, amulet bandolier
  - armour and vests: leather armor, tactical vest, reflective hi-vis vest
  - headwear: beret, fur headband with feathers, beaded headband, fila cap, combat helmet, holo visor, goggles
  - jewellery and charms: beaded collar, bead and cowrie necklaces, protective charms, brass cuffs, beaded and cowrie arm bands
  - wraps and bands: shuka shoulder drape, arm guards, fur bands, arm wraps
  - other: neon accents, wrist watch
- **Footwear:** MakeHuman shoes, sandals, combat boots, or barefoot.
- **Fabrics:** generated, tileable, with normal maps: kente, aso-oke, ankara, adire, shuka plaid, cowhide, leopard, camo, MOLLE, leather, techwear, tattered.

Every piece has editable colours (Colour + Accent, for example epaulettes, a badge or reflective tape) and, where it has several, a choice of pattern.

The presets include two Nigerian uniforms:
- **Nigerian Police:** an all-black uniform with short sleeves, a beret and a duty belt.
- **FRSC officer:** a beige short-sleeve shirt after the FRSC No. 5b dress, black trousers, a maroon beret and a service belt.

The uniform shirt comes in short and long sleeves, and a hi-vis reflective vest is available as an accessory.

Garments are grown from the body surface or wrapped around it with convex-hull rings, so they fit every body shape.

## Hair, beards, tattoos, earrings

- **Hairstyles:** MakeHuman hair, plus generated **buzz cut**, **punk mohawk** (liberty spikes, shaved sides), **cornrows** and **box braids**. These follow every head shape and take their own *Hair colour*.
- **Facial hair:** stubble, mustache, goatee, short beard or full beard, with a *Beard colour*. Beards are hair cards (alpha-masked strips, the usual game approach) over a stubble layer. With facial bones on, they follow the jaw.
- **Tattoos** (adults 18+ only): tribal armband, full sleeve, forearm bands, chest piece, back piece, and Yoruba-style cheek marks, with an ink colour.
- **Earrings:** studs, small hoops or big hoops, in gold or silver.

Tattoos, stubble and shaved scalps are painted into one RGBA "Skin details" texture in the body's UV space:
- **Placement:** the texture sits on a thin copy of the skin it covers, 0.4 mm above it.
- **Fit:** designs are defined on the unmorphed base mesh, so they keep their shape on every body.
- **Speed:** the texture is cached while you move sliders.

## Adult-only options

Topless and bottomless (no underwear) are only possible for characters aged 18+. Under-18 female characters always get a top, and every under-18 character keeps underwear. Bodies are anatomically neutral (no genital geometry).
