"""Central configuration (all overridable through environment variables)."""
import os
from datetime import date, time
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.getenv("DATA_DIR", BASE_DIR / "data"))
SNAPSHOT_PATH = DATA_DIR / "wind_snapshot.json.gz"
STATIC_DIR = Path(os.getenv("STATIC_DIR", BASE_DIR.parent / "frontend" / "dist"))

ELEXON_BASE_URL = "https://data.elexon.co.uk/bmrs/api/v1"

# Scope of the challenge: purchase decisions taken in January 2026.
# A decision taken on day D-1 is for delivery day D, so delivery days run
# from 2 Jan 2026 (decided 1 Jan) to 1 Feb 2026 (decided 31 Jan).
DECISION_MONTH_START = date(2026, 1, 1)
DECISION_MONTH_END = date(2026, 1, 31)

# Assumed day-ahead gate closure (UK local time, on D-1). Editable in the UI.
DEFAULT_CUTOFF = time.fromisoformat(os.getenv("DEFAULT_CUTOFF", "09:20"))

# If no real snapshot exists, serve clearly-labelled synthetic data (demo only).
ALLOW_SYNTHETIC = os.getenv("ALLOW_SYNTHETIC", "1") == "1"
