"""
extract_assets.py - cut QuestForge's game assets out of the reference sheet.

    python scripts/extract_assets.py          (needs Pillow: pip install pillow)

Input : assets/reference/questforge_reference.webp  (843x562 showcase image)
Output: assets/tilesets/**, assets/sprites/**, assets/items/**, assets/ui/**,
        src/data/assetCatalog.js    (every extracted file + size + collision footprint)
        assets/reference/extracted_contact_sheet.png (visual check of every crop)

The reference is a flattened, softly anti-aliased showcase, not a spritesheet,
so nothing sits on an exact grid. Every region below was measured by hand on
the reference (x0, y0, x1, y1 in reference pixels). For each region:
  1. the crop's background colour is estimated from its border,
  2. background pixels connected to the border are made transparent (flood
     fill), so light pixels INSIDE a sprite (castle walls, white flowers) stay,
  3. a light halo left by anti-aliasing is trimmed and alpha is hardened,
  4. the result is trimmed to its content.
Props keep their native pixel size (the reference terrain swatches are ~16px,
so props are already at the 16px-tile scale). Characters are resized to the
16x24 frame size the reference README specifies.
"""
import json
import os
from collections import deque

from PIL import Image, ImageDraw

ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), '..'))
ASSETS = os.path.join(ROOT, 'assets')
REF = Image.open(os.path.join(ASSETS, 'reference', 'questforge_reference.webp')).convert('RGB')

# --------------------------------------------------------------------------
# Collision footprints, as fractions of the sprite: [x, y, w, h].
# The map builder paints these into each map's Collision layer.
SOLID = {
    'none': None,
    'tree': [0.30, 0.72, 0.40, 0.28],
    'house': [0.02, 0.42, 0.96, 0.58],
    'castle': [0.0, 0.30, 1.0, 0.70],
    'tower': [0.05, 0.40, 0.90, 0.60],
    'base': [0.08, 0.45, 0.84, 0.55],
    'full': [0.0, 0.0, 1.0, 1.0],
    'low': [0.10, 0.60, 0.80, 0.40],
}

