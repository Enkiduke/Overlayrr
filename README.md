# Standalone Overlayrr

One Python script and a YAML file. It scans movie/TV libraries in Plex, finds
artwork using TMDb, Fanart.tv and TVDB, applies named layouts from YAML, and
saves JPEG/PNG posters. It can also generate season posters and send results to Plex.
It runs once and exits; schedule the command externally if needed.

## Run

Python 3.10 or newer:

```sh
python -m pip install -r standalone/requirements.txt
```

Copy `standalone/config.example.yaml` to `standalone/config.yaml` and
`standalone/.env.example` to `standalone/.env` if you don't already have one.
Set your Plex URL and library names in YAML. Fill in the API keys and Plex token
in `.env`; YAML doesn't need credential fields or placeholders:

```dotenv
PLEX_TOKEN="your-plex-token"
TMDB_API_KEY="your-tmdb-api-key"
TVDB_API_KEY="your-tvdb-api-key"
FANART_API_KEY="your-fanart-api-key"
TVDB_PIN=""
FANART_CLIENT_KEY=""
```

The script automatically loads `.env` from the YAML file's directory. Existing
shell environment variables take precedence. Leave optional keys blank;
`TVDB_PIN` and `FANART_CLIENT_KEY` are optional. `.env` is already ignored by Git.
Older YAML configs with `api` keys and `plex.token` still work. Those optional
fields override the environment; an explicit empty value disables that credential.
They accept quoted literals or `${ENV_VAR}` placeholders.

Then run from the repository root:

```sh
python standalone/overlayrr.py standalone/config.yaml --limit 1
python standalone/overlayrr.py standalone/config.yaml
```

The entire `standalone` folder can be copied elsewhere; the script imports
nothing from the web application. All relative paths are resolved against the
YAML file, so the command works from any directory.

`plex.upload: false` saves locally. Set it to `true` to save and upload each
poster. Existing Plex posters are replaced by the upload. Each finished poster is
saved as `rendered.jpg` beside its source files in `assets`. Media ID suffixes on
the title folders keep remakes and duplicate titles separate.

For a batch of specific titles without a Plex scan, set `plex.libraries: []` and
add `items` with `tmdb_id`, `tvdb_id`, or `imdb_id`. Each item defaults to
`type: movie`; use `type: tv` for a series. If uploads are enabled, every item
must include its Plex `rating_key`.

## Which command for what

| You want | Run |
| --- | --- |
| Posters for new media (Tautulli hook) | `--item KEY --added`, see "Run it from Tautulli" |
| The nightly catch-up: only what changed | `--changed-only` |
| One title built and sent again | `--item KEY` (or `--title "Name"`) |
| One title with fresh artwork | `--item KEY --refetch` |
| Files already made, sent to Plex again | `--refresh` |
| Everything rebuilt (rare, slow) | no flags at all |

Without `--changed-only` a run always renders and uploads what it selects, so a run with no selector rebuilds and
uploads the whole library. `--remake` only matters next to `--changed-only` or `--refresh`, which it overrides.

## Remake and refresh

Three flags cover "do it all again", and each does one thing:

| Flag | What it does |
| --- | --- |
| `--remake` | Re-renders everything selected, even if unchanged, ignoring `--changed-only`. Works on the whole library, or on one title with `--item`/`--title`. Uploads to Plex when `plex.upload` is true. Saved `poster`/`logo` files are kept. |
| `--refresh` | Sends everything selected to Plex again. A finished file that is still current is uploaded as is, without rendering; a missing or out-of-date one is rendered first. Requires `plex.upload: true`, and can't be combined with `--changed-only`. |
| `--refetch` | Ignores the cached API responses and downloaded images and fetches them again, and deletes each selected title's saved `poster`/`logo` file so new art is picked and downloaded. That includes ones you put there yourself; files your config names under `items`/`overrides` are kept. |

They combine: for example, `--remake --refetch` rebuilds everything from fresh provider data. `--refresh` prints `RELOAD` for
each item it re-sent without rendering.

## Remake one movie or show

Select a movie or show by its Plex rating key (the numeric ID in Plex's item URL,
also recorded in the title's `.overlayrr.json`), then force it to rebuild and upload:

```sh
python standalone/overlayrr.py standalone/config.yaml --item 12345 --remake
```

The script uses a direct metadata lookup for that ID instead of scanning all
libraries. A matching job in YAML's `items` is used directly, so manual-only
configured jobs can also be selected by their `rating_key` without a Plex scan.
ID selection can target an item outside the configured scan libraries.

You can also select an exact title, ignoring case, in the configured libraries
or individual YAML jobs. Optional type/year filters distinguish remakes and
titles shared by movies and shows:

```sh
python standalone/overlayrr.py standalone/config.yaml --title "The Matrix" --type movie --year 1999 --remake
python standalone/overlayrr.py standalone/config.yaml --title "Breaking Bad" --type show --remake
```

With `--type movie` or `--type show`, title lookup scans only configured libraries
of that type (`--type collection` is covered under Collections). Unrelated or missing names in the batch library list are ignored.
At least one matching configured library must exist when the list is nonempty;
otherwise the error lists Plex's available library names and IDs. Normal batch
runs still require every configured library name/ID to exist.

No match or multiple matches is an error, with no renders or uploads. For
ambiguous titles, the error lists matching Plex IDs so you can use `--item`.
Neither selector falls back to processing the entire library.

A targeted show run processes its series poster only, even if the batch setting
`plex.include_seasons` is enabled. To include that show's seasons, add:

```sh
python standalone/overlayrr.py standalone/config.yaml --item 12345 --with-seasons --remake
```

`--remake` overrides `--changed-only` for the selected
movie/show and any explicitly included seasons. It keeps your saved source files
and still follows `plex.upload`: set it to `true` for server updates, or `false`
to rebuild locally. It does not enable uploads or replace curated source artwork, and it does not
re-download anything: saved `poster`/`logo` files (and episode stills) are reused. To fetch fresh artwork,
add `--refetch`, which deletes those saved files for the selected titles and ignores the cached API responses.
The selectors also work without `--remake` for a targeted routine run.
`--with-seasons`, `--with-episodes`, `--poster`, `--logo`, `--type` and `--year` require a selector;
`--limit` cannot be combined with a single-title selector.

## Download more posters and logos

To browse other artwork for a title, add `--poster` and/or `--logo` to a single-title
selector. Each takes a number (the N best candidates) or `all`:

```sh
python overlayrr.py config.yaml --title "Breaking Bad" --type show --poster 5 --logo all
python overlayrr.py config.yaml --item 12345 --with-seasons --poster 3
```

This only downloads: nothing is rendered or uploaded to Plex, and your current
`poster`/`logo` files are not touched. The candidates are saved in the title's folder beside its
other inputs, best first, as `poster2`, `poster3`... and `logo2`, `logo3`... (a season's posters go in its
`Season 01` folder). Each file saved is printed with its provider, language and width. A rerun overwrites the
same numbers, so `--poster 6` after `--poster 3` extends the set, but a `poster2` you made yourself would be replaced.

Candidates come from TMDb, Fanart.tv, TVDB and the posters Plex itself lists for the item (its agents' and anything
uploaded; needs `plex.url` and the token; Overlayrr's own finished posters are recognized by their marker and skipped;
Plex's aren't labeled with or without text, so they only appear under `--poster-filter all`). They follow the item's layout:
posters respect `poster_filter` (so `textless` skips posters with text, which is most of what TMDb lists;
add `--poster-filter all` to download them anyway, or `text` for only those); logos must be
raster images with real transparency, and with `logo_preference: white` only white-ish logos are
kept when any exist. Both are ranked by your `language`, then by width, so `--poster 1` is the
best match. Seasons use their show's logos, so `--logo` applies to movies and shows, and
episodes are not covered.

To use one, rename it to `poster`/`logo` with the same extension (delete the old `poster`/`logo` first), in the
title's folder, then run with `--changed-only`. Only the exact names `poster` and `logo` are used.

## Import posters from a MediUX / Kometa YAML

`--import-posters` reads the metadata files MediUX (and Kometa) share and saves each `url_poster` as the title's
`poster` file, so your normal run draws the logo and badges over it:

```sh
python overlayrr.py config.yaml --import-posters mediux-spiderman.yml   # from a file
python overlayrr.py config.yaml --import-posters                        # or paste it in, then Ctrl+D
python overlayrr.py config.yaml --changed-only
```

Without a file name it waits for pasted text and ends on Ctrl+D (Ctrl+Z, then Enter, on Windows). Pasting the
whole file is fine, and a copy that lost the first line's leading spaces is repaired.

The file maps TMDb IDs (or `tt` IMDb IDs) to a `url_poster`, optionally under a `metadata:` heading, and shows can
list `seasons:` with their own `url_poster`:

```yaml
metadata:
  557:
    url_poster: https://api.mediux.pro/assets/2cd3cbf4-c67e-4c91-a718-8271ae2a2736
  1396:
    url_poster: https://api.mediux.pro/assets/...
    seasons:
      1:
        url_poster: https://api.mediux.pro/assets/...
```

Titles are matched through Plex, so they must be in `plex.libraries`; others are listed as skipped. Each import
replaces the poster already saved in that title's (or season's) folder, including ones you placed there. Nothing is
rendered or uploaded by the import itself. Episode entries and `url_background` are ignored (Overlayrr draws its
own title cards), and so is a `collections:` section.

## Clear logos in Plex

With `plex.upload: true`, each movie's and series' saved logo (the one in its asset folder, which the poster
draws) is also uploaded as its Plex **clear logo** and selected, right after its poster. Seasons, episodes and
collections are left alone, and so is a series marked "No logo" in the web page. Plex names an upload after its
contents, so a logo it already holds is just selected again rather than uploaded twice. A failed logo upload
only prints a `WARN`; the poster still counts as delivered. Turn it off with `plex.upload_logo: false`.
`--changed-only` doesn't revisit unchanged posters for this, so run `--refresh` once to send logos for titles
uploaded before.

