# LURKER

A top-down browser horror game where darkness is your greatest enemy — and the monsters only move when you can't see them.

## Gameplay

You wake up trapped in a maze. Somewhere in the dark is an exit. Armed with only a flashlight, you must navigate the corridors while keeping the lurking creatures frozen in your beam of light.

**Core mechanic:** Enemies are paralyzed the moment your flashlight illuminates them. The instant you look away, they rush toward you. Managing your flashlight angle while navigating tight corridors is the key to survival.

- **Find the EXIT** tile to escape and win
- **Don't get touched** — each hit costs 25 sanity; four hits and it's over
- **Listen** — the heartbeat quickens as your sanity drops

## Controls

### Desktop
| Action | Keys |
|---|---|
| Move | WASD or Arrow Keys |
| Aim flashlight | Mouse |

### Mobile
| Action | Input |
|---|---|
| Move | Left thumb stick (left half of screen) |
| Aim flashlight | Right thumb stick (right half of screen) |

Play in **landscape orientation** — a warning is shown if the device is held in portrait.

## Enemies

| Type | Behavior |
|---|---|
| **Stalker** | Slow, patient. Roams aimlessly until it senses you nearby, then creeps closer. |
| **Rusher** | Fast. The moment your light leaves it, it charges directly at you. |

Both types freeze solid while illuminated — use this to create safe windows to move through.

## Mechanics

- **Flashlight cone** — a wide beam extending ~260 px that freezes anything inside it
- **Ambient glow** — a short-range ring of dim light around the player (radius ~75 px) that also freezes enemies
- **Sanity / heartbeat** — health bar labeled SANITY; heartbeat SFX speeds up below 50%
- **Screen shake** — camera shakes on each hit
- **Torches** — scattered wall-mounted torches cast flickering light and offer momentary safety

## Running Locally

No build step required — it's plain HTML + JS.

```bash
git clone https://github.com/justinbaur/lurker.git
cd lurker
# open index.html in a browser, or serve with any static file server:
npx serve .
```

## Tech

- Vanilla JavaScript, Canvas 2D API
- Dual-layer canvas for lighting (destination-out compositing for the darkness mask)
- Web Audio API for procedural sound effects and heartbeat
