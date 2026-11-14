# Publishing service

Ara Play's **Publish online** button needs a small publishing service in two parts, both on free plans: a Cloudflare Worker that does almost all the work, and one account step on Deno Deploy. Cloudflare refuses to create temporary accounts for requests coming from any Worker (`worker_subrequest_blocked`), and its API doesn't accept requests from web pages, so that single request runs on a server outside Cloudflare.

Players' games don't go into your account. Each one goes into a temporary Cloudflare account created for that player, which they can claim within 60 minutes. Cloudflare deletes unclaimed accounts. See Cloudflare's [claim deployments](https://developers.cloudflare.com/workers/platform/claim-deployments/) for the platform side.

## Why there is a service

Cloudflare's provisioning and upload API can't be called from a web page, and each temporary account's API token must not reach the browser. The service relays each step and keeps that token encrypted inside an opaque session that the browser carries between requests. It stores nothing. Both parts run the same code (`src/publish-service/`) and share `SESSION_SECRET`, so a session sealed by the account step opens on the Worker.

| Step | What the service does |
| --- | --- |
| `POST /v1/challenge` | Fetches Cloudflare's proof-of-work challenge. The player's browser solves it in a background thread: about 16 million SHA-256 hashes, a few seconds. |
| `POST /v1/account` | Runs on Deno Deploy. Checks the game's `project.json`, then creates the temporary account and returns the sealed session and the claim link. |
| `POST /v1/manifest` | Checks the file list and opens Cloudflare's asset upload session. |
| `POST /v1/upload` | Streams one batch of files to Cloudflare. |
| `POST /v1/finish` | Uploads the fixed game server script, attaches the files and turns on the game's `workers.dev` address. |

## Guardrails

- **Allowed pages only.** Requests must come from an origin in `ALLOWED_ORIGINS`.
- **Rate limit.** Each visitor can start up to three games a minute: through the `PUBLISH_LIMIT` binding on the Worker, and an in-memory count on the account step.
- **No 18+ games.** The service parses `project.json` and refuses any game where a character in any chapter has underwear off, nothing on the bottom half, or is a woman with nothing on top. Ara Play makes the same check before it uploads anything, so players see the reason straight away.
- **The checked game is the published game.** The manifest's `project.json` must have the same content hash as the copy that was checked.
- **Game files only.** Paths must be plain game files (HTML, JavaScript, CSS, JSON, text, character packs, images, audio, video and their numbered parts). Nothing may start with `_` or `.` except `/_parts.json`. Each file is at most 5 MiB; a game is at most 1,000 files and 200 MB.
- **No custom server code.** Every game runs the same fixed script (`src/publish-service/game-server.ts`). It serves the files, joins split films with byte-range support, and adds a small **Report this game** link to the page.

## Deploy

1. Deploy the Worker with your Cloudflare account:

   ```sh
   npm run publish:deploy
   ```

   Wrangler prints its address, for example `https://ara-publish.<your-subdomain>.workers.dev`.

2. Create the shared settings in `publish/account/.env.deploy` (kept out of git): a `SESSION_SECRET` of 32 or more random characters, and `ALLOWED_ORIGINS` listing the pages that host Ara Play, comma-separated.

3. Give the Worker the same secret:

   ```sh
   grep '^SESSION_SECRET=' publish/account/.env.deploy | cut -d= -f2- | tr -d '\n' | npx wrangler@4 secret put SESSION_SECRET -c publish/wrangler.jsonc
   ```

4. Build the account step and deploy it to Deno Deploy. The first `deploy` signs you in and creates the app (choose the local folder and `main.js` as the entry); then load the settings and deploy again so they take effect:

   ```sh
   npm run publish:build-account
   cd publish/account
   npx deno@2 deploy
   npx deno@2 deploy env load .env.deploy
   npx deno@2 deploy --prod
   ```

5. Put both addresses in `.env` at the repository root, which every build reads:

   ```sh
   VITE_PUBLISH_URL=https://ara-publish.<your-subdomain>.workers.dev
   VITE_PUBLISH_ACCOUNT_URL=https://<your-deno-app>.deno.net
   ```

   Without `VITE_PUBLISH_URL`, the button explains that publishing isn't set up and points players to **Download game ZIP**. Local development at `http://localhost:5173` can publish too; it's in `ALLOWED_ORIGINS`.

Changing `SESSION_SECRET` means setting it on both hosts; publishes already in progress then fail and the player starts again.

## Tests

`npm run test:publish` runs the guard, file splitting, the game server's joining and byte ranges, the whole service flow against a stand-in Cloudflare API (including every refusal and a check that the account token never reaches the browser), and the colour themes. `npm run test:play:browser -- --publish` runs the dialog in a browser against the real service code with a stand-in Cloudflare API.
