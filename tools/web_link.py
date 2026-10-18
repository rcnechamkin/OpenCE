"""Wrapper around emcc for linking on Windows/Linux to normalize response files."""

import os
import subprocess
import sys


def main() -> int:
    args = sys.argv[1:]
    new_args = []
    for arg in args:
        if arg.startswith("@"):
            rsp_path = arg[1:]
            if os.path.exists(rsp_path):
                # Normalize all backslashes to forward slashes so Emscripten's shlex.split
                # does not interpret Windows path separators as escape characters.
                content = open(rsp_path, "r", encoding="utf-8").read()
                normalized = content.replace("\\", "/")
                open(rsp_path, "w", encoding="utf-8").write(normalized)
        new_args.append(arg)

    proc = subprocess.run(new_args)
    return proc.returncode


if __name__ == "__main__":
    sys.exit(main())
