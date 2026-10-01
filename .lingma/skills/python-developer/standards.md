# Python Coding Standards

## PEP 8 Compliance

### Indentation
- Use 4 spaces per indentation level
- Never mix tabs and spaces
- Continuation lines should align wrapped elements

```python
# Good
def function(
    arg1,
    arg2,
    arg3
):
    pass

# Good - hanging indent
result = some_function(
    argument1, argument2,
    argument3, argument4
)
```

### Maximum Line Length
- Limit all lines to 79 characters for code
- Limit docstrings/comments to 72 characters
- Can extend to 88-100 if team agrees (black default is 88)

### Blank Lines
- Surround top-level function and class definitions with two blank lines
- Method definitions inside a class are surrounded by a single blank line
- Use blank lines in functions sparingly to indicate logical sections

## Naming Conventions

### Variables
```python
# Descriptive names
user_count = 0
total_price = 100.50
is_active = True

# Avoid single letters except in loops
for i in range(10):  # OK
    pass

for index, user in enumerate(users):  # Better
    pass
```

### Functions and Methods
```python
# snake_case
def calculate_total():
    pass

def get_user_by_id(user_id):
    pass

def is_valid_email(email):
    pass

# Private methods with leading underscore
def _internal_processing():
    pass
```

### Classes
```python
# PascalCase
class UserProfile:
    pass

class DatabaseConnection:
    pass

# Exceptions end with Error
class ValidationError(Exception):
    pass
```

### Constants
```python
# UPPER_SNAKE_CASE at module level
MAX_CONNECTIONS = 100
DEFAULT_TIMEOUT = 30
API_VERSION = "v2"
```

## Import Organization

### Order of Imports
1. Standard library imports
2. Related third-party imports
3. Local application/library specific imports

```python
# Standard library
import os
import sys
import json
from typing import List, Dict, Optional
from datetime import datetime

# Third-party
import requests
from flask import Flask, jsonify
import numpy as np

# Local application
from myapp.models import User, Product
from myapp.utils import format_date, validate_input
```

### Import Best Practices
```python
# Good - specific imports
from collections import defaultdict, OrderedDict

# Avoid wildcard imports
from module import *  # BAD

# Use aliases for long names
import pandas as pd
import numpy as np
from pathlib import Path as FilePath
```

## String Formatting

### f-strings (Python 3.6+)
```python
name = "Alice"
age = 30

# Preferred
message = f"{name} is {age} years old"

# With expressions
message = f"Next year, {name} will be {age + 1}"

# Format specifiers
price = 49.99
formatted = f"Price: ${price:.2f}"
```

### str.format()
```python
# For complex formatting
template = "{name} is {age} years old"
message = template.format(name="Alice", age=30)
```

### Avoid % formatting
```python
# Old style - avoid
message = "%s is %d years old" % (name, age)
```

## Comments

### Block Comments
```python
# This is a block comment explaining the next section.
# It spans multiple lines and provides context.
result = complex_calculation(data)
```

### Inline Comments
```python
x = x + 1  # Compensate for border
```

### Docstrings
```python
def function(arg1, arg2):
    """One-line docstring."""
    pass

def complex_function(arg1, arg2):
    """Multi-line docstring.

    Provides detailed explanation of what the function does,
    its parameters, return value, and any exceptions raised.

    Args:
        arg1: Description of first argument.
        arg2: Description of second argument.

    Returns:
        Description of return value.

    Raises:
        ValueError: When arg1 is negative.
    """
    pass
```

## Type Hints Guidelines

### Basic Types
```python
from typing import List, Dict, Set, Tuple, Optional, Union

def process_data(
    items: List[str],
    config: Dict[str, int],
    tags: Optional[Set[str]] = None
) -> Tuple[int, str]:
    pass
```

### Custom Types
```python
from typing import NewType

UserId = NewType('UserId', int)
EmailAddress = NewType('EmailAddress', str)

def get_user(user_id: UserId) -> dict:
    pass
```

### Type Aliases
```python
from typing import Dict, List

JSONValue = Union[str, int, float, bool, None, Dict[str, 'JSONValue'], List['JSONValue']]
JSONObject = Dict[str, JSONValue]
```

## Error Handling Standards

### Exception Hierarchy
```python
class AppError(Exception):
    """Base exception for the application."""
    pass

class ValidationError(AppError):
    """Raised when input validation fails."""
    pass

class NotFoundError(AppError):
    """Raised when a resource is not found."""
    pass
```

### Logging Errors
```python
import logging

logger = logging.getLogger(__name__)

try:
    result = risky_operation()
except SpecificError as e:
    logger.error(f"Operation failed: {e}", exc_info=True)
    raise AppError(f"Failed to complete operation: {e}") from e
```

## Code Organization

### Function Size
- Functions should do one thing well
- Aim for < 50 lines per function
- Extract helper functions for complex logic

### Class Design
- Single Responsibility Principle
- Keep classes focused
- Use composition over inheritance

### Module Structure
```python
"""Module docstring describing purpose."""

# Imports
import os
from typing import List

# Constants
MAX_SIZE = 100

# Helper functions
def _helper():
    pass

# Public API
def public_function():
    pass

class MyClass:
    pass
```
