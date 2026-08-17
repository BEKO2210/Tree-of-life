# Tree of Life

A cinematic mobile-safe **2.5D Tree of Life** website.

The scene is built like a game/film trick: the giant world tree is procedurally pre-rendered once into a canvas layer, then the page animates lighter 2D layers over it: parallax camera drift, energy vines, glowing leaves, particles, nebula, scanlines and depth shadows.

## Files

- `index.html` — page structure
- `styles.css` — cinematic layout, typography, glass panel, responsive styling
- `script.js` — procedural tree renderer and animation loop
- `.github/workflows/pages.yml` — GitHub Pages deployment

## Local preview

Open `index.html` directly, or run:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## GitHub Pages

The repo contains a GitHub Pages workflow. If Pages is not active yet, enable:

**Settings → Pages → Source → GitHub Actions**

Then push to `main` or run the workflow manually.
