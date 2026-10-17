import os
import subprocess
import sys
import time
import httpx
from dotenv import load_dotenv

load_dotenv()

clean = "--clean" in sys.argv
db_path = os.path.join(os.path.dirname(__file__), "..", "backend", "modelfit.db")
if clean and os.path.exists(db_path):
    try:
        os.remove(db_path)
    except Exception:
        pass

base_url = os.getenv("API_URL", "http://localhost:8000/api")

server_proc = None
client = httpx.Client(base_url=base_url, timeout=30.0)

try:
    client.get("/health")
except Exception:
    backend_dir = os.path.join(os.path.dirname(__file__), "..", "backend")
    env = os.environ.copy()
    server_proc = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "app.main:app", "--port", "8000", "--host", "127.0.0.1"],
        cwd=backend_dir,
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    ready = False
    for _ in range(30):
        time.sleep(0.5)
        try:
            if client.get("/health").status_code == 200:
                ready = True
                break
        except Exception:
            pass
    if not ready:
        print("Failed to start uvicorn backend")
        if server_proc:
            server_proc.kill()
        sys.exit(1)

try:
    res = client.get("/models")
    res.raise_for_status()
    mod_data = res.json()
    local_models = mod_data.get("local", [])
    if local_models:
        candidate = local_models[0]["name"]
    else:
        candidate = mod_data.get("judge", {}).get("model", "gemma4:latest")

    print(f"Candidate: {candidate}")

    payload = {
        "prompts": [{"text": "What is the capital of France?", "reference": "Paris"}],
        "models": [candidate],
        "cloud": [],
        "passes": 1,
        "temperature": 0.2,
    }

    res = client.post("/runs", json=payload)
    if res.status_code != 200:
        print(f"Failed to create run: {res.text}")
        sys.exit(1)

    run_id = res.json()["id"]
    print(f"Run ID: {run_id}")

    t0 = time.time()
    while time.time() - t0 < 300:
        time.sleep(2)
        r = client.get(f"/runs/{run_id}")
        if r.status_code != 200:
            continue
        data = r.json()
        status = data.get("status")
        phase = data.get("phase")
        print(f"Status: {status} ({phase})")
        if status == "done":
            audit = data.get("audit") or {}
            trust = audit.get("trust", 0)
            print(f"Trust score: {trust}")

            rec_res = client.get(f"/runs/{run_id}/recommendation")
            if rec_res.status_code == 200:
                rec = rec_res.json()
                print(f"Good enough model: {rec.get('good_enough', {}).get('model')}")
            sys.exit(0)
        elif status in ("failed", "cancelled"):
            print(f"Run ended with status: {status}")
            sys.exit(1)

    print("Timed out waiting for run to complete")
    sys.exit(1)
finally:
    if server_proc:
        server_proc.terminate()
        try:
            server_proc.wait(timeout=5)
        except Exception:
            server_proc.kill()
