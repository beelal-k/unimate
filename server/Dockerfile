FROM python:3.11-slim

WORKDIR /app

# gcc is required to build any C-extension wheels that lack prebuilt binaries.
# libsql-experimental ships prebuilt wheels for x86_64-linux so gcc is only a
# safety net — the build still works without it if the wheel exists.
RUN apt-get update && apt-get install -y --no-install-recommends gcc && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Fly.io injects $PORT at runtime. Default to 8080 so local docker run works too.
EXPOSE 8080

# Default command — overridden per process group in fly.toml.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
