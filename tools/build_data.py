"""Parse every mirrored paper into normalized data for the practice app.

Usage:  python -I tools/build_data.py <mirror_dir> <site_dir>

Writes, under <site_dir>:
  data/json/<paperId>.json   canonical per-paper data (questions, options,
                             answers, NAT ranges, marks, solutions)
  data/papers/<paperId>.js   same data wrapped for loading without a server
  data/library.js / .json    branch > provider > series > paper index
  data/qindex/<CODE>.js      compact per-branch question index (search/bank)
  media/<hh>/<hash>.<ext>    every image, de-duplicated by content
  data/build_report.json     validation report
"""
import base64
import collections
import hashlib
import html as htmllib
import json
import os
import re
import sys
import time
import urllib.parse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import dvr_common as dc  # noqa: E402

BRANCH_CODES = [
    ("DATA SCIENCE", "DA"), ("COMPUTER", "CS"), ("ELECTRONICS", "EC"),
    ("ELECTRICAL", "EE"), ("MECHANICAL", "ME"), ("CIVIL", "CE"),
]
PROVIDER_ALIASES = {"MADE EASY": "DVRUO EASY", "GATE ZEAL": "DVRUO ZEAL"}
PROVIDER_KEYS = {"DVRUO EASY": "easy", "DVRUO ZEAL": "zeal", "DVRUO CLASSES": "classes", "DVRUOACE": "ace"}

CATEGORY_RULES = [
    ("mock", r"\bmock\b"), ("subjectwise", r"subject[\s_-]*wise"), ("topicwise", r"topic[\s_-]*wise"),
    ("aptitude", r"\baptitude\b"), ("advance", r"\badvance"), ("basic", r"\bbasic\b"),
    ("demo", r"\bdemo\b"), ("full-syllabus", r"full[\s_-]*syllabus"), ("part-syllabus", r"part[\s_-]*syllabus"),
]

report = collections.defaultdict(list)
counters = collections.Counter()


# --------------------------------------------------------------------------- utils

def tidy(text):
    text = str(text or "").replace("_", " ")
    text = re.sub(r"\s*-\s*-\s*", " - ", text)
    return re.sub(r"\s+", " ", text).strip()


def branch_code(name):
    up = name.upper()
    for match, code in BRANCH_CODES:
        if match in up:
            return code
    return up[:2]


def category_of(title):
    low = title.lower()
    for key, pat in CATEGORY_RULES:
        if re.search(pat, low):
            return key
    return "other"


def years_in(text):
    return sorted(set(re.findall(r"(?<![0-9])20\d{2}(?![0-9])", str(text))))


def to_num(value):
    try:
        if value is None:
            return None
        s = str(value).strip().replace(",", "")
        if s == "":
            return None
        return float(s)
    except ValueError:
        return None


def clean_num(x):
    if x is None:
        return None
    return int(x) if float(x).is_integer() else round(float(x), 6)


