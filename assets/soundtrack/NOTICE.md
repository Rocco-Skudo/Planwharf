# Bundled Soundtrack notices

These four complete instrumental music recordings were downloaded from their
named creators' OpenGameArt upload pages on 19 October 2026. Each page identifies
the upload as Music, names its author, associates CC0 1.0 with the work, and links
the attached recording. We reviewed that license grant for both composition and
recording, rather than relying on a public-domain composition or a collection's
license label. No separate third-party recording or incompatible source was
identified on these pages. This documents the published author grants; it is not
an independent chain-of-title warranty or a claim of author endorsement.

| Recording | Creator | Source | Bundled file |
| --- | --- | --- | --- |
| Deep Sea | Umplix | https://opengameart.org/content/deep-sea | deep-sea.mp3 |
| Deeper Sea | Umplix | https://opengameart.org/content/deeper-sea | deeper-sea.ogg |
| Ocean Trance | MintoDog | https://opengameart.org/content/ocean-trance | ocean-trance.ogg |
| Drifting | Some Weirdo | https://opengameart.org/content/drifting-0 | drifting.ogg |

All four use **CC0 1.0 Universal**, including its waiver of related rights and
fallback license. Attribution is not required; creator credit and source links
are retained voluntarily. Umplix additionally states that credit is optional on
both upload pages. The canonical legal code is
https://creativecommons.org/publicdomain/zero/1.0/legalcode and is included in
`CC0-1.0.txt`. CC0 does not grant trademark rights or imply endorsement.

`manifest.json` records exact download URLs, original-file SHA-256 and byte size,
source-page SHA-256, bundled-file SHA-256, review date, duration and conversion.
The source-page hash fingerprints the HTML retrieved during review (including
mutable download counts); it is a receipt, not an expectation that the live page
will retain that hash. The attached recordings and author/source/license links
were checked directly, not inferred from search results or a collection page.

Deep Sea, Ocean Trance and Drifting retain the exact downloaded audio bytes.
Deeper Sea was rebuilt on 19 October 2026 from the author's hash-verified WAV
using a checksum-verified portable FFmpeg 9.0.2 Windows essentials build from
https://www.gyan.dev/ffmpeg/builds/ (linked by https://ffmpeg.org/download.html).
This replaces the inaccessible cloud conversion; its previous SHA-256 and the
conversion-tool archive SHA-256 are retained in the manifest. The command was:

```sh
ffmpeg -i deeper_sea.wav -map_metadata -1 -c:a libvorbis -q:a 4 deeper-sea.ogg
```

Its original WAV hash remains in the manifest. No musical content was generated,
trimmed or substituted. Full decoding and duration checks succeeded; human
speaker/headphone listening is not claimed by this asset check.

The six playlist names are Planwharf's presentation themes, not retitled
compositions. Preparing and Completed reuse Drifting; Checkpoint and Failed reuse
Deeper Sea. This small starter collection provides ocean ambient and electronic
music rather than claiming a bespoke orchestral victory or storm score. Users
can replace any mapping with personal music or Silence. Runtime playback uses
only bundled local files; source URLs are provenance, not streaming endpoints.
