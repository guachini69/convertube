"""Compatibility entry point; the Flask implementation lives in backend/app.py."""
import os

from backend.app import app


if __name__ == "__main__":
    app.run(
        host="0.0.0.0",
        port=int(os.getenv("PORT", "5000")),
        debug=os.getenv("ENVIRONMENT", "development").lower() == "development",
    )
