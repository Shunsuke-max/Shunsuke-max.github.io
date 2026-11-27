# RFdiffusion3 → ProteinMPNN: viewer data handoff

The homepage starts with the 1CRN reference demo. It now also accepts a local JSON file containing already-computed outputs. Nothing is uploaded by the viewer. Do not commit confidential competition candidates, sequences, paths or credentials. A small, untargeted single-chain educational example is sufficient; no biological function is assumed or claimed.

## Source outputs
- RFdiffusion3: the official [input documentation](https://rosettacommons.github.io/foundry/models/rfd3/input.html) documents `dump_trajectories=True`. Retain the final structure, the corresponding multi-model trajectory file (noisy OR denoised predictions, not a mixture), the inference metadata, checkpoint version and run configuration. Confirm the stored model order from the source. The frame index in this viewer refers to an ordinal in the saved series, not necessarily the scheduler timestep.
- ProteinMPNN: the [official repository](https://github.com/dauparas/ProteinMPNN) documents `--save_probs 1` and `--save_score 1`. Retain the generated FASTA and corresponding NPZ for the same single-chain input backbone, and record the version/checkpoint and run settings. The first native FASTA record is not a generated sample. Probabilities are sample-conditioned, not unconditional probabilities or measured affinities.
- GPU inference and structure prediction are separate steps and have not been run as part of this change.

## Convert existing outputs
Run in a local/Colab environment with Python 3.11+ and `pip install gemmi numpy`.

```sh
python tools/export_design_run.py \
  --final final.cif.gz \
  --trajectory saved_trajectory.cif.gz \
  --kind noisy \
  --fasta generated.fa \
  --probs generated.npz \
  --rfd3-version 'record actual version/checkpoint' \
  --mpnn-version 'record actual version/checkpoint' \
  --note 'record public-safe run provenance' \
  --output design-run.json
```

Names are placeholders; choose the matching files from the actual run. The converter stops rather than guessing when residue identities/order, model count, fully designed masks, sequence order or dimensions disagree. It preserves a subset of exact saved Cα frames (up to 256, including endpoints) and records input SHA-256 hashes. If the source stores models in reverse inference order, use `--reverse-order` only after verifying it. The viewer auto-fits coordinates and does not reproduce physical motion or atom-level inference internals. It currently supports single-chain structures up to 256 residues, 32 sequence candidates and an 8 MiB JSON file.

## Load in Curiosity Lab
Open "データ・手法の出典" at the top of the design journey, then select the JSON. Navigate to diffusion or ProteinMPNN. Select a candidate and a revealed residue to inspect up to three saved sampling probabilities. "参照デモに戻す" restores the default view. A local file is not automatically published.

## Validation and limitations
`schema_version=1`, `kind=model-output`, units angstrom, ordered `residue_ids`, `final_ca`, ordered `frames` with index and coordinates, candidates with sequence and optional probabilities (alphabet ACDEFGHIKLMNPQRSTVWYX), provenance and optional prediction record. The browser validates structure and dimensions, not authenticity. The optional prediction record is for externally aligned Cα coordinates and a reported RMSD; at present the UI displays the reported evaluation only, not a structural overlay. The exporter does not fabricate predictions, probabilities or trajectories. The test fixtures are synthetic and never distributed as real output.

Do not publish a bundle until actual model/version provenance, matching residue IDs, scientific interpretation and permission for disclosure are reviewed. Future work: authenticated or public precomputed datasets, full-atom/sidechain rendering, real refolding comparison and independent metrics.
