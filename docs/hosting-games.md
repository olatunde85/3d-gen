# Hosting your game

There are two ways to put an Ara Play game on the web: **Publish online**, which is quick but temporary until you claim it, and **Download game ZIP**, which you can host anywhere.

## Publish online

**Game setup → Publish online** puts the game on Cloudflare for free in about a minute, with no sign-up to start. Know its limits before you share the link widely:

- **Temporary until claimed.** The game is deleted after 60 minutes unless you claim it with **Claim it on Cloudflare** by signing in to, or creating, a free Cloudflare account. Keep the claim link private: whoever uses it owns the game.
- **Free plan limits.** A claimed game runs on Cloudflare Workers' free plan, which allows about 100,000 requests a day. Opening the game loads each of its files, usually a few dozen requests, so that's roughly a couple of thousand plays a day. Past the limit, Cloudflare refuses visits until the next day, unless you upgrade that account to Workers Paid.
- **A new address each time.** The game lives at `https://<game-name>.<random>.workers.dev`. Changing it means publishing again, which makes a new game at a new address, and claiming that one too. Earlier games stay in your Cloudflare account until you delete them. After claiming, you can add your own domain in the Cloudflare dashboard.
- **Size.** Up to 1,000 files and 200 MB. Films over about 4.5 MB are stored in parts that play as one file.
- **18+ games.** Games with 18+ characters can be downloaded but not published.
- **Visitors may see a check.** Cloudflare sometimes shows a "Just a moment…" check before the game; it passes by itself in normal browsers.

For a game you want to keep, update often or share widely, use a host from the next section.

## Other ways to host your game

**Game setup → Download game ZIP** gives you the complete game: the player, characters, textures, music and films. It doesn't depend on Ara. Unzip it and upload the whole folder, keeping every file and subfolder together, to any static web host:

| Host | Cost | How |
| --- | --- | --- |
| [Cloudflare Pages](https://developers.cloudflare.com/pages/get-started/direct-upload/) | Free, unlimited visits | In the Cloudflare dashboard: **Workers & Pages → Create → Pages → Upload assets**, then drop the unzipped folder. Files up to 25 MiB. Upload again to update the same address. |
| [Netlify Drop](https://app.netlify.com/drop) | Free tier | Drag the unzipped folder onto the page. Sign up to keep it and update it. |
| [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site) | Free for public repositories | Put the unzipped files in a repository and turn on Pages. Files over 100 MB need Git LFS. |
| [itch.io](https://itch.io/docs/creators/html5) | Free | Create a project of kind **HTML** and upload the ZIP as it is; tick **This file will be played in the browser**. |
| Your own server | Varies | Serve the folder over HTTPS as static files. Films seek properly when the server supports byte ranges, which common servers do. |

The game needs to be served over `http://` or `https://`. Opening `index.html` straight from your computer won't load its files. To try it locally, run `python3 -m http.server 8080` in the unzipped folder and visit `http://localhost:8080`.

## Put the game on your own page

A hosted game can sit inside another page, such as a blog post, a portfolio or a launch page, in an `<iframe>`. Paste this where the game should go and change the address and name:

```html
<div class="ara-game" data-src="https://your-host.example/my-game/" style="position:relative;max-width:960px;aspect-ratio:16/10;background:#09090b center/cover;border-radius:12px;display:grid;place-items:center">
  <button style="font:600 18px system-ui;padding:14px 26px;border:0;border-radius:999px;background:#f4f4f5;color:#09090b;cursor:pointer">▶ Play My Game</button>
</div>
<script>
  // Loads the game only when someone presses Play, so it doesn't slow the page down. Phones open it full page instead.
  for (const box of document.querySelectorAll('.ara-game')) box.querySelector('button').onclick = () => {
    if (matchMedia('(max-width: 700px)').matches) { location.href = box.dataset.src; return; }
    box.innerHTML = `<iframe src="${box.dataset.src}" title="Game" allow="fullscreen; gamepad; autoplay" style="position:absolute;inset:0;width:100%;height:100%;border:0;border-radius:inherit"></iframe>`;
  };
</script>
```

- **A picture behind Play:** add `background-image:url(cover.jpg)` to the box's style, such as a screenshot of the game.
- **Keyboard:** keys reach the game after a click inside it. A mission pauses when the game loses focus, for example when someone clicks elsewhere on the page, and **Keep playing** carries on.
- **Full screen and controllers:** the `allow="fullscreen; gamepad; autoplay"` setting lets the game's full-screen button, gamepads and music work inside the frame.
- **Which games to embed:** your own copy on your host, or a published game you've claimed. An unclaimed game is deleted after an hour, and Cloudflare's "Just a moment…" check can fail inside a frame on another site.
- **Phones:** the snippet opens the game full page on small screens, where a 3D game in a box is cramped and uses a lot of memory.
- **Load on your server:** none. The game's files come from the host it lives on.
