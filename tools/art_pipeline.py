#!/usr/bin/env python3
"""Process imagegen output, maintain the 51-asset ledger, and verify delivery.

Requires Pillow and numpy. No game code is read for rendering or modified.
Examples (run from prototype):
  python tools/art_pipeline.py --init
  python tools/art_pipeline.py --process INPUT.png --asset cars/family_base.png
  python tools/art_pipeline.py --sheets --check
"""
import argparse
import hashlib
import json
import re
import shutil
import sys
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageOps

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
TYPES = ("family", "suv", "ev", "perf", "lux", "classic")
STAFF = ("manager_m", "manager_f", "tech_m", "tech_f", "sales_m", "sales_f", "finance_m", "finance_f")
ENDINGS = ("win_clean", "win_grey", "bankrupt", "sealed", "foreclosed")
SPECS = {}
for variant in ("base", "flood", "crash"):
    for typ in TYPES:
        SPECS[f"cars/{typ}_{variant}.png"] = (1200, 540, True)
for name in ("scratch", "dirt"):
    SPECS[f"cars/decal_{name}.png"] = (1200, 540, True)
SPECS["cars/decal_tire.png"] = (512, 512, True)
for typ in TYPES:
    SPECS[f"garage/top_{typ}.png"] = (200, 400, True)
SPECS["garage/garage_stall.png"] = (200, 400, False)
for level in range(1, 6):
    SPECS[f"store/store_l{level}.png"] = (1200, 900, True)
for place in ("city", "suburb", "autocity"):
    SPECS[f"store/bg_{place}.jpg"] = (1440, 720, False)
for name in STAFF:
    SPECS[f"staff/staff_{name}.png"] = (512, 512, False)
for name in ENDINGS:
    SPECS[f"endings/ending_{name}.jpg"] = (1600, 900, False)
SPECS["ui/keyart.jpg"] = (1080, 1920, False)
SPECS["ui/logo_mark.png"] = (1024, 1024, True)


def ledger():
    path = ASSETS / "manifest.json"
    data = json.loads(path.read_text()) if path.exists() else {"version": 1, "items": {}}
    for key in SPECS:
        data["items"].setdefault(key, {"status": "todo"})
    return data


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")


def initialize():
    ASSETS.mkdir(exist_ok=True)
    for key in SPECS:
        (ASSETS / key).parent.mkdir(parents=True, exist_ok=True)
    (ASSETS / "_ref").mkdir(exist_ok=True)
    (ASSETS / "_source").mkdir(exist_ok=True)
    write_json(ASSETS / "manifest.json", ledger())
    progress = ASSETS / "PROGRESS.md"
    if not progress.exists():
        progress.write_text("# 美术素材施工记录\n\n任务：ART_TASK_CODEX.md；共 51 张。生成：内置 imagegen；后期：Pillow / numpy。\n\n明确像素尺寸优先于括号中的近似比例；所有源图、提示词、验证数据保存在 assets 内。\n\n")
    hashes = {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest()
              for p in sorted(ROOT.rglob("*")) if p.is_file() and
              (p.parts[-2] in ("js", "css") or p == ROOT / "index.html")}
    baseline = ASSETS / "_ref/code_baseline.json"
    if not baseline.exists():
        write_json(baseline, hashes)


def bbox(im):
    alpha = np.asarray(im.getchannel("A"))
    ys, xs = np.where(alpha > 32)
    if not len(xs):
        raise ValueError("empty transparent subject")
    return (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)


