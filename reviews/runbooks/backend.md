# Backend/API Runbook
## Scope
- src/server/, src/routes/, src/middleware/, API handlers, auth
## Questions to ask
1. Are all endpoints protected by authentication/authorization middleware?
2. Is input validation applied before business logic (zod, joi, etc.)?
3. Are there rate-limiting and abuse-prevention measures?
4. Are secrets loaded from env vars, never hardcoded or logged?
5. Is there structured error handling with proper HTTP status codes?
6. Are database transactions used where multiple writes must be atomic?
7. Are long-running operations offloaded to a queue or worker?
8. Is CORS configured to allow only known origins?
## Tools
- grep for hardcoded passwords, API keys, missing auth middleware
- Check for missing input validation on POST/PUT endpoints
