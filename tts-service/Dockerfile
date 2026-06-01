FROM python:3.10-slim

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget \
    curl \
    libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Download model and voices during docker build to speed up container startup
RUN logger "Downloading Kokoro ONNX model weights (340MB)..." \
    && curl -L -o kokoro-v1.0.onnx https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx \
    && logger "Downloading voices binaries (22MB)..." \
    && curl -L -o voices-v1.0.bin https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin

# Copy app code
COPY app.py .

EXPOSE 8080

ENV PORT=8080
ENV KOKORO_MODEL_PATH=/app/kokoro-v1.0.onnx
ENV KOKORO_VOICES_PATH=/app/voices-v1.0.bin

# Run uvicorn on Railway-assigned port
CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT:-8080}"]