def strip_tags(fragment):
    text = re.sub(r"<(script|style)\b.*?</\1>", " ", fragment or "", flags=re.S | re.I)
    text = re.sub(r"<img\b[^>]*>", " [image] ", text, flags=re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    text = htmllib.unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def balanced_inner(text, open_end, tag="div"):
    """Given the index just after an opening <tag ...>, return (inner, end_index)."""
    pat = re.compile(r"<(/?)%s\b[^>]*?(/?)>" % tag, re.I)
    depth = 1
    pos = open_end
    while True:
        m = pat.search(text, pos)
        if not m:
            return text[open_end:], len(text)
        if m.group(1):
            depth -= 1
            if depth == 0:
                return text[open_end:m.start()], m.end()
        elif not m.group(2):
            depth += 1
        pos = m.end()


def find_div(block, cls):
    m = re.search(r'<div class="%s"[^>]*>' % re.escape(cls), block)
    if not m:
        return None
    inner, _ = balanced_inner(block, m.end(), "div")
    return inner


def sanitize(fragment):
    if not fragment:
        return ""
    s = re.sub(r"<script\b.*?</script>", "", fragment, flags=re.S | re.I)
    s = re.sub(r"\son[a-z]+\s*=\s*(\"[^\"]*\"|'[^']*')", "", s, flags=re.I)
    # CKEditor leftovers keep a second (base64) copy of every image
    s = re.sub(r"\s(?:_cke_saved_src|data-cke-saved-src|_cke_saved_href|data-cke-saved-href)\s*=\s*(\"[^\"]*\"|'[^']*')", "", s, flags=re.I)
    s = re.sub(r"<input\b[^>]*>", "", s, flags=re.I)
    return s.strip()


# --------------------------------------------------------------------------- media

class MediaStore:
    def __init__(self, mirror_root, site_root):
        self.mirror = mirror_root
        self.out = os.path.join(site_root, "media")
        self.known = {}
        self.cache = {}
        os.makedirs(self.out, exist_ok=True)
        for sub in os.listdir(self.out):
            d = os.path.join(self.out, sub)
            if os.path.isdir(d):
                for f in os.listdir(d):
                    self.known[f.split(".")[0]] = sub + "/" + f

    @staticmethod
    def sniff(data, hint=""):
        if data[:8] == b"\x89PNG\r\n\x1a\n":
            return "png"
        if data[:3] == b"\xff\xd8\xff":
            return "jpg"
        if data[:4] == b"GIF8":
            return "gif"
        if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
            return "webp"
        if data[:2] == b"BM":
            return "bmp"
        head = data[:300].lstrip().lower()
        if head.startswith(b"<?xml") or head.startswith(b"<svg") or b"<svg" in head:
            return "svg"
        hint = (hint or "").lower().strip(".")
        return hint if hint in ("png", "jpg", "jpeg", "gif", "webp", "svg", "bmp") else "bin"

    def put(self, data, hint=""):
        digest = hashlib.sha1(data).hexdigest()[:20]
        if digest in self.known:
            counters["media_dedup_hits"] += 1
            return "media/" + self.known[digest]
        ext = self.sniff(data, hint)
        sub = digest[:2]
        os.makedirs(os.path.join(self.out, sub), exist_ok=True)
        rel = f"{sub}/{digest}.{ext}"
        with open(os.path.join(self.out, sub, f"{digest}.{ext}"), "wb") as fh:
            fh.write(data)
        self.known[digest] = rel
        counters["media_written"] += 1
        return "media/" + rel

    def resolve(self, page_rel, src):
        key = (page_rel.rsplit("/", 1)[0], src)
        if key in self.cache:
            return self.cache[key]
        result = self._resolve(page_rel, src)
        self.cache[key] = result
        return result

    def _resolve(self, page_rel, src):
        s = src.strip()
        if s.startswith("data:"):
            try:
                header, payload = s.split(",", 1)
                mime = header[5:].split(";")[0]
                if ";base64" in header:
                    data = base64.b64decode(re.sub(r"\s+", "", payload) + "===")
                else:
                    data = urllib.parse.unquote_to_bytes(payload)
                hint = mime.split("/")[-1].replace("svg+xml", "svg").replace("jpeg", "jpg")
                counters["img_inline"] += 1
                return self.put(data, hint)
            except Exception as exc:  # noqa: BLE001
                report["bad_data_uri"].append([page_rel, repr(exc)])
                return None
        r = dc.resolve_media(page_rel, s)
        if not r:
            report["unresolvable_src"].append([page_rel, s[:200]])
            return None
        _url, rel = r
        path = dc.local_path(self.mirror, rel)
        if not os.path.exists(path):
            report["missing_media"].append([page_rel, rel])
            return None
        with open(path, "rb") as fh:
            data = fh.read()
        counters["img_external"] += 1
        return self.put(data, os.path.splitext(rel)[1])

    def rewrite(self, page_rel, fragment):
        if not fragment:
            return fragment

        def sub(m):
            new = self.resolve(page_rel, m.group(3))
            if new is None:
                return m.group(0)
            return m.group(1) + '"' + new + '"'

        return dc.IMG_SRC_RE.sub(sub, fragment)


# --------------------------------------------------------------------------- format A

QSEC_RE = re.compile(r'<section class="card qcard"([^>]*)>')
SECTION_TITLE_RE = re.compile(r'<h1 class="section-title">(.*?)</h1>', re.S)


def clean_option(inner, key):
    s = re.sub(r"^\s*<input\b[^>]*>\s*", "", inner, flags=re.I)
    lab = r"^\s*<(strong|b)>\s*%s\s*[.)]?\s*</\1>\s*" % re.escape(key)
    s = re.sub(lab, "", s, flags=re.I)
    m = re.match(r"^\s*<div\b[^>]*>", s, flags=re.I)
    if m:
        inner2, end = balanced_inner(s, m.end(), "div")
        if s[end:].strip() == "":
            s = inner2
    s = re.sub(lab, "", s, flags=re.I)
    return s.strip()


def parse_format_a(text, page_rel, media):
    title = re.search(r"<h1>(.*?)</h1>", text, re.S)
    meta = re.search(r'<div class="meta">\s*(.*?)\s*</div>', text, re.S)
    dur = re.search(r'data-duration="(\d+)"', text)
    q_start = text.find('<div id="questions">')
    body = text[q_start:] if q_start >= 0 else text

    starts = [m for m in QSEC_RE.finditer(body)]
    titles = [(m.start(), tidy(strip_tags(m.group(1)))) for m in SECTION_TITLE_RE.finditer(body)]
    questions = []
    for i, m in enumerate(starts):
        end = starts[i + 1].start() if i + 1 < len(starts) else body.find("</main>", m.end())
        block = body[m.start(): end if end > 0 else len(body)]
        attrs = dict(re.findall(r'data-([a-z-]+)="([^"]*)"', m.group(1)))
        qtype = (attrs.get("qtype") or "").upper()
        tags_m = re.search(r'<div class="tags">(.*?)</div>', block, re.S)
        tags = htmllib.unescape(strip_tags(tags_m.group(1))) if tags_m else ""
        qtext = find_div(block, "qtext") or ""
        opts = []
        for om in re.finditer(r'<label class="opt" data-opt="([A-Za-z0-9])">(.*?)</label>', block, re.S):
            opts.append({"key": om.group(1).upper(), "html": clean_option(om.group(2), om.group(1))})
        ansline = re.search(r'<div class="answerline"[^>]*>(.*?)</div>', block, re.S)
        ans_text = strip_tags(ansline.group(1)).replace("Correct answer:", "").strip() if ansline else ""
        sol = ""
        sm = re.search(r'<details class="solution"[^>]*>\s*<summary>.*?</summary>', block, re.S)
        if sm:
            close = block.rfind("</details>")
            sol = block[sm.end(): close if close > sm.end() else len(block)]
        sec_title = None
        for pos, name in titles:
            if pos < m.start():
                sec_title = name
        questions.append({
            "n": int(attrs.get("qnum") or i + 1),
            "type": qtype,
            "attrs": attrs,
            "tags": tags,
            "secTitle": sec_title,
            "q": qtext,
            "opts": opts,
            "ansText": ans_text,
            "sol": sol,
        })

    out_q = []
    for q in questions:
        attrs = q["attrs"]
        qtype = q["type"] if q["type"] in ("MCQ", "MSQ", "NAT") else None
        if qtype is None:
            qtype = "NAT" if not q["opts"] else ("MSQ" if "," in (attrs.get("correct") or "") else "MCQ")
            report["unknown_qtype_A"].append([page_rel, q["n"], q["type"]])
        pos = to_num(attrs.get("right"))
        neg = to_num(attrs.get("wrong"))
        tag_marks = re.search(r"\+\s*([\d.]+)\s*(?:/\s*-\s*([\d.]+))?", q["tags"])
        if pos is None and tag_marks:
            pos = to_num(tag_marks.group(1))
        if neg is None and tag_marks and tag_marks.group(2):
            neg = to_num(tag_marks.group(2))
        item = {
            "n": q["n"],
            "type": qtype,
            "section": None,
            "tags": q["tags"],
            "html": media.rewrite(page_rel, sanitize(q["q"])),
            "options": [{"key": o["key"], "html": media.rewrite(page_rel, sanitize(o["html"]))} for o in q["opts"]],
            "answer": None,
            "natRange": None,
            "answerText": q["ansText"],
            "marks": {"pos": clean_num(pos if pos is not None else 1), "neg": clean_num(abs(neg) if neg else 0)},
            "solution": media.rewrite(page_rel, sanitize(q["sol"])),
        }
        if qtype == "NAT":
            lo, hi = to_num(attrs.get("nat-low")), to_num(attrs.get("nat-high"))
            if lo is None and hi is None:
                v = to_num(q["ansText"])
                lo = hi = v
            rng = fix_range(lo, hi, page_rel, q["n"])
            item["natRange"] = solution_range_policy(rng, q["sol"], page_rel, q["n"])
            item["options"] = []
        else:
            raw_key = (attrs.get("correct") or "").strip()
            no_key = {"N/A", "NA", "NIL", "NONE", "-", "--"}
            keys = [] if raw_key.upper() in no_key else [k.strip().upper() for k in re.split(r"[,\s;]+", raw_key) if k.strip()]
            if not keys and q["ansText"] and q["ansText"].strip().upper() not in no_key:
                keys = [k.strip().upper() for k in re.split(r"[,\s;]+", q["ansText"]) if k.strip()]
            item["answer"] = sorted(set(keys))
        # section from tags ("General Aptitude • ... • +1 / -0.33")
        first = q["tags"].split("•")[0].strip() if "•" in q["tags"] else ""
        if first and "|" not in first and "marks" not in first.lower():
            item["section"] = first
        elif q["secTitle"]:
            item["section"] = q["secTitle"]
        out_q.append(item)

    info = {}
    if meta:
        meta_text = tidy(strip_tags(meta.group(1)))
        info["meta"] = meta_text
        pk = re.search(r"Package:\s*(.*?)\s*(?:•|\||$)", meta_text)
        if pk:
            info["package"] = pk.group(1).strip()
    return {
        "title": tidy(strip_tags(title.group(1))) if title else None,
        "durationSec": int(dur.group(1)) if dur else None,
        "info": info,
        "questions": out_q,
    }


_SOLNUM = r"[-−–]?\s*\d*\.?\d+"
_SOLRANGE_RE = re.compile(
    r"^\s*(" + _SOLNUM + r")\s*[\(\[]\s*(" + _SOLNUM + r")\s*(?:-|–|—|to|~)\s*(" + _SOLNUM + r")\s*[\)\]]"
)


def _f(x):
    return float(x.replace("−", "-").replace("–", "-").replace(" ", ""))


def solution_range_policy(rng, sol_html, page_rel, n):
    """MADE EASY solutions open with the official key, e.g. "91.31 (91.10 - 91.50)".

    The page's data-nat-low/high often hold only the point value, so the stated
    tolerance range is used whenever it is self-consistent (low <= value <= high).
    This also repairs keys whose sign was lost in the data attributes.
    """
    text = strip_tags(sol_html or "")[:240]
    m = _SOLRANGE_RE.match(text)
    if not m:
        return rng
    try:
        x, slo, shi = _f(m.group(1)), _f(m.group(2)), _f(m.group(3))
    except ValueError:
        return rng
    slo, shi = min(slo, shi), max(slo, shi)
    eps = 1e-9 * max(1.0, abs(x))
    if not (slo - eps <= x <= shi + eps):
        report["nat_solution_range_inconsistent"].append([page_rel, n, rng, [x, slo, shi]])
        return rng
    new = [clean_num(slo), clean_num(shi)]
    if rng is None:
        counters["nat_range_from_solution"] += 1
        return new
    lo, hi = rng
    if abs(lo - slo) < 1e-9 and abs(hi - shi) < 1e-9:
        return rng
    if lo - eps <= x <= hi + eps and slo - eps <= lo and hi <= shi + eps:
        counters["nat_range_widened"] += 1
    else:
        report["nat_range_repaired_from_solution"].append([page_rel, n, rng, new])
    return new


def fix_range(lo, hi, page_rel, n):
    if lo is None and hi is None:
        report["nat_without_answer"].append([page_rel, n])
        return None
    if lo is None:
        lo = hi
    if hi is None:
        hi = lo
    orig = (lo, hi)
    if lo > hi:
        lo, hi = hi, lo
    # obvious typo: "0.571 .. 579" -> "0.571 .. 0.579"
    if lo > 0 and hi / lo > 20 and abs(lo) < 1e6:
        for k in range(1, 8):
            cand = hi / (10 ** k)
            if cand >= lo and cand / lo < 1.6:
                report["nat_range_fixed"].append([page_rel, n, list(orig), [lo, cand]])
                hi = cand
                break
    return [clean_num(lo), clean_num(hi)]


# --------------------------------------------------------------------------- format B

LETTERS = "ABCDEFGHIJ"


def parse_nat_solution(values):
    """options[0].solution of a fill_ups question -> (lo, hi, text)."""
    texts = [str(v).strip() for v in (values or []) if str(v).strip() != ""]
    if not texts:
        return None, None, ""
    nums = []
    for t in texts:
        t2 = t.replace(",", "").replace("−", "-").replace("–", " to ").replace("—", " to ")
        rng = re.match(r"^\s*(-?\d*\.?\d+)\s*(?:to|-|~|:)\s*(-?\d*\.?\d+)\s*$", t2)
        if rng:
            nums.extend([float(rng.group(1)), float(rng.group(2))])
            continue
        v = to_num(t2)
        if v is not None:
            nums.append(v)
    if not nums:
        return None, None, " | ".join(texts)
    return min(nums), max(nums), " | ".join(texts)


def marks_b(q, section, provider_key):
    """Per-question marks for format B papers.

    question.marks is authoritative for ACE / Classes papers.  ZEAL payloads
    are attempt reports in which question.marks holds what the original
    candidate scored, so it cannot be trusted as the question's value; those
    papers are flagged and scored by count unless marks are recoverable.
    """
    mk = q.get("marks") or {}
    pos, neg = to_num(mk.get("positive")), to_num(mk.get("negative"))
    settings = (section.get("optionalQuestionSettings") or {}).get("marks") or {}
    spos, sneg = to_num(settings.get("positive")), to_num(settings.get("negative"))
    if provider_key == "zeal":
        return None, None
    if pos is None or pos == 0:
        pos = spos
    if neg is None:
        neg = sneg
    return pos, abs(neg) if neg else 0


def infer_zeal_marks(pairs, section_marks, page_rel):
    """ZEAL payloads are attempt reports: question.marks is what the original
    candidate scored, and only the section total is a real definition.

    A question answered correctly reveals its full value (marks.positive); a
    wrong MCQ reveals it through the penalty (0.33 -> 1 mark, 0.66 -> 2 marks).
    The rest are solved from the section total assuming GATE's 1/2-mark split;
    when that is ambiguous the remaining marks are spread evenly (flagged).
    MCQ penalty follows GATE: one third of the question's marks.
    """
    known = {}
    for idx, (item, q) in enumerate(pairs):
        mk = q.get("marks") or {}
        p = to_num(mk.get("positive")) or 0
        ng = abs(to_num(mk.get("negative")) or 0)
        if p > 0 and q.get("isCorrect") and not q.get("isPartiallyCorrect"):
            known[idx] = p
        elif ng > 0 and item["type"] == "MCQ":
            known[idx] = 1 if ng < 0.5 else 2
    m = len(pairs)
    unknown = [i for i in range(m) if i not in known]
    total = section_marks if section_marks and section_marks > 0 else None
    values = dict(known)
    approx = set()
    if unknown:
        if total is None:
            for i in unknown:
                values[i] = 1
                approx.add(i)
        else:
            rest = total - sum(known.values())
            u = len(unknown)
            twos = rest - u
            if abs(twos - round(twos)) < 1e-6 and 0 <= round(twos) <= u and round(twos) in (0, u):
                for i in unknown:
                    values[i] = 1 if round(twos) == 0 else 2
            else:
                each = rest / u if u else 0
                if each <= 0:
                    each = 1
                for i in unknown:
                    values[i] = round(each, 4)
                    approx.add(i)
    for idx, (item, _q) in enumerate(pairs):
        pos = values[idx]
        neg = round(pos * 0.33, 4) if item["type"] == "MCQ" else 0
        item["marks"] = {"pos": clean_num(pos), "neg": clean_num(neg)}
        if idx in approx:
            item["marksApprox"] = True
    counters["zeal_marks_known"] += len(known)
    counters["zeal_marks_solved"] += len(unknown) - len(approx)
    counters["zeal_marks_approx"] += len(approx)


def parse_format_b(text, page_rel, media, provider_key):
    payload = dc.extract_tsd(text)
    data = payload.get("data", payload)
    test = data.get("test") or {}
    out_q = []
    sections_meta = []
    n = 0
    for si, section in enumerate(sorted(data.get("sections") or [], key=lambda s: s.get("order") or 0)):
        sec_name = tidy(section.get("name") or f"Section {si + 1}")
        sections_meta.append({
            "name": sec_name,
            "marks": to_num(section.get("sectionMarks")),
            "instructions": strip_tags(section.get("sectionInstructions") or "") or None,
        })
        questions = sorted(section.get("questions") or [], key=lambda q: (q.get("order") or 0))
        sec_pairs = []
        for q in questions:
            n += 1
            qt = q.get("type")
            options = q.get("options") or []
            body = q.get("name") or ""
            if not strip_tags(body) and "<img" not in body.lower() and q.get("nameText"):
                body = "<p>" + htmllib.escape(str(q.get("nameText"))) + "</p>"
            item = {
                "n": n,
                "type": None,
                "section": sec_name,
                "tags": "",
                "html": media.rewrite(page_rel, sanitize(body)),
                "paragraph": None,
                "options": [],
                "answer": None,
                "natRange": None,
                "answerText": "",
                "marks": None,
                "solution": media.rewrite(page_rel, sanitize(q.get("solution") or "")),
            }
            para = q.get("paragraph")
            if para and strip_tags(para) or (para and "<img" in para):
                item["paragraph"] = media.rewrite(page_rel, sanitize(para))
            if qt == "multiple_choice" or (qt != "fill_ups" and options and "name" in options[0]):
                item["type"] = "MSQ" if q.get("hasMultipleAnswers") else "MCQ"
                keys = []
                for oi, opt in enumerate(options):
                    key = LETTERS[oi] if oi < len(LETTERS) else str(oi + 1)
                    item["options"].append({"key": key, "html": media.rewrite(page_rel, sanitize(opt.get("name") or ""))})
                    if opt.get("isCorrect"):
                        keys.append(key)
                item["answer"] = keys
                item["answerText"] = ", ".join(keys)
                if item["type"] == "MCQ" and len(keys) > 1:
                    report["mcq_multiple_correct"].append([page_rel, n, keys])
                if not keys:
                    report["no_correct_option"].append([page_rel, n])
                if qt != "multiple_choice":
                    report["unknown_qtype_B"].append([page_rel, n, qt])
            elif qt == "fill_ups" or not options or "solution" in (options[0] or {}):
                item["type"] = "NAT"
                acc = q.get("acceptedRange") or {}
                amin, amax = to_num(acc.get("min")), to_num(acc.get("max"))
                flagged = [o for o in options if o.get("isCorrect")] or options
                vals, rlo, rhi = [], [], []
                for opt in flagged:
                    sol = opt.get("solution")
                    if isinstance(sol, list):
                        vals.extend(sol)
                    elif sol not in (None, ""):
                        vals.append(sol)
                    fl, cp = to_num(opt.get("floor")), to_num(opt.get("cap"))
                    if fl is not None and cp is not None:
                        rlo.append(min(fl, cp))
                        rhi.append(max(fl, cp))
                lo, hi, txt = parse_nat_solution(vals)
                if amin is not None and amax is not None:
                    lo, hi = min(amin, amax), max(amin, amax)
                    counters["nat_accepted_range"] += 1
                elif rlo:
                    lo = min(rlo) if lo is None else min(lo, min(rlo))
                    hi = max(rhi) if hi is None else max(hi, max(rhi))
                    counters["nat_floor_cap_range"] += 1
                if lo is not None and not txt:
                    txt = f"{clean_num(lo)}" if lo == hi else f"{clean_num(lo)} to {clean_num(hi)}"
                item["answerText"] = txt
                item["natRange"] = fix_range(lo, hi, page_rel, n) if lo is not None else None
                if lo is None:
                    report["nat_without_answer"].append([page_rel, n, txt])
                if qt != "fill_ups":
                    report["unknown_qtype_B"].append([page_rel, n, qt])
            else:
                item["type"] = "MCQ"
                report["unknown_qtype_B"].append([page_rel, n, qt])
            pos, neg = marks_b(q, section, provider_key)
            if pos is not None:
                item["marks"] = {"pos": clean_num(pos), "neg": clean_num(neg or 0)}
            out_q.append(item)
            sec_pairs.append((item, q))
        if provider_key == "zeal":
            infer_zeal_marks(sec_pairs, to_num(section.get("sectionMarks")), page_rel)
    dur = to_num(test.get("testTotalDuration"))
    ctx = data.get("context") or {}
    info = {k: ctx.get(k) for k in ("orgName", "batchName", "subjectName") if ctx.get(k)}
    return {
        "title": tidy(test.get("name")) or None,
        "durationSec": int(dur / 1000) if dur else None,
        "info": info,
        "sectionsMeta": sections_meta,
        "questions": out_q,
    }


# --------------------------------------------------------------------------- build

def apply_gate_sections(paper):
    """Full-length GATE papers without real section info: Q1-10 are General
    Aptitude when their marks add up to the standard 15."""
    qs = paper["questions"]
    names = {q.get("section") for q in qs}
    if names & {"General Aptitude", "Technical"} or len(names - {None}) > 1:
        return
    if len(qs) != 65:
        return
    ga_ok = all(q.get("marks") for q in qs[:10]) and abs(sum(q["marks"]["pos"] for q in qs[:10]) - 15) < 1e-6
    full = re.search(r"full syllabus|advance level|basic level|mock|demo", paper["title"], re.I)
    if ga_ok or full:
        for i, q in enumerate(qs):
            q["section"] = "General Aptitude" if i < 10 else "Technical"
        counters["gate_sections_inferred"] += 1


# the whole name is just the branch ("EE", "Computer Science Engineer") - not "Electrical Machines"
BRANCH_SECTION_RE = re.compile(
    r"^(?:computer science(?: engineer(?:ing)?)?(?: (?:&|and) it)?|electrical(?: engineering)?|"
    r"electronics(?: (?:&|and) communication)?(?: engineering)?|mechanical(?: engineering)?|civil(?: engineering)?|"
    r"data science(?: (?:&|and) (?:artificial intelligence|ai))?|ee|ec|ece|cs|cse|me|ce|da)$", re.I)


def normalize_section(name, title):
    """Section names in the sources are often the test's own name ("Test ID - 1
    [DM Test - 1] - 2026", "GATE 2027 EE SUBJECT WISE TEST - 7"). Map those to
    the GATE section they really are, keep real subject names (ACE)."""
    n = tidy(name or "")
    if not n:
        return None
    low = n.lower()
    if "aptitude" in low:
        return "General Aptitude & Maths" if "math" in low else "General Aptitude"
    if low.startswith("technical"):
        return "Technical"
    if BRANCH_SECTION_RE.match(low):
        return "Technical"
    if re.search(r"\btest\b.*\d|\btest\s*id\b|subject\s*wise\s*test", low) or (title and low == tidy(title).lower()):
        return "Technical"
    return n


def summarize_sections(qs):
    out = []
    for i, q in enumerate(qs):
        name = q.get("section") or "Questions"
        if out and out[-1]["name"] == name:
            out[-1]["count"] += 1
        else:
            out.append({"name": name, "start": i, "count": 1})
    return out


def series_ids(manifest):
    ids = {}
    used = set()
    for bi, branch in enumerate(manifest["branches"]):
        code = branch_code(branch["name"]).lower()
        for provider in branch["providers"]:
            pname = PROVIDER_ALIASES.get(tidy(provider["name"]).upper(), tidy(provider["name"]))
            pkey = PROVIDER_KEYS.get(pname.upper(), re.sub(r"[^a-z0-9]+", "", pname.lower())[:8])
            for series in provider["series"]:
                yrs = years_in(series["name"]) or years_in(series["path"])
                base = f"{code}-{pkey}-{'-'.join(yrs) if len(yrs) <= 2 else yrs[-1]}"
                if "quiz" in series["name"].lower():
                    base += "q"
                sid, k = base, 2
                while sid in used:
                    sid = f"{base}-{k}"
                    k += 1
                used.add(sid)
                ids[id(series)] = sid
    return ids


SNIPPET_CHARS = 400


def qindex_row(pid, qi, q):
    """[paperId, questionIndex, type, section, searchable text snippet]."""
    text = strip_tags((q.get("paragraph") or "") + " " + (q.get("html") or "")).replace("[image]", " ")
    text = re.sub(r"\s+", " ", text).strip()
    return [pid, qi, q["type"], q.get("section") or "", text[:SNIPPET_CHARS]]


def rebuild_qindex(site):
    """Regenerate data/qindex/*.js from data/json without re-parsing the mirror."""
    rows = collections.defaultdict(list)
    lib = json.load(open(os.path.join(site, "data", "library.json"), encoding="utf-8"))
    for b in lib["branches"]:
        for p in b["providers"]:
            for s in p["series"]:
                for entry in s["papers"]:
                    path = os.path.join(site, "data", "json", entry["id"] + ".json")
                    if entry.get("missing") or not os.path.exists(path):
                        continue
                    paper = json.load(open(path, encoding="utf-8"))
                    for qi, q in enumerate(paper["questions"]):
                        rows[b["code"]].append(qindex_row(paper["id"], qi, q))
    for code, r in rows.items():
        with open(os.path.join(site, "data", "qindex", code + ".js"), "w", encoding="utf-8") as fh:
            fh.write("(window.DVR_QINDEX=window.DVR_QINDEX||{})")
            fh.write(js_wrap("[" + json.dumps(code) + "]", r))
    print("qindex rebuilt:", {k: len(v) for k, v in rows.items()})


def js_wrap(var_expr, obj):
    return var_expr + "=" + json.dumps(obj, ensure_ascii=False, separators=(",", ":")) + ";\n"


def main():
    mirror = os.path.abspath(sys.argv[1])
    site = os.path.abspath(sys.argv[2])
    only = sys.argv[3] if len(sys.argv) > 3 else None
    if only == "--qindex-only":
        rebuild_qindex(site)
        return
    manifest = dc.load_manifest(os.path.join(mirror, "data", "series-manifest.js"))
    for sub in ("json", "papers", "qindex"):
        os.makedirs(os.path.join(site, "data", sub), exist_ok=True)
    media = MediaStore(mirror, site)
    sids = series_ids(manifest)

    library = {"title": "GATE Practice Library", "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
               "source": dc.BASE, "branches": []}
    qindex = collections.defaultdict(list)
    t0 = time.time()
    done = 0
    for branch in manifest["branches"]:
        bname = tidy(branch["name"])
        code = branch_code(bname)
        lb = {"name": bname, "code": code, "providers": []}
        library["branches"].append(lb)
        for provider in branch["providers"]:
            pname = PROVIDER_ALIASES.get(tidy(provider["name"]).upper(), tidy(provider["name"]))
            pkey = PROVIDER_KEYS.get(pname.upper(), "other")
            lp = {"name": pname, "key": pkey, "series": []}
            lb["providers"].append(lp)
            for series in provider["series"]:
                sid = sids[id(series)]
                sname = tidy(series["name"])
                syears = years_in(series["name"]) or years_in(series["path"])
                ls = {"id": sid, "name": sname, "years": syears, "papers": []}
                lp["series"].append(ls)
                for idx, test in enumerate(series["tests"]):
                    num = test.get("num") if test.get("num") is not None else idx + 1
                    pid = f"{sid}-{int(num):03d}"
                    title = tidy(test["title"])
                    cat = test.get("category") or (category_of(title) if category_of(title) != "other" else category_of(sname))
                    yrs = years_in(title)
                    entry = {"id": pid, "num": num, "title": title, "category": cat,
                             "year": yrs[-1] if yrs else "", "source": test["path"]}
                    ls["papers"].append(entry)
                    if only and only not in pid:
                        continue
                    page = dc.local_path(mirror, test["path"])
                    if not os.path.exists(page):
                        report["missing_page"].append(test["path"])
                        entry["missing"] = True
                        continue
                    text = open(page, encoding="utf-8", errors="replace").read()
                    fmt = dc.detect_format(text)
                    try:
                        if fmt == "A":
                            parsed = parse_format_a(text, test["path"], media)
                        elif fmt == "B":
                            parsed = parse_format_b(text, test["path"], media, pkey)
                        else:
                            report["unknown_format"].append(test["path"])
                            entry["missing"] = True
                            continue
                    except Exception as exc:  # noqa: BLE001
                        report["parse_error"].append([test["path"], repr(exc)])
                        entry["missing"] = True
                        continue

                    paper = {
                        "v": 1, "id": pid, "title": title, "sourceTitle": parsed.get("title"),
                        "branch": bname, "code": code, "provider": pname, "providerKey": pkey,
                        "series": sname, "seriesId": sid, "num": num, "category": cat,
                        "year": entry["year"], "format": fmt,
                        "durationSec": parsed.get("durationSec"),
                        "info": parsed.get("info") or {},
                        "source": test["path"],
                        "questions": parsed["questions"],
                    }
                    if parsed.get("sectionsMeta"):
                        paper["sectionsMeta"] = parsed["sectionsMeta"]
                    if pkey == "zeal":
                        paper["marksInferred"] = True
                        paper["marksApprox"] = sum(1 for q in parsed["questions"] if q.get("marksApprox"))
                    for q in paper["questions"]:
                        q["section"] = normalize_section(q.get("section"), title)
                    apply_gate_sections(paper)
                    qs = paper["questions"]
                    for q in qs:
                        # problems that exist in the source paper itself
                        if not strip_tags(q["html"]).replace("[image]", "").strip() and "<img" not in (q["html"] or ""):
                            q["sourceIssue"] = "The question text is missing in the source paper - see the solution."
                            counters["source_issue_empty_question"] += 1
                        if q["type"] in ("MCQ", "MSQ"):
                            keys = {o["key"] for o in q["options"]}
                            if len(keys) < 2:
                                q["sourceIssue"] = "Most options are missing in the source paper, so it is not graded."
                                q["answerText"] = ", ".join(q.get("answer") or [])
                                q["answer"] = []
                                counters["source_issue_options_missing"] += 1
                            elif q.get("answer") and not set(q["answer"]) <= keys:
                                q["sourceIssue"] = "The answer key points to an option missing in the source paper."
                                q["answerText"] = ", ".join(q["answer"])
                                q["answer"] = [k for k in q["answer"] if k in keys]
                                counters["source_issue_key_outside_options"] += 1
                        has_key = bool(q.get("natRange")) if q["type"] == "NAT" else bool(q.get("answer"))
                        if not has_key:
                            q["keyMissing"] = True
                            counters["questions_without_key"] += 1
                    blob = " ".join([q["html"] or "" for q in qs] + [o["html"] for q in qs for o in q["options"]] + [q.get("solution") or "" for q in qs])
                    # LaTeX only where it really is LaTeX: DVRUO Classes (GATE Overflow) content
                    # uses $...$, while MADE EASY papers contain literal "$" (end-of-input marker,
                    # dollar amounts) that MathJax would wrongly turn into formulas.
                    tex_cmd = re.search(r"\$[^$<>]{0,400}?\\[a-zA-Z]{2,}[^$<>]{0,400}?\$|\\\(.{0,400}?\\\)|\\\[.{0,400}?\\\]", blob, re.S)
                    dollars = re.search(r"\$[^$<>]{1,300}\$", blob)
                    paper["math"] = bool(tex_cmd) or (pkey == "classes" and bool(dollars))
                    marked = all(q.get("marks") for q in qs) and qs
                    paper["scoring"] = "marks" if marked else "count"
                    if not marked:
                        for q in qs:
                            q["marks"] = q.get("marks") or None
                    paper["sections"] = summarize_sections(qs)
                    tcount = collections.Counter(q["type"] for q in qs)
                    paper["stats"] = {
                        "questions": len(qs),
                        "maxMarks": clean_num(sum(q["marks"]["pos"] for q in qs if not q.get("keyMissing"))) if marked else None,
                        "types": dict(tcount),
                        "withoutKey": sum(1 for q in qs if q.get("keyMissing")),
                    }
                    if not qs:
                        report["empty_paper"].append(test["path"])
                    if not paper["durationSec"]:
                        paper["durationSec"] = 180 * 60 if len(qs) >= 60 else max(15 * 60, len(qs) * 3 * 60)
                        report["duration_defaulted"].append(test["path"])

                    entry.update({"q": len(qs), "dur": paper["durationSec"], "max": paper["stats"]["maxMarks"],
                                  "types": dict(tcount), "fmt": fmt,
                                  "secs": [s["name"] for s in paper["sections"]]})

                    with open(os.path.join(site, "data", "json", pid + ".json"), "w", encoding="utf-8") as fh:
                        json.dump(paper, fh, ensure_ascii=False, indent=1)
                    with open(os.path.join(site, "data", "papers", pid + ".js"), "w", encoding="utf-8") as fh:
                        fh.write("(window.DVR_PAPERS=window.DVR_PAPERS||{})")
                        fh.write(js_wrap("[" + json.dumps(pid) + "]", paper))
                    for qi, q in enumerate(qs):
                        qindex[code].append(qindex_row(pid, qi, q))
                    counters["papers"] += 1
                    counters["questions"] += len(qs)
                    done += 1
                    if done % 50 == 0:
                        print(f"{done} papers, {counters['questions']} questions, "
                              f"{counters['media_written']} images, {time.time() - t0:.0f}s", flush=True)

    # library totals
    total_papers = total_q = 0
    for lb in library["branches"]:
        bp = bq = 0
        for lp in lb["providers"]:
            pp = pq = 0
            for ls in lp["series"]:
                sp = sum(1 for p in ls["papers"] if not p.get("missing"))
                sq = sum(p.get("q", 0) for p in ls["papers"])
                ls["paperCount"], ls["questionCount"] = sp, sq
                pp += sp
                pq += sq
            lp["paperCount"], lp["questionCount"] = pp, pq
            bp += pp
            bq += pq
        lb["paperCount"], lb["questionCount"] = bp, bq
        total_papers += bp
        total_q += bq
    library["paperCount"], library["questionCount"] = total_papers, total_q

    if not only:
        with open(os.path.join(site, "data", "library.json"), "w", encoding="utf-8") as fh:
            json.dump(library, fh, ensure_ascii=False, indent=1)
        with open(os.path.join(site, "data", "library.js"), "w", encoding="utf-8") as fh:
            fh.write(js_wrap("window.DVR_LIBRARY", library))
        for code, rows in qindex.items():
            with open(os.path.join(site, "data", "qindex", code + ".js"), "w", encoding="utf-8") as fh:
                fh.write("(window.DVR_QINDEX=window.DVR_QINDEX||{})")
                fh.write(js_wrap("[" + json.dumps(code) + "]", rows))

    rep = {"counters": dict(counters), "elapsedSec": round(time.time() - t0, 1)}
    for k, v in report.items():
        rep[k] = {"count": len(v), "items": v[:400]}
    with open(os.path.join(site, "data", "build_report.json"), "w", encoding="utf-8") as fh:
        json.dump(rep, fh, ensure_ascii=False, indent=1)
    print("DONE", json.dumps(rep["counters"]), {k: len(v) for k, v in report.items()}, flush=True)


if __name__ == "__main__":
    main()
