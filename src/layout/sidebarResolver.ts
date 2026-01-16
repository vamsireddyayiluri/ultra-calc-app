import { InstallMethod } from "../utils/ultraCalcLocked";
import { Joist, JOIST_MM } from "./blockConstants";

export function resolveSidebarAssets(
  method: InstallMethod,
  joist: Joist
) {
  const mm = JOIST_MM[joist];
  const joistLabel = `${joist}" (${mm} mm) Joists`;

  switch (method) {
    case "DRILLING":
      return {
        profiles: [`/assets/diagrams/PROFILE_${joist}-${mm}_Drilling.svg`],
        supportIcon: `/assets/diagrams/ICON_Drilling.svg`,
        label: "Drilling",
        joistLabel,
      };

    case "OPEN_WEB":
      return {
        profiles: [
          `/assets/diagrams/PROFILE_${joist}-${mm}_OpenWeb.svg`,
          `/assets/diagrams/PROFILE_OpenWeb.svg`,
        ],
        supportIcon: `/assets/diagrams/ICON_UltraClip.svg`,
        label: "Open-Web / Truss Joist",
        joistLabel,
      };

    case "HANGING_SNAKE":
      return {
        profiles: [`/assets/diagrams/PROFILE_${joist}-${mm}_HangingSH.svg`],
        supportIcon: `/assets/diagrams/ICON_SnakeHanger.svg`,
        label: "Hanging – Snake",
        joistLabel,
      };

    case "HANGING_ULTRACLIP":
      return {
        profiles: [`/assets/diagrams/PROFILE_${joist}-${mm}_HangingUC.svg`],
        supportIcon: `/assets/diagrams/ICON_UltraClip.svg`,
        label: "Hanging – Ultra-Clip",
        joistLabel,
      };

    case "TOPDOWN_UC_UC1212":
      return {
        profiles: [`/assets/diagrams/PROFILE_${joist}-${mm}_Bracket.svg`],
        supportIcon: `/assets/diagrams/ICON_Bracket.svg`,
        label: "Top-Down",
        joistLabel,
      };

    case "INSLAB":
      
      return {
        profiles: [],
        supportIcon: `/assets/diagrams/ICON_UltraClip.svg`,
        label: "In Slab",
        joistLabel,
      };

    default:
      throw new Error("Unsupported install method");
  }
}
