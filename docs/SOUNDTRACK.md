# Soundtrack

Soundtrack is optional, browser-local music for the workspace and Ship View. It
starts disabled on a fresh installation or upgrade. Restoring an enabled setting
does not start audio: press **Play** after opening or reloading the application.
The player follows the selected project, not every running project.

## Start listening

1. Open **Settings**, then the **Soundtrack** section.
2. Enable Soundtrack and choose **Adaptive**, **Continuous playlist**, or **Manual**.
3. Press **Play** in the compact player. If the browser blocks playback, check the
   displayed notice and press Play again; the app does not retry indefinitely.
4. Use Previous/Next, Seek, Volume, Mute, Shuffle and Repeat as needed. Repeat can
   be Off, Track, or Playlist. Seek depends on readable media duration.
5. **Pause** stays in effect through project/state changes until you press Play
   or change playback mode. **Stop** also resets the position. Disabling
   Soundtrack stops audio immediately.

The same player remains mounted in Ship View. Entering or leaving that view
keeps the current audio and position. Ship animation and decorative weather
never control the music. The player provides a shortcut back to Soundtrack
settings without introducing a separate settings window.

## Modes and playlists

**Adaptive** uses the existing Ship execution-state mapping and backend project
snapshots. Idle/ready, preparing, running, pausing, checkpointed, failed and
completed states can each select a playlist, individual track, or **Silence**.
An unchanged snapshot does not restart the track. Failed/blocked music is a user
preference, not evidence of an operational failure; playback never changes work.

**Continuous playlist** follows the selected playlist independently of execution.
**Manual** lets you select and control individual tracks directly. Playback and
volume are global to this application instance; it does not start one player per
project. Three or more running projects still share the selected project's player.

## Multiple tabs and windows

The first active player holds an exclusive browser Web Lock. Another tab or
window in the same browser profile and origin stays silent and displays a notice.
Pause or Stop the active player, then explicitly press Play in the other tab to
transfer playback. There is no queued automatic takeover. Disable, Silence,
finished playback, errors, and page exit also release ownership. Reload never
restores playback authorization. Web Locks are required; unsupported browsers
leave audio silent with an actionable notice rather than risking overlap.

This policy follows the [Web Locks API](https://www.w3.org/TR/web-locks/).
Different browsers, profiles, hosts, or ports have separate lock scopes and can
play independently. The application cannot coordinate audio across those scopes.

Create a user playlist, select it in **Playlist to edit**, name it, and add the
selected track. Use Remove beside an entry to remove it from that playlist.
Rename and Delete apply to user playlists. Bundled playlists are protected;
**Copy** creates an editable user version. All metadata is displayed as text.

## Personal audio and consent

Use **Select personal audio** to choose MP3, OGG, WAV or FLAC files. The browser's
format support is checked; an accepted extension does not guarantee a valid
recording. Decode failures show an actionable message. Files must be nonempty
and smaller than 256 MB; the personal library holds at most 200 entries.

By default, selection is temporary. No bytes are uploaded, copied into Planwharf's
source tree, or exposed through an HTTP file-path endpoint. After a reload,
temporary tracks must be selected again. Missing playlist entries remain visible
as unavailable; reselect the file and add the new entry to the playlist.

Select **Store selected audio in this browser for later sessions** only if you
want an independent local copy retained in IndexedDB. That copy remains playable
if the original file is moved, deleted, or becomes inaccessible. Removing stored
audio removes the browser copy, not your original file. Storage quota or browser
privacy restrictions can prevent saving; use temporary selection in that case.
Clearing browser site data removes these copies and preferences. Storage belongs
to the application's browser origin/profile; a different host, port, profile or
browser does not share it. Soundtrack preferences are in localStorage under
`planwharf_soundtrack_v1`; consented media uses the IndexedDB database
`planwharf_soundtrack_media_v1`. Neither is part of a notebook or project export.

## Bundled music and licensing

Four complete recordings are included, approximately 12.6 MiB total:

| Recording | Creator | License |
| --- | --- | --- |
| Deep Sea | Umplix | CC0 1.0 |
| Deeper Sea | Umplix | CC0 1.0 |
| Ocean Trance | MintoDog | CC0 1.0 |
| Drifting | Some Weirdo | CC0 1.0 |

The six theme playlists reuse those four recordings. They provide ocean ambient
and electronic music, rather than a bespoke orchestral adventure score. You can
replace every mapping with your own audio or Silence.

See [the asset notices](../assets/soundtrack/NOTICE.md),
[the machine-readable manifest](../assets/soundtrack/manifest.json), and the
included CC0 legal code for exact author upload/download URLs, attribution,
verification hashes and the documented WAV-to-OGG conversion. Verification covers
published author license grants for composition and recording; it is not an
independent chain-of-title warranty. Runtime does not download or stream from
those provenance URLs.

Soundtrack requires no AI calls, provider quota, telemetry, cloud account, new
runtime package, or extra backend polling. Planwharf remains usable without any
music or browser storage. Execution approval, Stop, Pause, Resume and checkpoint
controls remain separate from audio controls.