## Completion status in Plex

With `plex.upload: true`, the script adds a server label after a successful upload:

```yaml
plex:
  upload: true
  completion_label: Overlayrr
```

`Overlayrr` identifies a successfully uploaded layout poster. `Overlayrr: Stock`
identifies an uploaded ordinary fallback poster that still needs suitable artwork.
The script switches between these two labels as the result changes, preserving
all your other labels. It reads current labels, writes the complete list with the
label field locked, and reads the metadata again to confirm the update. The API
parameters follow [PlexAPI's label editing implementation](https://python-plexapi.readthedocs.io/en/latest/_modules/plexapi/mixins/edit.html#LabelMixin).

Movies, shows and seasons are marked individually on their own Plex rating keys.
A show's label refers to its series poster, not completion of every season.
The label records the last successful upload by this script; it does not detect
someone subsequently replacing a poster in Plex.

Failed uploads don't add a new status label. If labeling or verification fails,
the item reports `ERROR` and its local success record is invalidated so
`--changed-only` retries it. Local-only runs don't read or change server labels.
An empty `completion_label: ""` disables server labeling. Changing the configured
label triggers processing on the next `--changed-only` run; old custom label
names are preserved as unrelated labels. `--added` (the Tautulli hook) treats a movie, show or season without the
label as not yet uploaded and sends it.

## Cleaning up old posters in Plex

Plex keeps every poster you upload in the item's poster list, and its API has no way to delete one. So
`--cleanup` works on the files themselves, the way [ImageMaid](https://github.com/Kometa-Team/ImageMaid)
does, but only for posters Overlayrr made. It must run on a machine that can read Plex's data folder, normally
the Plex server itself.

Set the folder in the YAML (the one that contains `Metadata` and `Plug-in Support`):

```yaml
plex:
  data_dir: C:\Users\you\AppData\Local\Plex Media Server      # Windows
  # data_dir: /var/lib/plexmediaserver/Library/Application Support/Plex Media Server   # Linux
  cleanup_min_age_minutes: 60    # Leave files newer than this alone (default 60)
```

```sh
python overlayrr.py config.yaml --cleanup            # report: list unused posters, change nothing
python overlayrr.py config.yaml --cleanup move       # set them aside in "Overlayrr Restore" (reversible)
python overlayrr.py config.yaml --cleanup restore    # put the moved files back
python overlayrr.py config.yaml --cleanup remove     # delete them for good
```

How it decides, and why it is careful:

- **Which images Plex still uses.** It asks Plex for a database snapshot (`/diagnostics/databases`, made by Plex
  itself, so a poster you uploaded a second ago is included) and reads the poster, art, banner, logo and square
  art fields in `metadata_items`. Anything referenced there is kept. If the snapshot looks wrong (no images in
  use, or a required column missing) it stops without touching anything.
- **Which files it may remove.** Only files inside an `Uploads` folder under `Metadata` (never `Contents`, never
  anything with a file extension) that are not in use, are older than `cleanup_min_age_minutes`, and carry both of
  Overlayrr's tags: EXIF tag `0x04bc` = `overlay` (what Kometa uses, `overlay_marker`) and the Software tag
  `Overlayrr`. Kometa's own overlays, posters you uploaded by hand and everything else are left alone.
- **Nothing is deleted by default.** `--cleanup` alone only reports. `move` is reversible and `remove` is
  permanent, so read the report first. `--cleanup` can't be combined with other flags.

Things to know:

- Only posters uploaded **after** `overlay_marker` was on carry the tags. Older uploads have none, so they are
  never touched. Re-upload an item (`--remake`) and the previous poster becomes unused and removable.
- Plex must keep our tags on its stored copy. After an upload, open one of the extension-less files in
  `Metadata/.../Uploads/posters` with Pillow: `Image.open(path).getexif()` should contain `0x04bc: overlay` and
  `0x0131: Overlayrr`. If it doesn't, `--cleanup` finds nothing, which is safe but means this approach won't work.
- `--cleanup` can't clean a remote Plex from another machine, because it needs the files on disk. The database
  snapshot, though, only needs `plex.url` and the token.
- The first run after turning `overlay_marker` on or updating re-renders everything under `--changed-only`,
  because the tags are part of the rendered file. `overlay_marker: false` turns the tagging off, and
  `--cleanup` then has nothing to match.

## Starting completely fresh

`reset_plex.py` undoes everything Overlayrr put in Plex. It needs the same `plex.url`, `plex.token`,
`plex.libraries` and `plex.data_dir` as `--cleanup`, and only touches the libraries in `plex.libraries`.

```sh
python reset_plex.py config.yaml                 # list what would happen, change nothing
python reset_plex.py config.yaml --apply         # do it (needs plex.upload: true; asks you to type RESET)
```

- **Collections:** deletes *every* collection in those libraries, not just the ones Overlayrr made.
- **Labels:** removes `plex.completion_label` and `<label>: Stock` from movies, shows, seasons and episodes. Your
  other labels stay.
- **Poster files:** every Overlayrr-tagged poster in Plex's Metadata folder. Items still showing one are first
  switched to a poster Plex had on its own, so nothing is left broken.
- **Change records:** clears `.cache/renders`, so the next run rebuilds everything. `assets/` is not touched.

`--keep-collections`, `--keep-labels` and `--keep-files` skip a part, and `--yes` skips the typed confirmation.
Posters from older Overlayrr versions carry no tags and are skipped by default; `--all-uploads` treats every uploaded
poster on items in your `plex.libraries` as Overlayrr's (including ones you uploaded yourself to those items), and `--any-overlay` adds Kometa's tagged overlays.
`--inspect PLEX_ID` shows one item's posters and changes nothing.
Run `overlayrr.py` afterwards to start again.

## Layouts

The example YAML defines `overlayrr-main` as the default, plus `tk-movies` and
`tk-tv` using the applicable values from your presets. All layout names and
visual settings live in YAML. The script's generic defaults have no fade,
matte, vignette or grain; a layout supplies its own look.

Choose a default and assign a layout to each Plex library:

```yaml
default_layout: overlayrr-main
layout_by_library:        # Plex library name (as shown in Plex) -> layout
  Movies: tk-movies
  TV Shows: tk-tv
```

An item's `layout` (in `items` or `overrides`) takes precedence over
`layout_by_library`, which takes precedence over `layout_by_type` (optional:
`movie`/`tv`/`collection`/`streaming`/`chart` -> layout; the collection kinds beat `layout_by_library`),
which takes precedence over `default_layout` (optional: if it's omitted, every item
needs a match from one of the above or rendering stops with an "Undefined layout" error).
Seasons use their show's library. Names can be anything you like; undefined
names are rejected before rendering.

Each layout is an independent, complete mapping; the example lists every
setting in each one, so to add a layout, copy one of them and edit it. (YAML
anchors still work if you prefer them.) The script accepts the following
settings:

| Purpose | Settings |
| --- | --- |
| Canvas and crop | `width`, `height`, `poster_zoom`, `poster_shift_y`, `poster_shift_x` (moves the picture sideways as `poster_shift_y` moves it up and down, as a fraction of the width; the gap shows black) |
| Effects | `matte_height_ratio`, `fade_height_ratio`, `fade_smoothness` (0-1: `0` = a straight ramp, `1` = eased at both ends), `matte_opacity` (0-1: how solid the matte is; lower lets the poster show through), `matte_color` (`#RRGGBB`: what the poster fades to), `vignette_strength`, `vignette_mode` (`classic/radial`), `vignette_color`, `vignette_size`, `vignette_falloff`, `grain_amount`, `grain_mode` (`blend/film`), `grain_size`, `grain_seed` (see below) |
| Logo bounds | `uniform_logo_max_w`, `uniform_logo_max_h`, `uniform_logo_offset_x`, `uniform_logo_offset_y`, `uniform_logo_trim` (`true` trims the logo's transparent padding before fitting it, so every logo fills its box alike instead of shrinking by however much padding its file has; `false` by default, and always trimmed with `uniform_logo_center_below`) |
| Logo alignment | `uniform_logo_h_align` (`left/center/right`), `uniform_logo_v_align` (`top/center/bottom`), `uniform_logo_center_below` (pixels on a 3000px-tall poster; logos shorter than this are trimmed of transparent padding and centered vertically in the matte band at the bottom (the bottom `matte_height_ratio` of the poster; their box when there is no matte) whatever `uniform_logo_v_align` says; `0` = off; applies to series and movie posters, never seasons) |
| Logo shadow | `uniform_logo_shadow_enabled`, `uniform_logo_shadow_color`, `uniform_logo_shadow_opacity`, `uniform_logo_shadow_angle`, `uniform_logo_shadow_distance`, `uniform_logo_shadow_size`, `uniform_logo_shadow_spread` (see below) |
| Artwork selection | `poster_filter` (`textless/text/all`), `logo_preference` (`white/any/color`), `logo_min_brightness` (0-255), `logo_mode` (`original/none`) |
| Border | `border_enabled`, `border_px`, `border_color`, `border_radius` (rounds the picture's corners inside the border; the border color fills the corners, and the poster itself stays rectangular; `0` = square) |
| Text | `text_overlay_enabled`, `custom_text`, `font_file`, `font_size`, `text_color`, `text_transform`, `letter_spacing`, `position_y`, `position_x`, `text_line_spacing`, `text_stroke_width`, `text_stroke_opacity`, `text_stroke_color`, `text_shadow_strength`, `text_shadow_blur`, `text_shadow_offset_y`, `text_shadow_color` |
| Badges | `badges`, `resource_dir`, `badge_gradient_height`, `badge_gradient_strength`, `badge_gradient_top_height`, `badge_gradient_top_strength`, `badge_gradient_bottom_height`, `badge_gradient_bottom_strength`, `resolution_font_file`, `resolution_font_size`, `edition_font_file`, `edition_font_size`, `badge_text_color`, `badge_stroke_width`, `badge_stroke_opacity`, `badge_stroke_color`, `badge_shadow_strength`, `badge_shadow_blur`, `badge_shadow_offset_y`, `badge_shadow_color`, `badge_layout`, `badge_margin`, `badge_gap`, `badge_fit`, `badge_text_transform`, `badge_art_scale`, `badge_gradient_color`, `audience_score_text_color`, `audience_score_font_size`, `audience_score_font_file`, `audience_score_tiers`, `resolution_labels`, `status_labels`, `edition_labels` (see [Badges](#badges)) |
| Collection posters | `collection_gradient_radius`, `collection_gradient_strength`, `collection_gradient_corner`, `streaming_colors`, `chart_color` (the posters Overlayrr draws itself; see [Streaming service collections](#streaming-service-collections-tv)) |
| Seasons | `season_options`, containing any of the settings above |
| Episodes | `episode_options`, containing any setting above plus the title-card settings (see [Episode title cards](#episode-title-cards)) |

The matte is a fade (`fade_height_ratio` of the poster's height, from clear up to the matte) above a solid block at the
bottom (`matte_height_ratio`). A straight ramp leaves a visible edge where it starts and where it meets the block;
`fade_smoothness: 1` eases both ends so neither shows, and a longer `fade_height_ratio` spreads it out. For no solid
block at all, set `matte_height_ratio: 0` and lengthen the fade. `matte_opacity` below `1` keeps the poster faintly
visible through the block, and `matte_color` fades to something other than black. At their defaults (`0`, `1`,
`"#000000"`) these three settings leave the matte exactly as it was; once any is changed the fade is dithered so it
can't band. The Template view has a control for each.

`vignette_strength` on its own is the parent app's *classic* vignette, which dims the whole picture evenly (a white poster
at `0.03` comes out 248 everywhere). It is kept exactly as it was so existing posters don't change. `vignette_mode: radial`
is a real vignette: clear in the middle and darkest at the corners, along the poster's frame, laid on in floating point
and dithered so a faint one can't band. `vignette_size` (1) is how far in it reaches (smaller darkens nearer the middle),
`vignette_falloff` (2) shapes the ramp (1 is straight; higher stays clear longer, then darkens toward the edges), and
`vignette_color` (`#000000`) is what it fades to (it tints the classic one too).

`grain_mode: blend` (the default, as in Simposter) mixes grey noise into the picture. That pulls blacks up and whites down
(`grain_amount: 0.22` turns black into 28 and white into 226), and the grain texture itself is faint (a standard deviation of
about 0.7 levels on a 2000px poster). `grain_mode: film` adds the grain instead: its standard deviation is 20 × `grain_amount`
levels (0.22 gives about 4.4), faded out toward pure black and pure white, so a black matte stays black. `grain_size`
(1.5, pixels on a 2000px poster; `0` = none) is how coarse the noise is; in film mode a larger size is coarser without
being fainter.

A layout can give the logo a drop shadow, with the same settings and meanings as Simposter's, plus spread. It is off by
default; distances are pixels on a 2000px-wide poster and scale with `width`:

| Setting | Meaning |
| --- | --- |
| `uniform_logo_shadow_enabled` | `true` turns the shadow on; the rest apply only then |
| `uniform_logo_shadow_color` | `#RRGGBB` (`#000000`); a light color makes a glow instead |
| `uniform_logo_shadow_opacity` | 0 to 100 (60) |
| `uniform_logo_shadow_angle` | Degrees, where the light comes from, counterclockwise from the right (Photoshop's). The shadow falls the other way: `-45` (the default, as in Simposter) casts it up and left, `135` down and right, `90` straight down |
| `uniform_logo_shadow_distance` | How far the shadow is offset, 0 to 100 (8) |
| `uniform_logo_shadow_size` | How far it blurs, 0 to 250 (15) |
| `uniform_logo_shadow_spread` | 0 to 100 (0): how much of the size is grown solid before the blur. `0` is a plain blurred copy, as in Simposter; 20 to 50 gives thin or light logos a shadow that reads, and 100 is a heavy glow |

The shadow is cut from the logo image's own transparency, laid on in floating point and dithered so it doesn't band, and
the logo is then drawn over it exactly as it is without a shadow. Season posters draw it with their logo; episode title
cards ignore these settings and have their own (`card_logo_shadow_*`, see [Episode title cards](#episode-title-cards)).
The Template view's Logo group has a control for each.

`logo_preference` chooses among the logos providers offer:

| Value | Picks |
| --- | --- |
| `any` | The first logo with real transparency, whatever its color (best-matching language and width first). |
| `white` | The brightest, least-saturated logo; falls back to the first logo if none is white-ish. |
| `color` | The best-ranked logo (language, then width) that is clearly colored; how vivid it is doesn't matter once it passes, so a garish lower-ranked logo doesn't beat a good one. Black and very dark logos are never chosen (it applies a floor of 60 if `logo_min_brightness` is 0), and white or grey logos are not favored: they are used only when no provider has a colored logo. |

Seasons and episodes always use their series' logo, chosen once with the series layout's `logo_preference` and
`logo_min_brightness`, so they can't differ from it. Those two settings are therefore rejected inside
`season_options` and `episode_options`; `logo_mode` still works there (`none` hides the logo). Movies and series
are processed before their seasons and episodes, so the logo is already saved when they need it. A `logo` file
in a season or episode folder is ignored.

`logo_min_brightness` rejects black and very dark logos while keeping colored ones: it is the average
perceived brightness (0-255) of the logo's visible pixels, and logos below it are never chosen (also for
`--logo`). Black text scores near 0; saturated red or blue score about 70-90; navy about 35. `60` is a good
start, and `0` (default) accepts any logo. If every available logo is too dark, the title is treated as
having no logo (a stock poster, or `missing_art` rules). It only affects automatic picks: delete a title's
saved `logo.png` to have it chosen again, since your own files always win.

Font size, logo bounds and border (width and radius)
pixels are specified against the 2000×3000 reference canvas and scale with
output dimensions. Borders expand the image, matching the app. Text is centered
across the poster at `position_x` (0.5) and vertically at `position_y`, with
`text_line_spacing` (0.2 of the font size) between lines; `letter_spacing` inserts
spaces between characters as in the app. `text_transform` accepts `none`,
`uppercase` or `lowercase`.

The custom text can have an outline and a soft shadow, drawn the way the badge text and the episode title card draw
theirs (shadow first, then the outline, then the letters). Both are off by default, and sizes are pixels on a
2000px-wide poster: `text_stroke_width` (0 = none), `text_stroke_opacity` (1) and `text_stroke_color` (`#000000`);
`text_shadow_strength` (0 = none, 1 = solid), `text_shadow_blur` (10), `text_shadow_offset_y` (0, centered on the text)
and `text_shadow_color` (`#000000`). Season posters are made of this text, so it is where their legibility comes from.

`font_file` is an optional local `.ttf`/`.otf` path relative to the YAML. For the
Barlow appearance, place `Barlow-Regular.ttf` in `resources/fonts/` and uncomment the
`font_file` line in `tk-tv.season_options`. Select a bold font file to get that
weight. Without a file, Pillow's bundled font is used. Text supports newlines;
overly wide text fails with guidance to reduce its size or spacing.

Static files live in one `resources/` folder beside the YAML: `fonts/` (your
fonts, plus the badge score font), `gradients/` (badge fades and the title-card
gradient) and the badge image folders (`resolution/`, `edition/`, `codec/`,
`status/`, `audience_score/`). Font and gradient settings are plain paths, so
`resources/fonts/Poppins/Poppins-Bold.ttf` style paths work anywhere. The layout
setting `resource_dir` (default `resources`) relocates the badge files only.

Inactive UI settings such as overlay blend modes and API preset
fallback selectors are omitted. Unknown layout settings raise a clear error.
For an older standalone config, move `style` into a named entry under `layouts`
and add `default_layout`.

## Badges

For the `status_banner` badge, set `status_banner_date_format: "dd/mmm"` and
`status_banner_simplify_dates: true` in the TV layout to show today, tomorrow or
the full weekday for dates up to seven days ahead, and `28/Oct` for dates more
than a week away. The banner's text transform applies afterward (uppercase by
default: `NEXT EPISODE 28/OCT`). An explicit `ddd` in the date format keeps
simplified weekdays abbreviated; `dddd` uses the full weekday.

Ports of the Kometa overlays `media_info.yml` and `audience_rating.yml`: quality
badges, a score and gradients drawn on top of the finished poster. Enable them
per layout by listing the ones you want; the default is none:

```yaml
layouts:
  tk-movies:
    badges: [gradients, resolution, edition, codec, audience_score]
  tk-tv:
    badges: [gradients, resolution, status, audience_score]
```

| Badge | Where | Source |
| --- | --- | --- |
| `gradient_top` | Full-width shading from the top edge, drawn behind the logo | Always applies; generated, see below |
| `gradient_bottom` | The same from the bottom edge | Always applies; generated, see below |
| `gradients` | Both of the above | Shorthand for `gradient_top` and `gradient_bottom` |
| `resolution` | Top left: `SD`/`HD`/`FHD`/`UHD`, or `CAM` | Plex video resolution; `CAM` from the movie file path |
| `edition` | Top left, beside `resolution` (movies at 1080p/4K only) | `{edition-...}` tag in the file path |
| `codec` | Bottom left: HDR, Dolby Vision, Atmos, DTS, TrueHD, E-AC-3 | `[DV HDR10][TrueHD Atmos 7.1]` style tags in the file path (movies) |
| `status` | Top left, beside `resolution` (shows) | TMDb: new, airing, returning, canceled, ended |
| `audience_score` | Bottom right, colored by tier (8.5 / 7 / 5.5 / 3) | Plex's audience rating |

File-path tags follow the [TRaSH naming scheme](https://trash-guides.info/Radarr/Radarr-recommended-naming-scheme/#plex),
as in Kometa, with the same patterns and priorities. A badge is skipped when
its data is missing, so items without Plex IDs (`items:` without a `rating_key`)
only get the gradients. Shows have no file tags, so they get `resolution`
(the best resolution among up to 500 episodes, one extra Plex request per show),
`status` (TMDb, cached like other TMDb lookups, and the same `tmdb_id`
resolution as artwork) and `audience_score`. Season posters get no badges.

Badges also apply to stock fallback posters. Sizes and offsets are Kometa's
pixels on a 1000px-wide poster and scale with `width`; the `@2x` art is used
when the canvas is wider than 1500px. `resource_dir` (default `resources`, relative to
the YAML) holds the badge images and `fonts/centurygothic_bold.ttf`; replace any PNG
to restyle a badge. Badge changes are part of `--changed-only` detection. The
first run after adding `badges` to a layout rebuilds that layout's posters.

The `resolution`, `edition` and `status` badges are drawn as text rather than PNGs, the way episode cards draw
their title (per-glyph spacing, anti-aliased on the finished poster, any size). Resolution is bold, right-aligned to
the edge Kometa's art used; edition and status are a bullet and a tracked-out label, and both sit in the same 80px
box as before. `resolution_font_file` (default `resources/fonts/Poppins/Poppins-ExtraBold.ttf`) and
`edition_font_file` (default `Poppins-Regular.ttf`, also used for `status`) take any `.ttf`/`.otf` path relative to
the YAML; `resolution_font_size` (60) and `edition_font_size` (58) are pixels on a 1000px poster and scale with
`width`; `badge_text_color` (`#FFFFFF`) colors all three. Edition names come from the file tag (`DIRECTOR’S CUT`,
`EXTENDED EDITION`...). The IMAX badge (a logo) and the `codec` badges (Dolby/DTS logos) stay PNGs.

Those three text badges can also have a stroke (an outline) and a soft shadow, drawn the way the episode title card
draws its text: shadow first, then the outline, then the letters. Both are off by default, and one set of settings covers
all three text badges (the PNG badges and the score are untouched). Sizes are pixels on a 1000px poster and scale with `width`:

| Setting | Meaning |
| --- | --- |
| `badge_stroke_width`, `badge_stroke_opacity`, `badge_stroke_color` | The outline around the letters. `badge_stroke_width` is its thickness (`0`, the default, is none; 2 to 3 reads clearly), `badge_stroke_opacity` is 0 to 1 (`1`, solid; lower lets the poster show through) and `badge_stroke_color` is `#RRGGBB` (`#000000`; pick a light one if you set a dark `badge_text_color`) |
| `badge_shadow_strength`, `badge_shadow_blur`, `badge_shadow_offset_y`, `badge_shadow_color` | A soft shadow drawn from the letter shapes and blurred. `badge_shadow_strength` is 0 (none, the default) to 1 (solid), `badge_shadow_blur` is how far it spreads (5; about 8 is fuller), `badge_shadow_offset_y` shifts it down (`0` centers it on the text) and `badge_shadow_color` is `#RRGGBB` (`#000000`). It sits under the outline |

The Template view has a control for each; the opacity, color, blur and offset rows appear once the stroke or shadow is on.

By default the top-left badges sit in Kometa's fixed boxes: resolution is right-aligned to a fixed edge and the next badge
starts at a fixed position. That is why `resolution_font_size` can only get smaller: past about 70 the text runs off the
poster's left edge, and a long edition name runs off the right at larger sizes. These settings fix that (all in pixels on a
1000px-wide poster, scaling with `width`):

| Setting | Meaning |
| --- | --- |
| `badge_layout` | `kometa` (the default, exactly as before) or `flow`, which lays the top-left badges out left to right, each after the previous one's real width, so the sizes can grow. The first badge's ink starts at `badge_margin`; the IMAX art follows by its visible edge |
| `badge_margin`, `badge_gap` | `badge_margin` (25) is the distance of every badge from the poster's edges; `badge_gap` (14, the space Kometa's boxes leave) is the space between top-left badges in the flow layout |
| `badge_fit` | `true` shrinks resolution, edition and status text that would run past the margins, in either layout; `false` by default |
| `badge_art_scale` | Size of the IMAX, codec and score art (1); the text badges have their own sizes |
| `badge_text_transform` | `uppercase` (the default), `lowercase` or `none` (as written) for the resolution, edition and status text |
| `badge_gradient_color` | What the gradient badges fade to (`#000000`) |
| `audience_score_text_color`, `audience_score_font_size`, `audience_score_font_file` | The score's number: `#111111`, 68 and `resources/fonts/centurygothic_bold.ttf` |
| `audience_score_tiers` | The four scores where the art becomes excellent, good, average and bad, highest first; below the last it is worst. Default `[8.5, 7, 5.5, 3]` |
| `resolution_labels`, `status_labels`, `edition_labels` | Mappings from a name to the words shown, for the resolution (`480p`, `576p`, `720p`, `1080p`, `4k`, `cam`), the status (`new`, `airing`, `returning`, `canceled`, `ended`) and the edition (`Unrated-Edition`, `Directors-Cut`, `Special-Edition`, `Anniversary-Edition`, `Collectors-Edition`, `Minus-Color`, `Extended-Cut`, `Extended-Edition`, `Open-Matte`, `Final-Cut`, `Remastered`, `Restored`, `Signature-Edition`, `Theatrical`, `Theatrical-Cut`, `Uncut`, `Ultimate-Edition`). Names match in any case, and `badge_text_transform` still applies |

```yaml
badge_layout: flow
badge_fit: true
resolution_labels: {4k: "4K", 1080p: "1080P", 720p: "720P"}
status_labels: {airing: "On air"}
edition_labels: {Directors-Cut: "Director's Cut"}
audience_score_tiers: [9, 8, 6.5, 4]
```

The Template view has a control for each except the mappings and the score font and tiers, which are written in the YAML.

The gradients are generated rather than PNGs: a black fade from the top and/or bottom edge with a smooth
falloff, darkened in floating point and dithered so it doesn't band. Each edge has its own settings:
`badge_gradient_top_height` and `badge_gradient_bottom_height` (0.25) are how far the fade reaches as a fraction of
the poster height, and `badge_gradient_top_strength` and `badge_gradient_bottom_strength` (0.67) are how black it is
at the edge; the defaults match the old Kometa images. `badge_gradient_height` and `badge_gradient_strength` set both
edges at once, and an edge's own setting wins over them (older configs that only use those two keep working
unchanged). List just the edge you want, for example `gradient_top` alone when a matte already darkens the bottom,
or both with different settings:

```yaml
badges: [gradient_top, gradient_bottom, resolution, codec, audience_score]
badge_gradient_top_height: 0.35
badge_gradient_top_strength: 0.8
badge_gradient_bottom_height: 0.12
badge_gradient_bottom_strength: 0.3
```

The Template view has a switch for each edge and a height and strength slider for it.

## Collections

### Making the collections

Overlayrr can build movie franchise collections itself, as Kometa's `franchise` default did: one Plex collection per
TMDb collection (Star Trek Alternate Reality, Alien...) that has at least `plex.collection_min_items` (default 2) of your
movies in a library. It needs only your TMDb key. Preview first; this changes nothing:

```sh
python overlayrr.py config.yaml --sync-collections
```

It prints `PLAN CREATE` / `PLAN UPDATE` lines, including exactly which movies would be added (`+`) or removed (`-`).
When the plan looks right, run `--sync-collections apply` (requires `plex.upload: true`). Or set
`plex.sync_collections: true` to do it at the start of every normal run, so new collections get their posters in the
same run (with `upload: false` that run only prints the plan).

- **Existing collections are adopted.** A Plex collection whose name matches (ignoring case, punctuation and a trailing
  "Collection": "Star Trek: Alternate Reality" matches "Star Trek Alternate Reality") is brought in line instead of
  duplicated. Its poster, sort order and name are left alone. Make sure the plan shows no unexpected `CREATE` for a
  collection you already have before applying.
- **`collection_sync: sync` (default)** also removes members that TMDb doesn't list. That drops anything Kometa added
  by hand to a franchise (its `addons` spin-offs, such as Prometheus in Alien), so read the `-` entries in the plan. Use
  `append` to only ever add. If any TMDb lookup fails in a run, nothing is removed that run.
- **Nothing is deleted**, with one exception: no movie from your library, ever, and no collection except an extra copy
  of "Newly Released" or "New Episodes" (see below). New collections sort by release date.
- Movie franchises and, optionally, streaming services. Kometa's other builders (universe, network, charts, seasonal
  lists, playlists) are not replaced.
- **Smart collections are skipped.** Plex can't add or remove members by hand in a smart collection, and Kometa's
  streaming and network collections are smart ones (their `smart_label`/`smart_filter`). Overlayrr prints a `SKIP` line
  for any it would have updated. Delete that collection in Plex and the next run makes a regular one in its place;
  it never deletes these itself.

### Streaming service collections (TV)

Set `plex.collection_streaming` to make a `<Service> Shows` collection (Netflix Shows, Disney+ Shows, Hulu Shows...) in
each TV library, named as Kometa's streaming default named them. It uses TMDb only, one `/tv/{id}` lookup per show
(cached for a day), and needs at least `collection_min_items` of your shows per service:

- `originals`: shows whose TMDb network is the service, i.e. its own productions. This is what `originals_only: true`
  gave in Kometa, and it needs no region.
- `available`: shows streaming on the service right now, in `plex.collection_region` (default `US`), subscription,
  free or ad-supported (rent/buy doesn't count). This changes as licensing changes; with `collection_sync: sync` shows
  that leave a service are removed from its collection on the next run.

The services are Netflix, Disney+, Hulu, Prime Video, HBO Max, Apple TV, Paramount+, Peacock, discovery+, Crunchyroll,
AMC+, BET+, hayu, YouTube and Tubi. Kometa's region-specific ones (Channel 4, Crave, ITVX, NOW, Filmin, Movistar,
Atres Player) are not included. Preview first with `--sync-collections`, as above.

#### Streaming collection posters

With `plex.include_collections: true`, every TV collection named for one of those services ("Netflix Shows"), whether
Overlayrr or Kometa made it, gets a poster: the service's logo centered over a radial gradient in the service's color.
Assign a layout with `layout_by_type: {streaming: streaming-collection}` (the example defines it: a 1400×1000 logo
box at the center; change `uniform_logo_max_w`/`_max_h` to resize the logo).

- **Logos** are bundled in `resources/streaming/<Service>.png`: the public `streaming/logos` set from
  Kometa-Team/Default-Images on GitHub, the same images Kometa's posters use. They're trademarks, so this is for your
  own library. To use your own, put a `logo.png` in the collection's folder under `assets/collections/`, which wins; if a
  bundled file is missing, Overlayrr downloads it from that repo instead.
- **The gradient** is generated once from a brand color per service and saved as that folder's `poster.png`. Replace
  it with any image to change the look; delete it to generate a new one. In the streaming layout, `streaming_colors`
  (for example `{Netflix: "#5a0a0f"}`; any service name, in any case) overrides a service's color, and the shape comes
  from `collection_gradient_radius` (1.25, how far the glow reaches), `collection_gradient_strength` (0.55, how much the
  edges darken) and `collection_gradient_corner` (0.4, extra darkening toward the bottom left). `chart_color`
  (`#8a5a10`) is the glow of "Newly Released" and "New Episodes". These apply when a poster is generated, so delete the
  collection's saved `poster.png` (or run with `--refetch`) to generate it again with new values. They are written in the
  YAML; the Template view previews a title's saved poster, so it has no controls for them.
- `--title "Netflix Shows" --type collection --remake` renders one.
- A poster can be uploaded to a smart collection, so Kometa's existing collections work too.

### Collection posters

Set `plex.include_collections: true` to make posters for the movie collections in your scanned movie
libraries (TV collections aren't supported: TMDb has none). A collection is rendered like a movie, with the same
layout settings, so give collections their own look with `layout_by_type: {collection: your-layout}`; that entry
wins over `layout_by_library`. Posters come from TMDb's collection artwork and the logo from Fanart.tv, which
files franchise logos under the TMDb collection ID (it needs a Fanart key; TMDb alone has no collection logos).
Badges that read file metadata (resolution, codec, edition) draw nothing on a collection.

To use TMDb's own collection poster, text and all, with no logo and no effects, add a layout with
`logo_mode: none` and `poster_filter: text` (the example's `collection-tmdb`) and point `layout_by_type.collection`
at it. With no logo wanted, only TMDb is asked: Fanart.tv isn't called. If a collection has no poster with text, its
first poster is used instead.

Plex collections have no TMDb ID, so Overlayrr works it out: the TMDb collection that most of the first five
members belong to, otherwise a TMDb collection whose name exactly matches the Plex title. Curated collections with
no single franchise ("Christmas Movies") stay unresolved on purpose, because a wrong franchise is worse than none.
Fix one by hand with `tmdb_id` in `overrides` (keyed by the collection's Plex rating key) or by dropping your own
`poster.jpg` and `logo.png` into its folder under `assets/collections/`, as with any other title.

A collection that doesn't resolve to a TMDb collection and has no poster of yours in its folder is left alone
(`LEFT`): its Plex poster stays as it is, and it doesn't count as missing artwork. If a resolved collection has no
poster on TMDb it is skipped (`SKIP`, counted as missing), never replaced with Plex's auto-generated collage, which
would freeze it. Select one collection with `--type collection`:

```sh
python overlayrr.py config.yaml --title "Alien Collection" --type collection --remake
python overlayrr.py config.yaml --item 54321 --remake
```

`--type collection` works even with `include_collections` off; without `--type`, `--title` only searches collections
when the setting is on, and a movie and a collection sharing a title are ambiguous (add `--type`). Uploads use the
same `plex.upload` switch and completion label as movies.

### "Newly Released" and "New Episodes"

Kometa's two basic chart collections are Plex smart collections, so Plex keeps them current itself and they keep working
without Kometa. Overlayrr can create them if they're missing and draws their posters:

- **Newly Released** (movie libraries): movies released in the last `plex.recent_movie_days` (default 90), newest first.
- **New Episodes** (TV libraries): episodes aired in the last `plex.recent_episode_days` (default 7). It's a smart
  collection of *episodes*, as Kometa's is.

Set `plex.recent_collections: true` and use `--sync-collections` (plan, then `apply`) as above. Missing ones are
created (`CREATE` lines). One that already exists, including Kometa's, is only touched to change its date window: if its
current window differs from your setting it prints `UPDATE ...: last 90 days -> last 30 days` and rewrites the filter
(type, newest-first sort and date window). A filter Overlayrr can't read or recognize is left exactly as it is. For
their posters, set `include_collections: true` and `layout_by_type: {chart: chart-collection}`: the Plex logo
(bundled in `resources/charts/Plex.png`, from the same Default-Images repo) over an amber radial gradient with the
collection's name below it. `{title_lines}` in a layout's `custom_text` puts each word of the title on its own line,
so "New Episodes" becomes two lines; `{title}` keeps it on one.

Overlayrr never makes a second one. Before creating a chart, streaming or franchise collection it asks Plex again for
every collection in that library (whatever it holds, since Plex lists a smart collection of episodes as an `episode`
collection) and skips the name if it's already there (`SKIP ...: a collection with that name is already in Plex`).

It also keeps just one of these two. If a library has more than one smart "Newly Released" or "New Episodes" (an
earlier run made a copy, or Kometa did), the oldest is kept and each extra is deleted (`DELETE ...: extra copy (id N);
keeping id M`; a plan shows `PLAN DELETE` and changes nothing). That is the only thing Overlayrr ever deletes, and only
a smart collection with exactly that name. A same-named collection that isn't smart is somebody's own and is left
alone, with a `NOTE`.

It also moves these two to the front of the library's collections list: Plex orders collections by sort title, so
Overlayrr sets the sort title of "Newly Released" and "New Episodes" to `!001 <name>` (a `SORT` line; only when it
isn't already set, and it's the only thing changed on a collection that already exists). In the web page's Collections
view they come first too.

## Seasons

Set `plex.include_seasons: true` to scan each show's seasons, including Specials.
Each season inherits its show's provider IDs and selected layout; the layout's
`season_options` override its base options. A show-level logo override carries
over to its seasons. Poster overrides use the season's own Plex rating key.

The `tk-tv` example keeps the series logo in a 1500×500 box at height 0.83 and
adds the season label at height 0.95. `{season}` becomes the Plex season title
(or `Season 1`, `Specials`, etc.). `{season_number}`, `{title}` and `{year}` are
also supported. The default example's seasons use text with no logo.

For an explicit season job without a Plex scan:

```yaml
items:
  - type: tv
    tmdb_id: 1396
    season: 1
    layout: tk-tv
```

When uploading an explicit season job, `rating_key` must identify that season.
For scanned seasons, the script discovers and uses the correct season ID
automatically. Each season's finished poster is saved in its own `Season 01`,
`Season 02`, etc. folder beside its inputs.

Season artwork is requested from TMDb, filtered by season in Fanart.tv, and
looked up through the official season's internal ID in TVDB. Series artwork is
available as a fallback when a provider has no suitable seasonal artwork.

## Episode title cards

A port of the TitleCardMaker `TitleColorMatch` card (azuravian): the episode's
16:9 still with a left-side gradient, the show's logo cropped and placed at the
top left, the episode title at the bottom left, and `SEASON 1 • EPISODE 1` beneath
it. With `title_color: auto` the title takes the logo's dominant color (skipping
transparent, near-white and near-black colors) with a contrasting outline.

Set `plex.include_episodes: true` to make a card for every episode of each
scanned show. Add `episode_options` to the layout those shows use; without it the
run stops with "needs episode_options". `episode_options` are applied on top of
the layout's base settings (not its `season_options`), and set a landscape size:

| Setting | Meaning |
| --- | --- |
| `width`, `height` | Card size. The design is drawn for 3200×1800 and scales with `width` |
| `uniform_logo_max_w`, `uniform_logo_max_h` | Logo box in pixels on a 3200px-wide card (1155×650). `logo_mode: none` hides the logo |
| `card_logo_offset_x`, `card_logo_offset_y` | Where the logo's box sits between the card's margins (50px): `0` (the default) is against the left and top margins, `1` against the right and bottom ones, `0.5` centered |
| `card_logo_h_align`, `card_logo_v_align` | Where the logo sits inside its box: `left`, `center` or `right` (`left`) and `top`, `center` or `bottom` (`top`) |
| `card_logo_trim` | `true` (the default, and what the card always did) trims the logo's transparent padding before fitting it; `false` keeps it |
| `card_logo_shadow_enabled`, `card_logo_shadow_color`, `card_logo_shadow_opacity`, `card_logo_shadow_angle`, `card_logo_shadow_distance`, `card_logo_shadow_size`, `card_logo_shadow_spread` | A drop shadow behind the logo, with the poster's logo shadow settings and meanings (see [Layouts](#layouts)), in pixels on a 3200px-wide card. Off by default; the defaults are a `#000000` shadow at 60% opacity, angle `-45`, distance `12`, size `24` and spread `0`. The card doesn't follow the poster's `uniform_logo_*` placement or shadow, only its size box |
| `card_gradient` | `radial` (default in the example): a fade generated from the `gradient_*` settings below; or `null` for none |
| `gradient_center_x`, `gradient_center_y` | Center of the clear area, as a fraction of width/height (0.68, 0.48: right of middle, so the left goes dark) |
| `gradient_radius_x`, `gradient_radius_y` | Fade size as a fraction of width/height (0.465, 0.6) |
| `gradient_softness` | Falloff exponent (4). Higher keeps the center clear and darkens the edges more steeply; lower gives a longer, gentler fade |
| `gradient_strength` | 0 to 1, how black the edges get (1) |
| `gradient_corner_strength` | 0 to 1: a faint extra fade that mostly touches the corners (0.35); the middle of each edge gets only about an eighth of it. `0` turns it off |
| `title_color` | `auto` (logo's dominant color) or `#RRGGBB`; the fallback is `#EBEBEB` |
| `title_min_brightness` | With `auto`: logo colors darker than this (perceived brightness, 0-255) are skipped, so the next most common color that is bright enough is used; `#EBEBEB` if none is. `0` (default) skips only near-black and near-white. 80 keeps text readable on the dark fade |
| `stroke_opacity`, `title_stroke_width`, `index_stroke_width` | The dark outline around the title and the season/episode text. `stroke_opacity` is 0 (none) to 1 (solid; the default, so the picture can't show through), and the widths are in pixels on a 3200px-wide card (defaults 3 and 6, as in the original card; 8 and 12 at 0.9 reads clearly). The outline sits under the letters and over the shadow |
| `title_stroke_color`, `index_stroke_color` | The outline colors: `title_stroke_color` is `auto` (the default: black, or white if `title_color: auto` picks a very dark color) or `#RRGGBB`; `index_stroke_color` is `#RRGGBB` (`#000000`) |
| `shadow_strength`, `shadow_blur`, `shadow_offset_y`, `shadow_color` | A soft shadow behind the title and season/episode text, drawn from the glyph shapes and blurred. `shadow_strength` is 0 (off, the default) to 1 (solid), `shadow_blur` is how far it spreads in pixels on a 3200px-wide card (14; about 24 is fuller), `shadow_offset_y` shifts it down (0 centers it on the text) and `shadow_color` is `#RRGGBB` (`#000000`). It sits under the existing thin outline |
| `title_font_file`, `title_font_size` | Title font and size (157) |
| `title_letter_spacing`, `title_line_spacing` | Pixels added after every character (`-1.25`) and between lines (`-22`, so negative is tighter), on a 3200px-wide card |
| `title_x`, `title_bottom` | The title's left edge (`50`) and the distance from the card's bottom edge to its last line (`125`), in pixels on a 3200px-wide card. The title grows upward from there |
| `title_max_line_width`, `title_max_lines` | TitleCardMaker's bottom-heavy title splitting: about 32 characters a line, at most 3 lines |
| `season_font_file`, `episode_font_file`, `index_font_size`, `index_color` | `SEASON 1 •` and `EPISODE 1` fonts (Semibold and Regular in the original), size (68) and color |
| `index_letter_spacing`, `index_gap` | Pixels added after every character of the season/episode text (`5.42`) and between the season and the episode part (`30`) |
| `index_x`, `index_bottom` | The season/episode text's left edge (`50`) and its distance from the card's bottom edge (`50`) |
| `season_text`, `episode_text` | Templates using `{season_number}` and `{episode_number}`. An empty `season_text` hides the season part |
| `text_transform` | Applies to the title and the season/episode text (the original uses `uppercase`) |

The `radial` gradient is darkened in floating point and dithered with a little
triangular noise (the same fixed pattern on every card) before the single rounding to
8 bits, so the fade doesn't show banding even on dark, JPEG-compressed stills.

Fonts are not bundled. Copy `Sequel-Neue.otf`, `Proxima Nova Semibold.otf` and
`Proxima Nova Regular.otf` from TitleCardMaker's `backend/assets/standard` into
`resources/fonts/`, then uncomment the font lines in the example.
Without font files Pillow's bundled font is used.

The still comes from TMDb (one cached request per season), then TVDB; the title
comes from Plex, then TMDb/TVDB. The logo is the show's `logo.png` in its asset
folder, or is picked like a series logo and saved there. Each card is saved as
`rendered.jpg` in `assets/tv/<Show>/Season 01/Episode 01/` next to the saved
`poster.jpg` (the still). Replace that file to use your own still; delete it to fetch
a new one. If TMDb and TVDB have no still, Plex's own episode image is used instead (and
saved as the still). It is ignored if it carries the Overlayrr marker, i.e. is a card you
uploaded earlier, which needs `overlay_marker: true` (the default). If there is no usable
image the episode is skipped (`SKIP`). With `missing_art: skip`, there is no Plex fallback,
and an episode whose show has no logo is also skipped; otherwise the card is made without a
logo.

With `plex.upload: true` each card replaces that episode's Plex image. Episodes
don't get the completion label (Plex labels apply to movies, shows and seasons here); use
`--changed-only` to skip unchanged cards.

To try a single card without touching the rest of the show:

```sh
python overlayrr.py config.yaml --item 12345 --with-episodes --season 1 --episode 1 --remake
```

`--with-episodes` on a targeted show adds all its episodes to the run, like
`--with-seasons`. Adding `--season` and/or `--episode` limits the run to matching
episodes only (no show or season posters). Explicit jobs without Plex work too:

```yaml
items:
  - type: tv
    tmdb_id: 1396
    season: 1
    episode: 1
    layout: tk-tv
```

## Web interface

A small password-protected page for browsing your titles, choosing their poster and logo, and pushing the
changes to Plex. It adds no dependencies and runs inside the same script:

```sh
python overlayrr.py config.yaml --serve                          # http://127.0.0.1:8787, this machine only
python overlayrr.py config.yaml --serve --host 0.0.0.0 --port 8787   # reachable from other machines
```

Set a password (8+ characters) in `.env` or the environment; `--serve` refuses to start without one:

```dotenv
OVERLAYRR_WEB_PASSWORD="something-long"
OVERLAYRR_WEB_HOST="0.0.0.0"   # optional, default 127.0.0.1
OVERLAYRR_WEB_PORT="8787"      # optional, default 8787
```

`--host` and `--port` on the command line override the two optional variables.

- **Browse.** Every folder under `assets/` (movies, TV, collections) is listed with its finished poster. Search (press
  */* to jump there), filter by type, or filter to *Not pushed* (titles you've changed).
- **Pick.** Opening a title shows *Current* (the last pushed poster) above *Preview* (what the next push will make) on
  the left, so you can compare them, and on the right *Poster* / *Logo* tabs (plus
  *Series* / *Season N* for shows; seasons use the series logo). Below them is one gallery of everything that could be
  the poster or logo: the file the last push used (green, tagged *Live*; worked out from the render record
  `--changed-only` keeps), your pick if it differs (blue, *Selected*), the files saved in the title's folder, what
  TMDb, Fanart.tv, TVDB and Plex offer online and, on the Poster tab, backdrops to crop. More loads as you scroll.
  On the Poster tab the chips show *All*, just *Posters* or just *Backdrops*. Clicking never
  moves a tile: a downloaded picture stays in its online slot (where each file came from is remembered in
  `.cache/web_sources.json`), your own uploads, crops and links follow the live one, and other saved files stay out
  of sight. **Click a picture to use it.** *Preview* then shows the result; with nothing picked beyond what's live it stays empty.
  The one it replaces is kept beside it as `poster-<hash>`/`logo-<hash>`. The gallery
  keeps its order while you pick: only the live one is moved, to the front.
  *Push to Plex* (or *Render*) at the top pushes just this title, and *Discard changes* selects the files the last push was made from (matched against the
  change record `--changed-only` uses) and drops the *Not pushed* mark. The corner icon on each picture opens it larger (arrow keys step through the gallery), with *Use this
  poster/logo*, *Preview in layout*, and *Delete* for saved files (never the current one). Logos sit on a
  checkerboard; *Light background* / *Dark background* switches it so dark and light logos both stay visible
  (remembered per browser). *Esc* closes the viewer, a dialog, the title or the Log.
- **Preview.** The panel on the left shows how the title will look after a push: it renders the poster and logo
  now in use with the title's layout, in memory, and updates as you pick. *Last pushed* shows the file from the
  last render instead. In the larger view, *Preview in layout* previews a candidate before you choose it. Nothing
  is written to disk (the images are JPEGs sent straight to the page). It needs Plex to be reachable, because the
  layout can depend on the title's library and badges, and it takes about a second per render. Closing the title
  clears the server's copies, and anything left over is dropped after five idle minutes.
- **Add your own.** The *Add your own* tile opens a small window: choose or drop image files, or paste a link to an
  image. You can also paste an image (Ctrl+V) or drop files or an image link anywhere on an open title. It's saved as `poster-<hash>`/`logo-<hash>`,
  so *Find more* never overwrites it, and becomes the current one right away (several at once are only saved). Links must be public http(s);
  private and local addresses are refused. Files up to 40 MB; JPEG, PNG, WebP, GIF, TIFF and BMP. A logo without
  transparency is added with a warning.
- **Online.** The gallery's online part lists everything TMDb, Fanart.tv,
  TVDB and Plex offer for the title (a season's Poster tab lists that season's; seasons share the series' logos),
  best language and size first. The server only looks up the lists (a few small requests, cached for a day); your
  browser loads the thumbnails straight from those sites, except Plex's own copies, which come through the page so
  your token stays on the server. Nothing is saved until you click one: then only that one image is downloaded to
  the title's folder (as `poster-<hash>`/`logo-<hash>`) and made the one in use. Posters can be narrowed to
  *Without text* or *With text* (Plex's posters aren't labeled, so they only show under *With or without text*). Providers
  that fail, such as a missing API key, are named under the list. The command-line `--poster`/`--logo` still
  download candidates in bulk if you want them saved ahead of time.
- **Backdrops as posters.** The end of the Poster tab's gallery (or the *Backdrops* chip) lists the wide pictures the
  same four sources have (TMDb, Fanart.tv, TVDB, Plex; most have no text on them). Clicking one opens a crop window
  with a frame in the shape of this layout's poster: drag it, or click the picture to move it there, and drag the slider
  right to zoom in. It shows the cropped size and warns when it will be enlarged a lot (a 1080p backdrop gives a 720×1080 poster,
  stretched to 2000×3000). *Use this crop* downloads that one backdrop, keeps only the chosen part as a lossless PNG
  (`poster-<hash>.png`; the backdrop itself isn't kept) and makes it the poster. A season's Posters tab lists the show's
  backdrops, cropped to the season layout's shape.
- **Push.** Titles you've changed are marked *Not pushed*. *Push N changes* (or a title's own *Push to Plex*; with upload
  off both say *Render*) runs
  `--item <id> --changed-only` for each one, which renders and, if `plex.upload` is `true`, uploads. The header
  shows whether upload is on; the page never changes that setting.
  For a show, a push also covers its seasons and, when the show has episode title cards (`plex.include_episodes`
  is `true`, or `Episode NN` folders already exist), its episodes. Seasons and episodes read the series logo from
  the show's folder, so a new logo re-renders all of them; `--changed-only` skips the ones that didn't change.
  Output streams into the Log panel, which opens when a push starts. One job runs at a time. The changed list is kept in `.cache/web_pending.json`.
- A title needs a Plex ID (the `rating_key` the script records in its folder after a normal run) before it can be
  searched or pushed.
- **Template.** The *Template* switch in the header opens a layout editor: pick a layout and *Poster*, *Season* or
  *Episode card*, then move the sliders, toggles and colors (image effects, logo box, text, border, badges). The
  preview beside them re-renders on one of your titles as you go (*Preview on* picks it, *Shuffle* picks one at random;
  a season preview uses the show's first season poster). It renders small and in memory, about a tenth of a second per
  change, and never more than one at a time: changes made while it renders are folded into the next one. A dot marks
  each changed setting (its ↺ puts the saved value back). *Save to config.yaml* writes just those settings into the
  YAML: only their lines change, so comments, order and line endings stay; Season changes go under `season_options`
  and Episode card changes under `episode_options`. The file as it was before is kept as
  `.cache/config-before-template.yaml`, and a save is refused if the file changed since the page loaded it. Saved
  posters aren't redrawn right away: each one picks up the new layout on its next render (a push, or a
  `--changed-only` run, sees the layout changed). The poster's font paths, `resource_dir`, canvas size and art choice
  (`poster_filter`, `logo_preference`) stay YAML-only.
  The *Episode card* view has every title card setting (gradient, logo box, position, alignment and shadow, and the
  title's and season/episode text's fonts, sizes, colors, spacing, positions, outline and shadow; see
  [Episode title cards](#episode-title-cards)), in pixels on a 3200px-wide card. Fonts are picked from the files
  in `resources/fonts` (a font named in the YAML from elsewhere shows up too). It previews the
  show's first saved episode still (`Season NN/Episode NN/poster.*`, Specials last) with the show's logo, and draws
  the card on the show's poster, saying so, when no still is saved yet. A layout without `episode_options` starts from
  its other settings on a 3200×1800 card, and saving writes that size along with your changes.

Notes for running it on a server:

- The page speaks plain HTTP. For remote access put an HTTPS reverse proxy (Caddy, Nginx, Traefik) in front of it
  and, if the proxy is on the same machine, listen on `127.0.0.1` only. The login cookie is marked `Secure`
  when the proxy sends `X-Forwarded-Proto: https`.
- Five wrong passwords from one address lock it out for ten minutes. A reverse proxy on the same machine passes
  each visitor's address on in `X-Forwarded-For`, so the limit applies per visitor; from a proxy on another
  machine (another container, say) every visitor shares its address, so one person's misses lock out everyone.
- Sessions last seven days and are kept in memory, so restarting `--serve` signs everyone out.
- It's built to stay out of Plex's way. On Linux every run, the server included, lowers its own CPU priority
  (`nice 10`), and the runs it starts inherit that. NumPy's math library is kept to one thread (set
  `OPENBLAS_NUM_THREADS` to change that), so a run doesn't briefly occupy every core of a big machine. Previews render at about 480 px wide, one at a time, and the Plex lookup behind them
  is made once per open title. Only two thumbnails are generated at once, uploads over 30 megapixels are refused, and
  idle connections are dropped after a minute. A push or "find more" is the same work as the command line, just at
  low priority (`workers` in the YAML still sets how many renders run together).
- Thumbnails are cached in `.cache/thumbs`; ones nobody has looked at for 30 days are deleted by the next full run.
  There are no config keys for this; it uses `assets_dir` and `cache_dir`.
- Pushes wait for any other run to finish (see the lock below); the Log panel says so while it waits.

## Run it from Tautulli (new media)

`--added` is for hooks that fire when something lands in Plex. With `--item` (or `--title`) it builds and sends
only what Plex doesn't have yet, so you never re-scan the library. `--item` takes the new media's own Plex key, and
the script asks Plex what it is:

| New media | What gets built and sent |
|---|---|
| Movie | the movie poster |
| Show Plex has no poster for | the show, every season and every episode card |
| Season of a known show | the season poster and that season's episode cards |
| Episode of a known show | the episode card, plus its season poster if Plex doesn't have it |

One command covers all four: `--item KEY --added` (`--item SHOW_ID --added --season N [--episode M]` still works).
A known show is one whose show poster exists and is already in Plex.

"Already in Plex" is checked on the server, not on disk. After an upload the movie, show or season carries the
`completion_label` (default `Overlayrr`; `Overlayrr: Stock` for a stock fallback), and `--added` skips only titles
that have it. A `rendered.jpg` that exists but whose title lacks the label (the upload failed, or Plex re-added the
title under a new ID) is sent to Plex again, or rendered again first if its inputs changed. Episodes carry no label,
so they count as done when their last upload finished, and with `completion_label: ""` so does everything else. Re-firing for a title Plex already has, as Tautulli does on quality upgrades, changes nothing.
To rebuild one anyway, run it yourself with `--item KEY` (add `--refetch` to pick new artwork).
`--added` can't be combined with `--remake`, `--refresh`, `--changed-only`, `--poster`, `--logo`,
`--with-seasons` or `--with-episodes`. On Linux, runs that change anything wait for each other (lock file
`.overlayrr.lock` next to the config): a season pack's burst of hooks runs one at a time, and a hook or web push
that arrives during the nightly run waits for it, printing "Waiting for another Overlayrr run to finish...".
That covers every render run, `--import-posters`, `--sync-collections apply` and `--cleanup move/remove/restore`;
plans and reports don't wait. With Script Timeout `0` (below) a waiting hook is never cut off.

Tautulli runs whichever file you pick, so use a small wrapper that changes into the Overlayrr folder and runs the
venv's Python. This is the layout on the server (the `overlayrr-venv` folder sits next to `overlayrr.py`):

```text
/path/to/Overlayrr/
  overlayrr.py  config.yaml  .env  overlayrr-venv/  assets/  .cache/
  overlayrr-hook.sh     <- the wrapper (chmod +x); output goes to hook.log
```

The wrapper is `overlayrr-hook.sh` in this folder; copy it to the server as it is (it needs Unix line endings, which it has):

```sh
#!/bin/sh
if [ "$#" -eq 0 ]; then
    echo "overlayrr-hook.sh needs arguments, for example: --item KEY --added (or --help to test)" >&2
    exit 2
fi
cd /path/to/Overlayrr || exit 1
echo "=== $(date '+%F %T') $*" >> hook.log
exec ./overlayrr-venv/bin/python -E -u overlayrr.py config.yaml "$@" >> hook.log 2>&1
```

The `===` line records every call with its arguments, and `-u` writes output as it happens, so a hook that is still
waiting or gets killed still shows up. No `===` line for a new title means Tautulli never ran the wrapper (check that
the Script Folder and Script File in the agent point at this exact file).

`-E` makes Python ignore `PYTHON*` environment variables. Tautulli starts scripts with its own environment, which can
put the system's packages ahead of the venv's. The sign is an import error naming a path outside `overlayrr-venv`, for
example `cannot import name '_imagingft' from 'PIL' (/usr/lib/python3.12/site-packages/...)`. It only shows when a
render draws text (season posters, episode cards, stock posters): re-sending an existing poster never touches it.

The wrapper refuses to run without arguments, because a run with no `--item` processes the whole library (every title,
and every episode card if `include_episodes` is on) and uploads all of it to Plex. To check that it runs, pass `--help`.

The user Tautulli runs as needs read access to the folder and write access to `assets/`, `.cache/` and `hook.log`. If
the volume is mounted `noexec`, keep the wrapper in a local folder (for example `/opt/overlayrr-hooks/`); only its
`cd` line points at the Overlayrr folder.

In Tautulli: Settings > Notification Agents > Add > Script, trigger **Recently Added**. In each agent set **Script
Folder** to the folder holding the wrapper, **Script File** to `overlayrr-hook.sh`, and **Script Timeout** to `0` (the
default 30 seconds is too short, and waiting on the lock counts against it). One agent is enough, with no condition on
`Media Type`. The arguments don't include any paths, because the wrapper supplies the script and config:

```text
--item {rating_key} --added
```

(Older setups with one agent per media type, passing `{parent_rating_key}` or `{grandparent_rating_key}` with
`--season`/`--episode`, keep working. On a movie those agents get empty placeholders and fail with
`argument --item: invalid int value: ''`, harmlessly. A single agent avoids that and the duplicate runs.)

Turn on "Group Notifications by Season or Album" in Tautulli's notification settings so a season pack sends one hook,
not one per episode. Keep a nightly `--changed-only` run as a safety net for missed events. To test without waiting for
new media, ask Tautulli to re-send a Recently Added event for an existing item (replace `AGENT_ID` and the key), then
read `hook.log`. This proves the hook runs. A title Plex already has the poster for prints `EXISTS` and is left alone:

```sh
curl "http://localhost:8181/api/v2?apikey=YOUR_KEY&cmd=notify_recently_added&rating_key=EPISODE_KEY&notifier_id=AGENT_ID"
```

## Editable asset folders

On the first run, the script creates `assets/movies` and `assets/tv` beside the
YAML, then saves the source files and finished poster for each title. Change this
location with `assets_dir`. A typical library looks like:

```text
assets/
  movies/
    The Matrix (1999) {tmdb-603}/
      poster.jpg
      logo.png
      rendered.jpg
  tv/
    Breaking Bad (2008) {tvdb-81189}/
      poster.jpg
      logo.png
      rendered.jpg
      Season 00/
        poster.jpg
        rendered.jpg
      Season 01/
        poster.jpg
        rendered.jpg
```

Replace a title's poster or logo file, then rerun. No per-title YAML artwork
settings are needed. Existing files take priority and are never automatically
refreshed. Missing inputs are selected using the APIs; both inputs together
bypass artwork API calls. Plex is still scanned to discover your selected items.
Use textless posters and transparent PNG logos. Original downloaded bytes are
preserved, without recompression. JPEG, PNG, WebP, TIFF, BMP and GIF are accepted.
Keep exactly one file named `poster` and one named `logo` per folder, regardless
of extension. When changing formats, remove the previous file; ambiguous inputs
produce an error rather than silently choosing one. A corrupt local image fails
that item and does not get replaced automatically.

Seasons use `Season 01`, `Season 02`, etc.; `Season 00` is Specials. Their posters
are independent, and their logo is always the show's (a `logo` file inside a season
folder is ignored). Replacing the show's logo updates all of its seasons. TVDB IDs are preferred for TV folder names; TMDb IDs for movies,
with IMDb/Plex IDs as fallbacks. The ID suffix and managed `.overlayrr.json`
metadata keep renamed titles and remakes separate; you can rename the readable
part of the folder without changing the ID. Don't edit the metadata file.

Generated posters use `rendered.jpg` in the same media folder and are replaced on
each rebuild. They are never used as source artwork. There is no `output_dir`.
For an older configuration, replace `artwork_dir: artwork` with
`assets_dir: assets`, remove `output_dir`, and rename your source folder to `assets`.
To fetch a different input automatically, delete that source file and rerun;
`--refetch` refreshes the API/download cache and also deletes the selected titles' saved `poster`/`logo` files
so they are picked and downloaded again (including ones you placed there yourself).
A saved stock poster retains its stock appearance until a `--changed-only` run finds a poster that fits (a textless
poster, or a textless backdrop to crop), and then it is replaced. Replace it with your own textless poster, or
delete it, to request a new automatic selection at once.

For routine runs after editing artwork or layouts:

```sh
python standalone/overlayrr.py standalone/config.yaml --changed-only
```

This hashes source files and layout settings and skips unchanged renders and
uploads. File hashes are remembered in `.cache/digests.json` and a file is only
read again when its size, modification time or (on Linux) change time differs,
so an unchanged run reads almost none of `assets/`; delete that file to make
the next run hash everything again. Font files, season labels, quality and upload settings are also checked.
With uploads on, the Plex server counts by its own ID (asked once and kept in
`.cache/plex_servers.json`), not by `plex.url`: reaching the same server by
another address (`localhost` instead of its IP) rebuilds nothing, while a
different server gets everything uploaded again.
The record is written only after successful rendering/upload and verified server
labeling, so failed uploads or label updates retry. It uses small records under
`.cache/renders`, with no database. A normal
run without this option rebuilds and uploads everything.

Optional YAML overrides remain available for provider IDs or layout selection:

```yaml
overrides:
  "12345":  # Plex rating key
    tmdb_id: 603
    layout: tk-movies
```

Legacy `poster`/`logo` paths or HTTP(S) URLs in YAML still work for initial inputs.
Once a title folder is populated, its files take priority. SVG is skipped to
avoid a native rendering dependency.

Manual-only jobs also work without credentials:

```yaml
plex:
  libraries: []
default_layout: custom
layouts:
  custom:
    uniform_logo_max_w: 1500
    uniform_logo_max_h: 500
    uniform_logo_offset_y: 0.83
items:
  - title: Custom Movie
    poster: assets/my-poster.jpg
    logo: assets/my-logo.png
    output: custom.png
```

An optional `output` on an item changes the filename inside that media's asset
folder, for example `rendered.png`. It must be a JPEG or PNG filename without
directories; `poster` and `logo` are reserved for inputs. Paths to local inputs
are relative to the YAML. You can also override provider IDs for a Plex item when
its GUIDs are absent or incorrect. Specify the intended IDs together if
correcting a mismatched item.

## Selection and fallback

The script uses Plex's provider GUIDs, with a metadata lookup if the library
listing omits them. It maps TVDB/IMDb IDs to TMDb using exact external-ID
lookup, and can find TVDB movie/series IDs using IMDb. It does not guess from a
title search. Missing IDs can be supplied in YAML.

It checks TMDb, then Fanart.tv, then TVDB, applying the selected layout's
`poster_filter` and `logo_preference`. White preference examines up to six raster
logo candidates using thumbnails where available and keeps a colored logo as a
fallback. Any preference takes the first usable logo in the preferred language.
Logos and posters are only used if they are in your `language`, in English, or have no language; Fanart.tv and TVDB
list artwork in every language, and the others are ignored even when they fit the preference better, or when a
provider flags a foreign-language poster as textless.
`logo_mode: none` bypasses logo selection and permits rendering without one.
Once suitable artwork is found, later providers are skipped to save API calls.
Missing credentials disable that provider.

Textless classification uses provider metadata: TMDb's language tag, Fanart's
neutral language marker, and TVDB's `includesText` flag (language when absent).
This is not OCR; if a provider mislabels artwork, use an override.

When no provider poster matches the filter (with `poster_filter: textless` that is common, since TMDb often
lists only posters with the title printed on them), a textless backdrop is cropped into the poster instead:
TMDb's widest first, then Fanart.tv's, then TVDB's. The layout and the series logo are applied as usual, and the picture
is centered and cropped to the poster shape (use `poster_zoom` and `poster_shift_x` to frame it). This is skipped with
`poster_filter: text`, and for a title with no logo, which is stock anyway. The backdrop is saved as the title's `poster`
file, so a textless poster that appears later is only picked up after `--refetch`.

When no poster (or backdrop) fits or no required logo exists, `missing_art: stock` saves an
ordinary cover-sized poster without Overlayrr effects, preferring artwork with
its original title. Plex's current poster is the final fallback. With
`missing_art: skip`, the item is left alone and the process exits with status 1
so a scheduled run can detect incomplete artwork. Download or API errors are
reported; a failed item does not stop the rest of the batch.

This covers movie, series and season posters. Episode posters, collections,
badges, notifications, webhooks and retry queues are not included.

## Look and performance

The example YAML's `overlayrr-main` values come from the `simposter-main` preset in `backend/api/presets.py`:

| Setting | Value |
| --- | --- |
| Canvas | 2000 × 3000 |
| Poster zoom / vertical shift | 1 / −0.04 |
| Bottom matte / fade | 0.22 / 0.21 of height |
| Vignette / grain | 0.03 / 0.22 |
| Logo bounding box | 1282 × 352 |
| Logo center | 0.5 of width, 0.83 of height |

The script preserves the original crop, shift, mask rounding, effect order and
logo placement. Grain is random as in the app, but drawn once per layout per run, so the
posters of one run share a pattern (it's subtle, and saves about 40% of render time); a
layout's `grain_seed: 42` makes it repeatable across runs. Its random generator differs
from the app's, so unseeded grain patterns differ. Lower output dimensions scale logo bounds and blur radii to
keep the proportions. Change these values directly in the YAML layout.

Fixed effect masks are cached and shared across workers and layouts with the
same canvas/effects. Renderers are created only when an item needs rendering,
so unchanged batches skip building full-size masks. Grain uses
float32 arrays, logo color analysis uses vectorized NumPy operations, and each
worker reuses HTTP connections. API responses are cached on disk for 24 hours
and downloaded images for 7 days; the artwork a title uses is saved in `assets/`,
so the cache only has to last between nearby runs. Each full run (not one on a
single title) deletes the cache files that have expired. Neither a database nor
a server is needed.
GET requests retry transient failures and respect `Retry-After`.
Logo thumbnails use a shared pool of at most six concurrent requests, so one
item's logo selection does not incur six sequential network waits.

Start with `workers: 2`. Increase to 4 for network-heavy batches if memory allows;
each active full-size render needs tens of megabytes. A layout's `width: 1000`
and `height: 1500` reduce pixel work to one quarter if smaller posters suffice.
JPEG defaults to quality 95 with full color resolution (`subsampling=0`); PNG
uses compression level 3 to reduce encoding time.

Useful options:

```sh
python standalone/overlayrr.py standalone/config.yaml --limit 5
python standalone/overlayrr.py standalone/config.yaml --changed-only
python standalone/overlayrr.py standalone/config.yaml --refetch
python standalone/overlayrr.py standalone/config.yaml --remake
python standalone/overlayrr.py standalone/config.yaml --refresh
python standalone/overlayrr.py standalone/config.yaml --item 12345 --remake
```

`--refetch` bypasses the disk cache. Cache files contain downloaded artwork and
provider responses; login tokens are kept only in memory. API keys are not
printed in HTTP error messages.

Run the focused tests from the repository root:

```sh
python -m unittest discover -s standalone/tests -v
```

API references: [TMDb images](https://developer.themoviedb.org/reference/movie-images),
[TMDb season images](https://developer.themoviedb.org/reference/tv-season-images),
[TVDB v4](https://thetvdb.github.io/v4-api/),
[Fanart.tv](https://api.fanart.tv/),
[PlexAPI poster uploads](https://python-plexapi.readthedocs.io/en/latest/modules/mixins.html#plexapi.mixins.PosterMixin).
