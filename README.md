# Divya's GATE Prep (offline)

This is a personal offline copy of the **DVRUO Test Series** library (https://dvruo-test-series.netlify.app). It contains every paper of every branch, and a practice app built on top of it.

## Setup on a new computer (from GitHub)

1. Install [Git for Windows](https://git-scm.com/download/win) (and optionally [Python](https://www.python.org/downloads/) for `START.bat`).
2. Download the repository (about 1.7 GB, so it takes a while):
   ```
   git clone https://github.com/amanRT/Gate-Test.git
   ```
   Or on GitHub: **Code → Download ZIP**, then extract it.
3. Open the `Gate-Test` folder and double-click **`index.html`** (or `START.bat`). That's it - everything runs offline.

Progress (attempts, bookmarks, mistakes) is saved in the browser on that computer. Use **Settings → Export backup / Import backup** to move it.

The `mirror/` folder (raw copy of the original website) is not in the repository - the app does not need it.

## Open it

- **Double-click `index.html`.** Everything loads from disk, so no internet or server is needed.
- Or run **`START.bat`**. It serves the app at http://127.0.0.1:8765 using Python. Use this if your browser blocks local files.
- **`START-ORIGINAL-MIRROR.bat`** opens the exact copy of the original website in `mirror/` at http://127.0.0.1:8766. Some ZEAL and GO Classes images on the original pages load from their CDNs, so the original pages need internet for those. The practice app itself is fully offline.

## What's inside

| Branch | Papers | Providers / batches |
|---|---|---|
| Civil (CE) | 84 | DVRUO EASY: GATE 2026 + ESE 2026 |
| Computer Science (CS) | 467 | DVRUO EASY 2026 and 2025, DVRUO ZEAL 2026 and 2025, DVRUO Classes 2027 test series and weekly quizzes |
| Data Science & AI (DA) | 77 | DVRUO EASY 2026 and 2025 |
| Electrical (EE) | 238 | DVRUO EASY 2027, 2026 and 2025, DVRUOACE 2027 |
| Electronics (EC) | 98 | DVRUO EASY 2026 and 2025 |
| Mechanical (ME) | 97 | DVRUO EASY 2026 and 2025 |

That is 1,061 papers in total, with **34,339 questions**: 20,619 MCQ, 4,808 MSQ and 8,912 NAT. Every question carries:

- its options
- its answer key (MCQ/MSQ letters; for NAT the accepted range, and 4,013 NAT questions have a tolerance range)
- marks (+/−) and section
- a worked solution (34,284 questions have one)
- all its images (69,818 of them, stored offline in `media/`)

Only 4 images are missing, and they are broken on the original site too.

1,158 questions have no official key in the source. Almost all are DVRUO Classes questions whose solution says "Answer: Not available". In practice mode you can grade yourself on these after reading the solution.

## Features of the practice app

- **Library.** Browse branch → series → paper. Filter by paper type and year, sort papers, save papers with a star, and see your best score on each card.
- **Search** (Ctrl+K). Searches paper titles and the text of every question.
- **CBT exam mode**, set up like the real GATE:
  - countdown timer that auto-submits at zero; pause is optional
  - sections (General Aptitude and Technical)
  - question palette with Not visited, Not answered, Answered, Marked and Answered & Marked states
  - Save & Next, Mark for Review & Next, Clear Response and Back buttons
  - an on-screen NAT keypad and a draggable scientific calculator
  - a confirmation summary before you submit
  - "strict" saving like the real CBT: an answer counts only after Save & Next (you can turn this off)
  - your attempt is saved continuously, so you can close the browser and resume later
- **Result & analysis.**
  - score, accuracy, and the positive and negative marks
  - section-wise and question-type tables
  - time spent per question, the slowest questions, and your attempt history on that paper
  - a question map and a full answer review with filters (wrong / skipped / marked / …) and solutions
- **Practice mode.** Go one question at a time: check your answer instantly and read the solution. Progress is saved.
- **Questions & solutions view.** The whole paper on one page. You can hide the answers for a self-test, and print or save it as a PDF.
- **Question bank.** Build custom practice sets or timed tests from any branch. Filter by series, section, paper type, question type, keyword, or your history (never attempted / got wrong / bookmarked).
- **Bookmarks** and a **mistakes notebook.** Every wrong answer is collected automatically, and you can practise or test on these lists.
- **Stats.** Score trend, accuracy by section, type and branch, and a list of all your attempts.
- **Settings.** Three themes (Dark, Bright, Green), question text size, and the strict-save and marking options. You can also export or import a progress backup as a JSON file.

Your progress is stored in the browser (localStorage). To move it to another browser, use Settings → Export backup.

## Scoring rules

- **MCQ:** a correct answer gets +marks and a wrong answer gets −penalty, as given in the paper (usually 1/3).
- **MSQ:** you must choose exactly the correct set of options. There is no partial credit. Following the GATE rule, there is no negative marking (Settings can switch this off).
- **NAT:** your answer is correct if it falls inside the inclusive accepted range.
- **Questions without a key in the source** (some DVRUO Classes weekly quizzes) show their solution but are not scored.

## Notes on how the data was cleaned (see `data/build_report.json`)

- **DVRUO EASY NAT answers.** Where the solution states a tolerance, e.g. `91.31 (91.10 - 91.50)`, that range is used. The original pages often stored only the point value.
- **DVRUOACE NAT answers** use the source's `acceptedRange`.
- **DVRUO ZEAL marks.** The source stores only section totals; the per-question marks it contains are a previous candidate's attempt. The app rebuilds each question's 1 or 2 marks from those attempt records plus the section total, and estimates are flagged. The MCQ penalty is 1/3 of the question's marks.
- **Sections.** Full-length GATE papers that lack section info are split into General Aptitude (Q1–10) and Technical.

## Folders

```
index.html            the practice app (open this)
app/                  app code (core, exam engine, calculator, views) + vendor/mathjax (offline math)
data/library.js       index of all branches / series / papers
data/papers/<id>.js   per-paper data used by the app
data/json/<id>.json   the same data as plain, readable JSON (one file per paper)
data/qindex/<CODE>.js per-branch question index (search / question bank)
media/                every image, de-duplicated by content hash
mirror/               exact offline copy of the original website (raw source, 1,061 HTML papers)
tools/                scripts that downloaded and converted everything
```

### Paper JSON format (`data/json/<id>.json`)

```json
{
  "id": "ce-easy-2026-001", "title": "...", "branch": "CIVIL ENGINEERING", "code": "CE",
  "provider": "DVRUO EASY", "series": "...", "durationSec": 10800, "scoring": "marks",
  "sections": [{"name": "General Aptitude", "start": 0, "count": 10}, ...],
  "questions": [{
    "n": 1, "type": "MCQ|MSQ|NAT", "section": "General Aptitude",
    "html": "<p>question html</p>", "paragraph": null,
    "options": [{"key": "A", "html": "..."}, ...],
    "answer": ["D"], "natRange": null, "answerText": "D",
    "marks": {"pos": 1, "neg": 0.33}, "solution": "<p>worked solution html</p>"
  }]
}
```

Image paths inside the HTML (`media/xx/<hash>.png`) are relative to this folder.

## Refreshing from the website

```
python -I tools/download_papers.py mirror          # papers (skips files already downloaded)
python -I tools/download_media.py  mirror          # images used by the papers
python -I tools/build_data.py      mirror .        # rebuild data/ and media/
```
