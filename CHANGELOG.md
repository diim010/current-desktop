# Changelog

## 1.0.0

- Initial release.
- Pull audio from YouTube, YouTube Music, and SoundCloud via yt-dlp.
- Local SQLite library with search, tagging, and download de-duplication.
- Built-in player with now-playing bar.
- macOS vibrancy UI, configurable library folder location.
- Resolves yt-dlp/ffmpeg via Homebrew paths so GUI launches don't fail
  with `spawn yt-dlp ENOENT`.
