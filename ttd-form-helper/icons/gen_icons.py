"""Generates TTD Form Helper app icons (rounded-square gradient badge with a
flat stepped-gopuram silhouette + a small check badge) at all required sizes.
Run once; output PNGs are committed, this script is not shipped."""
import math
from PIL import Image, ImageDraw

SS = 4  # supersample factor
MASTER = 128 * SS


def rounded_rect_mask(size, radius):
    m = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(m)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return m


def lerp(a, b, t):
    return a + (b - a) * t


def gradient_bg(size, c_top, c_bottom):
    img = Image.new("RGB", (size, size))
    px = img.load()
    for y in range(size):
        t = y / (size - 1)
        r = int(lerp(c_top[0], c_bottom[0], t))
        g = int(lerp(c_top[1], c_bottom[1], t))
        b = int(lerp(c_top[2], c_bottom[2], t))
        for x in range(size):
            px[x, y] = (r, g, b)
    return img


def gopuram_polygons(cx, base_y, scale):
    """Return list of polygons (bottom-to-top tiers) + apex triangle + finial circle,
    all in master-pixel coords. scale ~= MASTER/128."""
    tiers = []
    bottom_w = 78 * scale
    y = base_y
    vs = 0.87  # vertical compression so the apex/finial stays on-canvas
    gap = 3.2 * scale * vs
    widths_top_ratio = 0.84
    step_in_ratio = 0.90
    heights = [24 * scale * vs, 19 * scale * vs, 15.5 * scale * vs, 12 * scale * vs]
    w = bottom_w
    for h in heights:
        top_w = w * widths_top_ratio
        top_y = y - h
        poly = [
            (cx - w / 2, y),
            (cx + w / 2, y),
            (cx + top_w / 2, top_y),
            (cx - top_w / 2, top_y),
        ]
        tiers.append(poly)
        w = top_w * step_in_ratio
        y = top_y - gap
    # apex block + triangle + finial
    block_w = w
    block_h = 7 * scale * vs
    block_top = y - block_h
    block = [
        (cx - block_w / 2, y), (cx + block_w / 2, y),
        (cx + block_w / 2, block_top), (cx - block_w / 2, block_top),
    ]
    tri_h = 11 * scale * vs
    tri_top = block_top - tri_h
    tri = [
        (cx - block_w / 2, block_top), (cx + block_w / 2, block_top),
        (cx, tri_top),
    ]
    finial_r = 3.7 * scale
    finial_cy = tri_top - finial_r - 1.3 * scale
    finial = (cx - finial_r, finial_cy - finial_r, cx + finial_r, finial_cy + finial_r)
    return tiers, block, tri, finial


def base_plinth(cx, base_y, scale):
    w = 92 * scale
    h = 7 * scale
    return [
        (cx - w / 2, base_y + h), (cx + w / 2, base_y + h),
        (cx + w / 2 - 4 * scale, base_y), (cx - w / 2 + 4 * scale, base_y),
    ]


def build_master():
    size = MASTER
    scale = size / 128
    radius = int(30 * scale)

    # warm marigold -> temple-vermillion gradient
    bg = gradient_bg(size, (255, 176, 59), (196, 47, 59))
    mask = rounded_rect_mask(size, radius)

    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.paste(bg, (0, 0), mask)

    draw = ImageDraw.Draw(canvas)
    cx = size / 2
    base_y = size * 0.83

    plinth = base_plinth(cx, base_y, scale)
    draw.polygon(plinth, fill=(255, 255, 255, 235))

    tiers, block, tri, finial = gopuram_polygons(cx, base_y - 2 * scale, scale)
    for poly in tiers:
        draw.polygon(poly, fill=(255, 255, 255, 255))
    draw.polygon(block, fill=(255, 255, 255, 255))
    draw.polygon(tri, fill=(255, 255, 255, 255))
    draw.ellipse(finial, fill=(255, 255, 255, 255))

    # soft inner highlight ring for depth
    ring = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    rd = ImageDraw.Draw(ring)
    rd.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, outline=(255, 255, 255, 60), width=int(2 * scale))
    canvas = Image.alpha_composite(canvas, ring)

    # check badge (bottom-right), signals "free / auto-filled"
    badge_r = 24 * scale
    bx = size - badge_r * 1.05
    by = size - badge_r * 1.05
    badge = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    bd = ImageDraw.Draw(badge)
    bd.ellipse([bx - badge_r, by - badge_r, bx + badge_r, by + badge_r], fill=(30, 158, 92, 255), outline=(255, 255, 255, 255), width=int(3.4 * scale))
    # checkmark
    pts = [
        (bx - badge_r * 0.48, by + badge_r * 0.02),
        (bx - badge_r * 0.12, by + badge_r * 0.38),
        (bx + badge_r * 0.52, by - badge_r * 0.36),
    ]
    bd.line(pts, fill=(255, 255, 255, 255), width=int(4.4 * scale), joint="curve")
    canvas = Image.alpha_composite(canvas, badge)

    return canvas


def main():
    master = build_master()
    for name, size in [
        ("icon-128.png", 128),
        ("chrome_store_icon_128_clean.png", 128),
        ("icon-48.png", 48),
        ("icon-32.png", 32),
        ("icon-16.png", 16),
        ("toolbar_icon_16_clean.png", 16),
    ]:
        im = master.resize((size, size), Image.LANCZOS)
        im.save(name)
        print("wrote", name)


if __name__ == "__main__":
    main()
