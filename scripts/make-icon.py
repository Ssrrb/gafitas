"""Makes Gafitas's icons from Resources/AppIcon/gafitas.png (a square picture, edge to edge):

    python3 -I scripts/make-icon.py

- Resources/AppIcon.icns: the picture in the macOS icon grid (an 824 px rounded square on 1024, with its shadow), at
  every size from 16 px, for Finder, the Dock and macOS before 26.
- Resources/AppIcon/AppIcon.icon: the picture as the one layer of an Icon Composer document, which build.sh compiles
  into Assets.car when Xcode's actool is there (macOS 26 draws a full-size icon only from that).
Needs Pillow and macOS's iconutil.
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile

from PIL import Image, ImageDraw, ImageFilter

root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "Resources")
source = Image.open(os.path.join(root, "AppIcon", "gafitas.png")).convert("RGB")
side = min(source.size)
source = source.crop(((source.width - side) // 2, (source.height - side) // 2,
                      (source.width + side) // 2, (source.height + side) // 2))

# The macOS icon grid: the body is 824 of 1024 px, 100 px in, corners of 185.4 px; a soft shadow below it.
body, inset, radius = 824, 100, 185.4
mask = Image.new("L", (1024, 1024), 0)
ImageDraw.Draw(mask).rounded_rectangle((inset, inset, inset + body - 1, inset + body - 1), radius=radius, fill=255)
shadow = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
shadow.putalpha(mask.point(lambda a: int(a * 0.3)).filter(ImageFilter.GaussianBlur(14)))
icon = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
icon.alpha_composite(shadow, (0, 10))
picture = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
picture.paste(source.resize((body, body), Image.LANCZOS), (inset, inset))
picture.putalpha(mask)
icon.alpha_composite(picture)

iconset = tempfile.mkdtemp(suffix=".iconset")
for points in (16, 32, 128, 256, 512):
    for scale in (1, 2):
        name = f"icon_{points}x{points}" + ("@2x" if scale == 2 else "") + ".png"
        icon.resize((points * scale,) * 2, Image.LANCZOS).save(os.path.join(iconset, name))
subprocess.run(["iconutil", "-c", "icns", iconset, "-o", os.path.join(root, "AppIcon.icns")], check=True)
shutil.rmtree(iconset)

document = os.path.join(root, "AppIcon", "AppIcon.icon")
shutil.rmtree(document, ignore_errors=True)
os.makedirs(os.path.join(document, "Assets"))
source.resize((1024, 1024), Image.LANCZOS).save(os.path.join(document, "Assets", "gafitas.png"))
# The fill behind the layer: the picture's own average color, for the corners macOS's mask leaves.
average = source.resize((1, 1), Image.BOX).getpixel((0, 0))
with open(os.path.join(document, "icon.json"), "w") as out:
    json.dump({
        "fill": {"solid": "srgb:" + ",".join(f"{c / 255:.5f}" for c in average) + ",1.00000"},
        "groups": [{"layers": [{"image-name": "gafitas.png", "name": "gafitas"}], "name": "Gafitas"}],
        "supported-platforms": {"squares": "shared"},
    }, out, indent=2)
print("AppIcon.icns and AppIcon.icon from gafitas.png", file=sys.stderr)
