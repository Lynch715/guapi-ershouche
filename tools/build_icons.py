"""原创瓜皮车图标（两个方案）；Pillow 代码绘图，无外部图形依赖。"""
from pathlib import Path
from PIL import Image, ImageDraw
ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/'assets/icon';OUT.mkdir(parents=True,exist_ok=True)
SCREEN=ROOT/'_screens';SCREEN.mkdir(exist_ok=True)
def icon(option='A',maskable=False):
 n=1024;im=Image.new('RGB',(n,n));d=ImageDraw.Draw(im)
 for y in range(n):
  t=y/n;d.line((0,y,n,y),fill=(int(25-12*t),int(45-24*t),int(39-16*t)))
 # 明亮底圈与厚重车影，主形状落在图标中心安全区内。
 box=(128,128,896,896) if maskable else (40,40,984,984)
 d.ellipse(box,fill='#183d2d',outline='#e2b866',width=18)
 if option=='B':
  d.pieslice((150,240,874,930),0,180,fill='#98d76b');d.arc((150,240,874,930),0,180,fill='#24844b',width=100)
 body='#64c878' if option=='A' else '#e2b866'
 # 侧面车：厚车身、双轮、清晰车窗，不画字与细线。
 d.polygon([(160,570),(190,485),(310,460),(415,330),(655,330),(770,468),(854,490),(880,620),(157,620)],fill=body)
 if option=='A':
  for x in [240,365,495,625,755]:
   d.polygon([(x,470),(x+45,455),(x+78,620),(x+22,620)],fill='#1e7545')
 d.polygon([(354,454),(436,355),(510,355),(510,454)],fill='#142428')
 d.polygon([(545,355),(639,355),(724,454),(545,454)],fill='#142428')
 d.rounded_rectangle((180,540,850,596),radius=16,fill=body)
 d.rounded_rectangle((790,493,865,532),radius=12,fill='#f6db98')
 d.rounded_rectangle((160,506,197,546),radius=8,fill='#e2b866')
 for x in [315,725]:
  d.ellipse((x-94,560,x+94,748),fill='#101416');d.ellipse((x-50,604,x+50,704),fill='#e2b866')
 # 瓜皮帽：一大片弧形顶而非零碎装饰。
 if option=='A':
  d.arc((366,222,669,397),180,360,fill='#94e189',width=48)
  d.arc((366,222,669,397),180,360,fill='#247746',width=19)
 if maskable:
  # 整体缩至 80% 安全区，保持背景不透明铺满。
  bg=Image.new('RGB',(n,n),'#15291f');im=im.resize((800,800),Image.Resampling.LANCZOS);bg.paste(im,(112,112));im=bg
 return im
A=icon('A');B=icon('B')
for size,name in [(16,'favicon-16.png'),(32,'favicon-32.png'),(180,'apple-touch-icon.png'),(192,'icon-192.png'),(512,'icon-512.png')]: A.resize((size,size),Image.Resampling.LANCZOS).save(OUT/name)
A.save(OUT/'favicon.ico',sizes=[(16,16),(32,32),(48,48)])
icon('A',True).resize((512,512),Image.Resampling.LANCZOS).save(OUT/'icon-maskable-512.png')
# 实际像素大小对比：两行，列为 16 / 32 / 180 / 512。
compare=Image.new('RGB',(920,1140),'#e8e8e8');d=ImageDraw.Draw(compare)
for y,im,label in [(34,A,'A - melon car'),(600,B,'B - car on rind')]:
 d.text((16,y-24),label,fill='#111215');x=24
 for size in [16,32,180,512]:
  d.text((x,y),str(size),fill='#111215');compare.paste(im.resize((size,size),Image.Resampling.LANCZOS),(x,y+24));x+=size+32
compare.save(SCREEN/'t03-icon-compare.png')
A.resize((512,512),Image.Resampling.LANCZOS).save(SCREEN/'t03-icon-selected.png')
# 分享图由浏览器使用选中首图和相同 CSS 单独生成，避免重做图标时恢复旧首图。
print('已生成 8 类图标，选用 A；分享图请运行 node tools/build_share.js')
