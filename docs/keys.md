# Your own AI and voices

Ara can use your own AI and voice accounts. With a key connected, Assist writes characters, films and games for you in the app, **Ask Ara** chats and builds from the corner of the builder, Studio and Play, and Sound gives characters natural voices. You pay the provider directly, usually a cent or two a request. Without a key, everything else in Ara works as before, and Assist still works with any AI chat by copy and paste.

## Providers

| Provider | Used for | Keys start with | Free use |
|---|---|---|---|
| Google Gemini | Assist, Ask Ara and voices | `AIza…` | A daily allowance for keys from Google AI Studio |
| Anthropic Claude | Assist and Ask Ara | `sk-ant-…` | — |
| OpenAI | Assist and Ask Ara | `sk-…` | — |
| OpenRouter | Assist and Ask Ara (one key for many models) | `sk-or-…` | Some free models |
| ElevenLabs | Voices, including your own cloned voices | `sk_…` | A monthly allowance |

One Gemini key covers both writing and voices.

## Connecting a key

Open **Keys** from Assist (**Connect a key** or **Change**), from Ask Ara (the model button at the top), or from Sound (**More voices**). Paste a key and press **Connect**. Ara recognises the provider from the key, or asks which service it is for, then checks it with a free request and shows what it found: the models it can use, or the voices and how much of the monthly allowance is left.

- **Assist writes with:** the model Assist and Ask Ara use. The first one listed for each provider is the recommended one; prices and free allowances are shown next to each.
- **Voice new dialogue automatically:** when Assist builds a film or game, its dialogue is voiced straight away with your connected voices.
- **Remember keys on this device:** on by default. Turn it off on a shared computer and keys are forgotten when the browser closes.
- **Remove** takes a key out of this browser; **Remove all keys** removes every one.

### Where your key goes

Your key is kept in this browser only and sent straight from the page to its provider. Ara has no server in between and never receives your key or what you write. Every Ara app on the same site shares the keys in that browser.

You can set a monthly spending limit in your provider's settings for a hard cap.

### When a key doesn't work

Ara explains each problem in plain words, with what to do next:

- **A wrong or revoked key, no credit, a spent allowance or a rate limit.** Busy servers and rate limits are retried automatically before Ara reports them.
- **An Anthropic organisation key that needs a workspace:** paste the workspace ID (Anthropic Console › Workspaces) when asked, or create a key inside a workspace.
- **An Anthropic organisation that doesn't allow calls from web pages** (organisations with zero data retention or certain compliance settings): the key can't be used in any web app. Use a key from another organisation, or reach Claude through OpenRouter.
- **A restricted ElevenLabs key:** allow Text to Speech, Voices (read) and User (read) for it in ElevenLabs › API keys.

## Writing in Assist

With a key connected, step 2 of Assist becomes **Write the film** (or character, or game). Press the button and Ara sends your description with the guide to your AI and shows its progress. When the reply arrives, Ara checks it. If something is wrong, Ara sends the problem back to the AI to fix, up to twice, before showing you the result. The review card then works as usual: check it, then **Build**. **Stop** cancels at any time. The cost of each request is shown when it finishes.

**Or use any AI chat instead** keeps the copy-and-paste route.

## Ask Ara

**Ask Ara**, in the bottom-right corner of the builder, Studio and Play, is a chat with your AI. It knows which app you are in and what is open: the character, the film or the game. Ask it how to do something, or describe what you want.

In Studio, Ara has the full map of the location that's open. When a message names other locations ("a rooftop chase"), their maps go with it, and the AI can ask Ara for any other location's map itself; the reply notes which maps it looked at.

When Ara writes a character, film or game, it is checked and built straight away, and its card offers **Undo** to put back what you had. If it can't be built, the card says why and offers **Ask Ara to fix it**.

Dialogue in Ara's own voices isn't voiced automatically from the chat, because it needs the first-time voice download. Use **Voice all lines** in Sound (or **Generate all speech** in Play) for those lines.

Conversations last until the browser closes; **＋** starts a new one. In Play, Ask Ara stays out of the way while a game is being played and in full screen.

## Voices

Sound's voice menus list Ara's four free voices, Gemini's 30 voices and the voices in your ElevenLabs account, your own voices first. **▶** plays a sample: ElevenLabs' own preview, or a short sentence in the voice.

**How it's said** directs Gemini and ElevenLabs voices. Pick a preset (**Whispered**, **Shouting**, **Excited**, **Nervous**, **Sad**, **Angry**, **Laughing**, **Sarcastic**, **Calm**, **Out of breath**) or describe it in your own words. ElevenLabs works best with a word or two, such as *whispers* or *excited*; Gemini understands phrases such as *warm and slow*. Ara's own voices don't take direction.

Voiced lines are saved as audio in this browser and included in exports, so a film plays the same everywhere. A film that uses a provider's voices can be opened without that key; only voicing new or changed lines needs it.
