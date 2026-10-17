import os
import sys
import httpx
from dotenv import load_dotenv

load_dotenv()

host: str = os.getenv("OLLAMA_HOST", "http://localhost:11434")
judge: str = os.getenv("JUDGE_MODEL", "gemma4")
groq: str = os.getenv("GROQ_API_KEY", "")
openrouter: str = os.getenv("OPENROUTER_API_KEY", "")

try:
    res = httpx.get(f"{host}/api/tags", timeout=10.0)
    res.raise_for_status()
    data = res.json()
except Exception as err:
    print(f"Ollama unreachable: {err}")
    sys.exit(1)

models = data.get("models", [])
names = [m.get("name", "") for m in models]

for m in models:
    name = m.get("name", "")
    gb = m.get("size", 0) / (1024 ** 3)
    print(f"{name}: {gb:.2f} GB")

print(f"GROQ_API_KEY set: {bool(groq.strip())}")
print(f"OPENROUTER_API_KEY set: {bool(openrouter.strip())}")

found = judge in names or (not judge.endswith(":latest") and f"{judge}:latest" in names)
if not found:
    print(f"JUDGE_MODEL '{judge}' not found in Ollama models")
    sys.exit(1)

print(f"Found judge model: {judge}")
sys.exit(0)
