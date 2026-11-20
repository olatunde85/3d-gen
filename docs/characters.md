# Bodies, clothing and looks

## Quick build and Detailed

The sidebar has two modes, switched at its top. The app remembers which one you use.

**Quick build** is the guided mode, and where new visitors start. You build a character by tapping options, and it updates as you go.

- **Summary:** a sentence at the top describes the character in plain words: *"An athletic 35-year-old African man in a business suit, with cornrows and a short beard."* Each highlighted word jumps to the step that changes it.
- **Steps:**
  1. **Body:** gender, age, build and height.
  2. **Heritage:** African, Asian, Caucasian or mixed. This also sets the skin, face and eye colour.
  3. **Outfit:** 44 styles, from everyday wear and suits to uniforms (police, security, nurse scrubs, paramedic, doctor's white coat, lab coat, airline pilot, flight attendant, hard hat and hi-vis, army medic, racing jacket and clown among them), bridal/evening wear, traditional dress, warriors and beachwear. Each has a picture.
  4. **Colours:** fabric and colours for whatever the outfit lets you change, plus a custom colour.
  5. **Hair & face:** hairstyle, hair colour, facial hair, eyes and expression.
  6. **Extras:** glasses, hats (a hard hat among them), jewellery, earrings, tattoos, a bag and something to hold.
  7. **Vehicle:** pick one of fourteen vehicles to preview its matching riding/driving action. Choose a body/coat colour, Standard/Sport style and finish; Detailed has trim/mane and seat/tack colours. On foot returns to idle without a vehicle. Vehicle selection follows the active animation, including choices made in the animation bar.
  8. **Action:** play an animation, including moves for what's in hand and boarding/riding/alighting for the current vehicle.
- **Ready-made characters:** start from any preset, then change anything.
- **Never stuck:**
  - **Undo and Redo** cover every change, in both modes (also Ctrl/Cmd+Z and Shift+Ctrl/Cmd+Z).
  - **Surprise me** randomises everything you haven't picked yourself.
  - **Start over** goes back to a plain character.
  - **Unavailable options** are dimmed and say why when tapped. For example: tattoos and swimwear are for adults; a women's outfit needs a woman; a hair colour lighter than the hairstyle can take.
  - **Automatic changes are explained:** switching gender swaps the outfit for its counterpart (a pantsuit for a business suit) and says so.
- **Fine-tune:** each step links to its full controls in Detailed.

Quick build always reflects the current character, however it was made: in Detailed, from a preset or from a shared link. An outfit it doesn't offer shows as the character's own.

**Detailed** has every slider and setting, described in the rest of this page.

**On a phone:** drag the sheet's top handle to collapse, partially open or expand the controls; tapping it opens or collapses them. The character summary stays visible while the controls scroll, and the sheet remembers its height. The **⋯** menu contains download, export options, Studio, sharing, save/open settings and LLM Assist. Playback stays above the sheet, with additional options behind the sliders icon. Choosing an animation in the expanded browser closes it before playback so you can see the character.

**Bridal & evening** in Quick build includes the red cocktail dress and wedding gown, with garment thumbnails. Both also appear under **Clothing** in Detailed. The wedding outfit includes its veil, pearl necklace and heels; the cocktail dress includes heels. Quick build explains the existing gender and age requirements when an option is unavailable.

## Character LLM Assist

**LLM Assist** in the builder header creates a single character from a description. It works like [Studio's Assist](studio.md#assist):

1. **Describe** the character, or pick one of the **Ideas**. Optionally start from the current character.
2. **Write the character** with your own AI key ([Your own AI and voices](keys.md)), or **Get the JSON:** **Copy guide** (or **Save as .txt**) and give it to any AI assistant. Without a key, the builder sends nothing automatically.
3. **Review and build:** paste the assistant's whole reply (the JSON is found inside it) or open a file. A summary card shows the name, age, outfit, hair and extras, and any problem comes with a fix request to send back.

**Ask Ara**, in the bottom-right corner, can also make or change the character in a chat; the result is built straight away, with Undo.

The guide includes the installed asset IDs, all body and face controls, clothing and fabric options, equipment, presets, rig and detail settings, a JSON schema and a valid example.

Character input uses `{"kind":"ara-character","version":1,"preset":"The Adventurer","params":{"name":"Desert explorer","ageYears":34,"hair":"cornrows","carry":"backpack"}}`. A preset is optional; omitted parameters keep preset values or the builder defaults. Supplied arrays and maps replace their base values. Use `ageYears` (12–90) or normalized `age`, not both. Full `.params.json` exports can also be opened. Invalid fields, asset IDs, ranges and garment patterns are rejected before building.

**Build character** updates the normal builder controls and mesh. Undo restores the previous character, and the normal Studio button can return an edited actor to its film. Draft briefs and pasted JSON survive reloads. This mode accepts character settings only; film JSON, subtitles, text and camera shots belong in [Ara Studio](studio.md). Studio can also embed this character JSON in an actor’s `character` field, or use the same `preset`/`params` fields directly on an actor.

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

There are 63 presets, including the original athletes, professionals, warriors and game characters plus a resort guest, lifeguard, paramedic, nurse, flight attendant, airline pilot, road worker, dispatch rider, street racer, police officer (USA), MMA fighter, mob boss, clown, masked robber, getaway driver, security guard, motorcycle cop, army medic, doctor, lab scientist, explorer, chef, photographer, DJ, basketball player, footballer beach dude (tropical-print loose shorts, flip-flops and sunglasses) gamer (black oversized tee, grey baggy jeans and white over-ear headphones with green cushions), and three teens aged 13 to 15: a schoolboy (light blue uniform shirt without epaulettes, navy loose shorts, a black school bag), a schoolgirl (the same shirt in pale yellow, a maroon fitted skirt, a pink school bag) and the cool kid (purple oversized tee, black trousers, pink headphones). The doctor wears a white lab coat over blue scrubs with a stethoscope; the lab scientist wears the same coat over a pale blue blouse and charcoal trousers; the explorer wears a navy singlet, navy and brown camo cargo pants, a utility belt and a backpack. The street racer wears the full-length female casualsuit 01 T-shirt recoloured charcoal and red with its chest logo removed, an open racing jacket, matching charcoal cargo pants, an open-face motorcycle helmet and fingerless sport gloves. The builder's presets list (in Detailed) is grouped by the same categories as the characters page, alphabetically within each. *Randomize* makes reproducible random characters from a seed. Random eye colours follow the ethnicity mix.

The [characters page](https://ara3dgen.com/characters/) shows every preset with a portrait. Search it by name or by what a character wears, or filter by category (medical and science, police and military, work and travel, action and adventure, crime, sport, kids and teens, everyday and style, warriors and heritage, body types), by women or men, or by those with a vehicle. **Edit** opens the character in the builder; **Download .glb** opens it in the builder and saves it straight away as one rigged .glb with the idle, walk and run animations. The same download works on any builder link by adding `&download`, for example `app/#preset=The%20Nurse&download`.

Separate pieces include a fitted men's singlet, a resort shirt based on MakeHuman's male casualsuit 03 with short loose sleeves, open hems and a geometric print, a uniform shirt based on male casualsuit 01 with loose short sleeves and editable epaulette colour, and loose shorts with an open leg hem, gathered waistband and drawstring. Fingerless sport gloves with padded knuckles and wrist straps are available separately and worn by the MMA fighter and dispatch rider. Epaulettes are also a separate colour-editable accessory; the paramedic wears them over a solid resort shirt with suit trousers. The dispatch rider wears neutral-coloured techwear and a separate open-face motorcycle helmet with a transparent plastic visor and chin strap. His motorcycle has an optional delivery box mounted above the rear tyre under Vehicle appearance; the same option can be switched on for another motorcycle.

## Detail levels

| Level | Body | Typical triangles, dressed |
| --- | --- | --- |
| Low | MakeHuman game proxy (~1.6k quads) | ~25–50k |
| Medium | Full base mesh | ~45–65k |
| High (HD) | Catmull-Clark subdivided body + clothing | ~130–170k |

Low simplifies the body; clothing and hair keep their detail, so they make up most of a low-detail character. A full gown takes more (The Bride is about 90k at low and 110k at medium).

## Clothing

Choose a full MakeHuman outfit, an **outfit set**, or **Separate pieces**:

- **Outfit sets:** tee & baggy jeans (with a cap, Cuban chain and sneakers); a gold bikini (triangle top with halter and back ties, string bottom; the cups size themselves to the bust); an orange prison jumpsuit (collar and lapels, button placket, DOC prints front and back, rolled sleeves and trouser cuffs, worn and dirty) with a canvas backpack and worn sneakers; a pastel suit (single-button jacket with notch lapels and a close-fitting collar, pressed trousers with creases) over a tropical-print resort shirt (its collar laid over the jacket's), with layered gold chains, aviators and horsebit loafers; a white thobe (stand collar, buttoned placket, cuffs) with a keffiyeh and agal, a long gold chain, gold watch and signet ring, and leather slides; a tailored pantsuit over a satin silk blouse with pointed pumps and a structured handbag; a black clerical shirt with a tab collar under a long overcoat, with a silver cross, leather gloves and oxfords; an elegant suit and tie (MakeHuman's elegant suit with the suit, shirt and tie colours editable, plain or striped tie). Yoruba women's wear: ankara gown with flutter sleeves; ankara peplum top and pencil skirt; aso-ebi lace top (puff sleeves, double peplum, pearls) and maxi skirt with a gele. Each set shares one pattern and colour pair, comes with matching jewellery and high heels, and its pieces are also listed under Tops, Jackets and Bottoms.

- **Tops:** tank top, football shirt and basketball jersey (both numbered, see below), chef jacket (double-breasted, stand collar), fatigue shirt, uniform shirt (short or long sleeves, with epaulettes), fitted uniform shirt (male casualsuit 01 with loose short sleeves), sheriff uniform shirt (short sleeves, twin flap pockets and star badge), techwear jacket, tattered shirt, sleeveless tunic, woven tunic (buba), ankara gown, ankara peplum top, aso-ebi lace top, oversized tee, prison jumpsuit top, resort shirt, thobe (ankle-length robe), silk blouse, clerical shirt (tab collar), scrub top (V-neck, short sleeves, two lower pockets), or none (shirtless/topless).
- **Jackets** (worn over a top or fitted outfit): suit jacket, long overcoat, open racing jacket with three-quarter sleeves, shoulder panels and sewn patches, or a long version reaching the hips with full sleeves.
- **Bottoms:** briefs, cargo shorts, khaki cargo pants, fatigue/uniform/techwear/tattered pants, sheriff trousers (dark olive with gold side piping), loose trousers (sokoto), wrappers (knee or ankle length), Zulu hide aprons, a loincloth with front and back panels, pencil skirts (below the knee or ankle length), baggy jeans, prison jumpsuit trousers, suit trousers, or none.
- **Accessories:**
  - belts and straps: belts, utility belt, waist sash, crossed straps, amulet bandolier, colour-editable shoulder epaulettes
  - aprons: bib apron (a bib that widens below the chest, a strap from each top corner round the neck, a skirt to below the knee, waist ties knotted at the front; butcher's pinstripe, plain or linen)
  - armour and vests: leather armor, tactical vest, reflective hi-vis vest (worn over any top, with two silver tapes)
  - eyewear: sunglasses, sleek cat-eye sunglasses, aviators
  - headwear: keffiyeh with agal (in the Hat picker), hard hat (in the Hat picker, with a ridge and a short brim), chef hat (a tall pleated toque, in the Hat picker), over-ear headphones (cups over the ears, band over the head), baseball cap, gele (pleated head tie with lace flowers and a knotted back; it covers the hair), beret, fur headband with feathers, beaded headband, fila cap, combat helmet, open-face motorcycle helmet, holo visor, goggles
  - jewellery and charms: Cuban link chain, layered gold chains (rope and curb), long gold chain with pendant, fine gold chain with pendant, silver cross on a chain, gold signet ring, leather gloves, fingerless sport gloves, coral beads (iyun), gold necklace with pendant, pearl necklace, bangles, gold and silver bracelet watches, wrist beads, beaded collar, bead and cowrie necklaces, protective charms, brass cuffs, beaded and cowrie arm bands
  - wraps and bands: silk neck scarf (knotted at the front with two short ends), shuka shoulder drape, arm guards, fur bands, arm wraps
  - face: clown makeup (white face, red smile and nose, blue eye diamonds, arched brows), knitted balaclava with eye and mouth holes
  - other: stethoscope (round the neck, earpieces and chest piece hanging down the front), a camera on a neck strap (a DSLR with a zoom lens; *Take a picture* lifts it to the eye), knee-high sports socks with a ribbed top band, security earpiece (coiled tube), neon accents, wrist watch
- **Footwear:** MakeHuman shoes, sandals, combat boots, cowboy boots, high heels (pointed pumps on stilettos; the feet are arched in the mesh, so every animation keeps the heel pose), flip-flops, sneakers (chunky white or worn grey), horsebit loafers (patent or smooth leather), oxford dress shoes, leather slides, or barefoot. Headwear includes a broad-brimmed felt cowboy hat with a shaped crown and sheriff badge.
- **Fabrics:** generated, tileable, with normal maps: kente, aso-oke, ankara (three prints), lace, metallic foil, straw, washed denim, jersey, sports stripes and hoops, sport print, butcher's pinstripe, tropical print, keffiyeh (shemagh) check, silk satin, repp stripes, linen, worsted suiting, patent leather, damask, pleated head-tie cloth, adire, shuka plaid, cowhide, leopard, camo, MOLLE, leather, techwear, tattered.

Every piece has editable colours (Colour + Accent, for example epaulettes, a badge or reflective tape) and, where it has several, a choice of pattern.

**Jerseys:** the football shirt and the basketball jersey carry a number (0-99, set under the garment's colours) in the accent colour, outlined in the shirt colour: large on the back, and small on the chest (football) or large on the front (basketball). They come plain, in vertical stripes, in a sport print (diagonal streaks with a halftone fade) or in jersey knit; the football shirt also comes in hoops. On stripes and hoops the number is outlined in white. In files and the API the number is `garmentStyles.<id>.number`.

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
