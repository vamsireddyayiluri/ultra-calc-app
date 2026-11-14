# Ultra-Calc UI Field Glossary

Plain-language explanation of every field, option, and control in the Ultra-Calc app, written for end users (contractors/installers) using the application - not for developers. Field names and options below are copied verbatim from the app.

## Project Setup

When you start a new project, you fill in:

- **Heating System**: choose between **Standard** (a conventional boiler) or **Heat Pump**. Heat Pump projects use a tighter Ultra-Fin spacing layout and a lower operating water-temperature range suited to heat pumps.
- **Project Name**: a free-text name for the project (required).
- **Contractor**: optional free-text field for the contractor/company name.
- **Address**: the project/site address (required).
- **Region**: which country/standard the project follows. Options: **United Kingdom**, **European Union**, **United States**, **Canada (Metric U-values)**, **Canada (Imperial U-values)**. Selecting a region automatically applies that region's standard design defaults (safety factor, heat-up factor, thermal-bridging allowance, ventilation rate, infiltration rate) and switches the display units (metric vs imperial) throughout the app.
- **Indoor Design Temperature**: the target indoor temperature used for the heat-loss calculation (°C or °F depending on region).
- **Outdoor Design Temperature**: the coldest design-day outdoor temperature for your location - this is the main driver of how much heat loss is calculated (°C or °F).
- **Insulation Period**: the age/era of the building's insulation standard. Options: **Pre-1980 (Poor)**, **1980-2000 (Average)**, **2001-2015 (Good)**, **2016+ (Efficient)**. This sets default wall/roof/floor U-values (insulation quality) unless you override them in Advanced Defaults.
- **Glazing Type**: the window glazing type. Options: **Single**, **Double**, **Triple** - each has a different default window U-value (heat loss through glass).

## Advanced Defaults (optional, collapsible section)

Click "Show" to reveal additional design-standard settings, useful for experienced users who want to fine-tune the defaults:

- **Standards Mode**: the specific engineering standard being followed. Options: **BS EN 12831** (UK), **ASHRAE** (US), **EN / ISO 13790** (EU), **CSA F280** (Canada).
- **Safety Factor (%)**: a percentage margin added to the calculated heat loss, to avoid under-sizing the system (typical range 10-15%).
- **Heat-up Factor (%)**: an additional percentage margin accounting for how quickly the space needs to recover temperature after a setback (typical range 20-30%).
- **Psi allowance**: an allowance for thermal bridging (heat loss through structural junctions like where a wall meets a floor).
- **Mechanical Vent.**: the mechanical/forced ventilation rate for the space (m³/h or CFM depending on region).
- **Infiltration (ACH)**: the assumed air-change rate from natural draughts/infiltration (typical range 0.2-0.5 air changes per hour).
- **Custom U-Values** (Wall U, Window U, Door U, Roof U, Floor U): lets you override the default insulation values for each building element if you know the actual, specific values for your project, instead of using the Insulation Period preset.

## Per-Room Fields

Each room in a project has its own card with these fields:

- **Room Name**: free-text name for the room (e.g. "Living Room").
- **Setpoint Temp**: the target temperature for this specific room, if different from the project's overall indoor design temperature.
- **Length**, **Width**, **Height**: the room's dimensions (m or ft).
- **Exterior Wall**: the length of wall in this room that is exposed to the outside (m or ft) - used to calculate wall heat loss.
- **Windows**, **Doors**: the total window area and door area in this room (m² or ft²).
- **Joist Spacing**: the spacing between floor joists. Options: **12" (300 mm)**, **16" (400 mm)**, **19" (488 mm)**, **24" (600 mm)**. This affects the Ultra-Fin layout and material quantities.
- **Floor Cover**: the finished flooring material. Options: **Tile / Stone**, **Vinyl / LVT**, **Laminate**, **Engineered Wood**, **Solid Wood**, **Carpet (Low Pad)**, **Carpet (High Pad)**. Floor coverings with more insulating value (like carpet) require a slightly higher water temperature to deliver the same heat output.
- **Install Method**: how the Ultra-Fin system is installed under the floor. Options: **Drilled Joists**, **Open-Web / Truss Joist**, **Hanging - Snake**, **Hanging - Ultra-Clip**, **Top-Down**, **In-Slab**. This determines which hardware/clips are used and how material quantities are calculated.
- **Floor On Ground**: a checkbox ("Yes - floor on ground") indicating whether the room's floor is a ground-level slab, which adds ground heat loss to the calculation.

