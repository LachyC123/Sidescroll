"""Authoritative map of the 17 Legacy Fantasy collection items to their local files.

Built from a real inspection of the extracted ZIPs, not from storefront text.
Every path is relative to a pack's extracted root. Entries marked ``ase`` exist
only as Aseprite sources and are recovered by tools/aseprite.py.
"""

# zip stem -> (pack id, display name, inner root directory)
PACKS = {
    "Legacy-Fantasy - High Forest 2.0": (
        "high_forest", "High Forest", "Legacy-Fantasy - High Forest 2.3"),
    "Legacy Fantasy - Dusk Woods - 1.2": (
        "dusk_wood", "Dusk Woods", "Legacy Fantasy - Dusk Woods"),
    "Legacy Fantay - Lost Glades": (
        "lost_glades", "Lost Glades", "Legacy Fantay - Lost Glades"),
    "Legacy Fantasy - Forgotten Cemetery": (
        "cemetery", "Forgotten Cemetery", "Legacy Fantasy - Forgotten Cemetery"),
    "Legacy Fantasy - Kingdom Fortress - Update": (
        "fortress", "Kingdom Fortress", "Legacy Fantasy - Kingdom Fortress - Update"),
    "Legacy Fantasy - Castle Prison": (
        "prison", "Castle Prison", "Legacy Fantasy - Castle Prison"),
    "Legacy Fantasy - Sewer Canals": (
        "sewers", "Sewer Canals", "Legacy Fantasy - Sewer Canals"),
    "Legacy-Fantasy-VL.3 - Purple Bay": (
        "purple_bay", "Purple Bay", "Legacy-Fantasy-VL.3 - Purple Bay"),
    "Legacy-Fantasy-VL.3 - Muddy Swamp": (
        "swamp", "Muddy Swamp", "Legacy-Fantasy-VL.3 - Muddy Swamp"),
    "Legacy Fantasy - Lonely Mine": (
        "mine", "Lonely Mine", "Legacy Fantasy - Lonely Mine"),
    "Legacy Fantasy - Deep Cave": (
        "deep_cave", "Deep Cave", "Legacy Fantasy - Deep Cave"),
    "Legacy Fantasy - Deadwind Pass": (
        "deadwind", "Deadwind Pass", "Legacy Fantasy - Deadwind Pass"),
    "Legacy-Fantasy-VL.1 - Strange Temple 0.3": (
        "temple", "Strange Temple", "Legacy-Fantasy-VL.1 - Strange Temple 0.2"),
    "Legacy-Fantasy-VL.3 - Scarlet Monastery": (
        "monastery", "Scarlet Monastery", "Legacy-Fantasy-VL.3 - Scarlet Monastery"),
    "Legacy Fantasy - Blood Mansion": (
        "mansion", "Blood Mansion", "Legacy Fantasy - Blood Mansion"),
    "Legacy Enemy - Wild Boar": (
        "wild_boar", "Wild Boar", "Legacy Enemy - Wild Boar"),
    "Legacy Enemy - Boar Warrior": (
        "boar_warrior", "Boar Warrior", "Legacy Enemy - Boar Warrior"),
}

