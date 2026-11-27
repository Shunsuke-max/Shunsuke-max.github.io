// Pure validation for an explicitly supplied, public-safe, single-chain design run.
const ALPHABET='ACDEFGHIKLMNPQRSTVWYX';
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const require=(ok,msg)=>{if(!ok)throw new Error(msg);};
const coords=(a,n)=>Array.isArray(a)&&a.length===n&&a.every(v=>Array.isArray(v)&&v.length===3&&v.every(x=>finite(x)&&Math.abs(x)<10000));
export function validateRun(d){
 require(d&&d.schema_version===1&&d.kind==='model-output','Unsupported design bundle');
 require(d.units==='angstrom','Coordinates must be in angstroms');
 const p=d.provenance;
 require(p&&['rfd3','proteinmpnn'].every(k=>p[k]&&typeof p[k].version==='string'&&p[k].version.trim().length>0&&p[k].version.length<=160),'Model versions required');
 require(typeof p.note==='string'&&p.note.length<=400&&p.note.trim(),'Provenance note required');
 require(['noisy','denoised'].includes(d.trajectory_kind),'Trajectory kind required');
 const ids=d.residue_ids,n=ids?.length;
 require(Array.isArray(ids)&&n>=1&&n<=256&&ids.every(x=>typeof x==='string'&&x.length>0&&x.length<=30)&&new Set(ids).size===n,'Invalid residue mapping');
 require(coords(d.final_ca,n),'Invalid final C-alpha coordinates');
 require(Array.isArray(d.frames)&&d.frames.length>=2&&d.frames.length<=256,'Invalid trajectory frame count');
 for(let i=0;i<d.frames.length;i++){const f=d.frames[i];require(f&&Number.isInteger(f.index)&&f.index>=0&&(i===0||f.index>d.frames[i-1].index)&&coords(f.ca,n),'Invalid frame order or coordinates');}
 require(Array.isArray(d.candidates)&&d.candidates.length>=1&&d.candidates.length<=32,'Invalid sequence candidates');
 for(const c of d.candidates){
   require(c&&typeof c.sequence==='string'&&c.sequence.length===n&&/^[ACDEFGHIKLMNPQRSTVWY]+$/.test(c.sequence),'Sequence length or alphabet mismatch');
   if(c.probs!=null)require(Array.isArray(c.probs)&&c.probs.length===n&&c.probs.every(row=>Array.isArray(row)&&row.length===ALPHABET.length&&row.every(x=>finite(x)&&x>=0&&x<=1)&&Math.abs(row.reduce((a,b)=>a+b,0)-1)<.005),'Invalid sampling probabilities');
   if(c.score!=null)require(finite(c.score)&&c.score>=0,'Invalid ProteinMPNN score');
 }
 if(d.prediction!=null){const v=d.prediction;require(Number.isInteger(v.candidate)&&v.candidate>=0&&v.candidate<d.candidates.length&&coords(v.ca,n)&&finite(v.rmsd)&&v.rmsd>=0&&typeof v.method==='string'&&v.method.trim()&&v.method.length<=100,'Invalid prediction');}
 return d;
}
export function selectFrame(run,fraction){const i=Math.min(run.frames.length-1,Math.max(0,Math.round(fraction*(run.frames.length-1))));return run.frames[i];}
export function topProbabilities(candidate,index){const row=candidate.probs?.[index];return row?row.map((p,i)=>({aa:ALPHABET[i],p})).sort((a,b)=>b.p-a.p).slice(0,3):[];}
