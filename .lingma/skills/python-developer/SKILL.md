---
name: python-developer
description: Python development best practices, code style, testing, and common patterns. Use when writing Python code, reviewing Python files, debugging Python applications, or when the user asks about Python development, PEP 8, type hints, pytest, or Python best practices.
---

# Python Developer Skill

## Quick Start

When working with Python code, follow these core principles:

1. **Write clean, readable code** following PEP 8 standards
2. **Use type hints** for function signatures and complex variables
3. **Write tests** using pytest for all new functionality
4. **Handle errors gracefully** with specific exception types
5. **Document your code** with docstrings and comments where needed

## Code Style (PEP 8)

### Naming Conventions

```python
# Variables and functions: snake_case
def calculate_total_price(items: list) -> float:
    pass

user_name = "John"

# Classes: PascalCase
class UserProfile:
    pass

# Constants: UPPER_SNAKE_CASE
MAX_RETRY_COUNT = 3
DATABASE_URL = "postgresql://..."

# Private members: leading underscore
def _internal_helper():
    pass
```

### Imports

```python
# Standard library imports first
import os
import sys
from typing import List, Dict, Optional

# Third-party imports second
import requests
from flask import Flask

# Local application imports third
from myapp.models import User
from myapp.utils import helper
```

### Formatting

- Use 4 spaces per indentation level (no tabs)
- Maximum line length: 88 characters (black default) or 100
- Use blank lines to separate functions and classes
- Use tools like `black` for auto-formatting

## Type Hints

Always use type hints for function parameters and return values:

```python
from typing import List, Dict, Optional, Union, Callable

def process_users(
    users: List[Dict[str, str]],
    callback: Optional[Callable] = None
) -> Dict[str, int]:
    """Process users and return statistics."""
    result = {"total": len(users), "processed": 0}
    for user in users:
        if callback:
            callback(user)
        result["processed"] += 1
    return result

# Use Union for multiple types
def parse_value(value: Union[str, int, float]) -> str:
    return str(value)

# Python 3.10+ union syntax
def parse_value_modern(value: str | int | float) -> str:
    return str(value)
```

## Docstrings

Use Google-style or Sphinx-style docstrings:

```python
def calculate_average(numbers: List[float]) -> float:
    """Calculate the average of a list of numbers.

    Args:
        numbers: A list of floating-point numbers.

    Returns:
        The arithmetic mean of the input numbers.

    Raises:
        ValueError: If the input list is empty.
    """
    if not numbers:
        raise ValueError("Cannot calculate average of empty list")
    return sum(numbers) / len(numbers)
```

## Error Handling

### Do's

```python
# Catch specific exceptions
try:
    result = database.query(sql)
except DatabaseConnectionError as e:
    logger.error(f"Database connection failed: {e}")
    raise
except QueryExecutionError as e:
    logger.error(f"Query execution failed: {e}")
    return None

# Use context managers for resources
with open("file.txt", "r") as f:
    content = f.read()
```

### Don'ts

```python
# Avoid bare except clauses
try:
    do_something()
except:  # BAD - catches everything including KeyboardInterrupt
    pass

# Avoid catching Exception without handling
try:
    do_something()
except Exception:  # BAD - silent failure
    pass
```

## Common Patterns

### Dataclasses

Use dataclasses for structured data:

```python
from dataclasses import dataclass, field
from datetime import datetime
from typing import List

@dataclass
class User:
    name: str
    email: str
    age: int
    created_at: datetime = field(default_factory=datetime.now)
    tags: List[str] = field(default_factory=list)

    def is_adult(self) -> bool:
        return self.age >= 18
```

### Context Managers

Create custom context managers for resource management:

```python
from contextlib import contextmanager

@contextmanager
def database_connection(db_url: str):
    """Context manager for database connections."""
    conn = None
    try:
        conn = create_connection(db_url)
        yield conn
    except Exception as e:
        logger.error(f"Database error: {e}")
        raise
    finally:
        if conn:
            conn.close()

# Usage
with database_connection("postgresql://localhost/mydb") as conn:
    conn.execute("SELECT * FROM users")
```

### Decorators

Use decorators for cross-cutting concerns:

