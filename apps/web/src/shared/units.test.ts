import { describe, expect, it } from "vitest";
import { formatMeasurement, toDisplay } from "./units";

describe("unit conversion", () => {
  it("keeps SI values unchanged", () => {
    expect(toDisplay(585, "temperature", "si")).toEqual({ value: 585, unit: "degC" });
  });

  it("converts temperature to °F (offset, not just a factor)", () => {
    expect(toDisplay(100, "temperature", "imperial").value).toBeCloseTo(212);
    expect(toDisplay(-40, "temperature", "oilfield").value).toBeCloseTo(-40);
  });

  it("converts temperature DIFFERENCES without the +32 offset", () => {
    // A 22 °C exhaust spread is a 39.6 °F spread — not 71.6 °F (that bug was caught in the browser).
    expect(toDisplay(22, "temperature_difference", "imperial")).toEqual({ value: expect.closeTo(39.6), unit: "deltaF" });
  });

  it("converts pressure to psi", () => {
    expect(toDisplay(1, "pressure", "oilfield").value).toBeCloseTo(14.5038, 3);
  });

  it("converts oil flow to barrels per day and gas to MMscfd (oilfield units)", () => {
    expect(toDisplay(1, "liquid_flow", "oilfield")).toEqual({ value: expect.closeTo(150.955, 2), unit: "bbl/d" });
    // 1,000,000 Sm³/d ≈ 35.3 MMscfd
    expect(toDisplay(1_000_000, "gas_flow", "oilfield").value).toBeCloseTo(35.3147, 3);
  });

  it("converts wall thickness and vibration to inches", () => {
    expect(toDisplay(25.4, "length", "imperial").value).toBeCloseTo(1);
    expect(toDisplay(25.4, "vibration_velocity", "oilfield")).toEqual({ value: expect.closeTo(1), unit: "in/s" });
  });

  it("formats with precision that fits the size", () => {
    expect(formatMeasurement(165_000)).toBe("165,000");
    expect(formatMeasurement(587.34)).toBe("587.3");
    expect(formatMeasurement(3.14159)).toBe("3.14");
    expect(formatMeasurement(0.0123)).toBe("0.0123");
  });
});
