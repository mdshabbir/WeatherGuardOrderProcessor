const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const {
  OLLAMA_API_URL,
  fetchWeather,
  generateApologyMessage,
  generateTemplateApologyMessage,
  processOrders,
  run
} = require("../main");

describe("WeatherGuard Order Processor", () => {
  const originalApiKey = process.env.OPENWEATHER_API_KEY;

  beforeEach(() => {
    process.env.OPENWEATHER_API_KEY = "test-api-key";
  });

  afterEach(() => {
    process.env.OPENWEATHER_API_KEY = originalApiKey;
    jest.restoreAllMocks();
  });

  test('fetchWeather() returns "Rain" for a delayed weather response', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        weather: [{ main: "Rain" }]
      })
    });

    const result = await fetchWeather("Mumbai", mockFetch);

    expect(result).toEqual({ city: "Mumbai", condition: "Rain" });
  });

  test('fetchWeather() returns { error: "City not found" } for an invalid city', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({
        message: "city not found"
      })
    });

    const result = await fetchWeather("InvalidCity123", mockFetch);

    expect(result).toEqual({
      city: "InvalidCity123",
      condition: null,
      error: "City not found"
    });
  });

  test("generateApologyMessage() uses AI output when the Ollama response is valid", async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        response: JSON.stringify({
          message: "Hi Alice Smith, your order to New York is delayed due to heavy rain. We appreciate your patience!"
        })
      })
    });

    const message = await generateApologyMessage("Alice Smith", "New York", "Rain", mockFetch);

    expect(mockFetch).toHaveBeenCalledWith(
      OLLAMA_API_URL,
      expect.objectContaining({
        method: "POST"
      })
    );
    expect(message).toContain("Alice Smith");
    expect(message).toContain("New York");
  });

  test("generateApologyMessage() falls back to the template if AI is unavailable", async () => {
    const mockFetch = jest.fn().mockRejectedValue(new Error("connect ECONNREFUSED"));

    const message = await generateApologyMessage("Alice Smith", "New York", "Rain", mockFetch);

    expect(message).toBe(generateTemplateApologyMessage("Alice Smith", "New York", "Rain"));
  });

  test("processOrders() processes all four orders and preserves invalid city errors", async () => {
    const orders = [
      { order_id: "1001", customer: "Alice Smith", city: "New York", status: "Pending" },
      { order_id: "1002", customer: "Bob Jones", city: "Mumbai", status: "Pending" },
      { order_id: "1003", customer: "Charlie Green", city: "London", status: "Pending" },
      { order_id: "1004", customer: "InvalidCity123", city: "InvalidCity123", status: "Pending" }
    ];

    const mockFetch = jest.fn(async (url) => {
      const city = new URL(url).searchParams.get("q");

      if (city === "New York") {
        return {
          ok: true,
          status: 200,
          json: async () => ({ weather: [{ main: "Clear" }] })
        };
      }

      if (city === "Mumbai") {
        return {
          ok: true,
          status: 200,
          json: async () => ({ weather: [{ main: "Rain" }] })
        };
      }

      if (city === "London") {
        return {
          ok: true,
          status: 200,
          json: async () => ({ weather: [{ main: "Snow" }] })
        };
      }

      return {
        ok: false,
        status: 404,
        json: async () => ({ message: "city not found" })
      };
    });

    const mockApologyGenerator = jest.fn(async (customerName, city, weatherCondition) =>
      `Hi ${customerName}, your order to ${city} is delayed due to ${weatherCondition.toLowerCase()}. We appreciate your patience!`
    );

    const results = await processOrders(orders, mockFetch, mockApologyGenerator);

    expect(results).toHaveLength(4);
    expect(results.filter((result) => !result.weather.error)).toHaveLength(3);
    expect(results.find((result) => result.city === "New York").status).toBe("Pending");
    expect(results.find((result) => result.city === "Mumbai").status).toBe("Delayed");
    expect(results.find((result) => result.city === "London").status).toBe("Delayed");
    expect(results.find((result) => result.city === "InvalidCity123").weather.error).toBe("City not found");
  });

  test("run() exits gracefully when orders.json is an empty array", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "weatherguard-"));
    const inputFile = path.join(tempDir, "orders.json");
    const outputFile = path.join(tempDir, "updated_orders.json");
    const logger = { log: jest.fn() };

    await fs.writeFile(inputFile, "[]\n", "utf8");

    const result = await run({
      inputFile,
      outputFile,
      fetchImpl: jest.fn(),
      logger
    });

    const written = JSON.parse(await fs.readFile(outputFile, "utf8"));

    expect(result).toEqual([]);
    expect(written).toEqual([]);
    expect(logger.log).toHaveBeenCalledWith("No orders found. Nothing to process.");
  });
});
