#!/usr/bin/env python3
"""Export every phrase in the current study vocabulary with its source."""

from __future__ import annotations

import json
from collections import Counter
from pathlib import Path


WORKSPACE = Path(__file__).resolve().parents[2]
APP_VOCABULARY = WORKSPACE / "pet-vocab-app/app/data/vocabulary.json"
SOURCE_VOCABULARY = WORKSPACE / "tmp/vocab_builder/vocabulary_data.json"
OUTPUT = WORKSPACE / "outputs/phrase-analysis/词组完整清单.md"

PHASE_LABELS = {
    "core": "阶段一 · 共同核心",
    "growth": "阶段二 · 高频成长",
    "extension": "阶段三 · 进阶拓展",
    "phrases": "词组专项",
}
PHASE_ORDER = {phase: index for index, phase in enumerate(PHASE_LABELS)}
SOURCE_ORDER = {"PET": 0, "小托福": 1, "PET+小托福": 2}
PHRASE_GROUP_LABELS = {
    "get": "get 开头", "put": "put 开头", "turn": "turn 开头", "look": "look 开头",
    "take": "take 开头", "go": "go 开头", "give": "give 开头", "keep": "keep 开头",
    "set": "set 开头", "break": "break 开头", "in": "in 开头", "at": "at 开头",
    "on": "on 开头", "out": "out 开头", "up": "up 开头", "by": "by 开头",
    "as": "as 开头", "verb_other": "其他动词词组",
    "preposition_other": "其他介词与固定搭配", "noun_compound": "名词与复合词",
    "adjective_phrase": "形容词与描述词组", "daily_expression": "日常表达",
}


def escape_cell(value: object) -> str:
    """Keep Markdown tables valid when source text contains separators/newlines."""
    return str(value or "—").replace("|", "\\|").replace("\n", " ").strip()


def main() -> None:
    app_words = json.loads(APP_VOCABULARY.read_text(encoding="utf-8"))
    source_data = json.loads(SOURCE_VOCABULARY.read_text(encoding="utf-8"))
    source_by_id = {
        item["word_id"]: item["source_scope"] for item in source_data["master"]
    }

    phrases = []
    for item in app_words:
        if not item.get("isPhrase"):
            continue
        enriched = dict(item)
        enriched["source"] = source_by_id[item["id"]]
        phrases.append(enriched)

    phrases.sort(
        key=lambda item: (
            PHASE_ORDER[item["phase"]],
            SOURCE_ORDER[item["source"]],
            item["phaseOrder"],
            item["word"].casefold(),
        )
    )

    counts = Counter((item["phase"], item["source"]) for item in phrases)
    source_totals = Counter(item["source"] for item in phrases)

    lines = [
        "# 词组完整清单",
        "",
        f"> 当前词库共标记 **{len(phrases)}** 个词组。这里的“词组”以系统字段 `isPhrase = true` 为准，来源按原始 PET 词表与《TOEFL Junior 词汇精选》逐条标注。",
        "",
        "## 汇总",
        "",
        "| 阶段 | PET | 小托福 | 两边均有 | 合计 |",
        "|---|---:|---:|---:|---:|",
    ]

    for phase, label in PHASE_LABELS.items():
        phase_total = sum(counts[(phase, source)] for source in SOURCE_ORDER)
        lines.append(
            f"| {label} | {counts[(phase, 'PET')]} | {counts[(phase, '小托福')]} | "
            f"{counts[(phase, 'PET+小托福')]} | {phase_total} |"
        )

    lines.extend(
        [
            f"| **全部** | **{source_totals['PET']}** | **{source_totals['小托福']}** | "
            f"**{source_totals['PET+小托福']}** | **{len(phrases)}** |",
            "",
            "## 完整明细",
            "",
        ]
    )

    for phase, phase_label in PHASE_LABELS.items():
        phase_items = [item for item in phrases if item["phase"] == phase]
        if not phase_items:
            lines.extend([f"### {phase_label}（0 个）", "", "本阶段没有标记为词组的条目。", ""])
            continue

        for source in SOURCE_ORDER:
            section = [item for item in phase_items if item["source"] == source]
            if not section:
                continue
            lines.extend(
                [
                    f"### {phase_label}｜来源：{source}（{len(section)} 个）",
                    "",
                    "| 序号 | 词组 | 分类 | 中文释义 | 词频 | 难度 | 来源 |",
                    "|---:|---|---|---|---:|---|---|",
                ]
            )
            for index, item in enumerate(section, start=1):
                lines.append(
                    f"| {index} | {escape_cell(item['word'])} | "
                    f"{PHRASE_GROUP_LABELS.get(item.get('phraseGroup', ''), '未分类')} | "
                    f"{escape_cell(item.get('translation'))} | "
                    f"{escape_cell(item.get('frequency'))} | "
                    f"{escape_cell(item.get('difficulty'))} | {source} |"
                )
            lines.append("")

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text("\n".join(lines), encoding="utf-8")
    print(f"Exported {len(phrases)} phrases to {OUTPUT}")
    print(f"Source totals: {dict(source_totals)}")


if __name__ == "__main__":
    main()
