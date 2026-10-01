# LLM & Prompts Runbook
## Scope
- src/llm/, src/prompts/, prompt templates, token budget logic
## Questions to ask
1. Are prompts versioned and immutable once published?
2. Is token counting accurate for the target model (GPT-4o, etc.)?
3. Are there fallback/retry strategies for API failures or timeouts?
4. Is user-controlled content sanitized before injection into prompts?
5. Are there prompt-injection vectors in dynamic template fields?
6. Is the response schema validated before downstream consumption?
7. Are streaming responses handled with proper backpressure?
## Tools
- grep for template literals with user input, raw string interpolation
- Check for missing zod/joi validation on LLM response parsing
