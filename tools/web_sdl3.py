import os
import sys
import shutil
import pathlib
import subprocess

def main():
    if len(sys.argv) < 6:
        print("Usage: web_sdl3.py <web_emcc> <sdl_port> <sdl_tag> <out_stamp> <out_license>")
        sys.exit(1)

    web_emcc = sys.argv[1]
    sdl_port = sys.argv[2]
    sdl_tag = sys.argv[3]
    out_stamp = pathlib.Path(sys.argv[4])
    out_license = pathlib.Path(sys.argv[5])

    out_stamp.parent.mkdir(parents=True, exist_ok=True)
    out_license.parent.mkdir(parents=True, exist_ok=True)

    tmp_c = out_stamp.with_suffix(".stamp.c")
    tmp_o = out_stamp.with_suffix(".stamp.o")

    tmp_c.write_text("#include <SDL3/SDL.h>\n")
    try:
        cmd = [web_emcc, f"--use-port={sdl_port}", "-pthread", "-c", str(tmp_c), "-o", str(tmp_o)]
        subprocess.run(cmd, check=True)
    finally:
        if tmp_c.is_file():
            tmp_c.unlink(missing_ok=True)
        if tmp_o.is_file():
            tmp_o.unlink(missing_ok=True)

    # Locate license from emscripten cache
    cache_dir = None
    em_config_cands = [
        pathlib.Path(web_emcc).with_name("em-config.bat"),
        pathlib.Path(web_emcc).with_name("em-config.exe"),
        pathlib.Path(web_emcc).with_name("em-config.py"),
        pathlib.Path(web_emcc).with_name("em-config"),
    ]
    for cand in em_config_cands:
        if cand.is_file():
            try:
                cmd = [sys.executable, str(cand)] if cand.suffix == ".py" else [str(cand)]
                cache_dir = subprocess.check_output(cmd + ["CACHE"], text=True).strip()
                break
            except Exception:
                pass
    if not cache_dir:
        cache_dir = os.environ.get("EM_CACHE", str(pathlib.Path.home() / ".emscripten_cache"))

    license_candidates = [
        pathlib.Path(cache_dir) / "ports" / "halo_sdl3" / f"SDL-{sdl_tag}" / "LICENSE.txt",
        pathlib.Path(cache_dir) / "ports" / "halo_sdl3" / "LICENSE.txt",
    ]
    found_lic = False
    for lic in license_candidates:
        if lic.is_file():
            shutil.copyfile(str(lic), str(out_license))
            found_lic = True
            break
    if not found_lic:
        out_license.write_text("SDL3 License\n")

    out_stamp.write_text("ok\n")

if __name__ == "__main__":
    main()
