# WeatherGuard Order Processor

WeatherGuard Order Processor is a Node.js 18+ command-line application that reads pending orders from `orders.json`, fetches live weather from OpenWeatherMap concurrently, flags weather-sensitive orders as delayed, generates apology messages for delayed customers, and writes the results to `updated_orders.json`.

## Phase 1: Requirements and Planning

### Functional Requirements
- Load orders from a local JSON file.
- Validate that the JSON payload is an array of orders.
- Fetch live weather for each order city from OpenWeatherMap.
- Execute weather requests concurrently with `Promise.all`.
- Mark orders as `Delayed` when the weather condition is `Rain`, `Snow`, `Thunderstorm`, or `Extreme`.
- Keep non-delayed orders in `Pending`.
- Generate a personalized apology message for delayed orders.
- Handle invalid cities without crashing the full run.
- Persist processed orders to `updated_orders.json`.
- Log a per-city processing summary with success, delay, and error indicators.
- Load the OpenWeatherMap API key from `.env`.

### Non-Functional Requirements
- Node.js 18+ compatibility.
- Clear failure modes for missing credentials and malformed input.
- Testable design with mockable API calls.
- Simple local setup with minimal dependencies.
- Safe preservation of the original `orders.json`.
- CI validation on every push and pull request.
- Container-friendly runtime for consistent execution.

### Tech Stack and Justification
- Node.js 18: required runtime, includes native `fetch`, and fits the assignment.
- JavaScript (CommonJS): simple, portable, and straightforward for a CLI script.
- `dotenv`: standard way to load secrets from `.env`.
- Jest: lightweight testing with strong mocking support.
- GitHub Actions: automated CI for install and test validation.
- Docker: portable runtime packaging.

### External Dependencies
- OpenWeatherMap Current Weather API: live weather lookup per city.
- `dotenv`: environment variable loading.
- `jest`: automated testing.

### Risks and Mitigations
- API rate limits: request weather concurrently for only the required orders and keep the batch small.
- Network failures: convert request failures into per-city error objects so the batch continues.
- Invalid city names: return `{ error: "City not found" }` and continue processing.
- Missing or expired API key: fail fast with a clear operator-facing error.
- Malformed JSON: stop early with an explicit parsing error.

### Folder Structure
```text
WeatherGuardOrderProcessor/
|-- .github/workflows/ci.yml
|-- .env.example
|-- .gitignore
|-- Dockerfile
|-- README.md
|-- ai_log.md
|-- main.js
|-- orders.json
|-- package.json
|-- tests/
|   `-- main.test.js
`-- updated_orders.json
```

## Phase 2: System Design

### ASCII Architecture Diagram
```text
+-------------+      +---------------------------+      +-----------------------+
| orders.json | ---> | loadOrders + processOrders| ---> | updated_orders.json   |
+-------------+      |        (Promise.all)      |      +-----------------------+
                     +-------------+-------------+
                                   |
                                   v
                      +-----------------------------+
                      | OpenWeatherMap Weather API  |
                      +-----------------------------+
                                   |
                                   v
                      +-----------------------------+
                      | AI Apology Generator        |
                      | generateApologyMessage()    |
                      +-----------------------------+
```

### Function and Module Signatures
```js
async function loadOrders(filePath)
async function fetchWeather(city, fetchImpl = fetch) // -> { city, condition, error? }
async function processOrders(orders, fetchImpl = fetch, apologyGenerator = generateApologyMessage)
function generateApologyMessage(customerName, city, weatherCondition) // -> string
async function updateAndSaveOrders(orders, results, filePath)
async function run({ inputFile, outputFile, fetchImpl, logger } = {})
```

### Error Handling Strategy
- Invalid city (`404`): return `{ city, condition: null, error: "City not found" }`, keep the order in `Pending`, and continue.
- Missing API key: throw `OPENWEATHER_API_KEY is missing. Add it to your .env file.` before processing.
- Expired/invalid API key (`401`): stop execution with `OpenWeatherMap API key is invalid or expired.`
- Malformed `orders.json`: stop execution with `Malformed JSON in <file>: <parser error>`.
- Empty order list: log `No orders found. Nothing to process.`, write an empty `updated_orders.json`, and exit cleanly.