# name: (region, category, solid)
PROPS = {
    # ---------------------------------------------------------- NATURE & TREES
    'tree_round':      ((147, 20, 178, 53), 'nature', 'tree'),
    'tree_big':        ((178, 20, 210, 58), 'nature', 'tree'),
    'tree_teal':       ((213, 20, 243, 51), 'nature', 'tree'),
    'tree_green':      ((243, 20, 273, 51), 'nature', 'tree'),
    'tree_cypress':    ((268, 32, 282, 68), 'nature', 'tree'),
    'tree_light':      ((147, 54, 178, 89), 'nature', 'tree'),
    'tree_autumn':     ((176, 61, 207, 97), 'nature', 'tree'),
    'tree_pine':       ((207, 52, 227, 83), 'nature', 'tree'),
    'tree_pine_teal':  ((226, 54, 245, 81), 'nature', 'tree'),
    'tree_pine_green': ((245, 54, 268, 83), 'nature', 'tree'),
    'tree_tall':       ((147, 88, 180, 133), 'nature', 'tree'),
    'tree_small':      ((204, 82, 225, 108), 'nature', 'tree'),
    'tree_dark':       ((147, 134, 178, 164), 'nature', 'tree'),
    'bush_teal':       ((226, 94, 241, 107), 'nature', 'low'),
    'bush_round':      ((266, 69, 281, 83), 'nature', 'low'),
    'shrub_dark':      ((178, 116, 195, 132), 'nature', 'low'),
    'stump':           ((180, 99, 198, 115), 'nature', 'low'),
    'stump_big':       ((176, 132, 195, 151), 'nature', 'low'),
    'rock_small':      ((212, 113, 228, 131), 'nature', 'low'),
    'rock_big':        ((199, 131, 221, 153), 'nature', 'low'),
    'rock_flat':       ((196, 155, 214, 171), 'nature', 'low'),
    'bush_green':      ((224, 134, 241, 151), 'nature', 'low'),
    'bush_leafy':      ((244, 134, 262, 151), 'nature', 'low'),
    'bush_berry':      ((262, 134, 281, 151), 'nature', 'low'),
    'hedge_low':       ((172, 155, 193, 171), 'nature', 'low'),
    'flower_red':      ((226, 82, 238, 95), 'nature', 'none'),
    'flower_orange':   ((238, 82, 251, 95), 'nature', 'none'),
    'flower_white':    ((252, 82, 265, 95), 'nature', 'none'),
    'flower_yellow':   ((266, 82, 281, 95), 'nature', 'none'),
    'flower_daisy':    ((232, 112, 246, 131), 'nature', 'none'),
    'flower_purple':   ((248, 112, 262, 131), 'nature', 'none'),
    'grass_tuft':      ((262, 116, 281, 131), 'nature', 'none'),
    'grass_tall':      ((246, 157, 262, 173), 'nature', 'none'),
    # ---------------------------------------------------------- TOWN BUILDINGS
    'house_red':       ((288, 21, 336, 71), 'town', 'house'),
    'house_blue':      ((338, 21, 372, 66), 'town', 'house'),
    'house_green':     ((392, 21, 456, 71), 'town', 'house'),
    'house_blue_small': ((288, 73, 324, 118), 'town', 'house'),
    'house_purple':    ((325, 69, 372, 118), 'town', 'house'),
    'shop':            ((309, 121, 376, 170), 'town', 'house'),
    'market_stall':    ((288, 122, 307, 141), 'town', 'base'),
    'tub':             ((288, 143, 307, 163), 'town', 'base'),
    'barrel':          ((290, 165, 307, 191), 'town', 'base'),
    'mailbox':         ((390, 145, 404, 169), 'town', 'low'),
    'lamp_yellow':     ((427, 144, 440, 181), 'town', 'low'),
    'lamp_blue':       ((440, 143, 456, 197), 'town', 'low'),
    'bench':           ((288, 177, 314, 197), 'town', 'low'),
    'fence':           ((347, 176, 371, 197), 'town', 'full'),
    'gravestone_a':    ((317, 171, 333, 197), 'town', 'base'),
    'gravestone_b':    ((333, 171, 348, 197), 'town', 'base'),
    'plant_pot':       ((394, 169, 409, 186), 'town', 'low'),
    'crate_green':     ((373, 172, 392, 197), 'town', 'base'),
    # ------------------------------------------------------------ CASTLE TILES
    'castle':          ((462, 20, 574, 125), 'castle', 'castle'),
    'tower':           ((462, 20, 482, 113), 'castle', 'tower'),
    'castle_stairs':   ((575, 56, 600, 96), 'castle', 'none'),
    'castle_torch':    ((543, 113, 554, 144), 'castle', 'low'),
    'castle_torch_b':  ((552, 129, 561, 161), 'castle', 'low'),
    'castle_banner':   ((561, 116, 574, 145), 'castle', 'none'),
    'castle_pillar':   ((580, 128, 593, 197), 'castle', 'low'),
    'castle_statue':   ((559, 152, 576, 186), 'castle', 'base'),
    'castle_gate':     ((524, 168, 551, 197), 'castle', 'base'),
    'throne_hall':     ((594, 131, 650, 197), 'castle', 'none'),
    # --------------------------------------------------------------- INTERIORS
    'bookshelf_wide':  ((692, 45, 731, 72), 'interiors', 'base'),
    'bookshelf':       ((744, 65, 769, 95), 'interiors', 'base'),
    'bookshelf_tall':  ((813, 73, 840, 102), 'interiors', 'base'),
    'cabinet':         ((813, 44, 840, 73), 'interiors', 'base'),
    'reading_table':   ((770, 64, 811, 93), 'interiors', 'base'),
    'desk_apple':      ((728, 142, 759, 161), 'interiors', 'base'),
    'desk_candle':     ((761, 142, 791, 161), 'interiors', 'base'),
    'table_yellow':    ((709, 119, 742, 136), 'interiors', 'base'),
    'armchair':        ((692, 136, 706, 159), 'interiors', 'base'),
    'potted_plant':    ((795, 122, 809, 139), 'interiors', 'low'),
    'potted_plant_b':  ((808, 122, 822, 139), 'interiors', 'low'),
    'rug_purple':      ((820, 123, 839, 141), 'interiors', 'none'),
    'rug_red':         ((817, 142, 840, 161), 'interiors', 'none'),
    'bed':             ((656, 22, 680, 44), 'interiors', 'base'),
    'wardrobe':        ((751, 164, 772, 197), 'interiors', 'base'),
    'book_stand':      ((766, 96, 779, 110), 'interiors', 'low'),
    # ----------------------------------------------------------- MAZE / GARDEN
    'fountain':        ((696, 326, 725, 359), 'maze', 'base'),
    'garden_statue':   ((658, 295, 680, 329), 'maze', 'base'),
    'garden_bench':    ((696, 359, 724, 376), 'maze', 'low'),
    'flower_bed':      ((657, 347, 677, 376), 'maze', 'low'),
    'flower_pot':      ((728, 322, 745, 343), 'maze', 'low'),
    'hedge_pink':      ((658, 261, 678, 281), 'maze', 'low'),
    'hedge_red':       ((694, 261, 712, 281), 'maze', 'low'),
    'hedge_block':     ((657, 214, 677, 239), 'maze', 'full'),
}

