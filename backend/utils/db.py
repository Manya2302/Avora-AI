"""Database connection tuning."""
from django.db.backends.signals import connection_created


def _tune_sqlite(sender, connection, **kwargs):
    if connection.vendor != "sqlite":
        return
    with connection.cursor() as c:
        # WAL: readers never block the writer and vice versa (big win with background AI threads)
        c.execute("PRAGMA journal_mode=WAL;")
        c.execute("PRAGMA synchronous=NORMAL;")     # safe with WAL, far fewer fsyncs
        c.execute("PRAGMA busy_timeout=30000;")
        c.execute("PRAGMA temp_store=MEMORY;")
        c.execute("PRAGMA cache_size=-65536;")      # 64 MB page cache
        c.execute("PRAGMA foreign_keys=ON;")


def install():
    connection_created.connect(_tune_sqlite, dispatch_uid="avora_sqlite_tuning")
