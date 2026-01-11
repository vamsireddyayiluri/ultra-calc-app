import { Region, UIUnits } from "../models/projectTypes";

export function getUIUnits(region: Region): UIUnits {
  switch (region) {
    case "UK":
    case "EU":
      return {
        length: "m",
        area: "m²",
        temperature: "°C",
        uValue: "W/m²·K",
        power: "W",
        powerDensity: "W/m²",
        ventilation: "m³/h",
        psi: "W/K",
      };

    case "US":
      return {
        length: "ft",
        area: "ft²",
        temperature: "°F",
        uValue: "BTU/hr·ft²·°F",
        power: "BTU/hr",
        powerDensity: "BTU/hr·ft²",
        ventilation: "cfm",
        psi: "Btu/hr·°F",
      };

    case "CA_METRIC":
      return {
        length: "ft",
        area: "ft²",
        temperature: "°C",
        uValue: "W/m²·K",
        power: "BTU/hr",
        powerDensity: "BTU/hr·ft²",
        ventilation: "m³/h",
        psi: "W/K",
      };

    case "CA_IMPERIAL":
      return {
        length: "ft",
        area: "ft²",
        temperature: "°C",
        uValue: "BTU/hr·ft²·°F",
        power: "BTU/hr",
        powerDensity: "BTU/hr·ft²",
        ventilation: "cfm",
        psi: "Btu/hr·°F",
      };
  }
}
