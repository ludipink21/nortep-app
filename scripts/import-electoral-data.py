"""Build a reproducible, validated subset of the official TSE CSV archives.

Usage: python3 scripts/import-electoral-data.py --votes /path/votes.zip --totals /path/totals.zip
Only ordinary 2024 mayoral elections in Minas Gerais are included.
"""
import argparse
import csv
import hashlib
import io
import json
from pathlib import Path
import zipfile

SOURCE = "https://dadosabertos.tse.jus.br/dataset/resultados-2024"
BASE = "https://cdn.tse.jus.br/estatistica/sead/odsele/"


def rows(path, prefix):
    with zipfile.ZipFile(path) as archive:
        name = f"{prefix}_2024_MG.csv"
        with io.TextIOWrapper(archive.open(name), encoding="latin1") as text:
            for row in csv.DictReader(text, delimiter=";"):
                if (row["CD_TIPO_ELEICAO"], row["ANO_ELEICAO"], row["CD_CARGO"], row["SG_UF"]) == ("2", "2024", "11", "MG"):
                    yield row


def build(votes_path, totals_path):
    contests = {}
    generated = set()
    fields = {"electorate": "QT_APTOS", "turnout": "QT_COMPARECIMENTO", "abstentions": "QT_ABSTENCOES", "valid": "QT_TOTAL_VOTOS_VALIDOS", "blank": "QT_VOTOS_BRANCOS", "nullVotes": "QT_TOTAL_VOTOS_NULOS", "annulled": "QT_TOTAL_VOTOS_ANULADOS", "pending": "QT_TOTAL_VOTOS_ANUL_SUBJUD", "separate": "QT_VOTOS_ANULADOS_APU_SEP"}
    for row in rows(totals_path, "detalhe_votacao_munzona"):
        generated.add(row["DT_GERACAO"] + " " + row["HH_GERACAO"])
        key = row["CD_ELEICAO"] + ":" + row["CD_MUNICIPIO"]
        contest = contests.setdefault(key, {"id": key, "electionId": row["CD_ELEICAO"], "year": 2024, "round": int(row["NR_TURNO"]), "municipalityId": row["CD_MUNICIPIO"], "municipality": row["NM_MUNICIPIO"], "state": "MG", "office": "Prefeito", "officeId": "11", "zones": {}, "candidates": {}})
        zone = row["NR_ZONA"]
        if zone in contest["zones"]:
            raise ValueError(f"Duplicate totals: {key}/{zone}")
        counts = {name: int(row[field]) for name, field in fields.items()}
        if any(v < 0 for v in counts.values()):
            raise ValueError(f"Missing counts: {key}/{zone}")
        if counts["electorate"] != counts["turnout"] + counts["abstentions"]:
            raise ValueError(f"Electorate mismatch: {key}/{zone}")
        if counts["turnout"] != sum(counts[x] for x in ["valid", "blank", "nullVotes", "annulled", "pending", "separate"]):
            raise ValueError(f"Ballot mismatch: {key}/{zone}")
        contest["zones"][zone] = counts
    seen = set()
    for row in rows(votes_path, "votacao_candidato_munzona"):
        generated.add(row["DT_GERACAO"] + " " + row["HH_GERACAO"])
        key = row["CD_ELEICAO"] + ":" + row["CD_MUNICIPIO"]
        unique = (key, row["NR_ZONA"], row["SQ_CANDIDATO"], row["NM_TIPO_DESTINACAO_VOTOS"], row["ST_VOTO_EM_TRANSITO"])
        if unique in seen:
            raise ValueError(f"Duplicate candidate: {unique}")
        seen.add(unique)
        contest = contests[key]
        candidate = contest["candidates"].setdefault(row["SQ_CANDIDATO"], {"id": row["SQ_CANDIDATO"], "name": row["NM_URNA_CANDIDATO"], "number": row["NR_CANDIDATO"], "party": row["SG_PARTIDO"], "status": row["DS_SIT_TOT_TURNO"], "zones": {}})
        counts = candidate["zones"].setdefault(row["NR_ZONA"], {"valid": 0, "recorded": 0})
        counts["valid"] += int(row["QT_VOTOS_NOMINAIS_VALIDOS"])
        counts["recorded"] += int(row["QT_VOTOS_NOMINAIS"])
    for contest in contests.values():
        for zone, counts in contest["zones"].items():
            total = sum(c["zones"].get(zone, {}).get("valid", 0) for c in contest["candidates"].values())
            if total != counts["valid"]:
                raise ValueError(f"Valid votes mismatch: {contest['id']}/{zone}: {total} != {counts['valid']}")
        contest["candidates"] = sorted(contest["candidates"].values(), key=lambda c: c["name"])
    hashes = {"votes": hashlib.sha256(Path(votes_path).read_bytes()).hexdigest(), "totals": hashlib.sha256(Path(totals_path).read_bytes()).hexdigest()}
    data = {"schemaVersion": 1, "version": hashlib.sha256(json.dumps(hashes, sort_keys=True).encode()).hexdigest()[:16], "source": {"name": "Tribunal Superior Eleitoral", "url": SOURCE, "generatedAt": sorted(generated), "license": "Creative Commons Attribution — conforme catálogo do TSE", "files": [BASE + "votacao_candidato_munzona/votacao_candidato_munzona_2024.zip", BASE + "detalhe_votacao_munzona/detalhe_votacao_munzona_2024.zip"], "sha256": hashes}, "coverage": "Prefeito · eleições ordinárias de 2024 · Minas Gerais · municípios e zonas", "contests": sorted(contests.values(), key=lambda c: (c["municipality"], c["round"]))}
    return data


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--votes", required=True)
    parser.add_argument("--totals", required=True)
    parser.add_argument("--output", default="app/analise-eleitoral/data/mg-2024.json")
    args = parser.parse_args()
    data = build(args.votes, args.totals)
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n")
    print(json.dumps({"municipalities": len({c['municipalityId'] for c in data['contests']}), "contests": len(data['contests']), "bytes": output.stat().st_size, "version": data['version']}))
