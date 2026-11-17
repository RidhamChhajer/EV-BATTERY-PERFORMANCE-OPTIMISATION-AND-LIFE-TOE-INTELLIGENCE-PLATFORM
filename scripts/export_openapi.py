"""Write the API contract to docs/openapi.json (the frontend's type source). Run after any API change."""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.app.main import create_app

if __name__ == "__main__":
    with open("docs/openapi.json", "w") as f:
        json.dump(create_app().openapi(), f, indent=2, sort_keys=True)
        f.write("\n")
    print("wrote docs/openapi.json")
