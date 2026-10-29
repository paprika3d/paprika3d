# Contributing to paprika3d

This repository holds the stable builds of paprika3d. The source is developed in a private repository and published
here on each release, so changes are not merged here directly. The readable TypeScript each release is built from is in
`source/`; the bundles that run (`src/cli.js`, `hooks/`, `*/dist/`) are built from it.

- **Bugs and requests:** open an issue at https://github.com/paprika3d/paprika3d/issues with what you expected, what
  happened, and the run folder (`<project>/paprika3d/runs/<time>/`) if you have one.
- **Code:** paprika3d is under the Apache License 2.0. Send a change as a patch against `source/` in an issue, or as a
  pull request here; we port it into the private source and it ships in the next release. Each commit carries a
  `Signed-off-by:` line (`git commit -s`), which certifies the Developer Certificate of Origin
  (https://developercertificate.org).