def key_background(im, color, tolerance=30):
    a = np.asarray(im.convert("RGBA")).astype(np.float32).copy()
    c = np.array(color, dtype=np.float32)
    dist = np.max(np.abs(a[:, :, :3] - c), axis=2)
    alpha = np.clip((dist - tolerance) / 20, 0, 1)
    # 1px edge feather; restore strong foreground rather than blur its interior.
    soft = np.asarray(Image.fromarray((alpha * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(.55))) / 255.
    alpha = np.minimum(alpha, soft)
    af = alpha[:, :, None]
    rgb = np.clip((a[:, :, :3] - (1 - af) * c) / np.maximum(af, .05), 0, 255)
    if color == (0, 255, 0):
        # Suppress green fringe at partially transparent chroma-key edges.
        edge = alpha < .99
        rgb[:, :, 1][edge] = np.minimum(rgb[:, :, 1][edge], np.maximum(rgb[:, :, 0], rgb[:, :, 2])[edge])
    a[:, :, :3] = rgb
    a[:, :, 3] = np.minimum(a[:, :, 3], alpha * 255)
    a[a[:, :, 3] < 3] = 0
    return Image.fromarray(a.astype(np.uint8))


def fit_transparent(im, size, bottom=False, target_box=None):
    im = im.crop(bbox(im))
    if target_box:
        x0, y0, x1, y1 = target_box
        im = im.resize((x1 - x0, y1 - y0), Image.Resampling.LANCZOS)
        pos = (x0, y0)
    else:
        margin = .04 if bottom else .03
        available = (round(size[0] * (1 - margin * 2)), round(size[1] * (1 - margin * 2)))
        im.thumbnail(available, Image.Resampling.LANCZOS)
        pos = ((size[0] - im.width) // 2,
               round(size[1] * .96) - im.height if bottom else (size[1] - im.height) // 2)
    canvas = Image.new("RGBA", size)
    canvas.alpha_composite(im, pos)
    return canvas


def clean_cutout(im, multiple=False):
    """Remove isolated generation specks without painting or replacing pixels."""
    alpha = im.getchannel("A")
    small = alpha.copy()
    small.thumbnail((512, 512), Image.Resampling.BOX)
    mask = (np.asarray(small) > 12).astype(np.uint8) * 255
    mask = np.asarray(Image.fromarray(mask).filter(ImageFilter.MaxFilter(5))) > 0
    seen = np.zeros(mask.shape, dtype=bool)
    largest = []
    components = []
    height, width = mask.shape
    for y, x in zip(*np.where(mask)):
        if seen[y, x]:
            continue
        queue = deque([(int(y), int(x))])
        seen[y, x] = True
        component = []
        while queue:
            cy, cx = queue.popleft()
            component.append((cy, cx))
            for ny, nx in ((cy - 1, cx), (cy + 1, cx), (cy, cx - 1), (cy, cx + 1)):
                if 0 <= ny < height and 0 <= nx < width and mask[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    queue.append((ny, nx))
        if len(component) > len(largest):
            largest = component
        components.append(component)
    keep = np.zeros(mask.shape, dtype=np.uint8)
    for component in components if multiple else [largest]:
        if multiple and len(component) < len(largest) * .02:
            continue
        for y, x in component:
            keep[y, x] = 255
    keep = Image.fromarray(keep).resize(im.size, Image.Resampling.NEAREST).filter(ImageFilter.MaxFilter(9))
    a = np.asarray(im).copy()
    a[:, :, 3][np.asarray(keep) == 0] = 0
    a[a[:, :, 3] < 3] = 0
    return Image.fromarray(a)


def wheel_centers(im):
    """Silhouette wheel anchors in bottom 12%; excludes faint contact shadow."""
    a = np.asarray(im.getchannel("A"))
    ys, xs = np.where(a > 180)
    if not len(xs):
        return []
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    band = (a[round(y0 + (y1 - y0) * .89):y1] > 180).sum(axis=0)
    mid = (x0 + x1) // 2
    centers = []
    for lo, hi in ((x0, mid), (mid, x1)):
        weights = band[lo:hi].astype(float)
        centers.append(float(np.average(np.arange(lo, hi), weights=weights)) if weights.sum() else float((lo + hi) / 2))
    return [round(v, 2) for v in centers]


def wheel_baselines(im):
    a = np.asarray(im.getchannel("A"))
    out = []
    for cx in wheel_centers(im):
        ys, _ = np.where(a[:, max(0, round(cx) - 32):min(im.width, round(cx) + 33)] > 180)
        out.append(int(ys.max()) if len(ys) else 0)
    return out


def align_car(im, base):
    """Match wheel anchors with a restrained whole-image affine adjustment."""
    target = bbox(base)
    im = fit_transparent(im, base.size, target_box=target)
    dstw = wheel_centers(base)
    # Fix the outer silhouette and each wheel independently, so wheel alignment
    # does not shorten the whole vehicle. This is geometric registration only.
    for _ in range(5):
        srcw = wheel_centers(im)
        if max(abs(x - y) for x, y in zip(srcw, dstw)) < .65:
            break
        out_x = [0, target[0], round(dstw[0]), round(dstw[1]), target[2], base.width]
        in_x = [0, target[0], srcw[0], srcw[1], target[2], base.width]
        mesh = []
        for i in range(len(out_x) - 1):
            if out_x[i + 1] > out_x[i]:
                mesh.append(((out_x[i], 0, out_x[i + 1], base.height),
                             (in_x[i], 0, in_x[i], base.height,
                              in_x[i + 1], base.height, in_x[i + 1], 0)))
        im = im.transform(base.size, Image.Transform.MESH, mesh, Image.Resampling.BICUBIC)
    src_y = sum(wheel_baselines(im)) / 2
    dst_y = sum(wheel_baselines(base)) / 2
    if abs(src_y - dst_y) > .5:
        scale = (dst_y - target[1]) / (src_y - target[1])
        offset = target[1] * (1 - scale)
        im = im.transform(base.size, Image.Transform.AFFINE,
                          (1, 0, 0, 0, 1 / scale, -offset / scale), Image.Resampling.BICUBIC)
    return im


def process(source, asset, rounds, note, key=None, flip=False):
    if asset not in SPECS:
        raise ValueError("not one of the 51 requested paths: " + asset)
    w, h, alpha = SPECS[asset]
    im = Image.open(source).convert("RGBA")
    original = ASSETS / "_source" / (asset.replace("/", "__").rsplit(".", 1)[0] + f"__r{rounds}.png")
    original.parent.mkdir(exist_ok=True)
    if Path(source).resolve() != original.resolve():
        shutil.copy2(source, original)
    if flip:
        im = ImageOps.mirror(im)
    if asset.endswith("decal_scratch.png"):
        a = np.asarray(im).copy()
        lum = np.asarray(im.convert("L"))
        a[:, :, :3] = 255
        a[:, :, 3] = np.minimum(a[:, :, 3], lum)
        im = Image.fromarray(a)
    elif asset.endswith("decal_dirt.png"):
        a = np.asarray(im).copy()
        lum = np.asarray(im.convert("L"))
        a[:, :, 3] = np.minimum(a[:, :, 3], 255 - lum)
        im = Image.fromarray(a)
    elif alpha and im.getchannel("A").getextrema()[0] == 255:
        colors = {"gray": (43, 43, 43), "green": (0, 255, 0), "black": (0, 0, 0), "lightgray": (211, 211, 211)}
        color = colors.get(key or ("green" if asset.startswith("store/") else "gray"))
        im = key_background(im, color)
    if alpha:
        if "decal_scratch" not in asset and "decal_dirt" not in asset:
            im = clean_cutout(im, multiple=asset == "ui/logo_mark.png")
        if asset.endswith("decal_dirt.png"):
            im = im.crop(bbox(im))
            im = im.resize((round(w * .94), round(h * .30)), Image.Resampling.LANCZOS)
            canvas = Image.new("RGBA", (w, h))
            canvas.alpha_composite(im, ((w - im.width) // 2, round(h * .97) - im.height))
            im = canvas
        elif asset.startswith("cars/") and re.search(r"_(flood|crash)\.png$", asset):
            base = Image.open(ASSETS / re.sub(r"_(flood|crash)\.png$", "_base.png", asset)).convert("RGBA")
            im = align_car(im, base)
        else:
            im = fit_transparent(im, (w, h), bottom=asset.startswith("store/store_"))
    else:
        im = ImageOps.fit(im.convert("RGB"), (w, h), method=Image.Resampling.LANCZOS)
        if asset.startswith("staff/"):
            a = np.asarray(im)
            ys, _ = np.where(np.max(a[:100], axis=2) < 100)
            if len(ys) and ys.min() < 12:
                # Layout-only padding: move the generated portrait down while
                # preserving the head size; retain the generated gray backdrop.
                dy = int(16 - ys.min())
                canvas = Image.new("RGB", (w, h))
                canvas.paste(im.crop((0, 0, w, 1)).resize((w, dy)), (0, 0))
                canvas.paste(im, (0, dy))
                im = canvas
        if asset == "garage/garage_stall.png":
            a = np.asarray(im).copy().astype(float)
            # Equal mirrored 8px edge bands guarantee a continuous tile seam.
            edge = (a[:, :8] + a[:, -8:][:, ::-1]) / 2
            a[:, :8] = edge
            a[:, -8:] = edge[:, ::-1]
            im = Image.fromarray(a.astype(np.uint8))
    dest = ASSETS / asset
    dest.parent.mkdir(exist_ok=True, parents=True)
    if dest.suffix == ".jpg":
        im.convert("RGB").save(dest, quality=88, subsampling=0, optimize=True)
    else:
        im.save(dest, optimize=True)
    data = ledger()
    entry = {"status": "done", "w": w, "h": h, "alpha": alpha, "rounds": rounds,
             "note": note, "source": str(original.relative_to(ASSETS)),
             "sha256": hashlib.sha256(dest.read_bytes()).hexdigest()}
    if asset.startswith("cars/") and re.search(r"_(base|flood|crash)\.png$", asset):
        entry["bbox"] = bbox(im)
        entry["wheel_centers"] = wheel_centers(im)
        entry["wheel_baselines"] = wheel_baselines(im)
    data["items"][asset] = entry
    write_json(ASSETS / "manifest.json", data)
    with (ASSETS / "PROGRESS.md").open("a") as f:
        f.write(f"- [x] {asset} — {rounds} 轮；{note or '目检通过，按规格后期处理。'}\n")
    if asset == "cars/family_base.png":
        shutil.copy2(dest, ASSETS / "_ref/style_render.png")
    if asset == "staff/staff_manager_m.png":
        shutil.copy2(dest, ASSETS / "_ref/style_avatar.png")
    print(json.dumps({"saved": asset, **entry}, ensure_ascii=False))


def sheets():
    ref = ASSETS / "_ref"
    cars = Image.new("RGB", (1200, 6 * 220), "#20262d")
    d = ImageDraw.Draw(cars)
    for row, typ in enumerate(TYPES):
        for col, variant in enumerate(("base", "flood", "crash")):
            path = ASSETS / f"cars/{typ}_{variant}.png"
            if path.exists():
                im = Image.open(path).convert("RGBA")
                im.thumbnail((392, 185), Image.Resampling.LANCZOS)
                cars.paste(im, (col * 400 + (400 - im.width) // 2, row * 220 + 25), im)
            d.text((col * 400 + 12, row * 220 + 5), f"{typ} / {variant}", fill="white")
    cars.save(ref / "contact_cars.png")
    staff = Image.new("RGB", (1024, 512), "#e9e9e9")
    for n, name in enumerate(STAFF):
        p = ASSETS / f"staff/staff_{name}.png"
        if p.exists():
            staff.paste(Image.open(p).convert("RGB").resize((256, 256), Image.Resampling.LANCZOS), ((n % 4) * 256, (n // 4) * 256))
    staff.save(ref / "staff_contact_sheet.png")
    stores = Image.new("RGB", (1440, 5 * 280), "#151c28")
    ds = ImageDraw.Draw(stores)
    for row in range(5):
        for col, place in enumerate(("city", "suburb", "autocity")):
            bp, sp = ASSETS / f"store/bg_{place}.jpg", ASSETS / f"store/store_l{row + 1}.png"
            if bp.exists() and sp.exists():
                tile = Image.open(bp).convert("RGBA").resize((480, 240), Image.Resampling.LANCZOS)
                building = Image.open(sp).convert("RGBA")
                building.thumbnail((350, 240), Image.Resampling.LANCZOS)
                # All store bottoms share the same foreground baseline.
                tile.alpha_composite(building, ((480 - building.width) // 2, 240 - building.height))
                stores.paste(tile.convert("RGB"), (col * 480, row * 280 + 30))
            ds.text((col * 480 + 10, row * 280 + 8), f"level {row + 1} / {place}", fill="white")
    stores.save(ref / "contact_stores.png")
    stall = ASSETS / "garage/garage_stall.png"
    if stall.exists():
        im = Image.open(stall).convert("RGB")
        out = Image.new("RGB", (600, 400))
        for i in range(3):
            out.paste(im, (200 * i, 0))
        out.save(ref / "garage_stall_triptych.png")
    logo = ASSETS / "ui/logo_mark.png"
    if logo.exists():
        im = Image.open(logo).convert("RGBA").resize((64, 64), Image.Resampling.LANCZOS)
        im.save(ref / "logo_64.png")
    print("Contact sheets saved to assets/_ref")


def check():
    data = ledger()
    results = []
    for asset, (w, h, alpha) in SPECS.items():
        errors = []
        p = ASSETS / asset
        extra = {}
        if data["items"][asset]["status"] != "done":
            errors.append("manifest status != done")
        if not p.exists():
            errors.append("missing")
        else:
            with Image.open(p) as im:
                if im.size != (w, h):
                    errors.append(f"size {im.size} != {(w, h)}")
                if alpha:
                    if "A" not in im.getbands():
                        errors.append("missing alpha channel")
                    else:
                        a = np.asarray(im.getchannel("A"))
                        if any(a[y, x] != 0 for y, x in ((0, 0), (0, w - 1), (h - 1, 0), (h - 1, w - 1))):
                            errors.append("corners not transparent")
                        if not np.any(a > (32 if "decal_" in asset else 200)):
                            errors.append("no opaque subject")
                        if asset.startswith("cars/") and re.search(r"_(flood|crash)\.png$", asset):
                            bp = ASSETS / re.sub(r"_(flood|crash)\.png$", "_base.png", asset)
                            if bp.exists():
                                base = Image.open(bp).convert("RGBA")
                                b0, b1 = bbox(base), bbox(im)
                                delta = [abs((b1[i + 2] - b1[i]) / (b0[i + 2] - b0[i]) - 1) for i in (0, 1)]
                                wheel_delta = [abs(x - y) for x, y in zip(wheel_centers(base), wheel_centers(im))]
                                baseline_delta = [abs(x - y) for x, y in zip(wheel_baselines(base), wheel_baselines(im))]
                                extra = {"bbox_change": delta, "wheel_error_px": wheel_delta, "wheel_baseline_error_px": baseline_delta}
                                if max(delta) > .03:
                                    errors.append("subject bbox differs >3%")
                                if max(wheel_delta) > 2:
                                    errors.append("wheel centers differ >2px")
                                if max(baseline_delta) > 2:
                                    errors.append("wheel baselines differ >2px")
                        if asset.startswith("store/store_"):
                            bottom = bbox(im)[3]
                            extra["bottom"] = bottom
                            if abs(bottom - round(h * .96)) > 2:
                                errors.append("store baseline not at 96%")
                        if asset.endswith("decal_tire.png") and a[h // 2, w // 2] != 0:
                            errors.append("tire center not transparent")
                        if asset.endswith("decal_scratch.png"):
                            rgb = np.asarray(im.convert("RGB"))
                            if not np.all(rgb[a > 32] == 255):
                                errors.append("scratch color not white")
                elif "A" in im.getbands():
                    errors.append("opaque asset has alpha")
                if p.suffix == ".jpg" and im.format != "JPEG":
                    errors.append("wrong JPEG format")
        result = {"path": asset, "ok": not errors, "errors": errors, **extra}
        results.append(result)
        print(("PASS " if not errors else "FAIL ") + asset + (" — " + "; ".join(errors) if errors else "") + (" " + json.dumps(extra) if extra else ""))
    code_errors = []
    baseline = ASSETS / "_ref/code_baseline.json"
    if baseline.exists():
        for rel, digest in json.loads(baseline.read_text()).items():
            p = ROOT / rel
            if not p.exists() or hashlib.sha256(p.read_bytes()).hexdigest() != digest:
                code_errors.append(rel)
    print("Game code unchanged:", not code_errors)
    report = {"total": len(results), "passed": sum(r["ok"] for r in results), "results": results, "code_changed": code_errors}
    write_json(ASSETS / "_ref/check_results.json", report)
    print(f"RESULT {report['passed']}/{len(results)}")
    return not code_errors and report["passed"] == len(results)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--init", action="store_true")
    p.add_argument("--process", type=Path)
    p.add_argument("--asset")
    p.add_argument("--rounds", type=int, default=1)
    p.add_argument("--note", default="")
    p.add_argument("--key", choices=("gray", "green", "black", "lightgray"))
    p.add_argument("--flip", action="store_true")
    p.add_argument("--sheets", action="store_true")
    p.add_argument("--check", action="store_true")
    args = p.parse_args()
    if args.init:
        initialize()
    if args.process:
        if not args.asset:
            p.error("--process requires --asset")
        process(args.process, args.asset, args.rounds, args.note, args.key, args.flip)
    if args.sheets:
        sheets()
    if args.check:
        sys.exit(0 if check() else 1)


if __name__ == "__main__":
    main()
