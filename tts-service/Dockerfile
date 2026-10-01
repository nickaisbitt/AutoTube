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
    && curl -L -o kokoro-v0_19.onnx https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files/kokoro-v0_19.onnx \
    && logger "Downloading voices binaries (22MB)..." \
    && curl -L -o voices.bin https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files/voices.bin

# Copy app code
COPY app.py .

EXPOSE 5000

ENV PORT=5000
ENV KOKORO_MODEL_PATH=/app/kokoro-v0_19.onnx
ENV KOKORO_VOICES_PATH=/app/voices.bin

# Run uvicorn on port 5000
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "5000"]
