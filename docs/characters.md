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

There are 23 presets (athletes, a detective, a secret agent, a soldier, a cyberpunk hacker, a wasteland survivor, African warriors, Nigerian Police and FRSC officers, a beach girl, a gangster, a prison escapee and an 80s Miami dealer), and *Randomize* makes reproducible random characters from a seed. Random eye colours follow the ethnicity mix.

## Detail levels

| Level | Body | Typical triangles |
| --- | --- | --- |
| Low | MakeHuman game proxy (~1.6k quads) | ~5–10k |
| Medium | Full base mesh | ~30–40k |
| High (HD) | Catmull-Clark subdivided body + clothing | ~100–120k |

## Clothing

Choose a full MakeHuman outfit, an **outfit set**, or **Separate pieces**:

- **Outfit sets:** tee & baggy jeans (with a cap, Cuban chain and sneakers); a gold bikini (triangle top with halter and back ties, string bottom; the cups size themselves to the bust); an orange prison jumpsuit (collar and lapels, button placket, DOC prints front and back, rolled sleeves and trouser cuffs, worn and dirty) with a canvas backpack and worn sneakers; a pastel suit (single-button jacket with notch lapels and a close-fitting collar, pressed trousers with creases) over a tropical-print resort shirt (its collar laid over the jacket's), with layered gold chains, aviators and horsebit loafers. Yoruba women's wear: ankara gown with flutter sleeves; ankara peplum top and pencil skirt; aso-ebi lace top (puff sleeves, double peplum, pearls) and maxi skirt with a gele. Each set shares one pattern and colour pair, comes with matching jewellery and high heels, and its pieces are also listed under Tops, Jackets and Bottoms.

- **Tops:** tank top, fatigue shirt, uniform shirt (short or long sleeves, with epaulettes), techwear jacket, tattered shirt, sleeveless tunic, woven tunic (buba), ankara gown, ankara peplum top, aso-ebi lace top, oversized tee, prison jumpsuit top, resort shirt, or none (shirtless/topless).
- **Jackets** (worn over any top; the top shows only in the V and at the collar): suit jacket.
- **Bottoms:** briefs, cargo shorts, fatigue/uniform/techwear/tattered pants, loose trousers (sokoto), wrappers (knee or ankle length), Zulu hide aprons, a loincloth with front and back panels, pencil skirts (below the knee or ankle length), baggy jeans, prison jumpsuit trousers, suit trousers, or none.
- **Accessories:**
  - belts and straps: belts, utility belt, waist sash, crossed straps, amulet bandolier
  - armour and vests: leather armor, tactical vest, reflective hi-vis vest
  - eyewear: sunglasses, aviators
  - headwear: baseball cap, gele (pleated head tie with lace flowers and a knotted back; it covers the hair), beret, fur headband with feathers, beaded headband, fila cap, combat helmet, holo visor, goggles
  - jewellery and charms: Cuban link chain, layered gold chains (rope and curb), coral beads (iyun), gold necklace with pendant, pearl necklace, bangles, gold and silver bracelet watches, wrist beads, beaded collar, bead and cowrie necklaces, protective charms, brass cuffs, beaded and cowrie arm bands
  - wraps and bands: shuka shoulder drape, arm guards, fur bands, arm wraps
  - bags: canvas backpack (webbing straps over the shoulders)
  - other: neon accents, wrist watch
- **Footwear:** MakeHuman shoes, sandals, combat boots, high heels (the feet are arched in the mesh, so every animation keeps the heel pose), flip-flops, sneakers (chunky white or worn grey), horsebit loafers (patent or smooth leather), or barefoot.
- **Fabrics:** generated, tileable, with normal maps: kente, aso-oke, ankara (three prints), lace, metallic foil, straw, washed denim, jersey, tropical print, linen, worsted suiting, patent leather, damask, pleated head-tie cloth, adire, shuka plaid, cowhide, leopard, camo, MOLLE, leather, techwear, tattered.

Every piece has editable colours (Colour + Accent, for example epaulettes, a badge or reflective tape) and, where it has several, a choice of pattern.

The presets include two Nigerian uniforms:
- **Nigerian Police:** an all-black uniform with short sleeves, a beret and a duty belt.
- **FRSC officer:** a beige short-sleeve shirt after the FRSC No. 5b dress, black trousers, a maroon beret and a service belt.

The uniform shirt comes in short and long sleeves, and a hi-vis reflective vest is available as an accessory.

Garments are grown from the body surface or wrapped around it with convex-hull rings, so they fit every body shape.

## Hair, beards, tattoos, earrings

- **Hairstyles:** MakeHuman hair, plus generated **buzz cut**, **punk mohawk** (liberty spikes, shaved sides), **cornrows** and **box braids**. These follow every head shape and take their own *Hair colour*.
- **Facial hair:** stubble, mustache (alone or over stubble), goatee, short beard or full beard, with a *Beard colour*. Beards are hair cards (alpha-masked strips, the usual game approach) over a stubble layer. With facial bones on, they follow the jaw.
- **Tattoos** (adults 18+ only): tribal armband, full sleeve, forearm bands, chest piece, back piece, and Yoruba-style cheek marks, with an ink colour.
- **Earrings:** studs, small hoops or big hoops, in gold or silver.

Tattoos, stubble and shaved scalps are painted into one RGBA "Skin details" texture in the body's UV space:
- **Placement:** the texture sits on a thin copy of the skin it covers, 0.4 mm above it.
- **Fit:** designs are defined on the unmorphed base mesh, so they keep their shape on every body.
- **Speed:** the texture is cached while you move sliders.

## Adult-only options

Topless and bottomless (no underwear) are only possible for characters aged 18+. Under-18 female characters always get a top, and every under-18 character keeps underwear. Bodies are anatomically neutral (no genital geometry).
