#!/usr/bin/env python3
"""Build the compact, offline three-stage vocabulary dataset used by the app."""

from __future__ import annotations

import csv
import json
import re
import unicodedata
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT.parent / "tmp" / "vocab_builder" / "vocabulary_data.json"
ECDICT = ROOT.parent / "tmp" / "vocab_builder" / "ecdict.csv"
OUTPUT = ROOT / "app" / "data" / "vocabulary.json"


def normalize(value: str) -> str:
    value = unicodedata.normalize("NFKC", value).lower().strip()
    value = value.replace("’", "'").replace("–", "-").replace("—", "-")
    return re.sub(r"\s+", " ", value)


def compact_lines(value: str, limit: int, max_chars: int) -> str:
    value = (value or "").replace("\\r\\n", "\n").replace("\\n", "\n").replace("\\r", "\n")
    parts = [re.sub(r"\s+", " ", item).strip() for item in value.splitlines()]
    parts = [item for item in parts if item]
    text = "；".join(parts[:limit])
    if len(text) > max_chars:
        text = text[: max_chars - 1].rstrip("；，, ") + "…"
    return text


def clean_translation(value: str) -> str:
    text = compact_lines(value, 4, 220)
    text = re.sub(r"\[网络\].*$", "", text)
    text = re.sub(r"\[[^\]]+\]\s*", "", text)
    return text.strip("； ")


MANUAL = {
    "a/an": ("ə; eɪ / ən; æn", "一，一个（不定冠词）", "used before a noun to refer to one person or thing"),
    "dvd player": ("", "DVD 播放机", "a machine used for playing DVDs"),
    "extreme sport": ("", "极限运动", "a sport that is exciting and often dangerous"),
    "get fit": ("", "变得健康；强身健体", "to become healthier and physically stronger"),
    "ice skates": ("", "冰鞋；溜冰鞋", "boots with metal blades for moving on ice"),
    "in ink": ("", "用墨水（书写）", "written using ink rather than pencil"),
    "in pencil": ("", "用铅笔（书写）", "written using a pencil"),
    "oh dear!": ("", "哎呀！天哪！", "used to express surprise, worry, or disappointment"),
    "social media": ("", "社交媒体", "websites and apps used to share information and communicate"),
    "stay behind": ("", "留下；留在后面", "to remain somewhere after other people have left"),
    "step over/in/on/out of (sth)": ("", "跨过／走进／踩到／走出（某物）", "to move by lifting and placing your foot over, in, on, or out of something"),
    "tourist information centre": ("", "游客信息中心", "a place that gives visitors information about an area"),
    "well made / well-made": ("", "制作精良的；做工好的", "made with skill and care"),
    "while, whilst": ("", "当……的时候；而；然而", "during the time that; whereas"),
    "all right/alright": ("", "好的；没问题；安然无恙的", "satisfactory, safe, or acceptable"),
    "at / @": ("", "在；位于；符号 @", "used for a place, time, or the symbol @"),
    "blond(e)": ("", "金黄色头发的；金发的人", "having pale yellow hair"),
    "centre/center": ("", "中心；中央", "the middle point or part of something"),
    "dr / doctor": ("", "医生；博士", "a medical professional or a person with a doctoral degree"),
    "examination/exam": ("", "考试；检查", "a formal test or a careful medical inspection"),
    "forward(s)": ("", "向前；朝前", "towards the direction in front"),
    "humour/humor": ("", "幽默；幽默感", "the quality of being funny"),
    "lots / a lot": ("", "许多；大量", "a large number or amount"),
    "made of/from/out of": ("", "由……制成", "used to say what material or substance something consists of"),
    "maths / mathematics": ("", "数学", "the study of numbers, shapes, and quantities"),
    "ok / o.k. / okay": ("", "好的；可以；没事", "acceptable, satisfactory, or agreed"),
    "program(me)": ("", "节目；计划；程序", "a planned series of events or computer instructions"),
    "salesman/saleswoman": ("", "男销售员／女销售员", "a man or woman whose job is selling things"),
    "step forward/back(wards)/out": ("", "向前走／向后退／走出去", "to take a step forwards, backwards, or outside"),
    "tooth/teeth": ("", "牙齿（单数／复数）", "one of the hard white structures in the mouth"),
    "toward(s)": ("", "朝；向；对于", "in the direction of or in relation to"),
    "traffic light(s)": ("", "交通信号灯；红绿灯", "a set of coloured lights that controls road traffic"),
    "v/versus": ("", "对；与……相比", "used to show that two sides are against each other"),
    "wage(s)": ("", "工资；工钱", "money paid regularly for work"),
    "wetsuit/wet suit": ("", "潜水服；防寒泳衣", "a close-fitting rubber suit worn for water sports"),
}

