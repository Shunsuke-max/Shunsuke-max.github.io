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

## Gate 08 release QA
Run 46079779766 passed numerical, offline, desktop and mobile WebGL checks. Reviewed desktop composition, mobile graph, matrix overlay, and actual pair feature dialog. Desktop title/source status crowded the controls, and mobile matrix screenshot showed background lettering during opening. Release patch removes duplicate source status in the ready graph, caps controls with internal scrolling, makes matrix opaque with immediate visibility and raises it above the source disclosure. Adds Escape close, direct 3D/sequence selection and layout/opacity assertions. Recheck release commit and production deployment.

## PDB 8ZNL PD-L1 Binder Theme Migration
- Source upgraded from single-chain Crambin (1CRN, 46 residues) to RCSB PDB 8ZNL (1.77 Å co-crystal structure of a de novo designed 58-residue 3-helix miniprotein binder on Chain A bound to the 114-residue human PD-L1 IgV domain on Chain B).
- Bundled subset file: `assets/data/8znl-ab.pdb` (verbatim Chain A & Chain B ATOM records + headers + HELIX/SHEET records), verified byte-for-coordinate against the live RCSB `8ZNL.pdb` in `tests/geometry-reference.mjs`.
- Geometry explorer (`03 / GEOMETRY`) operates on the 58-residue binder (Chain A, residue IDs 1–58, `k = 1..57`).
- Default `k = 8` with focus `Arg8` (index 7) and comparison `Val46` (index 45): `5.66 Å` Cα distance, sequence separation `38`, rank `7 / 8` (`A7 · E9 · A11 · E5 · R6 · L10 · V46 · R4`), demonstrating a cross-helix tertiary contact between Helix 1 and Helix 3 that toggles out of the neighborhood when `k < 7`.
- Chapters 01, 02, and 05 also display the PD-L1 target backbone (Chain B) alongside the binder, and Chapter 02 computes real heavy-atom interchain polar contacts (`< 3.5 Å` N/O–N/O) directly from `8znl-ab.pdb`.
- Reference: https://www.rcsb.org/structure/8ZNL ; https://files.rcsb.org/download/8ZNL.pdb
