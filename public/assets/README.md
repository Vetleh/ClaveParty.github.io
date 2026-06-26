# Assets

Drop a short announcement sound here as `announce.mp3` (a fanfare/chime, a couple
of seconds, any royalty-free clip).

The screen works without it — `config.json` points `soundFile` at `/assets/announce.mp3`,
and `app.js` catches and ignores `sound.play()` failures when the file is missing or
autoplay is blocked. Add the file to enable the announcement sound.
