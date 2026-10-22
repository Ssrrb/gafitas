import { describe, expect, it } from "vitest";
import { placeName } from "../src/components/Trail";

// urllib3's retry.py, lines 380-395: a ref whose summary is its first def.
const entry = {
  id: "r5",
  repo: "urllib3",
  path: "src/urllib3/util/retry.py",
  first: 380,
  last: 395,
  summary: "def sleep_for_retry(self, response: BaseHTTPResponse) -> bool:",
  text: [
    "    def sleep_for_retry(self, response: BaseHTTPResponse) -> bool:",
    "        retry_after = self.get_retry_after(response)",
    "        if retry_after:",
    "            time.sleep(retry_after)",
    "            return True",
    "",
    "        return False",
    "",
    "    def _sleep_backoff(self) -> None:",
    "        backoff = self.get_backoff_time()",
    "        if backoff <= 0:",
    "            return",
    "        time.sleep(backoff)",
    "",
    "    def sleep(self, response: BaseHTTPResponse | None = None) -> None:",
    "        \"\"\"Sleep between retry attempts.",
  ].join("\n"),
};

describe("a chip's name", () => {
  it("is the def the cited line sits in, else the summary's name", () => {
    expect(placeName(entry)).toBe("sleep_for_retry");
    expect(placeName(entry, 380)).toBe("sleep_for_retry");
    expect(placeName(entry, 390)).toBe("_sleep_backoff");
    expect(placeName(entry, 395)).toBe("sleep");
    expect(placeName({ ...entry, summary: "en Retry.sleep_for_retry" }, 382)).toBe("Retry.sleep_for_retry");
  });
});
