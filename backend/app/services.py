from collections import defaultdict
from datetime import datetime
import json

from .checklist import CHECKLIST


def build_area_map():
    area_map = {}
    item_to_area = {}
    for area in CHECKLIST["areas"]:
        area_map[area["id"]] = area
        for item in area["items"]:
            item_to_area[item["id"]] = area["id"]
    return area_map, item_to_area


AREA_MAP, ITEM_TO_AREA = build_area_map()


def summarize_assessment(responses: list[dict]) -> str:
    buckets = defaultdict(list)
    for resp in responses:
        area_id = ITEM_TO_AREA.get(resp["item_id"])
        if area_id:
            buckets[area_id].append(resp["support"])
    lines = []
    for area_id, supports in buckets.items():
        area = AREA_MAP[area_id]["name"]
        if supports:
            avg = sum(supports) / len(supports)
            low = sum(1 for s in supports if s <= 1)
            line = (
                f"{area}: livello medio di supporto {avg:.1f}. "
                f"Indicatori critici (supporto 0-1): {low} su {len(supports)}."
            )
        else:
            line = f"{area}: dati non disponibili."
        lines.append(line)
    return " ".join(lines)


def build_plan_content(responses: list[dict]) -> tuple[str, str]:
    plan = []
    for area in CHECKLIST["areas"]:
        area_items = []
        for item in area["items"]:
            resp = next((r for r in responses if r["item_id"] == item["id"]), None)
            support = resp["support"] if resp else None
            line = {
                "item_id": item["id"],
                "label": item["label"],
                "support": support,
                "obiettivo": "Consolidare abilità funzionale" if support is not None and support <= 1 else "Mantenere e generalizzare",
                "strategie": "Attività guidate, modellamento, rinforzo positivo.",
                "criteri": "Esegue il compito in autonomia con supporto ridotto.",
            }
            area_items.append(line)
        plan.append({"area": area["name"], "items": area_items})
    return json.dumps(plan, ensure_ascii=False), _plan_text(plan)


def _plan_text(plan: list[dict]) -> str:
    chunks = []
    for area in plan:
        chunks.append(area["area"])
        for item in area["items"]:
            chunks.append(
                f"- {item['item_id']} {item['label']}: {item['obiettivo']} | {item['strategie']} | {item['criteri']}"
            )
    return "\n".join(chunks)


def now_iso() -> str:
    return datetime.utcnow().isoformat()
