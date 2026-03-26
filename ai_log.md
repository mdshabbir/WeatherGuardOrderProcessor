# AI Prompt Log

## Parallel Fetching Logic Prompt
```
Generate Node.js logic that reads an array of orders, calls a weather API for each city concurrently with Promise.all, and returns per-order results without blocking serially.
```

## Error Handling Logic Prompt
```
Generate robust Node.js error handling for a weather-processing script where invalid cities should return a recoverable error object, missing or expired API keys should fail fast with a clear message, and malformed JSON input should stop execution safely.
```

## Notes
- The implementation uses a deterministic template-based apology generator as the default AI fallback so the script remains runnable without a second paid API dependency.
- OpenWeatherMap responses are handled per order so one invalid city does not crash the batch.
