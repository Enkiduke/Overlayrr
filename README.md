# Overlayrr

Custom posters for your Plex library. Overlayrr fetches artwork from TMDb,
Fanart.tv and TVDB, applies your layouts, and saves the results or uploads them
to Plex. It supports movie and series posters, seasons, episode title cards,
collections, and a web interface for choosing artwork and editing layouts.

One Python script, a YAML config, and a bundled web interface. Run it on demand,
schedule it, or trigger it from Tautulli. Requires **Python 3.10+**.

## Quick start

On your Linux server:

```sh
git clone https://github.com/Enkiduke/Overlayrr.git
cd Overlayrr
python3 -m venv overlayrr-venv
. overlayrr-venv/bin/activate
python -m pip install -r requirements.txt
cp config.example.yaml config.yaml
cp .env.example .env
```

In `config.yaml`, set your Plex address and library names. Keep uploads off while
trying your first poster:

```yaml
plex:
  url: http://localhost:32400
  libraries: [Movies, TV Shows]
  upload: false
```

Fill in `.env` with your Plex token and the keys for the artwork providers you use:

```dotenv
PLEX_TOKEN="your-plex-token"
TMDB_API_KEY="your-tmdb-api-key"
TVDB_API_KEY="your-tvdb-api-key"
FANART_API_KEY="your-fanart-api-key"
```

Missing provider keys disable that provider. `.env` is ignored by Git.

Try one title:

```sh
python overlayrr.py config.yaml --limit 1
```

Look for `rendered.jpg` in that title's folder under `assets/`. When you're happy,
set `plex.upload: true` to replace Plex posters with your results, then run:

```sh
python overlayrr.py config.yaml --changed-only
```

Paths in YAML resolve relative to the config file.

## Everyday commands

Append these options to `python overlayrr.py config.yaml`:

| Task | Options |
| --- | --- |
| Process only changed artwork or settings | `--changed-only` |
| Rebuild one title by Plex rating key | `--item 12345` |
| Select by exact title | `--title "The Matrix" --type movie --year 1999` |
| Include a selected show's seasons | `--item 12345 --with-seasons` |
| Render one episode card (use the show's key) | `--item 12345 --with-episodes --season 1 --episode 1` |
| Re-send saved results to Plex | `--refresh` |
| Download alternate artwork without rendering | `--item 12345 --poster 5 --logo all` |
| Import a MediUX / Kometa poster set | `--import-posters posters.yml` |
| List every option | `--help` |

**A run without selectors or `--changed-only` rebuilds everything configured.**
`--remake` forces a rebuild even with `--changed-only`. `--refetch` fetches fresh
artwork and deletes the selected titles' saved `poster` and `logo` inputs,
including files you placed there yourself. Uploads always follow `plex.upload`;
`--refresh` requires it to be `true`.

## Layouts and artwork

[config.example.yaml](config.example.yaml) includes `overlayrr-main`, `tk-movies`
and `tk-tv`. Choose layouts in YAML:

```yaml
default_layout: overlayrr-main
layout_by_library:
  Movies: tk-movies
  TV Shows: tk-tv
```

Turn on `plex.include_seasons`, `plex.include_episodes` or
`plex.include_collections` for batch runs as needed. Episode cards require
`episode_options` in the show's layout; the example includes them for `tk-tv`.

To use your own artwork, replace `poster.*` or `logo.*` in a title's folder under
`assets/movies/` or `assets/tv/`, then run `--changed-only`. Keep exactly one
`poster` and one `logo`, with their image extensions. Use textless posters and
transparent logos; seasons and episodes share their show's logo.

Saved sources take priority over automatic picks. If suitable artwork is missing,
the default `missing_art: stock` uses an ordinary poster instead.

## Web interface

Set `OVERLAYRR_WEB_PASSWORD` in `.env` (at least 8 characters), then start:

```sh
python overlayrr.py config.yaml --serve
```

Open <http://127.0.0.1:8787> to browse titles, choose posters and logos, crop
backdrops, preview changes, edit layouts, and push results to Plex. Run a normal
batch first to populate the library. With uploads off, the page renders locally.

In **Collections > Discover > Universes**, choose from 17 presets including MCU,
Star Wars, Wizarding World and Middle Earth. These use the curated source lists
[listed by Kometa](https://github.com/Kometa-Team/Kometa/blob/master/defaults/both/universe.yml).
Choose Movies or TV shows, preview up to 250 titles, then add the collection to
its Plex library. The preset name is filled in; imports start disabled and use
append-only membership. Enable it, choose synchronization if you want removals,
save, and preview the plan before applying. Source refresh is on by default.
Movie and TV collections are separate; some presets are movie-only.

MDBList presets require `MDBLIST_API_KEY`; TMDb presets use `TMDB_API_KEY`.
IMDb may block public list imports. You can also use **Import URL** for your own
universe list. Presets supply membership; collection artwork is chosen separately.

For access from other machines, add `--host 0.0.0.0`; use an HTTPS reverse proxy
for remote access. See [server details](docs/reference.md#web-interface).

## Run it from Tautulli

Use [overlayrr-hook.sh](overlayrr-hook.sh) on your Linux server. Edit its `cd`
path to your Overlayrr folder, keep the virtual environment named `overlayrr-venv`,
and make the wrapper executable:

```sh
chmod +x overlayrr-hook.sh
```

In Tautulli, add a **Script** notification agent with the **Recently Added**
trigger. Select the wrapper, set **Script Timeout** to **0**, and use:

```text
--item {rating_key} --added
```

One agent handles movies, shows, seasons and episodes. `--added` processes only
what hasn't been delivered; enable `plex.upload` for delivery to Plex. Output goes
to `hook.log`. Keep a nightly `--changed-only` run for missed events.
[Hook setup and troubleshooting](docs/reference.md#run-it-from-tautulli-new-media).

## More details

- [Layout settings and badges](docs/reference.md#layouts)
- [Seasons and episode cards](docs/reference.md#seasons)
- [Collections and collection syncing](docs/reference.md#collections)
- [Artwork downloads and imports](docs/reference.md#download-more-posters-and-logos)
- [Plex labels, clear logos and poster cleanup](docs/reference.md#clear-logos-in-plex)
- [Asset folders, fallback rules and performance](docs/reference.md#editable-asset-folders)

## License

Overlayrr is released under [The Unlicense](LICENSE). Bundled third-party
libraries, fonts and artwork remain subject to their respective terms.
