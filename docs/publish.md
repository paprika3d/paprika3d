---
title: Publish a three.js page to paprika3d.app | paprika3d docs
description: paprika3d's publish tool puts a page your agent built on a public https://<name>.paprika3d.app link. An invite-only preview: how to get a code, use it, and what a publish uploads and records.
---
# Publishing

paprika3d's `publish` tool puts a page your agent built on a public link, `https://<name>.paprika3d.app`, when you ask for one. It is a preview, open by invite only for now.

## Get an invite

Join the waitlist at [paprika3d.com/waitlist](https://paprika3d.com/waitlist). An invite is a code.

## Use the code

Set `PAPRIKA3D_PUBLISH_INVITE` to the code in the environment your agent runs in, then ask it to publish. The first publish makes this install's publish key, with no sign-in; after that the code is not needed. Without a code, `publish` says so before it builds or uploads anything.

Each key holds up to 5 games, and republishing one of them is free. Publishing is free and has no paid tier yet.

## What a publish uploads and records

- It uploads the built project, never `.env` files, dotfiles, `node_modules` beyond what the page imports, or files named like credentials.
- The first publish keeps this install's key in `~/.config/paprika3d/credentials.json`, and no reply shows it.
- Every publish records the key, the install id, the agent's client and version, its model, the OS, the plugin version and a keyed hash of your IP address, even with `DO_NOT_TRACK` set, since publishing opts in to hosting.
- Unclaimed games are unlisted and noindexed, and come down after 90 days with no plays.
- If a reply warns that your key was used from a new network and that was not you, ask your agent to rotate it (`publish` with `rotate: true`) from your usual network: the old key stops working. If someone else rotated it first, a rotation from your usual network within 24 hours takes it back; after that, write to founders@keeno.dev for a new key with your games.
