---
name: paprika-publish
description: Publish to <name>.paprika3d.app (invite-only preview) when the person asks for a public link; not for Vercel, Netlify, GitHub or Cloudflare Pages, or another named host.
---

# Publish a page

`publish` builds the project and puts it at `https://<slug>.paprika3d.app`, a public link anyone can open. Only the person decides that: publish when they ask (or say yes to your offer), never to finish a task. A person who names another host (Vercel, Netlify, GitHub Pages, Cloudflare Pages, their own server) wants that host: do not call `publish`.

1. **Make sure it runs first.** A page that throws or shows nothing in `open` and `look` is what the link will show. A Vite project needs its packages installed (`npm install`), since `publish` runs its own `vite build`.
2. **Call `publish` with the project's folder** (`cwd`), and your model name as `model`. Leave `slug` out unless the person named one: the project's name is used and kept, so publishing the same project again updates the same link.
3. **Read the reply's `warnings`.** A file left out that the page needs (an import with no import map entry, a type that is not served) is a broken link: fix it and publish again before telling the person.
4. **Tell the person, in three short lines:** the `url`; the `claim_url`, where they can claim the game under their own account later (claiming opens soon; until then the game is live but unlisted and carries a small "made with paprika3d" badge); and what is left (`remaining_quota`: games left out of 5, publishes left this hour). On the first publish, also pass on once what the reply says publishing sends. If the reply has `held`, say instead that the link works once the paprika3d team has reviewed the game, and why it was held.

## When it is refused

The reply says what happened in words to pass on: a rate limit with when to try again, the 5-game limit (republishing one of those games still works; the waitlist link is for more), or a key that was refused. Say it to the person and stop; do not retry in a loop.

## The key

The first publish makes this install's publish key by itself, with no sign-in, and keeps it in `~/.config/paprika3d/credentials.json`. Never read, print, copy or paste that file or its key, and never put a key in a command: everything you print ends up in the session's transcript. Another key goes in `PAPRIKA3D_PUBLISH_KEY`, set by the person. The folder's other files (projects.json, the slug of each project) are not secret.

When a reply has `warning` (the key was used from a new network), pass it on. If the person says that was not them, or the key may have leaked, call `publish` with `rotate: true`: it replaces this install's key, so the old one stops working, and publishes nothing. If publishing says the key was replaced or suspended, pass on what it says, once; call `rotate: true` only when it says that takes the key back and the person is on their usual network.
