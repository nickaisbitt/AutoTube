# Python Code Snippets

## File Operations

### Read File
```python
from pathlib import Path

# Read entire file
content = Path("file.txt").read_text()

# Read lines
lines = Path("file.txt").read_text().splitlines()

# Using context manager
with open("file.txt", "r") as f:
    content = f.read()
```

### Write File
```python
from pathlib import Path

# Write text
Path("output.txt").write_text("Hello, World!")

# Append text
with open("log.txt", "a") as f:
    f.write("New log entry\n")

# Write JSON
import json
data = {"key": "value"}
Path("data.json").write_text(json.dumps(data, indent=2))
```

### List Directory
```python
from pathlib import Path

# List files in directory
files = list(Path(".").glob("*.py"))

# Recursive search
all_python = list(Path(".").rglob("*.py"))

# Filter by pattern
test_files = [f for f in Path("tests").glob("test_*.py")]
```

## Data Processing

### CSV Reading/Writing
```python
import csv
from pathlib import Path

# Read CSV
with open("data.csv", "r") as f:
    reader = csv.DictReader(f)
    rows = list(reader)

# Write CSV
with open("output.csv", "w", newline="") as f:
    writer = csv.DictWriter(f, fieldnames=["name", "age"])
    writer.writeheader()
    writer.writerow({"name": "John", "age": 30})
```

### JSON Processing
```python
import json
from pathlib import Path

# Load JSON
data = json.loads(Path("data.json").read_text())

# Save JSON
Path("output.json").write_text(json.dumps(data, indent=2, default=str))

# Pretty print
print(json.dumps(data, indent=2))
```

## String Manipulation

### Template Strings
```python
from string import Template

template = Template("Hello, $name! You have $count messages.")
message = template.substitute(name="Alice", count=5)
```

### Regular Expressions
```python
import re

# Find all matches
emails = re.findall(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b', text)

# Replace pattern
cleaned = re.sub(r'\s+', ' ', text)  # Normalize whitespace

# Validate pattern
if re.match(r'^\d{3}-\d{3}-\d{4}$', phone):
    print("Valid phone number")
```

## Date and Time

### Working with datetime
```python
from datetime import datetime, timedelta, timezone

# Current time
now = datetime.now()
utc_now = datetime.now(timezone.utc)

# Parse string
date = datetime.strptime("2024-01-15", "%Y-%m-%d")

# Format string
formatted = now.strftime("%Y-%m-%d %H:%M:%S")

# Arithmetic
tomorrow = now + timedelta(days=1)
last_week = now - timedelta(weeks=1)

# Difference
diff = date2 - date1
print(diff.days)
```

## Collections

### defaultdict
```python
from collections import defaultdict

# Group items
groups = defaultdict(list)
for item in items:
    groups[item.category].append(item)

# Count occurrences
counts = defaultdict(int)
for word in words:
    counts[word] += 1
```

### Counter
```python
from collections import Counter

# Count elements
word_counts = Counter(["apple", "banana", "apple", "cherry"])
print(word_counts.most_common(3))

# Merge counters
total = Counter(list1) + Counter(list2)
```

### namedtuple
```python
from collections import namedtuple

Point = namedtuple('Point', ['x', 'y'])
p = Point(10, 20)
print(p.x, p.y)
```

## Logging

### Basic Setup
```python
import logging

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

logger = logging.getLogger(__name__)

logger.debug("Debug message")
logger.info("Info message")
logger.warning("Warning message")
logger.error("Error message")
```

### Advanced Configuration
```python
import logging
from logging.handlers import RotatingFileHandler

logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)

# File handler with rotation
file_handler = RotatingFileHandler(
    "app.log",
    maxBytes=10*1024*1024,  # 10MB
    backupCount=5
)
file_handler.setLevel(logging.ERROR)

# Console handler
console_handler = logging.StreamHandler()
console_handler.setLevel(logging.INFO)

# Formatters
formatter = logging.Formatter(
    '%(asctime)s - %(name)s - %(levelname)s - %(funcName)s:%(lineno)d - %(message)s'
)
file_handler.setFormatter(formatter)
console_handler.setFormatter(formatter)

logger.addHandler(file_handler)
logger.addHandler(console_handler)
```

## Environment Variables

