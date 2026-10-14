# tapomo.app

The static website for Tapomo: plain HTML, CSS and JS, no framework, no build step, no external requests.

## Preview locally

Any static server works. From the repository root:

```
cd web
python3 -m http.server 8000
```

Then open http://localhost:8000. Opening `index.html` straight from disk mostly works too, but a server is closer to production.

To see the first-visit intro again, use the footer link "Ver cómo nació Tapomo", or clear the site's storage (`localStorage` key `tapomo.visited`). The chosen language is stored under `tapomo.lang`.

## Files

| Path | What it is |
|---|---|
| `index.html` | The page. Carries the Spanish text so it reads fine without JS and for search engines. |
| `css/site.css` | Layout, colours (light and dark via `prefers-color-scheme`), scroll-driven animations, intro. |
| `css/mascot.css` | Copied verbatim from `ui/mascot.css`. |
| `js/i18n.js` | Every string, ES and EN. **Source of truth**: `site.js` applies it on load, so edit here (and mirror the Spanish in `index.html` for the no-JS fallback). |
| `js/site.js` | Language switch, reveals, the Mochitsuki intro, Tapomo's trip down the page and its reactions. |
| `js/mascot.js` | Copied verbatim from `ui/mascot.js`. |
| `js/badges-art.js` | Copied verbatim from `ui/badges-art.js` (the medals). |
| `js/wardrobe-lite.js` | A few accessories copied from `ui/wardrobe.js` (hat, bow, scarf, headphones, glasses, bow tie). |
| `img/favicon.svg` | Copy of `assets/tapomo-icon.svg`. |
| `CNAME` | `tapomo.app`, for GitHub Pages. |

The mascot files are copies so the site stays self-contained. If the app's drawing changes, copy them again.

## Behaviour

- **First visit:** a skippable 7 s intro (rice pounded by a keycap, "tap, tap, tap", into a mochi that drops into the empty slot of T-A-P-O-M and becomes Tapomo). It has a visible "Saltar" button and Escape. Tabbing out of it also ends it, so it never traps focus.
- **Later visits:** Tapomo bounces in and says "¡Hola otra vez!" (about 1 s).
- **Scroll:** Tapomo rides a path along the page margins and stops at each section: types fast (what it measures), puts on sunglasses (privacy), fills the goal ring (habits), wears glasses (open source), wonders (FAQ) and celebrates next to the download button. On narrow screens the path line is hidden and Tapomo peeks from the screen edge while travelling, so it never sits on the text.
- **Reveals** use CSS `animation-timeline: view()/scroll()`. Browsers without it get an IntersectionObserver fallback (`html.no-sda`).
- **`prefers-reduced-motion`:** no intro, no travelling and no scroll motion. A still Tapomo stands in each section.

## Hosting

Free on **GitHub Pages** or **Cloudflare Pages**, serving this `web/` folder with the custom domain `tapomo.app`. The domain's DNS is not set up yet.

- GitHub Pages: publish `web/` (for example with a Pages workflow that uploads this folder). The `CNAME` file sets the custom domain.
- Cloudflare Pages: project root `web`, no build command, output directory `/`. Add `tapomo.app` as a custom domain (the `CNAME` file is ignored there).
