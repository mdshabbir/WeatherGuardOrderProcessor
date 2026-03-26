# AI Prompt Log

## Parallel Fetching Logic Prompt
```
Generate Node.js logic that reads an array of orders, calls a weather API for each city concurrently with Promise.all, and returns per-order results without blocking serially.
```

## Error Handling Logic Prompt
```
Generate robust Node.js error handling for a weather-processing script where invalid cities should return a recoverable error object, missing or expired API keys should fail fast with a clear message, and malformed JSON input should stop execution safely.
```

## AI Apology Generator Prompt
```
Generate a local-AI apology message function for Node.js that calls Ollama, requests a JSON response with a single message field, and falls back to a deterministic template if the AI call fails.
```

## Notes
- The implementation uses a local Ollama AI call for delayed-order apology generation and falls back to a deterministic template if the AI call is unavailable.
- OpenWeatherMap responses are handled per order so one invalid city does not crash the batch.
