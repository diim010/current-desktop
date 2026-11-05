# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Users

People curating a personal music library who want to collect, organize, and play locally saved tracks from a desktop app.

## Product Purpose

Current brings a user's downloaded music into a searchable local library. Success means being able to find a track, keep its collection context, and play it without leaving the app.

## Positioning

Current combines importing from YouTube, YouTube Music, SoundCloud, and Soulseek with a local, searchable, taggable library and built-in playback.

## Operating Context

Users search a personal collection, browse by source and tags, preview and queue imports, and listen to saved audio from the desktop app.

## Capabilities and Constraints

- The Electron app stores library records in SQLite and audio files in a user-selected local folder.
- Users can browse by artist and album, filter by source, color, and tags, sort tracks, edit tags and color markers, reveal files in Finder, and delete app-managed downloads.
- Supported audio files in the selected library folder and its subfolders are indexed as local tracks. Removing one from Current keeps the original file on disk.
- Album metadata is optional; older or incomplete records remain available as unfiled recordings.
- Playback uses local audio files. YouTube search and media extraction depend on an installed `yt-dlp`; MP3 conversion depends on `ffmpeg`.
- The package supports macOS and Windows builds.

## Brand Commitments

The product is named Current.

## Evidence on Hand

The existing Electron app, library UI, download integrations, and local player are the available product evidence. No external customer, performance, or licensing claims are established.

## Product Principles

- Keep the personal library local and under the user's control.
- Make finding and playing saved music a direct path.
- Preserve useful source and tag context as tracks move from import to collection.
