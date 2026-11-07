"""Download every externally referenced image used by the mirrored papers.

Usage:  python -I tools/download_media.py <mirror_dir> [workers]

Run after download_papers.py.  Images that the site serves itself
(ext_media/..., DVRUOACE media/...) are stored at the same relative path;
images on third-party CDNs (Classplus etc.) are stored under
ext_media/<host>/<path> so the whole library works offline.
"""
import concurrent.futures
import os
import sys
import threading
import time
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import dvr_common as dc  # noqa: E402

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) personal-offline-mirror"}
lock = threading.Lock()


def fetch(url, dest, retries=5):
    if os.path.exists(dest) and os.path.getsize(dest) > 0:
        return "skip", os.path.getsize(dest)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    last = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=60) as resp:
                data = resp.read()
            if not data:
                raise RuntimeError("empty")
            tmp = dest + f".{os.getpid()}.part"
            with open(tmp, "wb") as fh:
                fh.write(data)
            os.replace(tmp, dest)
            return "ok", len(data)
        except urllib.error.HTTPError as exc:
            last = exc
            if exc.code in (403, 404, 410):
                break
            time.sleep(1.5 * (2 ** attempt))
        except Exception as exc:  # noqa: BLE001
            last = exc
            time.sleep(1.5 * (2 ** attempt))
    return "fail", repr(last)


def main():
    root = os.path.abspath(sys.argv[1])
    workers = int(sys.argv[2]) if len(sys.argv) > 2 else 16
    # optional filter: "all" (default), "external" (third-party CDNs only, processed
    # in reverse order so it can run alongside a normal run), "site" (site-hosted only)
    which = sys.argv[3] if len(sys.argv) > 3 else "all"
    manifest = dc.load_manifest(os.path.join(root, "data", "series-manifest.js"))

    refs = {}
    pages_missing = 0
    for _b, _p, _s, test, _i in dc.iter_tests(manifest):
        page = dc.local_path(root, test["path"])
        if not os.path.exists(page):
            pages_missing += 1
            continue
        text = open(page, encoding="utf-8", errors="replace").read()
        for url, rel in dc.media_refs_in_page(test["path"], text):
            refs.setdefault(rel, url)
    print(f"unique media refs: {len(refs)}  (pages missing: {pages_missing})", flush=True)

    stats = {"ok": 0, "skip": 0, "fail": 0, "bytes": 0}
    failures = []
    items = sorted(refs.items())
    if which == "external":
        items = [it for it in items if not it[1].startswith(dc.BASE)][::-1]
    elif which == "site":
        items = [it for it in items if it[1].startswith(dc.BASE)]
    elif which == "site-rev":
        items = [it for it in items if it[1].startswith(dc.BASE)][::-1]
    total = len(items)

    def work(item):
        rel, url = item
        status, info = fetch(url, dc.local_path(root, rel))
        with lock:
            stats[status] += 1
            if status == "fail":
                failures.append((rel, url, info))
            else:
                stats["bytes"] += info
            done = stats["ok"] + stats["skip"] + stats["fail"]
            if done % 500 == 0 or done == total:
                print(f"{done}/{total} ok={stats['ok']} skip={stats['skip']} fail={stats['fail']} "
                      f"{stats['bytes'] / 1e6:.0f}MB", flush=True)

    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
        list(pool.map(work, items))

    with open(os.path.join(root, "_media_failures.tsv"), "w", encoding="utf-8") as fh:
        for rel, url, info in failures:
            fh.write(f"{rel}\t{url}\t{info}\n")
    print("DONE", stats, flush=True)


if __name__ == "__main__":
    main()
