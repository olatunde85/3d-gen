# Publishing service

Ara Play's **Publish online** button needs a small publishing service: a Cloudflare Worker that you deploy once to your own Cloudflare account. It runs on Cloudflare's free plan.

Players' games don't go into your account. Each one goes into a temporary Cloudflare account created for that player, which they can claim within 60 minutes. Cloudflare deletes unclaimed accounts. See Cloudflare's [claim deployments](https://developers.cloudflare.com/workers/platform/claim-deployments/) for the platform side.

## Why there is a service

Cloudflare's provisioning and upload API can't be called from a web page, and each temporary account's API token must not reach the browser. The service relays each step and keeps that token encrypted inside an opaque session that the browser carries between requests. It stores nothing.

| Step | What the service does |
| --- | --- |
| `POST /v1/challenge` | Fetches Cloudflare's proof-of-work challenge. The player's browser solves it in a background thread: about 16 million SHA-256 hashes, a few seconds. |
| `POST /v1/account` | Checks the game's `project.json`, then creates the temporary account and returns the sealed session and the claim link. |
| `POST /v1/manifest` | Checks the file list and opens Cloudflare's asset upload session. |
| `POST /v1/upload` | Streams one batch of files to Cloudflare. |
| `POST /v1/finish` | Uploads the fixed game server script, attaches the files and turns on the game's `workers.dev` address. |

## Guardrails

- **Allowed pages only.** Requests must come from an origin in `ALLOWED_ORIGINS`.
- **Rate limit.** Each visitor can start up to three games a minute, through the `PUBLISH_LIMIT` binding.
- **No 18+ games.** The service parses `project.json` and refuses any game where a character in any chapter has underwear off, nothing on the bottom half, or is a woman with nothing on top. Ara Play makes the same check before it uploads anything, so players see the reason straight away.
- **The checked game is the published game.** The manifest's `project.json` must have the same content hash as the copy that was checked.
- **Game files only.** Paths must be plain game files (HTML, JavaScript, CSS, JSON, text, character packs, images, audio, video and their numbered parts). Nothing may start with `_` or `.` except `/_parts.json`. Each file is at most 5 MiB; a game is at most 1,000 files and 200 MB.
- **No custom server code.** Every game runs the same fixed script (`src/publish-service/game-server.ts`). It serves the files, joins split films with byte-range support, and adds a small **Report this game** link to the page.

## Deploy

1. Deploy the service with your Cloudflare account:

   ```sh
   npm run publish:deploy
   ```

   Wrangler prints the service address, for example `https://ara-publish.<your-subdomain>.workers.dev`.

2. Give it a session secret: any random text of 32 characters or more. If you change it later, publishes that are already in progress fail and the player starts again.

   ```sh
   npx wrangler@4 secret put SESSION_SECRET -c publish/wrangler.jsonc
   ```

3. Check `ALLOWED_ORIGINS` in `publish/wrangler.jsonc` lists the pages that host Ara Play. Redeploy after changing it.

4. Build Ara Play with the service address:

   ```sh
   VITE_PUBLISH_URL=https://ara-publish.<your-subdomain>.workers.dev npm run build
   ```

   Without `VITE_PUBLISH_URL`, the button explains that publishing isn't set up and points players to **Download game ZIP**.

## Tests

`npm run test:publish` runs the guard, file splitting, the game server's joining and byte ranges, the whole service flow against a stand-in Cloudflare API (including every refusal and a check that the account token never reaches the browser), and the colour themes. `npm run test:play:browser -- --publish` runs the dialog in a browser against the real service code with a stand-in Cloudflare API.