## Phase 3: Implementation

### Input File: `orders.json`
```json
[
  { "order_id": "1001", "customer": "Alice Smith", "city": "New York", "status": "Pending" },
  { "order_id": "1002", "customer": "Bob Jones", "city": "Mumbai", "status": "Pending" },
  { "order_id": "1003", "customer": "Charlie Green", "city": "London", "status": "Pending" },
  { "order_id": "1004", "customer": "InvalidCity123", "city": "InvalidCity123", "status": "Pending" }
]
```

### Example Console Output
```text
✅ New York: Clear -> On schedule
⚠️ Mumbai: Rain -> Delayed
Message: Hi Bob, your order to Mumbai is delayed due to heavy rain. We appreciate your patience!
⚠️ London: Snow -> Delayed
Message: Hi Charlie, your order to London is delayed due to snow. We appreciate your patience!
❌ InvalidCity123: City not found
Saved 4 processed orders to D:\WeatherGuardOrderProcessor\updated_orders.json
```

### Sample Updated `updated_orders.json` Output
```json
[
  {
    "order_id": "1001",
    "customer": "Alice Smith",
    "city": "New York",
    "status": "Pending",
    "weather_condition": "Clear",
    "error": null,
    "apology_message": null
  },
  {
    "order_id": "1002",
    "customer": "Bob Jones",
    "city": "Mumbai",
    "status": "Delayed",
    "weather_condition": "Rain",
    "error": null,
    "apology_message": "Hi Bob, your order to Mumbai is delayed due to heavy rain. We appreciate your patience!"
  },
  {
    "order_id": "1003",
    "customer": "Charlie Green",
    "city": "London",
    "status": "Delayed",
    "weather_condition": "Snow",
    "error": null,
    "apology_message": "Hi Charlie, your order to London is delayed due to snow. We appreciate your patience!"
  },
  {
    "order_id": "1004",
    "customer": "InvalidCity123",
    "city": "InvalidCity123",
    "status": "Pending",
    "weather_condition": null,
    "error": "City not found",
    "apology_message": null
  }
]
```

## Phase 4: Testing

### Test Cases
- Unit test: `fetchWeather()` with mocked `Rain` response.
- Unit test: `fetchWeather()` with mocked invalid city response.
- Unit test: `generateApologyMessage()` content validation.
- Integration test: `processOrders()` with all four orders and mixed API outcomes.
- Edge case: `run()` with an empty `orders.json`.

### Expected vs Actual
| Test | Expected | Actual |
|---|---|---|
| `fetchWeather()` delayed case | `{ city: "Mumbai", condition: "Rain" }` | Matches in Jest |
| `fetchWeather()` invalid city | `{ city: "InvalidCity123", condition: null, error: "City not found" }` | Matches in Jest |
| `generateApologyMessage()` | Output contains customer name and city | Matches in Jest |
| `processOrders()` integration | 3 valid weather results, 1 recoverable error | Matches in Jest |
| Empty orders file | Returns `[]`, logs graceful message, writes `[]` | Matches in Jest |

## Phase 5: Deployment and Documentation

### Prerequisites
- Node.js 18 or later
- npm
- An OpenWeatherMap API key

### Installation
```bash
npm ci
copy .env.example .env
```

Populate `.env` with your real API key:

```env
OPENWEATHER_API_KEY=your_real_api_key
```

### How to Get a Free OpenWeatherMap API Key
1. Create an account at https://openweathermap.org/.
2. Open the API keys section in your account dashboard.
3. Generate a free key and place it in `.env`.
4. Wait for activation if the key does not work immediately.

### Run the Script
```bash
npm start
```

### Run the Test Suite
```bash
npm test
```

### Run with Docker
```bash
docker build -t weatherguard-order-processor .
docker run --rm --env-file .env weatherguard-order-processor
```

## Deliverables Checklist
- [x] `orders.json` (original)
- [x] `updated_orders.json` (after processing target file)
- [x] `main.js`
- [x] `.env.example`
- [x] `README.md`
- [x] `ai_log.md`
- [x] `Dockerfile`
- [x] `package.json`
- [x] Test files with passing results after dependency install
