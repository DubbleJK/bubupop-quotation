import { rmSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { costPersistence, devStoreDir, readDevJson, writeDevJson } from "../src/server/devStore";
import { trimQuoteLog } from "../src/server/kvQuoteLog";
import { readCostLibrary } from "../src/server/kvCostLibrary";

describe("개발 저장소와 운영 저장소", () => {
  it("운영 환경에는 주소가 없으면 파일을 대신 쓰지 않는다", () => {
    expect(costPersistence(true, "production")).toBe("kv");
    expect(costPersistence(false, "production")).toBe("none");
    expect(costPersistence(false, "development")).toBe("dev-file");
    expect(costPersistence(false, "test")).toBe("none");
  });

  it("개발 파일은 다시 읽히고 테스트 환경의 원가 읽기는 저장소를 만들지 않는다", async () => {
    const written = writeDevJson("sample-test.json", { materials: [{ id: "mat-1" }], processes: [], recipes: [] });
    const read = readDevJson("sample-test.json");
    rmSync(join(devStoreDir(), "sample-test.json"), { force: true });
    expect(written.ok).toBe(true);
    expect(read.state).toBe("ok");
    expect(await readCostLibrary()).toEqual({ state: "unconfigured" });
  });

  it("견적 기록은 200건을 넘기면 오래된 것부터 지운다", () => {
    const rows = Array.from({ length: 205 }, (_, index) => index);
    const kept = trimQuoteLog(rows);
    expect(kept).toHaveLength(200);
    expect(kept[0]).toBe(5);
    expect(kept.at(-1)).toBe(204);
  });
});
