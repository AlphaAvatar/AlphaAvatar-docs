#!/bin/sh
# Vercel's build command (vercel.json). The documentation check `pnpm sources` runs needs Python 3
# with PyYAML; where the build image's python3 lacks it, the system Python gets it from dnf, the
# image's package manager (https://vercel.com/docs/builds/build-image).
set -eu
if ! python3 -c 'import yaml' 2>/dev/null; then
  dnf install -y -q python3-pyyaml
  export PYTHON=/usr/bin/python3
fi
"${PYTHON:-python3}" --version
exec pnpm build
