# Async Python Programming

## asyncio Basics

### Coroutines
```python
import asyncio

async def fetch_data(url: str) -> dict:
    """Async function that returns a coroutine."""
    await asyncio.sleep(1)  # Simulate I/O
    return {"url": url, "data": "result"}

# Run coroutine
result = asyncio.run(fetch_data("https://api.example.com"))
```

### Running Multiple Coroutines
```python
async def main():
    # Run concurrently
    task1 = asyncio.create_task(fetch_data("https://api1.com"))
    task2 = asyncio.create_task(fetch_data("https://api2.com"))

    # Wait for both
    results = await asyncio.gather(task1, task2)
    return results

asyncio.run(main())
```

## async/await Patterns

### Sequential vs Concurrent
```python
# Sequential (slow)
async def fetch_sequential():
    result1 = await fetch_data("https://api1.com")
    result2 = await fetch_data("https://api2.com")  # Waits for result1
    return [result1, result2]

# Concurrent (fast)
async def fetch_concurrent():
    tasks = [
        fetch_data("https://api1.com"),
        fetch_data("https://api2.com"),
    ]
    return await asyncio.gather(*tasks)
```

### Timeout Handling
```python
async def fetch_with_timeout():
    try:
        result = await asyncio.wait_for(
            fetch_data("https://api.example.com"),
            timeout=5.0
        )
        return result
    except asyncio.TimeoutError:
        print("Request timed out")
        return None
```

## aiohttp for HTTP Requests

### Installation
```bash
pip install aiohttp
```

### Basic Usage
```python
import aiohttp
import asyncio

async def fetch_url(session: aiohttp.ClientSession, url: str) -> str:
    async with session.get(url) as response:
        return await response.text()

async def main():
    async with aiohttp.ClientSession() as session:
        html = await fetch_url(session, "https://example.com")
        print(html)

asyncio.run(main())
```

### Multiple Requests
```python
async def fetch_multiple_urls(urls: list[str]) -> list[str]:
    async with aiohttp.ClientSession() as session:
        tasks = [fetch_url(session, url) for url in urls]
        return await asyncio.gather(*tasks)
```

## Async Context Managers

### Creating Async Context Managers
```python
from contextlib import asynccontextmanager

@asynccontextmanager
async def database_connection(db_url: str):
    conn = await create_async_connection(db_url)
    try:
        yield conn
    finally:
        await conn.close()

# Usage
async def query_database():
    async with database_connection("postgresql://localhost/db") as conn:
        result = await conn.execute("SELECT * FROM users")
        return result
```

### Class-based Async Context Manager
```python
class AsyncDatabase:
    def __init__(self, db_url: str):
        self.db_url = db_url
        self.connection = None

    async def __aenter__(self):
        self.connection = await create_async_connection(self.db_url)
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.connection:
            await self.connection.close()

    async def query(self, sql: str):
        return await self.connection.execute(sql)

# Usage
async def main():
    async with AsyncDatabase("postgresql://localhost/db") as db:
        results = await db.query("SELECT * FROM users")
```

## Async Iterators

### Creating Async Generators
```python
async def read_lines(filepath: str):
    """Async generator that yields lines from a file."""
    with open(filepath) as f:
        for line in f:
            yield line.strip()
            await asyncio.sleep(0)  # Allow other tasks to run

# Usage
async def process_file():
    async for line in read_lines("large_file.txt"):
        print(line)
```

### Async Comprehensions
```python
# Async list comprehension
results = [item async for item in async_iterator()]

# With condition
filtered = [item async for item in async_iterator() if item > 10]
```

## Common Pitfalls

### Blocking the Event Loop
```python
# BAD - blocks event loop
async def bad_example():
    time.sleep(1)  # Synchronous sleep blocks everything

# GOOD - non-blocking
async def good_example():
    await asyncio.sleep(1)  # Allows other tasks to run
```

### CPU-bound Tasks
```python
import concurrent.futures

def cpu_intensive_task(n: int) -> int:
    """Synchronous CPU-bound function."""
    return sum(i * i for i in range(n))

async def main():
    loop = asyncio.get_event_loop()
    with concurrent.futures.ThreadPoolExecutor() as pool:
        # Run CPU-bound task in thread pool
        result = await loop.run_in_executor(pool, cpu_intensive_task, 1000000)
        print(result)
```

### Error Handling
```python
async def fetch_with_error_handling():
    try:
        result = await fetch_data("https://api.example.com")
        return result
    except aiohttp.ClientError as e:
        print(f"HTTP error: {e}")
        return None
    except asyncio.CancelledError:
        print("Task was cancelled")
        raise  # Always re-raise CancelledError
```

## FastAPI Example

### Async Endpoints
```python
from fastapi import FastAPI
import httpx

app = FastAPI()

@app.get("/users/{user_id}")
async def get_user(user_id: int):
    async with httpx.AsyncClient() as client:
        response = await client.get(f"https://api.example.com/users/{user_id}")
        return response.json()

@app.post("/users")
async def create_user(user_data: dict):
    async with httpx.AsyncClient() as client:
        response = await client.post("https://api.example.com/users", json=user_data)
        return {"status": "created", "data": response.json()}
```

## Best Practices

1. **Use async for I/O-bound operations** - Network requests, database queries, file I/O
2. **Don't mix sync and async unnecessarily** - Keep code consistently async or sync
3. **Use asyncio.gather for concurrent operations** - Better than sequential awaits
4. **Handle timeouts** - Prevent hanging operations with wait_for
5. **Use connection pooling** - Reuse connections for better performance
6. **Avoid blocking calls in async functions** - Use run_in_executor for CPU-bound work
7. **Properly cancel tasks** - Handle CancelledError appropriately
8. **Use async context managers** - Ensure proper resource cleanup