### Using os.environ
```python
import os

# Get with default
debug = os.getenv("DEBUG", "false").lower() == "true"
port = int(os.getenv("PORT", "8000"))

# Required variable
database_url = os.environ["DATABASE_URL"]  # Raises KeyError if not set
```

### Using python-dotenv
```python
from dotenv import load_dotenv
import os

load_dotenv()  # Load .env file

db_url = os.getenv("DATABASE_URL")
api_key = os.getenv("API_KEY")
```

## Command Line Arguments

### argparse
```python
import argparse

parser = argparse.ArgumentParser(description="Process some data")
parser.add_argument("input", help="Input file path")
parser.add_argument("-o", "--output", help="Output file path")
parser.add_argument("-v", "--verbose", action="store_true")

args = parser.parse_args()

if args.verbose:
    print(f"Processing {args.input}")
```

## HTTP Requests

### Using requests
```python
import requests

# GET request
response = requests.get("https://api.example.com/users")
data = response.json()

# POST request
response = requests.post(
    "https://api.example.com/users",
    json={"name": "John", "email": "john@example.com"},
    headers={"Authorization": "Bearer token"}
)

# With error handling
try:
    response = requests.get("https://api.example.com/data", timeout=10)
    response.raise_for_status()
except requests.exceptions.RequestException as e:
    print(f"Request failed: {e}")
```

## Caching

### functools.lru_cache
```python
from functools import lru_cache

@lru_cache(maxsize=128)
def fibonacci(n: int) -> int:
    if n < 2:
        return n
    return fibonacci(n - 1) + fibonacci(n - 2)
```

### Manual Cache
```python
from functools import wraps
import time

def cache(ttl: int = 300):
    """Cache decorator with TTL."""
    cache_store = {}

    def decorator(func):
        @wraps(func)
        def wrapper(*args):
            key = (func.__name__, args)
            if key in cache_store:
                result, timestamp = cache_store[key]
                if time.time() - timestamp < ttl:
                    return result
            result = func(*args)
            cache_store[key] = (result, time.time())
            return result
        return wrapper
    return decorator
```

## Validation

### Pydantic Models
```python
from pydantic import BaseModel, EmailStr, Field, validator

class UserCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    email: EmailStr
    age: int = Field(..., ge=0, le=150)

    @validator('name')
    def name_must_not_be_empty(cls, v):
        if not v.strip():
            raise ValueError('Name cannot be empty')
        return v

# Usage
user = UserCreate(name="John", email="john@example.com", age=30)
```

## Parallel Processing

### ThreadPoolExecutor
```python
from concurrent.futures import ThreadPoolExecutor, as_completed

def fetch_url(url: str) -> dict:
    import requests
    return requests.get(url).json()

urls = ["https://api1.com", "https://api2.com", "https://api3.com"]

with ThreadPoolExecutor(max_workers=5) as executor:
    future_to_url = {executor.submit(fetch_url, url): url for url in urls}
    for future in as_completed(future_to_url):
        url = future_to_url[future]
        try:
            data = future.result()
            print(f"{url}: {data}")
        except Exception as e:
            print(f"{url} generated exception: {e}")
```

### ProcessPoolExecutor
```python
from concurrent.futures import ProcessPoolExecutor

def cpu_intensive(n: int) -> int:
    return sum(i * i for i in range(n))

with ProcessPoolExecutor(max_workers=4) as executor:
    results = list(executor.map(cpu_intensive, [1000000, 2000000, 3000000]))
```

## Utilities

### Retry Decorator
```python
import functools
import time

def retry(max_attempts: int = 3, delay: float = 1.0, backoff: float = 2.0):
    """Retry decorator with exponential backoff."""
    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            current_delay = delay
            last_exception = None

            for attempt in range(max_attempts):
                try:
                    return func(*args, **kwargs)
                except Exception as e:
                    last_exception = e
                    if attempt < max_attempts - 1:
                        time.sleep(current_delay)
                        current_delay *= backoff

            raise last_exception
        return wrapper
    return decorator

@retry(max_attempts=3, delay=1.0)
def unstable_api_call():
    return requests.get("https://api.example.com").json()
```

### Timer Context Manager
```python
import time
from contextlib import contextmanager

@contextmanager
def timer(label: str = "Operation"):
    start = time.time()
    yield
    elapsed = time.time() - start
    print(f"{label} took {elapsed:.4f} seconds")

# Usage
with timer("Database query"):
    results = db.query("SELECT * FROM users")
```
