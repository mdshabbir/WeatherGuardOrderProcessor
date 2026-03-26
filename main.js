const fs = require("fs/promises");
const path = require("path");
const dotenv = require("dotenv");

dotenv.config();

const INPUT_FILE = path.join(__dirname, "orders.json");
const OUTPUT_FILE = path.join(__dirname, "updated_orders.json");
const WEATHER_API_BASE_URL = "https://api.openweathermap.org/data/2.5/weather";
const OLLAMA_API_URL = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434/api/generate";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.1:latest";
const DELAYED_CONDITIONS = new Set(["Rain", "Snow", "Thunderstorm", "Extreme"]);

function isDelayedCondition(condition) {
  return DELAYED_CONDITIONS.has(condition);
}

async function loadOrders(filePath) {
  let rawContent;

  try {
    rawContent = await fs.readFile(filePath, "utf8");
  } catch (error) {
    throw new Error(`Unable to read orders file at ${filePath}: ${error.message}`);
  }

  let orders;

  try {
    orders = JSON.parse(rawContent);
  } catch (error) {
    throw new Error(`Malformed JSON in ${filePath}: ${error.message}`);
  }

  if (!Array.isArray(orders)) {
    throw new Error(`Expected an array of orders in ${filePath}.`);
  }

  return orders;
}

async function fetchWeather(city, fetchImpl = fetch) {
  const apiKey = process.env.OPENWEATHER_API_KEY;

  if (!apiKey) {
    throw new Error("OPENWEATHER_API_KEY is missing. Add it to your .env file.");
  }

  const url = new URL(WEATHER_API_BASE_URL);
  url.searchParams.set("q", city);
  url.searchParams.set("appid", apiKey);
  url.searchParams.set("units", "metric");

  try {
    const response = await fetchImpl(url);
    const data = await response.json();

    if (response.status === 404) {
      return { city, condition: null, error: "City not found" };
    }

    if (response.status === 401) {
      throw new Error("OpenWeatherMap API key is invalid or expired.");
    }

    if (!response.ok) {
      throw new Error(data.message || `Weather API request failed with status ${response.status}.`);
    }

    const condition = data.weather?.[0]?.main;

    if (!condition) {
      throw new Error("Weather condition missing from API response.");
    }

    return { city, condition };
  } catch (error) {
    if (error.message === "OpenWeatherMap API key is invalid or expired.") {
      throw error;
    }

    return {
      city,
      condition: null,
      error: error.message || "Weather API request failed."
    };
  }
}

function generateTemplateApologyMessage(customerName, city, weatherCondition) {
  const normalizedCondition = String(weatherCondition || "unexpected weather").toLowerCase();

  return `Hi ${customerName}, your order to ${city} is delayed due to ${normalizedCondition}. We appreciate your patience!`;
}

function buildApologyPrompt(customerName, city, weatherCondition) {
  return [
    "Write one concise customer apology message for a delayed ecommerce order.",
    `Customer name: ${customerName}`,
    `Destination city: ${city}`,
    `Weather condition: ${weatherCondition}`,
    "Return JSON with exactly one key named message.",
    "The message must be one sentence, empathetic, professional, and mention the customer, city, and weather."
  ].join("\n");
}

function extractAiMessage(responseText) {
  const trimmed = String(responseText || "").trim();

  if (!trimmed) {
    return null;
  }

  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);

  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);

      if (typeof parsed.message === "string" && parsed.message.trim()) {
        return parsed.message.trim();
      }
    } catch (error) {
      return null;
    }
  }

  return null;
}

async function generateApologyMessage(customerName, city, weatherCondition, fetchImpl = fetch) {
  try {
    const response = await fetchImpl(OLLAMA_API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt: buildApologyPrompt(customerName, city, weatherCondition),
        format: {
          type: "object",
          properties: {
            message: {
              type: "string"
            }
          },
          required: ["message"]
        },
        stream: false
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data?.error || `Ollama API request failed with status ${response.status}.`);
    }

    const message = extractAiMessage(data?.response);

    if (!message) {
      throw new Error("Ollama AI response did not include a valid message.");
    }

    return message;
  } catch (error) {
    return generateTemplateApologyMessage(customerName, city, weatherCondition);
  }
}

async function processOrders(orders, fetchImpl = fetch, apologyGenerator = generateApologyMessage) {
  if (!Array.isArray(orders)) {
    throw new Error("processOrders expected an array of orders.");
  }

  return Promise.all(
    orders.map(async (order) => {
      const weather = await fetchWeather(order.city, fetchImpl);
      const delayed = weather.condition ? isDelayedCondition(weather.condition) : false;

      return {
        order_id: order.order_id,
        customer: order.customer,
        city: order.city,
        weather,
        status: delayed ? "Delayed" : "Pending",
        apologyMessage: delayed
          ? await apologyGenerator(order.customer, order.city, weather.condition, fetchImpl)
          : null
      };
    })
  );
}

async function updateAndSaveOrders(orders, results, filePath) {
  const resultsByOrderId = new Map(results.map((result) => [result.order_id, result]));
  const updatedOrders = orders.map((order) => {
    const result = resultsByOrderId.get(order.order_id);

    if (!result) {
      return order;
    }

    return {
      ...order,
      status: result.status,
      weather_condition: result.weather.condition,
      error: result.weather.error || null,
      apology_message: result.apologyMessage
    };
  });

  await fs.writeFile(filePath, `${JSON.stringify(updatedOrders, null, 2)}\n`, "utf8");
  return updatedOrders;
}

function getLogLine(result) {
  if (result.weather.error) {
    return `❌ ${result.city}: ${result.weather.error}`;
  }

  if (result.status === "Delayed") {
    return `⚠️ ${result.city}: ${result.weather.condition} -> Delayed`;
  }

  return `✅ ${result.city}: ${result.weather.condition} -> On schedule`;
}

async function run({
  inputFile = INPUT_FILE,
  outputFile = OUTPUT_FILE,
  fetchImpl = fetch,
  logger = console
} = {}) {
  const orders = await loadOrders(inputFile);

  if (orders.length === 0) {
    logger.log("No orders found. Nothing to process.");
    await fs.writeFile(outputFile, "[]\n", "utf8");
    return [];
  }

  const results = await processOrders(orders, fetchImpl);

  results.forEach((result) => {
    logger.log(getLogLine(result));

    if (result.apologyMessage) {
      logger.log(`Message: ${result.apologyMessage}`);
    }
  });

  const updatedOrders = await updateAndSaveOrders(orders, results, outputFile);
  logger.log(`Saved ${updatedOrders.length} processed orders to ${outputFile}`);

  return updatedOrders;
}

if (require.main === module) {
  run().catch((error) => {
    console.error(`Processing failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  DELAYED_CONDITIONS,
  INPUT_FILE,
  OUTPUT_FILE,
  OLLAMA_API_URL,
  OLLAMA_MODEL,
  buildApologyPrompt,
  extractAiMessage,
  fetchWeather,
  generateApologyMessage,
  generateTemplateApologyMessage,
  getLogLine,
  isDelayedCondition,
  loadOrders,
  processOrders,
  run,
  updateAndSaveOrders
};
