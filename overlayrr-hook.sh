#!/bin/sh
# The file Tautulli runs: Settings > Notification Agents > Script, Script Timeout 0,
# Script Arguments:  --item {rating_key} --added
# Copy it to the server's hooks folder and chmod +x. It logs to hook.log in the Overlayrr folder.

# A run with no arguments would rebuild and upload the whole library, so refuse it.
# To check that the file runs, pass --help.
if [ "$#" -eq 0 ]; then
    echo "overlayrr-hook.sh needs arguments, for example: --item KEY --added (or --help to test)" >&2
    exit 2
fi

cd /path/to/Overlayrr || exit 1
echo "=== $(date '+%F %T') $*" >> hook.log
# -E ignores PYTHON* variables from Tautulli's environment, so the venv's packages are the ones used.
exec ./overlayrr-venv/bin/python -E -u overlayrr.py config.yaml "$@" >> hook.log 2>&1
