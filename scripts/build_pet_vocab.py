#!/usr/bin/env python3
"""Build the compact, offline PET vocabulary dataset used by the app."""

from __future__ import annotations

import csv
import json
import re
import unicodedata
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT.parent / "tmp" / "vocab_builder" / "vocabulary_data.json"
ECDICT = ROOT.parent / "tmp" / "vocab_builder" / "ecdict.csv"
OUTPUT = ROOT / "app" / "data" / "pet-vocabulary.json"


def normalize(value: str) -> str:
    value = unicodedata.normalize("NFKC", value).lower().strip()
    value = value.replace("’", "'").replace("–", "-").replace("—", "-")
    value = re.sub(r"\s+", " ", value)
    return value


def compact_lines(value: str, limit: int, max_chars: int) -> str:
    value = (value or "").replace("\\r\\n", "\n").replace("\\n", "\n").replace("\\r", "\n")
    parts = [re.sub(r"\s+", " ", item).strip() for item in (value or "").splitlines()]
    parts = [item for item in parts if item]
    text = "；".join(parts[:limit])
    if len(text) > max_chars:
        text = text[: max_chars - 1].rstrip("；，, ") + "…"
    return text


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
}


def clean_translation(value: str) -> str:
    text = compact_lines(value, 4, 220)
    text = re.sub(r"\[网络\].*$", "", text).strip("； ")
    return text


def candidates(entry: dict) -> list[str]:
    values = [entry.get("normalized_primary", "")]
    values.extend(entry.get("normalized_candidates", "").split(";"))
    values.append(entry.get("headword", ""))
    result: list[str] = []
    for value in values:
        key = normalize(value)
        if key and key not in result:
            result.append(key)
    return result


with SOURCE.open(encoding="utf-8") as file:
    source = json.load(file)

dictionary: dict[str, dict] = {}
with ECDICT.open(encoding="utf-8-sig", newline="") as file:
    for row in csv.DictReader(file):
        key = normalize(row.get("word", ""))
        if key and key not in dictionary:
            dictionary[key] = row

toefl = {normalize(item["normalized"]): item for item in source["toefl"]}
output: list[dict] = []
coverage = {"toefl": 0, "ecdict": 0, "pet_only": 0}

for pet in source["pet"]:
    keys = candidates(pet)
    overlap_keys = [normalize(item) for item in pet.get("overlap_words", "").split(";") if item.strip()]
    toe = next((toefl[key] for key in overlap_keys + keys if key in toefl), None)
    dic = next((dictionary[key] for key in keys if key in dictionary), None)

    if toe:
        detail_source = "小托福词汇精选"
        phonetic = toe.get("phonetic", "").strip("[] ")
        translation = toe.get("definition_zh", "")
        definition_en = ""
        example_en = toe.get("example_en", "")
        example_zh = toe.get("example_zh", "")
        coverage["toefl"] += 1
    elif dic:
        detail_source = "ECDICT"
        phonetic = (dic.get("phonetic") or "").strip("[] / ")
        translation = clean_translation(dic.get("translation") or "")
        definition_en = compact_lines(dic.get("definition") or "", 3, 320)
        example_en = ""
        example_zh = ""
        coverage["ecdict"] += 1
    else:
        detail_source = "PET官方词表"
        phonetic = ""
        translation = ""
        definition_en = ""
        example_en = ""
        example_zh = ""
        coverage["pet_only"] += 1

    manual = MANUAL.get(normalize(pet["headword"]))
    if manual:
        phonetic = manual[0] or phonetic
        translation = manual[1]
        definition_en = manual[2]
        detail_source = "人工校订"

    word = pet["headword"]
    output.append(
        {
            "id": pet["source_id"],
            "word": word,
            "lemma": pet["normalized_primary"],
            "letter": re.sub(r"[^a-z]", "", normalize(word))[:1].upper() or "#",
            "pos": pet.get("pos", "").strip("()"),
            "phonetic": phonetic,
            "translation": translation,
            "definitionEn": definition_en,
            "exampleEn": example_en,
            "exampleZh": example_zh,
            "page": str(pet.get("pages", "")),
            "isPhrase": bool(pet.get("is_phrase")),
            "isOverlap": bool(pet.get("is_overlap")),
            "detailSource": detail_source,
        }
    )

OUTPUT.parent.mkdir(parents=True, exist_ok=True)
with OUTPUT.open("w", encoding="utf-8") as file:
    json.dump(output, file, ensure_ascii=False, separators=(",", ":"))

print(json.dumps({"total": len(output), "coverage": coverage, "output": str(OUTPUT)}, ensure_ascii=False))