# Interaction objects + world-specific objects -> assets/sprites/objects
OBJECTS = {
    'door_wood':       ((488, 214, 511, 249), 'base'),
    'doorway_dark':    ((514, 214, 536, 249), 'base'),
    'chest_big':       ((558, 215, 582, 244), 'base'),
    'chest_open':      ((603, 215, 626, 244), 'base'),
    'stone_pedestal':  ((628, 214, 649, 244), 'base'),
    'chest_small':     ((489, 254, 506, 276), 'base'),
    'chest':           ((556, 247, 576, 271), 'base'),
    'chest_red':       ((579, 245, 603, 271), 'base'),
    'crystal_block':   ((626, 245, 650, 269), 'base'),
    'signpost':        ((489, 283, 507, 307), 'low'),
    'crystal_orb':     ((525, 277, 551, 308), 'base'),
    'stone_shrine':    ((554, 275, 577, 310), 'base'),
    'vault_door':      ((579, 274, 604, 309), 'base'),
    'barrel_wood':     ((606, 269, 625, 295), 'base'),
    'stone_altar':     ((628, 269, 649, 297), 'base'),
    'bubble_quest':    ((489, 310, 508, 331), 'none'),
    'bubble_help':     ((508, 310, 526, 331), 'none'),
    'gem_blue':        ((545, 311, 561, 329), 'none'),
    'notice_board':    ((491, 331, 514, 373), 'base'),
    'blue_rug':        ((539, 354, 570, 373), 'none'),
    'dungeon_door':    ((576, 337, 606, 373), 'base'),
    'tall_statue':     ((621, 318, 650, 376), 'base'),
    'flame':           ((606, 321, 617, 343), 'none'),
    # world-specific: village
    'well':            ((515, 401, 542, 437), 'base'),
    'bench_wood':      ((545, 397, 576, 418), 'low'),
    'lamp_post':       ((559, 416, 573, 455), 'low'),
    'sign_wood':       ((519, 439, 541, 464), 'low'),
    'planter':         ((519, 465, 541, 484), 'low'),
    'flower_basket':   ((536, 487, 553, 506), 'low'),
    # blacksmith
    'anvil':           ((583, 403, 602, 421), 'base'),
    'forge':           ((605, 397, 632, 436), 'base'),
    'cauldron':        ((583, 428, 601, 448), 'base'),
    'forge_small':     ((605, 436, 631, 470), 'base'),
    'hammer':          ((585, 448, 601, 467), 'none'),
    'iron_fence':      ((585, 471, 605, 491), 'full'),
    'red_carpet':      ((581, 488, 614, 547), 'none'),
    'banner_red':      ((615, 490, 627, 515), 'none'),
    # library
    'shelf_small':     ((638, 400, 656, 427), 'base'),
    'shelf_wide':      ((655, 400, 680, 425), 'base'),
    'shelf_tall':      ((638, 426, 656, 456), 'base'),
    'crystal_table':   ((658, 428, 677, 451), 'base'),
    'scroll_desk':     ((639, 455, 664, 479), 'base'),
    'crate':           ((639, 480, 661, 506), 'base'),
    'chair':           ((664, 480, 679, 506), 'low'),
    # castle
    'throne':          ((685, 400, 711, 436), 'base'),
    'torch':           ((713, 400, 723, 436), 'low'),
    'banner_royal':    ((723, 400, 737, 434), 'none'),
    'pillar':          ((702, 439, 714, 481), 'low'),
    'knight_statue':   ((687, 484, 701, 511), 'base'),
    'gargoyle':        ((711, 507, 734, 541), 'base'),
    'blue_crystal':    ((683, 508, 708, 541), 'base'),
}

