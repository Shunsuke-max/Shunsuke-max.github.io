from pathlib import Path
import json, shutil, subprocess, sys
try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    subprocess.run([sys.executable,'-m','pip','install','Pillow'],check=True)
    from PIL import Image, ImageDraw, ImageFont
src=Path('review-raw')
dst=Path('review-result')
font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',15)
def sheet(name, entries, columns, tile):
    rows=(len(entries)+columns-1)//columns
    w,h=tile
    out=Image.new('RGB',(w*columns,(h+30)*rows),'#e7e7e7')
    d=ImageDraw.Draw(out)
    for j,(label,file) in enumerate(entries):
        x=j%columns*w;y=j//columns*(h+30)
        d.text((x+6,y+4),label,font=font,fill='#152027')
        with Image.open(src/(file+'.jpg')) as img:
            img.thumbnail((w,h),Image.Resampling.LANCZOS)
            out.paste(img,(x+(w-img.width)//2,y+26))
    out.save(dst/(name+'.jpg'),quality=86,optimize=True)
for group in ('design','scale'):
    for i in range(1,6):
        for view,tile in [('pc',(580,363)),('tablet',(345,460)),('phone',(234,507))]:
            entries=[(f'{view} | {mode} | {phase}',f'{group}_{i}_{view}_{mode}_{phase}') for mode in ('no-preference','reduce') for phase in ('start','mid','end')]
            sheet(f'{group}-{i}-{view}',entries,3,tile)
for view,tile in [('pc',(600,375)),('tablet',(345,460)),('phone',(234,507))]:
    sheet('works-'+view,[(s,'works_'+s+'_'+view) for s in ['foldlens','ensemble','part5','design']],2,tile)
for fault in ['webgl','pdb']:
    entries=[(f'{fault} | {g} {i}',f'fault_{fault}_{g}_{i}') for g,i in [('design',2),('design',3),('design',4),('scale',1),('scale',3),('scale',5)]]
    if all((src/(f+'.jpg')).exists() for _,f in entries):sheet('fault-'+fault,entries,2,(520,325))
for file in ['entry','seq-scroll-phone','different-phone','small-sequence','design_2_pc_reduce_end','design_4_phone_reduce_mid','scale_4_pc_reduce_mid','design_3_pc_reduce_mid','design_5_pc_reduce_mid']:
    if (src/(file+'.jpg')).exists():shutil.copy(src/(file+'.jpg'),dst/(file+'.jpg'))
