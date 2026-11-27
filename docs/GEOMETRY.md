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

## Gate 02 first visual pass
Fixed Cys4 focus, Cys32 comparison; six directed neighborhood edges only. Reuse studio ribbon at 22% opacity; background nodes subdued, pair and focus ivory; deterministic camera searches 72 yaw angles. Pair distances and neighbor labels come from the shared numerical module. No false Å values if the PDB/module is unavailable. Capture desktop and mobile graph frames in CI. No matrix/picking/rotation controls yet. Review actual screenshots before moving on.

### Gate 02 first render review
CI 46019533729 passed. Desktop and 390px mobile screenshots show readable pair metrics and six local edges, but ribbon competes with nodes, Cys4 label sits over a neighbor, mobile molecule is too small. Revision: 14% ribbon opacity, slightly smaller focus and neighbors, stronger pair hierarchy, projected label placement and leader lines, focus ring, closer mobile camera. Camera scoring now also considers angular separation between edges. Re-run screenshot QA; do not claim visual gate complete until second render is inspected.

## Interactive explorer, gates 03–07
Shared geometry, directed adjacency and selection state. Desktop matrix, mobile expandable matrix, focus/pair selects, keyboard arrows, sequence track, 3D click and drag, k 1–45; non-neighbor pair retained as a dashed measurement. Pair inspector uses N/CA/C/O/virtual CB and a 5×5 Å distance table, with 16 RBF values for selected cell. Message dots move from neighbors to focus as a schematic only, static under reduced motion. Chapter 04 retains focus. No actual inference. Transition is a short panel reveal and a fixed-coordinate representation change, not a full atom-to-graph morph. CI plus screenshot review required before completion.

Second integration pass: self-pair zero distance without duplicate 3D label; matrix cell and arrow keys, camera drag and feature dialog tests; mobile/short-height layout, visible label exclusion zones, crossfade from atoms to graph for forward chapter transition. 3D picking uses projected screen distance (not atom mesh raycasts); touch vertical scrolling stays available. The transition is schematic and doesn't model inference.