```python
import functools
import time

def timer(func):
    """Decorator to measure function execution time."""
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        start = time.time()
        result = func(*args, **kwargs)
        end = time.time()
        print(f"{func.__name__} took {end - start:.4f}s")
        return result
    return wrapper

@timer
def slow_function():
    time.sleep(1)
```

## Testing with pytest

### Basic Test Structure

```python
# test_example.py
import pytest

def add(a: int, b: int) -> int:
    return a + b

def test_add_positive_numbers():
    assert add(2, 3) == 5

def test_add_negative_numbers():
    assert add(-1, -1) == -2

def test_add_raises_with_strings():
    with pytest.raises(TypeError):
        add("2", "3")
```

### Fixtures

```python
import pytest

@pytest.fixture
def sample_user():
    return {"name": "John", "email": "john@example.com"}

@pytest.fixture
def db_connection():
    conn = create_test_database()
    yield conn
    conn.close()

def test_user_creation(sample_user, db_connection):
    db_connection.insert("users", sample_user)
    assert db_connection.count("users") == 1
```

### Parametrized Tests

```python
@pytest.mark.parametrize("input,expected", [
    (2, 4),
    (3, 9),
    (4, 16),
    (5, 25),
])
def test_square(input, expected):
    assert input ** 2 == expected
```

## Performance Tips

### Use List Comprehensions

```python
# Good
squares = [x ** 2 for x in range(100)]

# Better with condition
even_squares = [x ** 2 for x in range(100) if x % 2 == 0]
```

### Use Generators for Large Data

```python
# Memory efficient
def read_large_file(filepath: str):
    with open(filepath) as f:
        for line in f:
            yield line.strip()

for line in read_large_file("huge_file.txt"):
    process(line)
```

### Use Built-in Functions

```python
# Instead of manual loops
total = sum(numbers)
maximum = max(numbers)
minimum = min(numbers)

# Use map and filter
doubled = list(map(lambda x: x * 2, numbers))
evens = list(filter(lambda x: x % 2 == 0, numbers))
```

## Security Best Practices

### Input Validation

```python
def sanitize_input(user_input: str) -> str:
    """Sanitize user input to prevent injection attacks."""
    # Remove potentially dangerous characters
    sanitized = user_input.replace("<", "&lt;").replace(">", "&gt;")
    return sanitized.strip()
```

### SQL Injection Prevention

```python
# BAD - vulnerable to SQL injection
cursor.execute(f"SELECT * FROM users WHERE name = '{name}'")

# GOOD - use parameterized queries
cursor.execute("SELECT * FROM users WHERE name = %s", (name,))
```

### Secrets Management

```python
import os
from dotenv import load_dotenv

load_dotenv()

# Never hardcode secrets
API_KEY = os.getenv("API_KEY")
DATABASE_PASSWORD = os.getenv("DB_PASSWORD")
```

## Project Structure

Recommended layout for Python projects:

```
my_project/
├── pyproject.toml          # Project configuration
├── README.md               # Project documentation
├── LICENSE                 # License file
├── .gitignore              # Git ignore rules
├── src/                    # Source code
│   └── my_package/
│       ├── __init__.py
│       ├── module1.py
│       └── module2.py
├── tests/                  # Test files
│   ├── __init__.py
│   ├── test_module1.py
│   └── test_module2.py
├── docs/                   # Documentation
├── examples/               # Example scripts
└── scripts/                # Utility scripts
```

## Dependency Management

### Using pip

```bash
# Create virtual environment
python -m venv venv
source venv/bin/activate  # Linux/Mac
# venv\Scripts\activate   # Windows

# Install dependencies
pip install -r requirements.txt

# Freeze current dependencies
pip freeze > requirements.txt
```

### Using Poetry (Recommended)

```bash
# Initialize project
poetry init

# Add dependencies
poetry add requests flask

# Add dev dependencies
poetry add --group dev pytest black mypy

# Run commands in virtual environment
poetry run python main.py
poetry run pytest
```

## Additional Resources

- For detailed coding standards, see [standards.md](standards.md)
- For testing patterns, see [testing.md](testing.md)
- For async programming, see [async.md](async.md)
- For common code snippets, see [snippets.md](snippets.md)
