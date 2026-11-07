"""Shared helpers for mirroring and parsing the DVRUO test-series papers.

Two source formats exist on the site:

* Format "A" (DVRUO EASY / MADE EASY papers): every question is a
  ``<section class="card qcard" data-...>`` block in the page markup.
* Format "B" (ZEAL, DVRUO Classes / GO Classes, DVRUOACE papers): the page
  embeds a Classplus-style API payload as ``window.TEST_SERIES_DATA = {...};``.
"""
import json
import os
import posixpath
import re
import urllib.parse

BASE = "https://dvruo-test-series.netlify.app/"

IMG_SRC_RE = re.compile(r"""(<img\b[^>]*?\bsrc\s*=\s*)(["'])(.*?)\2""", re.I | re.S)
TSD_RE = re.compile(r"window\.TEST_SERIES_DATA\s*=\s*", re.S)


def load_manifest(path):
    text = open(path, encoding="utf-8").read()
    return json.loads(text[text.index("{"): text.rindex("}") + 1])


def iter_tests(manifest):
    """Yield (branch, provider, series, test, series_index) in manifest order."""
    s_index = 0
    for branch in manifest["branches"]:
        for provider in branch["providers"]:
            for series in provider["series"]:
                for test in series["tests"]:
                    yield branch, provider, series, test, s_index
                s_index += 1


def local_path(root, rel):
    return os.path.join(root, *rel.split("/"))


def detect_format(text):
    if "window.TEST_SERIES_DATA" in text:
        return "B"
    if 'class="card qcard"' in text:
        return "A"
    return None


def extract_tsd(text):
    """Return the parsed window.TEST_SERIES_DATA object from a format B page."""
    m = TSD_RE.search(text)
    if not m:
        raise ValueError("TEST_SERIES_DATA not found")
    decoder = json.JSONDecoder()
    obj, _end = decoder.raw_decode(text, m.end())
    return obj


def resolve_media(page_rel, src):
    """Map an <img src> found on page ``page_rel`` to (download_url, mirror_rel).

    Returns None for data: URIs (handled inline) and for unusable values.
    mirror_rel is the path (relative to the mirror root, '/'-separated) where
    the file is stored locally.  Remote hosts are stored under
    ``ext_media/<host>/<path>`` - the same scheme the site itself uses.
    """
    src = (src or "").strip().replace("&amp;", "&")
    if not src or src.startswith("data:") or src.startswith("blob:"):
        return None
    if src.startswith("//"):
        src = "https:" + src
    parsed = urllib.parse.urlsplit(src)
    if parsed.scheme in ("http", "https"):
        if "@" in parsed.netloc:
            return None  # junk URL with embedded credentials in the source content
        host = parsed.netloc.lower()
        if host == "dvruo-test-series.netlify.app":
            rel = urllib.parse.unquote(parsed.path).lstrip("/")
            return BASE + urllib.parse.quote(rel, safe="/"), rel
        path = urllib.parse.unquote(parsed.path).lstrip("/")
        if parsed.query:
            # keep query-distinct files apart without illegal characters
            path += "__q_" + re.sub(r"[^A-Za-z0-9._-]", "_", parsed.query)[:60]
        rel = "ext_media/" + host + "/" + path
        rel = sanitize_rel(rel)
        return src, rel
    if parsed.scheme:
        return None
    path = urllib.parse.unquote(parsed.path)
    if path.startswith("/"):
        rel = posixpath.normpath(path.lstrip("/"))
    else:
        rel = posixpath.normpath(posixpath.join(posixpath.dirname(page_rel), path))
    if rel.startswith(".."):
        return None
    return BASE + urllib.parse.quote(rel, safe="/"), sanitize_rel(rel)


_BAD = set(':*?"<>|')


def sanitize_rel(rel):
    parts = []
    for seg in rel.split("/"):
        seg = "".join("_" if (c in _BAD or ord(c) < 32) else c for c in seg)
        seg = seg.rstrip(" .") or "_"
        parts.append(seg)
    return "/".join(parts)


def img_srcs(fragment):
    return [m.group(3) for m in IMG_SRC_RE.finditer(fragment or "")]


def tsd_fragments(payload):
    """All HTML fragments inside a TEST_SERIES_DATA payload."""
    data = payload.get("data", payload)
    out = []
    for section in data.get("sections") or []:
        out.append(section.get("sectionInstructions") or "")
        for q in section.get("questions") or []:
            out.append(q.get("name") or "")
            out.append(q.get("paragraph") or "")
            out.append(q.get("solution") or "")
            for opt in q.get("options") or []:
                if isinstance(opt.get("name"), str):
                    out.append(opt["name"])
    return out


def media_refs_in_page(page_rel, text):
    """Every (download_url, mirror_rel) image reference used by one paper."""
    fmt = detect_format(text)
    refs = []
    if fmt == "B":
        try:
            payload = extract_tsd(text)
            frags = tsd_fragments(payload)
        except Exception:  # noqa: BLE001
            frags = [text]
        for frag in frags:
            for src in img_srcs(frag):
                r = resolve_media(page_rel, src)
                if r:
                    refs.append(r)
    else:
        for src in img_srcs(text):
            r = resolve_media(page_rel, src)
            if r:
                refs.append(r)
    return refs
