# Python Testing Patterns

## pytest Basics

### Test Discovery
pytest automatically discovers tests matching these patterns:
- Files: `test_*.py` or `*_test.py`
- Functions: `test_*`
- Classes: `Test*` (without `__init__`)
- Methods: `test_*` inside Test classes

### Running Tests
```bash
# Run all tests
pytest

# Run specific file
pytest test_module.py

# Run specific test
pytest test_module.py::test_function

# Run with verbose output
pytest -v

# Run with coverage
pytest --cov=myapp --cov-report=html

# Stop on first failure
pytest -x

# Run last failed tests
pytest --lf
```

## Test Structure

### Arrange-Act-Assert Pattern
```python
def test_user_creation():
    # Arrange
    user_data = {"name": "John", "email": "john@example.com"}

    # Act
    user = User.create(**user_data)

    # Assert
    assert user.name == "John"
    assert user.email == "john@example.com"
    assert user.is_active is True
```

## Fixtures

### Basic Fixtures
```python
import pytest

@pytest.fixture
def sample_user():
    return User(name="John", email="john@example.com")

@pytest.fixture
def sample_products():
    return [
        Product(name="Widget", price=9.99),
        Product(name="Gadget", price=19.99),
    ]

def test_user_name(sample_user):
    assert sample_user.name == "John"
```

### Fixture Scopes
```python
@pytest.fixture(scope="module")
def database():
    """Created once per module."""
    db = Database.connect()
    yield db
    db.close()

@pytest.fixture(scope="function")
def session(database):
    """Created for each test function."""
    return database.create_session()
```

### conftest.py
Share fixtures across multiple test files:

```python
# tests/conftest.py
import pytest

@pytest.fixture
def app():
    return create_test_app()

@pytest.fixture
def client(app):
    return app.test_client()

# Now available in all test files
```

## Mocking

### Using unittest.mock
```python
from unittest.mock import Mock, patch, MagicMock
import pytest

def test_api_call():
    with patch('requests.get') as mock_get:
        mock_get.return_value.status_code = 200
        mock_get.return_value.json.return_value = {"data": "value"}

        result = fetch_data("https://api.example.com")

        assert result == {"data": "value"}
        mock_get.assert_called_once_with("https://api.example.com")
```

### pytest-mock Plugin
```python
# Install: pip install pytest-mock

def test_service(mocker):
    mock_db = mocker.patch.object(Database, 'query')
    mock_db.return_value = [{"id": 1}]

    service = UserService()
    result = service.get_all_users()

    assert len(result) == 1
    mock_db.assert_called_once()
```

### Mock Side Effects
```python
def test_retry_logic(mocker):
    mock_request = mocker.patch('requests.post')

    # Fail twice, then succeed
    mock_request.side_effect = [
        ConnectionError("Timeout"),
        ConnectionError("Timeout"),
        Mock(status_code=200)
    ]

    result = make_request_with_retry("https://api.example.com")

    assert result.status_code == 200
    assert mock_request.call_count == 3
```

## Parametrized Tests

### Basic Parametrization
```python
import pytest

@pytest.mark.parametrize("input,expected", [
    (2, 4),
    (3, 9),
    (4, 16),
    (-1, 1),
    (0, 0),
])
def test_square(input, expected):
    assert input ** 2 == expected
```

### Complex Parametrization
```python
@pytest.mark.parametrize("user_data,should_succeed", [
    ({"name": "John", "email": "john@example.com"}, True),
    ({"name": "", "email": "invalid"}, False),
    ({"name": "J" * 100, "email": "j@example.com"}, False),
    ({"email": "no-name@example.com"}, False),
])
def test_user_validation(user_data, should_succeed):
    if should_succeed:
        user = User(**user_data)
        assert user is not None
    else:
        with pytest.raises(ValidationError):
            User(**user_data)
```

## Testing Exceptions

### Asserting Exceptions
```python
def test_division_by_zero():
    with pytest.raises(ZeroDivisionError):
        1 / 0

def test_custom_exception():
    with pytest.raises(ValidationError) as exc_info:
        User(name="", email="invalid")

    assert "name cannot be empty" in str(exc_info.value)
```

### Warning Tests
```python
import warnings

def test_deprecation_warning():
    with pytest.warns(DeprecationWarning):
        old_function()
```

## Integration Tests

### Database Testing
```python
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

@pytest.fixture
def db_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()

def test_user_persistence(db_session):
    user = User(name="John", email="john@example.com")
    db_session.add(user)
    db_session.commit()

    retrieved = db_session.query(User).filter_by(email="john@example.com").first()
    assert retrieved is not None
    assert retrieved.name == "John"
```

### API Testing
```python
import pytest
from fastapi.testclient import TestClient

@pytest.fixture
def client():
    from main import app
    return TestClient(app)

def test_create_user(client):
    response = client.post("/users", json={
        "name": "John",
        "email": "john@example.com"
    })

    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "John"
```

## Test Coverage

### Configuration (pyproject.toml)
```toml
[tool.pytest.ini_options]
addopts = "--cov=myapp --cov-report=term-missing --cov-report=html"

[tool.coverage.run]
source = ["myapp"]
omit = ["*/tests/*", "*/migrations/*"]

[tool.coverage.report]
exclude_lines = [
    "pragma: no cover",
    "def __repr__",
    "raise NotImplementedError",
    "if TYPE_CHECKING:",
    "pass",
]
fail_under = 80
```

### Running Coverage
```bash
# Generate coverage report
pytest --cov=myapp

# HTML report
pytest --cov=myapp --cov-report=html
# Open htmlcov/index.html

# Fail if coverage below threshold
pytest --cov=myapp --cov-fail-under=80
```

## Test Organization

### Directory Structure
```
tests/
├── __init__.py
├── conftest.py          # Shared fixtures
├── unit/
│   ├── __init__.py
│   ├── test_models.py
│   └── test_services.py
├── integration/
│   ├── __init__.py
│   ├── test_api.py
│   └── test_database.py
└── fixtures/
    ├── sample_data.json
    └── test_files/
```

### Markers
```python
import pytest

@pytest.mark.slow
def test_large_dataset():
    pass

@pytest.mark.integration
def test_external_api():
    pass

# Run only marked tests
pytest -m slow
pytest -m integration

# Skip tests
@pytest.mark.skip(reason="Not implemented yet")
def test_future_feature():
    pass

@pytest.mark.skipif(sys.version_info < (3, 10), reason="Requires Python 3.10+")
def test_match_statement():
    pass
```

## Best Practices

1. **Test one thing per test** - Each test should verify a single behavior
2. **Use descriptive test names** - `test_returns_empty_list_when_no_users_exist`
3. **Keep tests independent** - Tests should not depend on execution order
4. **Clean up resources** - Use fixtures with teardown for cleanup
5. **Mock external dependencies** - Don't hit real APIs/databases in unit tests
6. **Use factories for test data** - Consider factory_boy for complex objects
7. **Test edge cases** - Empty inputs, boundary values, error conditions
8. **Avoid testing implementation details** - Focus on public API behavior
