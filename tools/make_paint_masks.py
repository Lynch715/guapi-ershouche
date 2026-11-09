"""
生成「车漆遮罩」：标出车图里哪些像素是车漆（会被游戏染色），
车窗、车灯、轮胎轮毂、阴影都排除在外。
用法：python3 tools/make_paint_masks.py   （在 prototype/ 目录下运行）
输出：assets_original/cars/{车型}_{版本}_paint.png、assets_original/garage/top_{车型}_paint.png（灰度图，白=染色）
"""
import numpy as np
from PIL import Image, ImageFilter
from pathlib import Path

MODELS = ['family', 'suv', 'ev', 'perf', 'lux', 'classic']
ROOT = Path(__file__).resolve().parent.parent / 'assets_original'


def smooth(x, a, b):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def wheel_boxes(rgb, alpha):
    """在车身下半部找两个轮子：取深色像素（轮胎）最多的两段 x 区间"""
    h, w = alpha.shape
    lum = rgb.mean(axis=2)
    lower = slice(int(h * 0.45), h)
    dark = (lum[lower] < 70) & (alpha[lower] > 200)
    col = dark.sum(axis=0).astype(float)
    col = np.convolve(col, np.ones(15) / 15, mode='same')
    thr = col.max() * 0.35
    on = col > thr
    segs, start = [], None
    for x, v in enumerate(on):
        if v and start is None: start = x
        if not v and start is not None: segs.append((start, x)); start = None
    if start is not None: segs.append((start, w))
    segs = sorted(segs, key=lambda s: -(s[1] - s[0]))[:2]
    boxes = []
    for x0, x1 in segs:
        rows = np.where(dark[:, x0:x1].any(axis=1))[0]
        if not len(rows): continue
        y0, y1 = rows.min() + lower.start, rows.max() + lower.start
        size = max(x1 - x0, y1 - y0)
        cx, cy = (x0 + x1) / 2, y1 - size / 2
        boxes.append((cx, cy, size / 2 * 1.08))
    return boxes


def make_mask(path, wheels=True):
    im = Image.open(path).convert('RGBA')
    a = np.asarray(im).astype(float)
    rgb, alpha = a[..., :3], a[..., 3]
    lum = rgb.mean(axis=2)
    mx, mn = rgb.max(axis=2), rgb.min(axis=2)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1), 0)
    m = smooth(lum, 95, 175) * (1 - smooth(sat, 0.18, 0.4)) * smooth(alpha, 180, 250)
    if wheels:
        h, w = lum.shape
        yy, xx = np.mgrid[0:h, 0:w]
        for cx, cy, r in wheel_boxes(rgb, alpha):
            d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
            m *= smooth(d, r * 0.98, r * 1.08)
    out = Image.fromarray((m * 255).astype(np.uint8), 'L').filter(ImageFilter.GaussianBlur(1.2))
    return out


if __name__ == '__main__':
    for model in MODELS:
        for var in ['base', 'flood', 'crash']:
            src = ROOT / 'cars' / f'{model}_{var}.png'
            make_mask(src).save(ROOT / 'cars' / f'{model}_{var}_paint.png', optimize=True)
        make_mask(ROOT / 'garage' / f'top_{model}.png', wheels=False).save(ROOT / 'garage' / f'top_{model}_paint.png', optimize=True)
        print('ok', model)
