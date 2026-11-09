"""构建 WebP；首次 --prepare 移动母版。--reuse 只用于中断后继续。
所有源图保持原样，遮罩无损，透明度逐像素验证；图标不参与。
"""
from pathlib import Path
from PIL import Image, ImageChops
from concurrent.futures import ThreadPoolExecutor
import shutil, json, argparse, hashlib
ROOT=Path(__file__).resolve().parent.parent
GROUPS=('cars','garage','store','staff','endings','ui')
def build(prepare=False,jobs=4,reuse=False):
 masters=ROOT/'assets_original';assets=ROOT/'assets'
 if prepare:
  for group in GROUPS:
   for source in sorted((assets/group).glob('*')):
    if source.suffix.lower() not in ('.png','.jpg','.jpeg'):continue
    target=masters/group/source.name;target.parent.mkdir(parents=True,exist_ok=True)
    if target.exists():raise RuntimeError('母版已存在，不覆盖：'+str(target.relative_to(ROOT)))
    shutil.move(str(source),str(target))
 sources=[p for group in GROUPS for p in sorted((masters/group).glob('*')) if p.suffix.lower() in ('.png','.jpg','.jpeg')]
 if not sources:raise RuntimeError('没有母版，请先用 --prepare 分离原图')
 def convert(source):
  group=source.parent.name;target=assets/group/(source.stem+'.webp');target.parent.mkdir(parents=True,exist_ok=True)
  im=Image.open(source);mask=source.stem.endswith('_paint');settings={'method':6,'alpha_quality':100,'exact':True}
  if mask:settings.update(lossless=True)
  elif source.stem.startswith('decal_'):settings.update(quality=80)
  elif group in ('cars','garage') or source.stem.startswith('store_l'):settings.update(quality=85)
  else:settings.update(quality=82)
  existing=False
  if reuse and target.exists():
   try:
    with Image.open(target) as old:old.load();existing=old.size==im.size
   except (OSError,ValueError):pass
  if not existing:
   temporary=target.with_suffix('.tmp.webp');im.save(temporary,'WEBP',**settings);temporary.replace(target)
  with Image.open(target) as decoded:
   if mask and ImageChops.difference(im.convert('RGB'),decoded.convert('RGB')).getbbox():raise RuntimeError('遮罩像素发生变化：'+source.name)
   alpha_ok='A' not in im.getbands() or ImageChops.difference(im.getchannel('A'),decoded.convert('RGBA').getchannel('A')).getbbox() is None
  if not alpha_ok:raise RuntimeError('alpha 发生变化：'+source.name)
  row={'file':str(target.relative_to(ROOT)),'before':source.stat().st_size,'after':target.stat().st_size,'lossless':mask,'alphaExact':alpha_ok,'originalSha256':hashlib.sha256(source.read_bytes()).hexdigest()}
  print(f'{group}/{source.name}: {row["before"]:,} → {row["after"]:,} bytes'+(' 无损遮罩' if mask else ''),flush=True);return row
 with ThreadPoolExecutor(max_workers=max(1,jobs)) as pool:rows=list(pool.map(convert,sources))
 before=sum(r['before'] for r in rows);after=sum(r['after'] for r in rows)
 print(f'TOTAL: {len(rows)} files, {before:,} → {after:,} bytes ({(1-after/before)*100:.1f}% smaller)',flush=True)
 evidence=ROOT/'_screens';evidence.mkdir(exist_ok=True);(evidence/'t03-webp-build.json').write_text(json.dumps({'before':before,'after':after,'files':rows},indent=2))
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--prepare',action='store_true');parser.add_argument('--jobs',type=int,default=4);parser.add_argument('--reuse',action='store_true');args=parser.parse_args();build(args.prepare,args.jobs,args.reuse)
