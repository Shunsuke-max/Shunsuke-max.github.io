"""Synthetic fixture only: checks converter mechanics, not protein design."""
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
import numpy as np

def pdb_model(shift):
    return "".join(f"ATOM  {i:5d}  CA  {aa:3s} A{i:4d}    {x+shift:8.3f}{0.:8.3f}{0.:8.3f}{1.:6.2f}{10.:6.2f}           C  \n" for i,aa,x in [(1,"ALA",0.),(2,"GLY",3.8)])

class ExportTest(unittest.TestCase):
    def test_convert_and_reject_mismatch(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)
            (p/"final.pdb").write_text(pdb_model(0)+"END\n")
            (p/"trajectory.pdb").write_text("MODEL        1\n"+pdb_model(2)+"ENDMDL\nMODEL        2\n"+pdb_model(0)+"ENDMDL\nEND\n")
            (p/"seq.fa").write_text(">native\nAG\n>T=0.1, sample=1, score=0.5\nAG\n")
            np.savez(p/"probs.npz",probs=np.full((1,2,21),1/21),S=np.array([[0,5]]),mask=np.ones((1,2)))
            command=[sys.executable,"tools/export_design_run.py","--final",str(p/"final.pdb"),"--trajectory",str(p/"trajectory.pdb"),"--fasta",str(p/"seq.fa"),"--probs",str(p/"probs.npz"),"--kind","noisy","--rfd3-version","TEST","--mpnn-version","TEST","--note","Synthetic test only","--output",str(p/"run.json")]
            subprocess.run(command,check=True,capture_output=True)
            result=json.loads((p/"run.json").read_text())
            self.assertEqual(result["residue_ids"],["A:1","A:2"])
            self.assertEqual(result["frames"][0]["ca"][0],[2.,0.,0.])
            self.assertEqual(result["candidates"][0]["sequence"],"AG")
            self.assertEqual(len(result["provenance"]["sha256"]["final"]),64)
            (p/"seq.fa").write_text(">native\nAG\n>T=0.1, sample=1, score=0.5\nGA\n")
            self.assertNotEqual(subprocess.run(command,capture_output=True).returncode,0)

if __name__=="__main__":
    unittest.main()