## Room Results (calculated automatically, read-only)

Once a room's fields are filled in, Ultra-Calc automatically computes:

- **Total Heat**: the total calculated heat loss for the room (W or BTU/hr) - this is the headline number used to size the system.
- **Load Density**: heat loss per unit of floor area (W/m² or BTU/hr·ft²) - used to decide tube size and spacing.
- **Fabric**, **Ventilation**, **Psi**, **Ground**: the breakdown of heat loss by source - through walls/windows/doors/ceiling/floor (Fabric), through air changes (Ventilation), through thermal bridging (Psi), and through a ground-level floor (Ground).
- **Water Temp**: the recommended flow water temperature needed to deliver the required heat output through the floor system.
- If the heating system is **Heat Pump**, an additional note shows the bivalent threshold and that the temperature range follows the heat pump's own configuration.
- A warning appears if a room's load density is high enough that supplemental heating may be required.

## Materials (Ultra-Calc sizing results, read-only)

For each room, Ultra-Calc also calculates the exact material list needed:

- **Install Method** and **Tube Size** (tube diameter selected based on load).
- **Tubing Length**: total length of radiant tubing needed, and **Loops**: how many loops it's split into (loop length is capped for installability).
- **Ultra-Fins**: the number of Ultra-Fin pairs/halves needed.
- **Hanging Supports**, **Open-Web Ultra-Clips**, **Top-Down Ultra-Clips**, **UC1212 Clips**, **UC1234 Clips**: hardware counts, shown only for the install methods that use them.
- **Ultra-Fin Spacing (C-C)** / **Tubing Spacing (C-C)**: the center-to-center spacing used in the layout, which depends on joist spacing and load.
- All material quantities are rounded up to whole units, so you always have enough to complete the installation.
- A red warning appears if supplemental heat is recommended for that room.

## Floor Layout Diagram

Each room also has a visual floor-layout diagram showing the physical placement of Ultra-Fin blocks, pipe bridges, and end caps across the joists, with a sidebar showing supporting-hardware details. This is generated automatically from the room's dimensions, joist spacing, load, and install method.

## Project Summary

A project-level summary combines all rooms into overall totals:

- **Total Heat Load** and **Required Water Temperature** (shown as a range) - the two headline numbers for the whole project.
- **Total Project Area**, **Average Per-Area Load**.
- **Total Tubing**, **Total Ultra-Fins**, **Total Clips / Hangers**, **Total Loops** - total material quantities across every room, used for ordering.
- Any project-level notes or warnings are listed at the bottom.

## Project Status

Every project shows a status pill: **Draft** (still being worked on), **Needs attention** (has incomplete/invalid fields), **Ready to publish** (complete and valid), or **Published** (finalized). The save button label changes accordingly ("Save Draft", "Publish Project", "Save Project").

## Other Pages

- **Home / Dashboard**: lists your projects with search, a Status filter (All/Draft/Published), a Region filter, and a Sort option (Recently Updated, Recently Created, Name A-Z/Z-A).
- **Create Project**: choose between **Create Manually** (enter rooms by hand) or **Upload Plans** (import a floor-plan PDF and let the app detect rooms automatically for you to review).
- **Manual Plan Entry**: lets you view an uploaded PDF floor plan page-by-page (with zoom and navigation controls) side-by-side with the project editor, as a reference while entering rooms manually.
- **Profile**: edit your Full Name, Phone Number, Company, and Address (Email is fixed and cannot be edited).