ITEMS = {
    'key': (8, 392, 26, 413), 'potion_red': (30, 392, 48, 413), 'potion_blue': (52, 392, 70, 413),
    'potion_green': (74, 392, 92, 413), 'apple': (8, 414, 26, 433), 'coin_bronze': (31, 416, 47, 432),
    'coin_copper': (53, 416, 69, 432), 'coin_gold': (75, 415, 91, 433), 'gem_sapphire': (8, 435, 26, 455),
    'map': (30, 435, 49, 455), 'book_green': (52, 435, 71, 455), 'book_dark': (73, 435, 93, 456),
    'scroll': (30, 456, 49, 476), 'ingot_gold': (52, 456, 71, 476), 'ingot_iron': (74, 456, 93, 476),
    'ore': (30, 513, 49, 531), 'key_wood': (52, 476, 70, 496),
}

UI = {
    'dialog_frame': (105, 451, 204, 495),
    'dialog_arrow': (234, 427, 245, 438),
    'icon_quest': (265, 396, 284, 415),
    'icon_check': (266, 435, 285, 454),
}

# Characters ---------------------------------------------------------------
# Player sheets: 4 rows (down, left, right, up) x 4 frames. NOTE: the README
# panel says "12 frames (4 dir x 3)" but the drawn sheet has 4 frames per row;
# all 16 are kept.
PLAYER_ROWS = [(212, 245), (245, 278), (278, 311), (311, 344)]
PLAYER_SHEETS = {
    'player_male': [(20, 41), (40, 61), (60, 81), (80, 101)],
    'player_female': [(126, 147), (147, 168), (168, 189), (189, 209)],
}
# NPC sheet columns (labelled in the reference) x 3 rows (down, side, up)
NPC_COLS = {'mentor': 233, 'guide': 272, 'guard': 312, 'blacksmith': 348,
            'librarian': 386, 'keeper': 425, 'elder': 465}
NPC_ROWS = [(219, 254), (254, 288), (288, 323)]
# Villagers / kids sit closer together than a fixed window allows: each row is
# split at the empty columns between characters (see split_row).
VILLAGER_SPAN = (216, 352)
KID_SPAN = (368, 470)
VILLAGER_ROW = (322, 354)
FRAME_W, FRAME_H = 16, 24