PHASES = {"阶段一": "core", "阶段二": "growth", "PET补充": "extension"}

with SOURCE.open(encoding="utf-8") as file:
    source = json.load(file)

dictionary: dict[str, dict] = {}
with ECDICT.open(encoding="utf-8-sig", newline="") as file:
    for row in csv.DictReader(file):
        key = normalize(row.get("word", ""))
        if key and key not in dictionary:
            dictionary[key] = row

pet_by_normalized: dict[str, str] = {}
for pet in source["pet"]:
    for candidate in pet.get("normalized_candidates", "").split(";") + [pet.get("normalized_primary", "")]:
        key = normalize(candidate)
        if key and key not in pet_by_normalized:
            pet_by_normalized[key] = pet["source_id"]

output: list[dict] = []
coverage = {"master": 0, "ecdict": 0, "manual": 0}

for item in source["master"]:
    word = item["word"]
    keys = []
    for candidate in (item.get("normalized_word", ""), word, item.get("pet_headword", "")):
        key = normalize(candidate)
        if key and key not in keys:
            keys.append(key)
    dic = next((dictionary[key] for key in keys if key in dictionary), None)

    phonetic = (item.get("phonetic") or "").strip("[] / ")
    translation = (item.get("definition_zh") or "").strip()
    definition_en = compact_lines((dic or {}).get("definition", ""), 3, 320)
    if not phonetic and dic:
        phonetic = (dic.get("phonetic") or "").strip("[] / ")
    if not translation and dic:
        translation = clean_translation(dic.get("translation") or "")
        coverage["ecdict"] += 1
    elif translation:
        coverage["master"] += 1

    # The first stage represents form-level overlap. Keep both common dictionary
    # senses and the curated source meaning so a child is not marked wrong for
    # knowing a different, valid sense of the same word.
    if item["learning_stage"] == "阶段一" and dic:
        broad_translation = clean_translation(dic.get("translation") or "")
        if broad_translation:
            if translation.replace(" ", "") in broad_translation.replace(" ", ""):
                translation = broad_translation
            else:
                translation = compact_lines(f"{translation}\n{broad_translation}", 6, 220)

    manual = MANUAL.get(normalize(word))
    if manual:
        phonetic = manual[0] or phonetic
        translation = manual[1]
        definition_en = manual[2]
        coverage["manual"] += 1

    primary_key = normalize(item.get("normalized_word", "") or word)
    output.append(
        {
            "id": item["word_id"],
            "word": word,
            "lemma": item.get("normalized_word", word),
            "letter": re.sub(r"[^a-z]", "", normalize(word))[:1].upper() or "#",
            "pos": (item.get("part_of_speech") or "").strip("()"),
            "phonetic": phonetic,
            "translation": translation or "释义待补充",
            "definitionEn": definition_en,
            "exampleEn": item.get("example_en", ""),
            "exampleZh": item.get("example_zh", ""),
            "relatedWords": item.get("related_words", ""),
            "phase": PHASES[item["learning_stage"]],
            "phaseOrder": item.get("stage_order"),
            "difficulty": item.get("difficulty", ""),
            "isPhrase": bool(item.get("is_phrase")),
            "legacyPetId": pet_by_normalized.get(primary_key, ""),
        }
    )

OUTPUT.parent.mkdir(parents=True, exist_ok=True)
with OUTPUT.open("w", encoding="utf-8") as file:
    json.dump(output, file, ensure_ascii=False, separators=(",", ":"))

counts = {phase: sum(1 for item in output if item["phase"] == phase) for phase in ("core", "growth", "extension")}
print(json.dumps({"total": len(output), "phases": counts, "coverage": coverage, "output": str(OUTPUT)}, ensure_ascii=False))
