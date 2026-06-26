# Assets

`announce.mp3` — the short announcement sound played when a spin starts.
`config.json` points `soundFile` at `/assets/announce.mp3` (served from `public/`).

To swap it, replace `announce.mp3` with another short clip of the same name. The
screen also works without it — `app.js` catches and ignores `sound.play()` failures
when the file is missing or autoplay is blocked.
