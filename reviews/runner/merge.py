from pathlib import Path
import json
dst=Path('review-result')
p=dst/'measurements.json'
data=json.loads(p.read_text())
states={r['file']:r for r in data['states']}
for f in sorted(dst.glob('supplement-*.json')):
    d=json.loads(f.read_text())
    for row in d['states']:states[row['file']]=row
    data['events'].extend(d['events'])
    data['errors'].extend(d['errors'])
    f.unlink()
data['states']=list(states.values())
# Sheet generation consolidates per-segment data from this file as in the original run.
(dst/'measurements-all.json').write_text(json.dumps(data))