# ---------------------------------------------------------------- environments
# out name -> (pack id, source path, kind).  kind: tiles | props | bg<N> | fg
ENVIRONMENTS = {
    "high_forest": dict(
        tiles="Assets/Tiles.png",
        props=["Assets/Props-Rocks.png", "Assets/Tree-Assets.png",
               "Assets/Buildings.png", "Assets/Hive.png", "Assets/Interior-01.png"],
        bg=["Background/Background.png", "Trees/Background.png"],
        trees=["Trees/Green-Tree.png", "Trees/Yellow-Tree.png", "Trees/Golden-Tree.png",
               "Trees/Red-Tree.png", "Trees/Dark-Tree.png"],
    ),
    "dusk_wood": dict(
        tiles="Assets/Tiles.png",
        props=["Assets/Vegetation.png", "Assets/House_Props.png", "Assets/Dark_Tiles.png"],
        bg=["BackGround/Background_0.png", "BackGround/Background_1.png",
            "BackGround/Background_2.png", "BackGround/Background_3.png"],
    ),
    "lost_glades": dict(
        tiles="Assets/Tiles.png",
        props=["Assets/Tree.png"],
        bg=["Background/Background_00.png", "Background/Background_01.png",
            "Background/Background_02.png"],
    ),
    "cemetery": dict(
        tiles="Assets/Tiles.png",
        props=["Assets/Props.png"],
        bg=["Background/Sprite-0007.png"],
    ),
    "fortress": dict(
        tiles="Tiles/Assets.png",
        props=["Tiles/Props.png", "Tiles/Vegetation-export.png"],
        bg=["Background/Background.2-export.png", "Background/02.png"],
        ase={"city.png": "Tiles/city.aseprite"},
    ),
    "prison": dict(
        tiles="Assets/Tiles.png",
        props=["Assets/Props.png"],
        bg=["Assets/Background.png"],
    ),
    "sewers": dict(
        tiles="Assets/Tiles.png",
        props=["Assets/Props.png", "Assets/Wall.png", "Assets/Slime.png"],
        bg=["Background/Background.png", "Background/Background-wall.png"],
    ),
    "purple_bay": dict(
        tiles="Assets/tiles.png",
        props=[],
        bg=["Background/Background-1.png", "Background/Background-2.png",
            "Background/Background-3.png", "Background/Background-4.png"],
    ),
    "swamp": dict(
        tiles="Assets/Tiles.png",
        props=[],
        bg=[],
        # Muddy Swamp ships no background PNG and its tree is Aseprite-only.
        ase={"tree.png": "Assets/Tree.aseprite"},
    ),
    "mine": dict(
        tiles="Assets/Tiles.png",
        props=[],
        bg=["Background/Background.png"],
        fg="Background/ForeGround.png",
    ),
    "deep_cave": dict(
        tiles="Assets/Tiles.png",
        props=["Assets/Props.png"],
        bg=["Background/Background-1.png", "Background/Background-2.png",
            "Background/Background-3.png"],
    ),
    "deadwind": dict(
        tiles="Assets/Tiles.png",
        props=["Assets/Props.png"],
        bg=["Background/01.png", "Background/02.png", "Background/03.png"],
        ase={"bones.png": "Assets/Bones.aseprite"},
    ),
    "temple": dict(
        tiles="Assets/Tiles.png",
        props=["Assets/Props.png"],
        bg=["Background/Background-1.png", "Background/Background-2.png"],
    ),
    "monastery": dict(
        tiles="Assets/Tiles.png",
        props=[],
        bg=[],
        # Confirmed: the storefront comments were right, the background is
        # Aseprite-only in this pack.
        ase={"bg0.png": "Assets/Background.aseprite"},
    ),
    "mansion": dict(
        tiles="Assets/Tiles.png",
        props=["Assets/Props.png"],
        bg=["Assets/Background.png"],
    ),
}

# --------------------------------------------------------------------- player
# clip -> (source path, frame width, frame height, source fps)
PLAYER = {
    "idle":       ("Character/Idle/Idle-Sheet.png", 64, 80, 8),
    "run":        ("Character/Run/Run-Sheet.png", 80, 80, 12),
    "attack1":    ("Character/Attack-01/Attack-01-Sheet.png", 96, 80, 14),
    "dead":       ("Character/Dead/Dead-Sheet.png", 80, 64, 10),
    "jump_start": ("Character/Jump-Start/Jump-Start-Sheet.png", 64, 64, 14),
    "jump_all":   ("Character/Jumlp-All/Jump-All-Sheet.png", 64, 64, 12),
    "jump_end":   ("Character/Jump-End/Jump-End-Sheet.png", 64, 64, 14),
}

