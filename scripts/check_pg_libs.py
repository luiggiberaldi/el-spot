import sys

# Check python installed db libraries
for mod in ["psycopg2", "psycopg", "pg8000", "asyncpg", "sqlalchemy"]:
    try:
        __import__(mod)
        print(f"Module {mod} is installed.")
    except ImportError:
        pass
