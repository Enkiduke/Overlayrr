Libraries the web interface's Template editor is drawn with. Plain script builds (no modules, no build step); the server
puts them into the page itself, so the browser never fetches anything from a CDN.

  preact.min.js   Preact 10.29.8        MIT         https://cdn.jsdelivr.net/npm/preact@10.29.8/dist/preact.min.js
  hooks.umd.js    Preact hooks 10.29.8  MIT         https://cdn.jsdelivr.net/npm/preact@10.29.8/hooks/dist/hooks.umd.js
  htm.js          htm 3.1.1             Apache-2.0  https://cdn.jsdelivr.net/npm/htm@3.1.1/dist/htm.js

The only change from the downloads is that the trailing "//# sourceMappingURL=..." comment is removed (there is no map to fetch).
SHA-256 of the downloads as published:

  25aa00978fef96e4fd0020cc723a41c3b1a1e81c9c087eff26a77e07a4867e8e  preact.min.js
  5c29238e5dc99df306d7f7fff038591a397cfcfabb59f81fbdef43d670aa0566  hooks.umd.js
  80e39afe20fd61183412eda89efa10532d57945e6364642aceacd50eb2384b4b  htm.js

To update, download the new versions from the same paths, check them, and change this note.
