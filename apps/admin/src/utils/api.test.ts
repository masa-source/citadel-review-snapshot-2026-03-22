import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getApiBaseUrl } from "./api";

const mockFetch = vi.fn();

describe("getApiBaseUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("should return VITE_API_URL when set", () => {
    vi.stubEnv("VITE_API_URL", "https://api.example.com");
    expect(getApiBaseUrl()).toBe("https://api.example.com");
  });

  it("should strip trailing slash from VITE_API_URL", () => {
    vi.stubEnv("VITE_API_URL", "https://api.example.com/");
    expect(getApiBaseUrl()).toBe("https://api.example.com");
  });

  it("should return URL with port 8000 when env unset (window or default)", () => {
    const url = getApiBaseUrl();
    expect(url).toMatch(/:8000$/);
    expect(url).toMatch(/^https?:\/\//);
  });
});

describe("swrFetcher", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_API_URL", "http://localhost:8000");
    vi.resetModules();
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("swrFetcher should call GET using openapi-fetch and return data", async () => {
    const { swrFetcher } = await import("./api");
    const mockData = [{ id: "1", name: "Test" }];
    // openapi-fetch internally uses global.fetch
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify(mockData), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const result = await swrFetcher("/api/reports");

    expect(mockFetch).toHaveBeenCalled();
    const [req] = mockFetch.mock.calls[0] as [Request];
    expect(req.url).toMatch(/\/api\/reports$/);
    expect(result).toEqual(mockData);
  });

  it("swrFetcher should throw on error response", async () => {
    const { swrFetcher } = await import("./api");
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ detail: "Error" }), {
        status: 500,
        statusText: "Internal Server Error",
      })
    );

    await expect(swrFetcher("/api/reports")).rejects.toThrow();
  });
});

describe("downloadPdf", () => {
  let createObjectURLMock: ReturnType<typeof vi.fn>;
  let revokeObjectURLMock: ReturnType<typeof vi.fn>;
  let appendChildMock: ReturnType<typeof vi.fn>;
  let clickMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubEnv("VITE_API_URL", "http://localhost:8000");
    vi.resetModules();
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockReset();

    createObjectURLMock = vi.fn(() => "blob:mock-url");
    revokeObjectURLMock = vi.fn();
    global.URL.createObjectURL = createObjectURLMock;
    global.URL.revokeObjectURL = revokeObjectURLMock;

    clickMock = vi.fn();
    appendChildMock = vi.fn();

    vi.spyOn(document.body, "appendChild").mockImplementation(appendChildMock);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      if (tag === "a") {
        return {
          href: "",
          download: "",
          click: clickMock,
          remove: vi.fn(),
        } as unknown as HTMLElement;
      }
      return document.createElement(tag);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("should call API with correct parameters", async () => {
    const { downloadPdf } = await import("./api");
    const mockBlob = new Blob(["PDF content"], { type: "application/pdf" });
    mockFetch.mockResolvedValue(
      new Response(mockBlob, { status: 200, headers: { "Content-Type": "application/pdf" } })
    );

    await downloadPdf("report-uuid-123");

    expect(mockFetch).toHaveBeenCalled();
    const [request] = mockFetch.mock.calls[0] as [Request];
    expect(request.url).toContain("/api/generate-report");
    expect(request.method).toBe("POST");
  });

  it("should create download link and trigger click", async () => {
    const { downloadPdf } = await import("./api");
    const mockBlob = new Blob(["PDF content"], { type: "application/pdf" });
    mockFetch.mockResolvedValue(
      new Response(mockBlob, { status: 200, headers: { "Content-Type": "application/pdf" } })
    );

    await downloadPdf("report-uuid-456");

    expect(document.createElement).toHaveBeenCalledWith("a");
    expect(appendChildMock).toHaveBeenCalled();
    expect(clickMock).toHaveBeenCalled();
    expect(revokeObjectURLMock).toHaveBeenCalled();
  });

  it("should throw backend detail message on error", async () => {
    const { downloadPdf } = await import("./api");
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ detail: "report_id=xxx のレポートが見つかりません。" }), {
        status: 404,
        statusText: "Not Found",
        headers: { "Content-Type": "application/json" },
      })
    );

    await expect(downloadPdf("report-uuid-notfound")).rejects.toThrow(
      "report_id=xxx のレポートが見つかりません。"
    );
  });
});

describe("downloadExcelZip", () => {
  let createObjectURLMock: ReturnType<typeof vi.fn>;
  let revokeObjectURLMock: ReturnType<typeof vi.fn>;
  let appendChildMock: ReturnType<typeof vi.fn>;
  let clickMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubEnv("VITE_API_URL", "http://localhost:8000");
    vi.resetModules();
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockReset();

    createObjectURLMock = vi.fn(() => "blob:mock-url");
    revokeObjectURLMock = vi.fn();
    global.URL.createObjectURL = createObjectURLMock;
    global.URL.revokeObjectURL = revokeObjectURLMock;

    clickMock = vi.fn();
    appendChildMock = vi.fn();

    vi.spyOn(document.body, "appendChild").mockImplementation(appendChildMock);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      if (tag === "a") {
        return {
          href: "",
          download: "",
          click: clickMock,
          remove: vi.fn(),
        } as unknown as HTMLElement;
      }
      return document.createElement(tag);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("should call API with correct parameters", async () => {
    const { downloadExcelZip } = await import("./api");
    const mockBlob = new Blob(["ZIP content"], { type: "application/zip" });
    mockFetch.mockResolvedValue(
      new Response(mockBlob, { status: 200, headers: { "Content-Type": "application/zip" } })
    );

    await downloadExcelZip("report-uuid-789");

    expect(mockFetch).toHaveBeenCalled();
    const [request] = mockFetch.mock.calls[0] as [Request];
    expect(request.url).toContain("/api/generate-excel");
    expect(request.method).toBe("POST");
  });

  it("should create download link with .zip extension", async () => {
    const { downloadExcelZip } = await import("./api");
    const mockBlob = new Blob(["ZIP content"], { type: "application/zip" });
    mockFetch.mockResolvedValue(
      new Response(mockBlob, { status: 200, headers: { "Content-Type": "application/zip" } })
    );

    await downloadExcelZip("report-uuid-101");

    expect(document.createElement).toHaveBeenCalledWith("a");
    expect(clickMock).toHaveBeenCalled();
  });

  it("should throw backend detail message on error", async () => {
    const { downloadExcelZip } = await import("./api");
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ detail: "テンプレートファイルが見つかりません: dummy.xlsx" }), {
        status: 404,
        statusText: "Not Found",
        headers: { "Content-Type": "application/json" },
      })
    );

    await expect(downloadExcelZip("report-uuid-error")).rejects.toThrow(
      "テンプレートファイルが見つかりません: dummy.xlsx"
    );
  });
});
