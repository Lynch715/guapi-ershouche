"""把 browser-check 的三案四尺寸原始截图拼成可复核联系表。"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/'_screens'
FONT=next(p for p in [Path('/System/Library/Fonts/Supplemental/Arial Unicode.ttf'),Path('/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc')] if p.exists())
def font(n):return ImageFont.truetype(str(FONT),n)
columns=[('a','A · 插画首图'),('b','B · 代码拼车'),('c','C · 招牌首图')]
sizes=[(390,844),(430,932),(1280,800),(1920,1080)]
col=590;left=140;gap=20;top=88;rows=[900,988,425,390]
canvas=Image.new('RGB',(left+3*(col+gap)+gap,top+sum(rows)+30),'#e9e5dc');d=ImageDraw.Draw(canvas)
for i,(_,title) in enumerate(columns):d.text((left+i*(col+gap)+25,22),title,font=font(30),fill='#20392f')
y=top
for (w,h),rowh in zip(sizes,rows):
 d.text((12,y+12),str(w)+'×',font=font(22),fill='#20392f');d.text((12,y+44),str(h),font=font(22),fill='#20392f')
 for i,(variant,_) in enumerate(columns):
  im=Image.open(OUT/f't04-keyart-{variant}-{w}.png').convert('RGB');im.thumbnail((col,rowh-20),Image.Resampling.LANCZOS)
  x=left+i*(col+gap)+(col-im.width)//2;canvas.paste(im,(x,y))
 y+=rowh
canvas.save(OUT/'t04-keyart-compare.jpg',quality=90,optimize=True)
print('已生成 _screens/t04-keyart-compare.jpg',canvas.size)
