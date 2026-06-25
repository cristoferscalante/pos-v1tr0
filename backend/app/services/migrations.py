import subprocess
import sys


def run_alembic_upgrade_head() -> None:
    subprocess.run([sys.executable, "-m", "alembic", "upgrade", "head"], check=True)
