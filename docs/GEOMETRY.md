# Chapter 03 / GEOMETRY — scientific foundation (Gate 01)

Scope: independent numerical module only. The homepage renderer, existing contact graph and navigation are unchanged. Do not publish this as a finished feature.

- Source: RCSB PDB 1CRN, chain A, 46 residues. Use original C-alpha coordinates in Å, not normalized render coordinates.
- D[i][j]: Euclidean distance, symmetric, zero diagonal. No rounding before ranking.
- A[i][j]: directed 0/1 adjacency; row i chooses k other residues. Exclude self, include sequence neighbors. Stable ties use zero-based input order. Valid k=1..n-1; default UI proposal k=6.
- Initial focus Cys4 (index 3), comparison Cys32 (index 31). Display real PDB IDs. Check the expected six nearest residues against the RCSB file in CI.
- One geometry object and one graph object per k, shared by future 3D, matrix, and sequence components. Changing camera or selected pair does not recompute geometry. No fallback data may be labeled as measured Å.
- The educational graph is not the exact ProteinMPNN neighbor tensor: the model implementation includes self and model-specific masking/top-k. No learned messages or predictions are computed here.

## Verification
`node --test tests/static.test.mjs` includes unit tests for the geometry module.
The existing WebGL CI job downloads 1CRN and verifies all distances against a separate squared-distance oracle, every k=1..45, and the initial pair. See tests/geometry-reference.mjs.

## Next gate (not implemented)
Static composition using the current main ribbon and lighting: fixed focus Cys4, selected Cys32, six neighbor edges, real 46×46 matrix, one-dimensional sequence track. Validate desktop/mobile screenshots before adding picking, controls or message animations. Later: shared selection state; per-pair backbone/virtual-Cβ distances and RBF; handoff to chapter 04.

References: https://www.rcsb.org/structure/1CRN ; https://files.rcsb.org/download/1CRN.pdb ; https://github.com/dauparas/ProteinMPNN/blob/main/protein_mpnn_utils.py
