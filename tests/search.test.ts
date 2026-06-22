import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  it("loads the default CodiMD URL", () => {
    expect(loadConfig().codimdBaseUrl).toBe("http://140.115.52.84:3000");
  });
});
