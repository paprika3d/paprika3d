@AGENTS.md

In Claude Code, the `threejs-game` skill says what each tool shows; Claude loads it when building or fixing a three.js,
React Three Fiber or WebGL page. `/paprika3d:paprika-make` and `/paprika3d:paprika-loop` start a build from a short
brief. The plugin's after-edit hook reruns the checks you saved with `interact`'s `save` and rechecks the open page's
`Lighting:` and `Surfaces:` lines, and speaks only when one starts or stops failing.
