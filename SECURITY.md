# Security

## Reporting a vulnerability

Email **founders@keeno.dev** with what you found, how to reproduce it and the paprika3d version (the `version` in the plugin's
`.claude-plugin/plugin.json` or the npm package's `package.json`). Please do not open a public issue for a vulnerability. We will reply to say we have it,
and say when a fix ships.

## Supported versions

Only the latest release gets security fixes: the newest `paprika3d` on npm and the newest `v*` tag of this repository.
A fix ships as a new release; there are no backports.

## Threat model

paprika3d is an MCP server, a Claude Code plugin (skills and hooks) and a CLI. It runs on your machine as you, with your
user's privileges, and does what your coding agent asks of it. Your agent client's permission prompts are the gate: a
tool call you approve (or allow in advance) runs with no further check from paprika3d.

### `open` and what it runs

- **`command`**: `open` runs the dev-server command it is given (`npm run dev`, `vite`, anything) as shell code with
  `sh -c`, in the `cwd` it is given, as you, with the MCP server's environment. It is not sandboxed. The command gets its
  own process group, which paprika3d kills when the page closes or the server exits. Treat a `command` as you would one
  your agent runs in its own shell.
- **The command is recorded and run again.** The last `open` records its `url` or `command` in
  `<project>/paprika3d/state.json`. `paprika3d check`, and the Claude Code plugin's after-edit hook when the project has
  saved checks (`game-tests.json`) and no paprika3d server answers, open the page again from that record, which runs the
  recorded command. That hook runs after edits and shell commands without an `open` call. `paprika3d/` holds a
  `.gitignore` of `*`, so your own commits leave it out, but a project you clone could ship one: open only projects
  you trust, as you would before running their `package.json` scripts.
- **A file or folder** is served by a static server on `127.0.0.1` (never on another interface) on a port picked by the
  OS. It serves the project folder (or the target's own folder when that is outside it), dotfiles included, to any
  client on this machine while a page is open. Paths outside the served folder are refused.
- **An http(s) URL** is opened as given; the page makes its own requests.
- **The control socket** that the hook's CLI uses listens on `127.0.0.1`, takes only `POST /check` with a random token
  kept in `state.json`, and refuses any request with an `Origin` header, so a web page cannot call it.

### Code in the page

- **`eval`** runs the agent's JavaScript in the open page's own JavaScript context, with that page's origin and no
  Node APIs. On a served file or folder that origin is the static server's, so the code can fetch any file it serves. With `save`, the value it returns is written to a path under the
  project; a path outside it is refused.
- **`model_run`** runs the agent's code in a blank page of its own, which reads and writes files under the project
  folder through two functions paprika3d gives it (paths outside are refused).

### Chrome

Pages run in Google Chrome (or the Firefox already installed, with `browser: "firefox"`), headless by default, launched
by paprika3d with a fresh temporary profile, never your own browser profile. paprika3d downloads no browser. Chrome's
sandbox stays on everywhere but Linux. **On Linux, paprika3d starts Chrome with `--no-sandbox`** (and
`--enable-unsafe-swiftshader`), for containers that have no user namespaces for Chrome's sandbox: there, a page that
exploits a Chrome bug runs with your privileges. Open only pages you trust on Linux.

### paprika-loop

The `paprika-loop` skill runs unattended `claude -p` sessions in the project folder with `Bash`, `Edit`, `Write`, `Read`,
`Glob`, `Grep` and the paprika3d tools allowed in advance (`--permission-mode acceptEdits`), so its builder runs shell
commands as you without asking. Its sessions cannot call `publish`, and its judge cannot edit files or run `Bash`. Start
a loop only in a folder you are happy for an agent to change.

### What leaves your machine

Besides the pages you open, which make their own requests, only these three tools send data, and only when the agent
calls them. The one other message is the install ping, below.

- **`asset_search`** sends the search words and filters to `https://assets.keeno.dev`, and, with `image`, the cropped
  picture as a JPEG. Each request names the agent's model (`model`, when the agent gives it) or else the agent client's
  name and version. The library logs model searches, picks and rejections; texture and HDRI searches are not logged.
  The proxy in front of the search API passes on a keyed hash of your IP address, never the address itself. Thumbnails
  and the file `pick` downloads into the project come from the library's public Cloudflare R2 bucket.
- **`send_feedback`** sends the agent's report text as written (2,000 characters at most; it is not scrubbed, so the
  agent decides what is in it), the kind of report, the last tool call's name, the names of the options it was given
  (an option's value only when it is one of the tool's fixed choices), whether it failed and its error's first line with
  URLs and paths taken out (160 characters at most), a random install id, the paprika3d version, the OS and Node's major
  version. A copy is kept on your machine. At most 5 reports a session. `DO_NOT_TRACK=1` or `PAPRIKA3D_TELEMETRY=0` turns
  it off. The stable build writes and sends no usage telemetry.
- **The install ping:** when the MCP server first starts after an install or an update, it sends the random install
  id, the paprika3d version, the OS, Node's major version and the MCP client's name and version (such as
  `claude-code/2.1.130`), so the team can count installs. Nothing about your project. The server adds a keyed hash of
  your IP address and your country. `DO_NOT_TRACK=1` or `PAPRIKA3D_TELEMETRY=0` turns it off.
- **`publish`** uploads the built project to `<slug>.paprika3d.app`, where anyone with the link can open it. It leaves
  out `paprika3d/`, `paprika-loop/`, `node_modules` (except the files the page's import map reaches), every dotfile and
  dot folder (`.env*`, `.git`), symlinks, source and note files (`.ts`, `.md`, `.sh` and the like), files named as
  credentials (`credentials.json`, `api_token.txt`, `serviceAccount.json` and the like) and the package manager's files; a file with only a credential-like word in its
  name is uploaded with a warning naming it. A Vite project is built with its own `vite build` and only a fixed list of
  environment variables (such as `PATH`, `HOME`, the locale, a few `NODE_*`, and every `VITE_*`), so no other token in
  your environment reaches it; Vite writes `VITE_*` values into the published bundle.
  Each publish also sends the key's identity record (install id, agent client and version, model, OS, plugin version);
  the server adds a keyed hash of your IP address. `DO_NOT_TRACK` does not turn this off, since publishing is a request
  to host.

### The publish key

On the first `publish`, paprika3d mints a key for this install and keeps it in plain text in
`~/.config/paprika3d/credentials.json` (`$XDG_CONFIG_HOME/paprika3d` or `$PAPRIKA3D_CONFIG_DIR` when set), mode `0600` in
a folder of mode `0700`, or uses `PAPRIKA3D_PUBLISH_KEY` when set. The key goes only in the `Authorization` header: never
in a reply, a log line, an argument list or a child process's environment, and any text `publish` returns is scrubbed
of key- and bearer-shaped strings. It is sent only over https (plain http only to localhost), and a key from
`PAPRIKA3D_PUBLISH_KEY` goes only to `https://api.paprika3d.app` unless `PAPRIKA3D_PUBLISH_API_TRUST=1`. The server keeps
a SHA-256 hash of the key, not the key. If a key leaks, `publish` with `rotate: true` from the network it was made or last
rotated on replaces it; a publish from a new network is flagged, and more than 3 new networks in a day suspend the key for 24
hours.

### Releases

The npm package `paprika3d` is published from this repository's `.github/workflows/npm-publish.yml` with npm trusted
publishing (GitHub OIDC, no npm token stored), and each version carries a provenance attestation that ties it to the
workflow run and commit that built it (`npm audit signatures`). The `@paprika3d/*` packages are bundled into the
build and are not published to npm.
