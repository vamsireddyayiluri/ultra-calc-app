# How Ultra-Calc's Calculations Work (plain-language, customer-facing)

This explains the engineering logic behind Ultra-Calc's numbers, in plain language, for answering user questions about what the app calculates and why. It intentionally omits internal implementation detail and engineering notes that aren't relevant to using the app.

## Heat Loss Calculation

For each room, Ultra-Calc calculates total heat loss as the sum of four components:

- **Fabric loss**: heat lost through walls, windows, doors, ceiling, and floor, based on each surface's area and insulation value (U-value) and the difference between indoor and outdoor design temperature.
- **Ventilation loss**: heat lost through air changes - both natural infiltration (draughts) and any mechanical ventilation - scaled by room volume and the indoor/outdoor temperature difference.
- **Thermal bridging (Psi) loss**: an allowance for heat lost through structural junctions (e.g. where a wall meets a floor slab) that aren't accounted for by the flat wall/floor U-values alone.
- **Ground loss**: additional heat loss for rooms whose floor sits directly on the ground, using a standard ground U-value.

The total is then adjusted by a **safety factor** (a margin to avoid under-sizing the system) and a **heat-up factor** (extra capacity to recover temperature quickly after a setback), where applicable for the selected region/standard. The result, divided by the room's floor area, gives the **load density** (W/m² or BTU/hr·ft²), which drives tube sizing and spacing decisions. Rooms above a load-density threshold are flagged as possibly needing supplemental heating.

## Water Temperature

For most installations, Ultra-Calc determines the required water (flow) temperature using a standard load-to-temperature reference table: higher load density requires a higher water temperature. If the room has a floor covering (e.g. carpet, tile), an additional adjustment is added to the water temperature to compensate for the covering's extra insulating resistance - up to a capped maximum increase.

**In-slab installations** use a different, simpler rule: the system classifies the room's load as either a lower or higher output mode and recommends one of two standard water temperatures accordingly, independent of floor covering.

## Material Sizing (Ultra-Calc tubing/fin/clip quantities)

Based on a room's load density, dimensions, joist spacing, and chosen install method, Ultra-Calc determines:

- The appropriate tube diameter (upgrading to a larger tube size above a load threshold).
- Total tubing length and how it should be split into installable loops (loop length is capped at a maximum manufacturer-specified length).
- The number of Ultra-Fin pairs needed, and the hardware (clips/supports) specific to the chosen install method.
- The center-to-center spacing of fins/tubing, which varies by joist size and load level.

All material quantities are always **rounded up** to the next whole unit, so a material order is never short - this is a deliberate design choice to protect against under-ordering for a real installation.

## Regions and Standards

Ultra-Calc supports five regional configurations, each with its own design standard and default assumptions:

| Region | Standard | Display units |
|---|---|---|
| United Kingdom | BS EN 12831 | Metric |
| European Union | EN / ISO 13790 | Metric |
| United States | ASHRAE | Imperial |
| Canada (Metric U-values) | CSA F280 | Metric |
| Canada (Imperial U-values) | CSA F280 | Imperial |

Selecting a region automatically applies that region's standard default safety factor, heat-up factor, thermal-bridging allowance, ventilation rate, and infiltration rate - you can still adjust any of these afterward in Advanced Defaults. Safety and heat-up factor margins are applied for UK and EU projects as part of their respective standards; US and Canada projects are calculated per the ASHRAE/CSA F280 methodology without that additional margin, which is standard practice for those codes.

## Project Workflow

Projects autosave automatically a short moment after you stop editing - there's no separate "save" step required while you work, though a manual save/publish button is also available once a project is complete. A project's status (Draft / Needs attention / Ready to publish / Published) reflects whether all required fields across all rooms have been filled in correctly.
