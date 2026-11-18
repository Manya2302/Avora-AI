from django.apps import AppConfig


class UsersConfig(AppConfig):
    name = 'apps.users'
    label = 'users'

    def ready(self):
        from utils import db
        db.install()   # SQLite WAL / busy-timeout tuning on every new connection
