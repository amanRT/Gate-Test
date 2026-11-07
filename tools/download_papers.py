"""Mirror every paper listed in the DVRUO manifest into a local folder.

Usage:  python -I tools/download_papers.py <mirror_dir> [workers]

The mirror keeps the original relative paths, so the downloaded portal works
exactly like the live one when served from <mirror_dir>.  Re-running skips
files that are already complete, so an interrupted run can simply be resumed.
"""
import concurrent.futures
import json
import os
import sys
import threading
import time
import urllib.parse
import urllib.request

BASE = "https://dvruo-test-series.netlify.app/"
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) personal-offline-mirror"}

SITE_FILES = [
    "index.html",
    "assets/styles.css",
    "assets/app.js",
    "assets/calculator.js",
    "assets/made-easy-dummy.js",
    "assets/progress.js",
    "assets/math-boot.js",
    "data/series-manifest.js",
]

lock = threading.Lock()
stats = {"ok": 0, "skip": 0, "fail": 0, "bytes": 0}


def fetch(url, dest, retries=6, min_size=1):
    if os.path.exists(dest) and os.path.getsize(dest) >= min_size:
        return "skip", os.path.getsize(dest)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    last = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=90) as resp:
                data = resp.read()
                status = resp.status
            if status != 200:
                raise RuntimeError(f"HTTP {status}")
            if len(data) < min_size:
                raise RuntimeError("empty body")
            tmp = dest + ".part"
            with open(tmp, "wb") as fh:
                fh.write(data)
            os.replace(tmp, dest)
            return "ok", len(data)
        except Exception as exc:  # noqa: BLE001 - retry anything network related
            last = exc
            time.sleep(min(30, 1.5 * (2 ** attempt)))
    return "fail", repr(last)


def load_manifest(path):
    text = open(path, encoding="utf-8").read()
    return json.loads(text[text.index("{"): text.rindex("}") + 1])


def main():
    root = os.path.abspath(sys.argv[1])
    workers = int(sys.argv[2]) if len(sys.argv) > 2 else 12
    os.makedirs(root, exist_ok=True)
    log_path = os.path.join(root, "_download_log.txt")
    fail_path = os.path.join(root, "_download_failures.tsv")

    for rel in SITE_FILES:
        status, info = fetch(BASE + rel, os.path.join(root, *rel.split("/")))
        print("site", rel, status, info, flush=True)

    manifest = load_manifest(os.path.join(root, "data", "series-manifest.js"))
    jobs = []
    for branch in manifest["branches"]:
        for provider in branch["providers"]:
            for series in provider["series"]:
                for test in series["tests"]:
                    rel = test["path"]
                    url = BASE + urllib.parse.quote(rel, safe="/")
                    jobs.append((url, os.path.join(root, *rel.split("/")), rel))

    total = len(jobs)
    print(f"papers to mirror: {total}", flush=True)
    failures = []
    started = time.time()

    def work(job):
        url, dest, rel = job
        status, info = fetch(url, dest, min_size=1024)
        with lock:
            stats[status] += 1
            if status in ("ok", "skip"):
                stats["bytes"] += info
            else:
                failures.append((rel, info))
            done = stats["ok"] + stats["skip"] + stats["fail"]
            if done % 10 == 0 or done == total:
                mb = stats["bytes"] / 1e6
                rate = mb / max(1e-6, time.time() - started)
                line = (f"{done}/{total} ok={stats['ok']} skip={stats['skip']} "
                        f"fail={stats['fail']} {mb:.0f}MB {rate:.1f}MB/s")
                print(line, flush=True)
                with open(log_path, "a", encoding="utf-8") as fh:
                    fh.write(line + "\n")

    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
        list(pool.map(work, jobs))

    with open(fail_path, "w", encoding="utf-8") as fh:
        for rel, info in failures:
            fh.write(f"{rel}\t{info}\n")
    print("DONE", stats, f"failures={len(failures)}", flush=True)


if __name__ == "__main__":
    main()
