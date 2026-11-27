"""Convert already-generated single-chain demonstration outputs into the viewer format.
No model inference is performed. Only use data you are authorized to disclose.
"""
import argparse
import hashlib
import json
import re
from pathlib import Path
import gemmi
import numpy as np

AA = "ACDEFGHIKLMNPQRSTVWYX"

def read_models(path):
    structure = gemmi.read_structure(str(path))
    models = []
    for model in structure:
        ids, coordinates = [], []
        for chain in model:
            for residue in chain:
                atoms = [a for a in residue if a.name == "CA"]
                if not atoms:
                    continue
                if len(atoms) != 1:
                    raise ValueError("Ambiguous C-alpha atom: " + str(residue.seqid))
                atom = atoms[0]
                ids.append(f"{chain.name}:{residue.seqid}")
                coordinates.append([atom.pos.x, atom.pos.y, atom.pos.z])
        arr = np.array(coordinates, dtype=float)
        if not ids or len(set(ids)) != len(ids) or not np.isfinite(arr).all():
            raise ValueError("Invalid or duplicate residue coordinates")
        if len({i.split(":")[0] for i in ids}) != 1:
            raise ValueError("Only a single protein chain is supported")
        models.append((ids, arr))
    if not models:
        raise ValueError("No models found")
    return models

def fasta_records(path):
    records = []
    for part in Path(path).read_text().split(">")[1:]:
        lines = part.strip().splitlines()
        if lines:
            records.append((lines[0], "".join(lines[1:]).strip()))
    return records

def sha(path):
    with open(path, "rb") as handle:
        return hashlib.file_digest(handle, "sha256").hexdigest()

def convert(args):
    final_models = read_models(args.final)
    if len(final_models) != 1:
        raise ValueError("Final structure must contain exactly one model")
    ids, final = final_models[0]
    n = len(ids)
    if not 1 <= n <= 256:
        raise ValueError("The viewer supports 1–256 residues")
    frames = read_models(args.trajectory)
    if args.reverse_order:
        frames.reverse()
    if len(frames) < 2:
        raise ValueError("At least two saved trajectory models are required")
    if any(frame_ids != ids for frame_ids, _ in frames):
        raise ValueError("Residue order/identity mismatch between final structure and trajectory")
    # Preserve exact saved frames, including first and last, rather than interpolating.
    chosen = np.unique(np.linspace(0, len(frames)-1, min(256,len(frames)), dtype=int))
    records = [(header, seq) for header, seq in fasta_records(args.fasta)
               if re.search(r"(?:^|,\s*)sample=\d+", header)]
    if not 1 <= len(records) <= 32:
        raise ValueError("Expected 1–32 generated ProteinMPNN FASTA records (not the native header)")
    with np.load(args.probs, allow_pickle=False) as archive:
        probs = archive["probs"]
        sampled = archive["S"]
        mask = archive["mask"]
        if probs.shape != (len(records), n, 21) or sampled.shape != (len(records), n):
            raise ValueError("ProteinMPNN sequence/probability dimensions do not match the backbone")
        if mask.shape[-1] != n or not np.all(mask == 1):
            raise ValueError("Only fully designed single chains without masked positions are supported")
        if not np.isfinite(probs).all() or np.any(probs < 0) or np.any(probs > 1) or not np.allclose(probs.sum(-1), 1, atol=0.004):
            raise ValueError("Invalid sampling probability rows")
        candidates = []
        for i, (header, seq) in enumerate(records):
            if len(seq) != n or any(a not in AA[:-1] for a in seq):
                raise ValueError("Candidate sequence does not match the single-chain backbone")
            if np.any(sampled[i] < 0) or np.any(sampled[i] >= len(AA)):
                raise ValueError("Invalid amino acid indices")
            if seq != "".join(AA[int(a)] for a in sampled[i]):
                raise ValueError("FASTA and NPZ sample order mismatch")
            item = {"sequence":seq, "probs":probs[i].round(6).tolist()}
            match = re.search(r"(?:^|,\s*)score=([0-9.]+)", header)
            if match:
                item["score"] = float(match.group(1))
            candidates.append(item)
    return {"schema_version":1, "kind":"model-output", "units":"angstrom",
            "trajectory_kind":args.kind, "residue_ids":ids,
            "final_ca":final.round(3).tolist(),
            "frames":[{"index":int(i),"ca":frames[i][1].round(3).tolist()} for i in chosen],
            "candidates":candidates,
            "provenance":{"rfd3":{"version":args.rfd3_version},
                          "proteinmpnn":{"version":args.mpnn_version},
                          "note":args.note,
                          "sha256":{k:sha(getattr(args,k)) for k in ("final","trajectory","fasta","probs")}}}

def main():
    p = argparse.ArgumentParser(description=__doc__)
    for key in ("final","trajectory","fasta","probs","output"):
        p.add_argument("--"+key, type=Path, required=True)
    p.add_argument("--kind", choices=["noisy","denoised"], required=True)
    p.add_argument("--reverse-order", action="store_true", help="Only if source models are confirmed to be stored in reverse inference order")
    p.add_argument("--rfd3-version", required=True)
    p.add_argument("--mpnn-version", required=True)
    p.add_argument("--note", required=True, help="Public-safe source/run provenance; no private paths or credentials")
    args = p.parse_args()
    if not args.note.strip() or len(args.note)>400 or any(not v.strip() or len(v)>160 for v in (args.rfd3_version,args.mpnn_version)):
        p.error("Provide nonempty provenance and valid version labels")
    bundle = convert(args)
    encoded = json.dumps(bundle, ensure_ascii=False, separators=(",",":"), allow_nan=False)
    if len(encoded.encode("utf-8")) > 8*1024*1024:
        p.error("Output exceeds viewer size limit")
    args.output.write_text(encoded, encoding="utf-8")
    print(f"Wrote {len(bundle['frames'])} saved frames and {len(bundle['candidates'])} sequences to {args.output}")

if __name__ == "__main__":
    main()