def border_bg(img):
    w, h = img.size
    px = img.load()
    ps = [px[x, 0] for x in range(w)] + [px[x, h - 1] for x in range(w)] + \
         [px[0, y] for y in range(h)] + [px[w - 1, y] for y in range(h)]
    ps = sorted(ps, key=sum)
    return ps[len(ps) // 2]


def dist(a, b):
    return sum((x - y) ** 2 for x, y in zip(a, b)) ** 0.5


def cutout(box, tol=52, halo=88, margin=2, dark_bg=False, strict=False):
    """Crop `box` (+margin) and make its border-connected background transparent."""
    x0, y0, x1, y1 = box
    img = REF.crop((x0 - margin, y0 - margin, x1 + margin, y1 + margin))
    bg = border_bg(img)
    w, h = img.size
    px = img.load()
    out = img.convert('RGBA')
    opx = out.load()
    clear = [[False] * w for _ in range(h)]

    def bgish(p, t):
        if dark_bg:   # UI icons sit on the navy notification panel
            return dist(p, bg) <= t
        # the reference's panel background is always light and nearly grey,
        # so that test also works when the sprite touches the crop border
        panel = not strict and min(p) >= 175 and max(p) - min(p) <= 55
        return panel or (dist(p, bg) <= t and min(p) >= 140)

    q = deque()
    for x in range(w):
        q.extend([(x, 0), (x, h - 1)])
    for y in range(h):
        q.extend([(0, y), (w - 1, y)])
    while q:
        x, y = q.popleft()
        if clear[y][x] or not bgish(px[x, y], tol):
            continue
        clear[y][x] = True
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and not clear[ny][nx]:
                q.append((nx, ny))
    # one pass of halo trimming: light, bg-tinted pixels touching the cleared area
    trim = []
    for y in range(h):
        for x in range(w):
            if clear[y][x]:
                continue
            near = any(0 <= x + dx < w and 0 <= y + dy < h and clear[y + dy][x + dx]
                       for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))
            if near and bgish(px[x, y], halo):
                trim.append((x, y))
    for x, y in trim:
        clear[y][x] = True
    for y in range(h):
        for x in range(w):
            if clear[y][x]:
                opx[x, y] = (0, 0, 0, 0)
    # drop tiny islands (specks of a neighbouring sprite inside the margin)
    keep_largest_parts(out)
    bbox = out.getbbox()
    return out.crop(bbox) if bbox else out


def keep_largest_parts(img, min_ratio=0.15):
    w, h = img.size
    px = img.load()
    seen = [[False] * w for _ in range(h)]
    parts = []
    for y in range(h):
        for x in range(w):
            if px[x, y][3] and not seen[y][x]:
                q = deque([(x, y)])
                seen[y][x] = True
                pts = []
                while q:
                    cx, cy = q.popleft()
                    pts.append((cx, cy))
                    for nx in (cx - 1, cx, cx + 1):
                        for ny in (cy - 1, cy, cy + 1):
                            if 0 <= nx < w and 0 <= ny < h and px[nx, ny][3] and not seen[ny][nx]:
                                seen[ny][nx] = True
                                q.append((nx, ny))
                parts.append(pts)
    if not parts:
        return
    biggest = max(len(p) for p in parts)
    for p in parts:
        if len(p) < biggest * min_ratio:
            for x, y in p:
                px[x, y] = (0, 0, 0, 0)


def char_cutout(box):
    """Characters: strict background test (keeps white caps / hair), falling
    back to the normal test when a cell's background was not removed."""
    img = cutout(box, margin=0, strict=True, halo=60)
    alpha = img.getchannel('A')
    opaque = sum(1 for a in alpha.getdata() if a) / (img.width * img.height)
    return img if opaque < 0.8 else cutout(box, margin=0)


def split_row(span, row, min_w=9):
    """Split a row of characters at columns that contain only background."""
    full = REF.crop((span[0], row[0], span[1], row[1]))
    bg = border_bg(full)
    px = full.load()
    cols = [any(dist(px[x, y], bg) > 60 for y in range(full.height)) for x in range(full.width)]
    runs, start = [], None
    for x, on in enumerate(cols + [False]):
        if on and start is None:
            start = x
        elif not on and start is not None:
            # keep only complete, single characters: drop runs that touch the
            # span edge (cut off) or are too wide (two characters touching)
            if min_w <= x - start <= 22 and start > 0 and x < full.width:
                runs.append((span[0] + start, span[0] + x))
            start = None
    return runs