# ---------------------------------------------------------------------- mobs
# id -> dict(pack, clips={name: (path, frame_w, frame_h, fps, loop)})
MOBS = {
    "snail": dict(pack="high_forest", clips={
        "walk": ("Mob/Snail/walk-Sheet.png", 32, 32, 6, True),
        "hide": ("Mob/Snail/Hide-Sheet.png", 32, 32, 8, False),
        "dead": ("Mob/Snail/Dead-Sheet.png", 32, 32, 8, False),
    }),
    "bee": dict(pack="high_forest", clips={
        "fly":    ("Mob/Small Bee/Fly/Fly-Sheet.png", 64, 64, 12, True),
        "attack": ("Mob/Small Bee/Attack/Attack-Sheet.png", 64, 64, 12, False),
        "hit":    ("Mob/Small Bee/Hit/Hit-Sheet.png", 64, 64, 12, False),
    }),
    "boar": dict(pack="high_forest", clips={
        "idle": ("Mob/Boar/Idle/Idle-Sheet.png", 32, 32, 6, True),
        "walk": ("Mob/Boar/Walk/Walk-Base-Sheet.png", 32, 32, 8, True),
        "run":  ("Mob/Boar/Run/Run-Sheet.png", 32, 32, 12, True),
        "hit":  ("Mob/Boar/Hit-Vanish/Hit-Sheet.png", 32, 32, 10, False),
    }),
    "wild_boar": dict(pack="wild_boar", clips={
        "idle":   ("Idle/Idle-Sheet - Color 1.png", 64, 48, 6, True),
        "walk":   ("Walk/Walk-Sheet - Color 1.png", 96, 64, 8, True),
        "run":    ("Run/Run-Sheet - Color 1.png", 96, 64, 12, True),
        "attack": ("Attack/Attack - Color 1.png", 64, 64, 12, False),
        "dead":   ("Die/Die-Sheet - Color 1.png", 96, 48, 10, False),
    }),
    "boar_warrior": dict(pack="boar_warrior", clips={
        "idle":   ("Idle/Idle-Sheet.png", 96, 64, 6, True),
        "walk":   ("Walk/Walk-Sheet.png", 80, 64, 8, True),
        "attack": ("Attack/Attack-01-Sheet.png", 160, 112, 12, False),
        "dead":   ("Die/Die-Sheet.png", 144, 96, 10, False),
    }),
    "skeleton": dict(pack="prison", clips={
        "idle":   ("Mob/Skeleton/Idle/Idle-Sheet.png", 32, 48, 6, True),
        "walk":   ("Mob/Skeleton/Walk/Walk-Sheet.png", 64, 64, 8, True),
        "run":    ("Mob/Skeleton/Run/Run-Sheet.png", 64, 64, 12, True),
        "attack": ("Mob/Skeleton/Attack/Attack-Sheet.png", 96, 80, 12, False),
        "hit":    ("Mob/Skeleton/Hit/Hit-Sheet.png", 64, 64, 12, False),
        "dead":   ("Mob/Skeleton/Death/Death-Sheet.png", 64, 64, 10, False),
    }),
    "slime": dict(pack="sewers", clips={
        "idle": ("Mobs/Slime-01/Idle/Idle-Sheet.png", 32, 32, 6, True),
        "move": ("Mobs/Slime-01/Move/Move-Sheet.png", 32, 32, 8, True),
        "fall": ("Mobs/Slime-01/Down/Down-Sheet.png", 32, 32, 10, False),
        "dead": ("Mobs/Slime-01/Die/Die-Sheet.png", 32, 32, 10, False),
    }),
    # Not mentioned anywhere in the master plan's roster: the Purple Bay pack
    # actually ships a full crab mob. It fills the "coastal crab" silhouette
    # Section 6 lists as missing, so it is asset-backed after all.
    "crab": dict(pack="purple_bay", clips={
        "idle":   ("Mob/Idle-Sheet.png", 64, 48, 6, True),
        "walk":   ("Mob/Walk-Sheet.png", 64, 48, 8, True),
        "attack": ("Mob/Atack-Sheet.png", 64, 64, 12, False),
        "dead":   ("Mob/Death-Sheet.png", 64, 64, 10, False),
    }),
}

HUD = ("high_forest", "HUD/Base-01.png")

# Findings from actually opening the ZIPs, recorded into docs/asset_issues.md.
PACK_NOTES = {
    "mine": [
        "biome `mine`: confirmed the master plan's Appendix A warning, and it goes "
        "further than the storefront text. Lonely Mine's `Assets/Tiles.png` contains "
        "forest material -- dark foliage, ferns, vines, mushrooms and berries -- with "
        "no rails, timber supports, carts or lamps anywhere in the tileset. The pack's "
        "mining identity exists only in Background/Background.png and "
        "Background/ForeGround.png. Chapter 9 is therefore authored as an abandoned "
        "worksite being reclaimed by growth, with the machinery read from the "
        "background and foreground layers rather than from tiles.",
    ],
    "swamp": [
        "biome `swamp`: Muddy Swamp ships no background layer at all. Chapter 8 "
        "composites its parallax from the pack's own tree and canopy tiles plus a "
        "tinted flat, per the creator's soft-light note.",
    ],
    "purple_bay": [
        "biome `purple_bay`: the pack ships a complete crab mob (idle/walk/attack/"
        "death) that the master plan's Section 6 lists as *missing* art needing "
        "commission. It is asset-backed; the roster uses it.",
    ],
    "deep_cave": [
        "biome `deep_cave`: the storefront advertises one unidentified enemy. There is "
        "no mob folder in the local ZIP -- the pack is environment-only. Chapter 10 "
        "uses slimes and bats-by-behaviour from other packs instead.",
    ],
}
