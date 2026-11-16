# Changelog

## 0.2.1-dm.2 (demios78 fork)

- New furniture: a twin loft bed with a ladder on either side, a guard rail and open space below. Frame and bedding
  colors can be chosen.

## 0.2.1-dm.1 (demios78 fork)

- Beds come in Twin, Full, Queen and King sizes, with five headboard styles: flat, framed panels, padded, arched and
  carved lattice. Frame and bedding colors can be chosen, including a floral print.
- Nightstands can have a carved lattice door and a color of their own.
- New furniture: a narrow console table with an adjustable length.
- Installs from github.com/demios78/homescape.

## 0.2.1

- The average temperature counts only indoor rooms: terraces, balconies and gardens no longer change it
  ([#3](https://github.com/muratozturkdev/homescape/issues/3)).
- LED strips have their own length, set in their card; the strip, its glow and its light follow it, and it never gets
  longer than its wall ([#4](https://github.com/muratozturkdev/homescape/issues/4)).
- Installing or updating the app builds exactly this version.

## 0.2.0

- Open-plan rooms: walls can be left out ([#2](https://github.com/muratozturkdev/homescape/issues/2)). In edit mode click
  a wall to select and delete it, or use the new Walls list in the room card, where a room can also lose all its walls.
  The rooms keep their own name, Home Assistant area and stats; lamps light the whole open space, and walk mode, people
  and pets pass through. Balcony and terrace railings can be removed the same way.
- Room names can be hidden in the 3D view (the tag button in the tool column, on phones in the three-dot menu).
- The sample home's names follow the language.
- The top bar fits small phones: under 640 px fullscreen moves into the three-dot menu.
- Plans are saved in a new format (6). Homescape 0.1.0 never writes over them: it stops syncing until it is updated.

## 0.1.0

- First release: Homescape in the Home Assistant sidebar through ingress.