def to_frame(sprite):
    """Fit a character crop into a 16x24 frame (bottom-centred)."""
    w, h = sprite.size
    s = min(FRAME_W / w, FRAME_H / h)
    nw, nh = max(1, round(w * s)), max(1, round(h * s))
    # BOX = area average: the right filter for shrinking; alpha is then
    # hardened so the result stays crisp under nearest-neighbour rendering.
    small = sprite.resize((nw, nh), Image.BOX)
    spx = small.load()
    for y in range(nh):
        for x in range(nw):
            r, g, b, a = spx[x, y]
            spx[x, y] = (r, g, b, 255) if a >= 110 else (0, 0, 0, 0)
    frame = Image.new('RGBA', (FRAME_W, FRAME_H), (0, 0, 0, 0))
    frame.paste(small, ((FRAME_W - nw) // 2, FRAME_H - nh), small)
    return frame


def sheet(frames, cols):
    rows = (len(frames) + cols - 1) // cols
    out = Image.new('RGBA', (cols * FRAME_W, rows * FRAME_H), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        out.paste(f, ((i % cols) * FRAME_W, (i // cols) * FRAME_H), f)
    return out


# Terrain tiles --------------------------------------------------------------
# Swatch grid of the TERRAIN TILES panel: column/row origins of each ~15px swatch.
SW_X = [5, 21, 38, 55, 72, 88, 104, 121]
SW_Y = [16, 33, 49, 65, 81]


def swatch(cx, cy, size=13):
    """16x16 tile from the clean interior of a swatch centred at (cx, cy)."""
    h = size // 2
    patch = REF.crop((cx - h, cy - h, cx - h + size, cy - h + size))
    return patch.resize((16, 16), Image.NEAREST).convert('RGBA')


def sw(c, r):
    return swatch(SW_X[c] + 8, SW_Y[r] + 8)


# name -> (tile image, Tiled properties)
TERRAIN = [
    ('grass', sw(0, 0), {}),
    ('grass_light', sw(1, 0), {}),
    ('grass_dark', sw(2, 0), {}),
    ('grass_b', sw(3, 0), {}),
    ('sand', sw(4, 0), {'terrain': 'road'}),
    ('dirt', sw(5, 0), {'terrain': 'hills'}),
    ('dirt_dark', sw(6, 0), {'terrain': 'hills'}),
    ('grass_c', sw(7, 0), {}),
    ('grass_d', sw(0, 1), {}),
    ('grass_forest', sw(1, 1), {'terrain': 'forest'}),
    ('stone', sw(3, 1), {'terrain': 'road'}),
    ('stone_b', sw(4, 1), {'terrain': 'road'}),
    ('stone_dark', sw(5, 1), {}),
    ('stone_light', sw(6, 1), {}),
    ('water_deep', sw(7, 1), {'collides': True}),
    ('water', swatch(28, 72, 11), {'collides': True}),
    ('water_b', swatch(96, 89), {'collides': True}),
    ('marsh', swatch(111, 181), {'terrain': 'marsh'}),
    ('bridge', swatch(129, 89), {'terrain': 'road'}),
    ('flowerbed', sw(0, 3), {}),
    ('floor_purple', sw(6, 3), {}),
    ('stone_grey', sw(7, 3), {}),
    ('hedge', swatch(751, 226, 10), {'collides': True}),
    ('floor_wood', swatch(672, 58, 13), {}),
    ('floor_wood_b', swatch(680, 52, 13), {}),
    ('floor_stone', swatch(665, 86, 11), {}),
    ('floor_grey', swatch(682, 82, 13), {}),
    ('wall_stone', sw(5, 1), {'collides': True}),          # dark stone, used as walls
    ('carpet_red', swatch(616, 182, 9), {}),
    ('wall_purple', sw(6, 3), {'collides': True}),          # dark purple stone, archive walls
    ('collision', None, {'collides': True}),
]


def build_terrain():
    cols = 8
    rows = (len(TERRAIN) + cols - 1) // cols
    img = Image.new('RGBA', (cols * 16, rows * 16), (0, 0, 0, 0))
    for i, (name, tile, _) in enumerate(TERRAIN):
        if tile is None:   # the editor-only collision marker tile
            tile = Image.new('RGBA', (16, 16), (230, 40, 60, 110))
        img.paste(tile, ((i % cols) * 16, (i // cols) * 16))
    out_dir = os.path.join(ASSETS, 'tilesets', 'terrain')
    os.makedirs(out_dir, exist_ok=True)
    img.save(os.path.join(out_dir, 'terrain.png'))
    tiles = [{'id': i, 'name': n, **p} for i, (n, _, p) in enumerate(TERRAIN)]
    # Tiled tileset (.tsx) so the maps can be opened and edited in Tiled.
    lines = ['<?xml version="1.0" encoding="UTF-8"?>',
             f'<tileset version="1.10" tiledversion="1.10.2" name="terrain" tilewidth="16" tileheight="16" '
             f'tilecount="{len(TERRAIN)}" columns="{cols}">',
             f' <image source="terrain.png" width="{cols * 16}" height="{rows * 16}"/>']
    for t in tiles:
        lines.append(f' <tile id="{t["id"]}">')
        lines.append('  <properties>')
        lines.append(f'   <property name="name" value="{t["name"]}"/>')
        if t.get('collides'):
            lines.append('   <property name="collides" type="bool" value="true"/>')
        if t.get('terrain'):
            lines.append(f'   <property name="terrain" value="{t["terrain"]}"/>')
        lines.append('  </properties>')
        lines.append(' </tile>')
    lines.append('</tileset>')
    with open(os.path.join(out_dir, 'terrain.tsx'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines) + '\n')
    return {'key': 'tiles.terrain', 'url': 'tilesets/terrain/terrain.png', 'columns': cols,
            'tileWidth': 16, 'tileHeight': 16, 'tiles': tiles}


def save(img, rel):
    path = os.path.join(ASSETS, *rel.split('/'))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path)
    return rel


def main():
    catalog = {'source': 'reference/questforge_reference.webp', 'terrain': build_terrain(),
               'props': {}, 'objects': {}, 'items': {}, 'ui': {}, 'characters': {}}
    contact = []

    for name, (box, cat, solid) in PROPS.items():
        img = cutout(box)
        url = save(img, f'tilesets/{cat}/{name}.png')
        catalog['props'][name] = {'key': f'prop.{name}', 'url': url, 'category': cat,
                                  'w': img.width, 'h': img.height, 'solid': SOLID[solid]}
        contact.append((name, img))

    for name, (box, solid) in OBJECTS.items():
        img = cutout(box)
        url = save(img, f'sprites/objects/{name}.png')
        catalog['objects'][name] = {'key': f'obj.{name}', 'url': url, 'w': img.width, 'h': img.height,
                                    'solid': SOLID[solid]}
        contact.append((name, img))

    for name, box in ITEMS.items():
        img = cutout(box)
        url = save(img, f'items/{name}.png')
        catalog['items'][name] = {'key': f'item.{name}', 'url': url, 'w': img.width, 'h': img.height}
        contact.append((name, img))

    for name, box in UI.items():
        # UI frames are rectangular: keep the full crop (no background removal)
        # except the icons and the arrow.
        img = cutout(box, dark_bg=name.startswith('icon')) if name.startswith(('icon', 'dialog_arrow')) else REF.crop(box).convert('RGBA')
        url = save(img, f'ui/{name}.png')
        catalog['ui'][name] = {'key': f'ui.{name}', 'url': url, 'w': img.width, 'h': img.height}
        contact.append((name, img))

    # Player: 4x4 frames
    for name, cols in PLAYER_SHEETS.items():
        frames = [to_frame(char_cutout((x0, y0, x1, y1)))
                  for (y0, y1) in PLAYER_ROWS for (x0, x1) in cols]
        img = sheet(frames, 4)
        url = save(img, f'sprites/player/{name}.png')
        catalog['characters'][name] = {'key': name.replace('_', '.'), 'url': url, 'frameWidth': FRAME_W,
                                       'frameHeight': FRAME_H, 'columns': 4,
                                       'rows': ['down', 'left', 'right', 'up']}
        contact.append((name, img))

    # Named NPCs: 3 frames (down, side, up)
    for name, cx in NPC_COLS.items():
        frames = [to_frame(char_cutout((cx - 17, y0, cx + 17, y1))) for (y0, y1) in NPC_ROWS]
        img = sheet(frames, 3)
        url = save(img, f'sprites/npcs/{name}.png')
        catalog['characters'][f'npc_{name}'] = {'key': f'npc.{name}', 'url': url, 'frameWidth': FRAME_W,
                                                'frameHeight': FRAME_H, 'columns': 3,
                                                'rows': ['down', 'side', 'up']}
        contact.append((name, img))

    # Villagers and kids: one frame each (front-facing)
    for name, span in (('villagers', VILLAGER_SPAN), ('kids', KID_SPAN)):
        frames = [to_frame(cutout((x0, VILLAGER_ROW[0], x1, VILLAGER_ROW[1]), margin=0)) for x0, x1 in split_row(span, VILLAGER_ROW)]
        img = sheet(frames, len(frames))
        url = save(img, f'sprites/npcs/{name}.png')
        catalog['characters'][name] = {'key': f'npc.{name}', 'url': url, 'frameWidth': FRAME_W,
                                       'frameHeight': FRAME_H, 'columns': len(frames), 'rows': ['down']}
        contact.append((name, img))

    # Generated module: imported by src/config/assets.js (browser) and by
    # scripts/build-maps.mjs (Node), so both read the same sizes/footprints.
    with open(os.path.join(ROOT, 'src', 'data', 'assetCatalog.js'), 'w', encoding='utf-8') as f:
        f.write('// GENERATED by scripts/extract_assets.py - do not edit by hand.\n'
                '// Every asset cut from assets/reference/questforge_reference.webp:\n'
                '// url (relative to assets/), pixel size and collision footprint\n'
                '// (solid = [x, y, w, h] as fractions of the sprite, null = walkable).\n'
                'export const ASSET_CATALOG = ')
        json.dump(catalog, f, indent=1)
        f.write(';\n')
    contact_sheet(contact)
    print(f"terrain tiles: {len(TERRAIN)}  props: {len(PROPS)}  objects: {len(OBJECTS)}  "
          f"items: {len(ITEMS)}  ui: {len(UI)}  characters: {len(catalog['characters'])}")


def contact_sheet(entries, scale=3, cols=10):
    cell_w, cell_h = 56 * scale // 2, 70 * scale // 2
    terrain = Image.open(os.path.join(ASSETS, 'tilesets', 'terrain', 'terrain.png'))
    t_big = terrain.resize((terrain.width * scale, terrain.height * scale), Image.NEAREST)
    rows = (len(entries) + cols - 1) // cols
    out = Image.new('RGBA', (max(cols * cell_w, t_big.width), t_big.height + 10 + rows * cell_h), (60, 66, 80, 255))
    out.paste(t_big, (0, 0), t_big)
    d = ImageDraw.Draw(out)
    for i, (name, img) in enumerate(entries):
        cx, cy = (i % cols) * cell_w, t_big.height + 10 + (i // cols) * cell_h
        s = min(scale, (cell_w - 4) / img.width, (cell_h - 14) / img.height)
        big = img.resize((max(1, int(img.width * s)), max(1, int(img.height * s))), Image.NEAREST)
        out.paste(big, (cx + 2, cy + 2), big)
        d.text((cx + 2, cy + cell_h - 12), name[:18], fill=(255, 255, 255))
    out.save(os.path.join(ASSETS, 'reference', 'extracted_contact_sheet.png'))


if __name__ == '__main__':
    main()
