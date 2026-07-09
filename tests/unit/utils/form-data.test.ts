import { describe, it, expect } from "vitest";
import { parseIndexedFormData } from "~/utils/form-data";

describe("parseIndexedFormData()", () => {
  it("parses form data correctly", () => {
    const formData = new FormData();
    formData.append("origin", "STY");
    formData.append("origin", "MPA");
    formData.append("destination", "MPA");
    formData.append("destination", "STY");

    const result = parseIndexedFormData<{ origin: string; destination: string }>(
      formData,
      ["origin", "destination"]
    );

    expect(result).toHaveLength(2);
    expect(result[0].origin).toBe("STY");
    expect(result[0].destination).toBe("MPA");
    expect(result[1].origin).toBe("MPA");
    expect(result[1].destination).toBe("STY");
  });

  it("handles missing fields gracefully", () => {
    const formData = new FormData();
    formData.append("origin", "STY");
    // No "destination" field appended

    const result = parseIndexedFormData<{ origin: string; destination: string }>(
      formData,
      ["origin", "destination"]
    );

    expect(result).toHaveLength(1);
    expect(result[0].origin).toBe("STY");
    expect(result[0].destination).toBe("");
  });

  it("handles empty FormData", () => {
    const formData = new FormData();

    const result = parseIndexedFormData<{ origin: string; destination: string }>(
      formData,
      ["origin", "destination"]
    );

    expect(result).toHaveLength(0);
  });

  it("handles type conversion (values are always strings)", () => {
    const formData = new FormData();
    formData.append("count", "3");
    formData.append("count", "5");

    const result = parseIndexedFormData<{ count: string }>(
      formData,
      ["count"]
    );

    expect(result).toHaveLength(2);
    expect(result[0].count).toBe("3");
    expect(result[1].count).toBe("5");
    // Values are strings from FormData
    expect(typeof result[0].count).toBe("string");
  });

  it("filters empty rows when filterEmpty option is true", () => {
    const formData = new FormData();
    formData.append("origin", "STY");
    formData.append("origin", ""); // empty row
    formData.append("origin", "MPA");
    formData.append("destination", "MPA");
    formData.append("destination", ""); // empty row
    formData.append("destination", "STY");

    const result = parseIndexedFormData<{ origin: string; destination: string }>(
      formData,
      ["origin", "destination"],
      { filterEmpty: true }
    );

    expect(result).toHaveLength(2);
    expect(result[0].origin).toBe("STY");
    expect(result[0].destination).toBe("MPA");
    expect(result[1].origin).toBe("MPA");
    expect(result[1].destination).toBe("STY");
  });

  it("handles single field extraction", () => {
    const formData = new FormData();
    formData.append("name", "Alice");
    formData.append("name", "Bob");

    const result = parseIndexedFormData<{ name: string }>(
      formData,
      ["name"]
    );

    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("Alice");
    expect(result[1].name).toBe("Bob");
  });

  it("handles uneven column lengths", () => {
    const formData = new FormData();
    formData.append("origin", "STY");
    formData.append("origin", "MPA");
    formData.append("origin", "SHR");
    formData.append("destination", "MPA");
    // destination only has 1 entry, origin has 3

    const result = parseIndexedFormData<{ origin: string; destination: string }>(
      formData,
      ["origin", "destination"]
    );

    // rowCount = max(3, 1) = 3
    expect(result).toHaveLength(3);
    expect(result[0].origin).toBe("STY");
    expect(result[0].destination).toBe("MPA");
    expect(result[1].origin).toBe("MPA");
    expect(result[1].destination).toBe(""); // missing value becomes empty string
    expect(result[2].origin).toBe("SHR");
    expect(result[2].destination).toBe(""); // missing value becomes empty string
  });
});
