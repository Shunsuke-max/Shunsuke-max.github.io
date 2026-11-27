# Curiosity Lab — Development guide

## Purpose
A molecular journey and an interactive exhibition of published research and software. Keep the scientific data distinct from illustrative scenery. Do not imply that generated conformations are a time trajectory or that predictions prove biological function.

## Protein design journey
The homepage uses the natural crambin crystal structure (PDB 1CRN) as a public reference. It visualizes a deterministic coordinate interpolation, a C-alpha distance graph, a reference sequence and an illustrative side-chain choice. The validation stage overlays a deliberately displaced version of the reference trace and lets visitors compare closer and farther examples; neither is a real predicted structure. None is an actual RFdiffusion3 trajectory, ProteinMPNN result, or structure prediction. The educational visualization is the primary goal; actual model outputs are not required. If PDB retrieval fails, display only schematic coordinates and no invented sequence. WebGL has a Canvas fallback. Replace the reference with genuine public model outputs only when provenance and disclosure are established.

## Architecture
- `assets/js/design.js` / `assets/css/design.css`: five-stage scroll-driven design experience.
- `index.html`: semantic markup, existing SVG scenery, exhibit content.
- `assets/css/base.css`: shared color, type, spacing, navigation and focus tokens.
- `assets/css/journey.css`: sticky story, molecular gallery and responsive controls.
- `assets/css/exhibition.css`: project-specific layouts.
- `assets/js/journey.js`: scene state, PDB fetching, camera and viewer lifecycle.
- `assets/js/depth-scene.js`: optional Three.js procedural bloodstream and cell interior, driven by scene progress; SVG fallback remains available.
- `assets/js/exhibition.js`: image tabs, contact data, design pipeline and scroll effects.

The static GitHub Pages deployment remains compatible with the existing root/main configuration. No credentials are needed. 3Dmol.js and public PDB structures are fetched externally; the exhibition uses public repository images.

## Local verification
Requires Node 22+ for the recommended environment.
```sh
node --test tests/static.test.mjs
npm install --no-save playwright@1.51.1
npx playwright install chromium
python3 -m http.server 4173
# In a separate terminal:
node tests/browser.mjs
```

CI uses Ubuntu 24.04 to match the pinned Playwright release. Browser test covers desktop/mobile navigation, the design journey, four exhibits and the intentionally unavailable CDN fallback. It does not validate GPU/WebGL or real PDB rendering. Manual release checks: real 3Dmol load, camera, residue selection, fullscreen, Safari/iOS, screenshots, loading performance and scientific text.

## Next
1. Visually verify the new procedural Three.js vessel/cell scenery and refine the camera path. It is schematic, not a physical simulation.
2. Create scene-specific motion direction; preserve reduced-motion behavior.
3. Use only genuinely public coordinates for scientific exhibits, with provenance.
4. Measure loading and rendering performance before setting numerical targets.
5. Review the visual result on desktop and mobile before merge.

## Molecular rendering refinement
The design scene renders a stylized C-alpha ribbon with widths based on the reference PDB HELIX/SHEET annotations, a residue's actual reference atom positions, and an identical ribbon mesh style for a deliberately perturbed comparison. It does not reproduce an atom-accurate secondary-structure cartoon, an inference trajectory, or a predicted structure. Small ambient points in the diffusion scene are decorative; larger points represent a schematic C-alpha trace. The camera and opacity interpolate with scroll, and animation is throttled to roughly 30 frames/s. CI captures motion-enabled intermediate states and mobile WebGL screens as well as the reduced-motion scenes. The 2D fallback preserves the explanatory flow without claiming exact secondary-structure rendering.

## Graph and inverse-folding refinement
A shared residue selection persists between the geometry and sequence chapters. The graph is a simplified C-alpha distance graph (distance <8 Å, excluding sequence separations of two or less), not the ProteinMPNN internal graph. Pulses toward the selected node illustrate message passing, not measured or computed activations; reduced motion shows static markers. The known reference sequence is revealed in a fixed illustrative non-sequential order; it is not a generated sequence or actual decoding order. Candidate A/V/S and fixed example probabilities are illustrative and independent of the selected residue. The 3D sidechain uses schematic positions and topology, not calculated rotamers; the reference sequence is not mutated. The fallback preserves the controls even without PDB or WebGL.
