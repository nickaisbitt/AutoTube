import os
import io
import asyncio
import logging
from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool
from kokoro_onnx import Kokoro
import soundfile as sf

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("tts-service")

app = FastAPI(title="AutoTube Kokoro ONNX TTS Service")

# Paths to the model files
MODEL_PATH = os.environ.get("KOKORO_MODEL_PATH", "kokoro-v0_19.onnx")
VOICES_PATH = os.environ.get("KOKORO_VOICES_PATH", "voices.bin")

# Synthesis is CPU-bound and blocking. Run it in a threadpool so the event loop
# stays responsive, and bound concurrency so parallel requests can't exhaust CPU
# or memory. Also cap request text length to avoid unbounded allocations.
MAX_CONCURRENCY = max(1, int(os.environ.get("KOKORO_MAX_CONCURRENCY", "2")))
MAX_TEXT_CHARS = max(1, int(os.environ.get("KOKORO_MAX_TEXT_CHARS", "5000")))
_generation_semaphore = asyncio.Semaphore(MAX_CONCURRENCY)

# Global placeholder for the Kokoro instance
kokoro_engine = None

@app.on_event("startup")
async def startup_event():
    global kokoro_engine
    logger.info("Initializing Kokoro ONNX Engine...")
    
    if not os.path.exists(MODEL_PATH) or not os.path.exists(VOICES_PATH):
        logger.error(f"Missing model files. MODEL_PATH={MODEL_PATH}, VOICES_PATH={VOICES_PATH}")
        raise RuntimeError("Model files not found. Make sure to download them.")
        
    try:
        kokoro_engine = Kokoro(MODEL_PATH, VOICES_PATH)
        logger.info("Kokoro ONNX Engine loaded successfully on CPU!")
    except Exception as e:
        logger.error(f"Failed to load Kokoro ONNX: {e}")
        raise RuntimeError(f"Failed to load model: {e}")

class TTSRequest(BaseModel):
    text: str
    voice: str = "af_heart"
    speed: float = 1.0

@app.get("/health")
async def health():
    if kokoro_engine is None:
        raise HTTPException(status_code=503, detail="TTS Engine is starting up or failed to load")
    return {"status": "healthy", "model": MODEL_PATH}

@app.post("/generate")
async def generate(request: TTSRequest):
    if kokoro_engine is None:
        raise HTTPException(status_code=503, detail="TTS Engine is not initialized")
        
    if not request.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")

    if len(request.text) > MAX_TEXT_CHARS:
        raise HTTPException(
            status_code=413,
            detail=f"Text exceeds maximum length of {MAX_TEXT_CHARS} characters",
        )

    try:
        logger.info(f"Generating speech for text: '{request.text[:40]}...' [voice={request.voice}, speed={request.speed}]")

        # Offload the blocking synthesis to a worker thread, bounded by a
        # semaphore so we never run more than MAX_CONCURRENCY generations at once.
        async with _generation_semaphore:
            samples, sample_rate = await run_in_threadpool(
                lambda: kokoro_engine.create(
                    text=request.text,
                    voice=request.voice,
                    speed=request.speed,
                )
            )
        
        # Write to in-memory bytes buffer as WAV
        buffer = io.BytesIO()
        sf.write(buffer, samples, sample_rate, format="WAV")
        buffer.seek(0)
        
        return StreamingResponse(
            buffer, 
            media_type="audio/wav",
            headers={"Content-Disposition": "attachment; filename=narration.wav"}
        )
    except Exception as e:
        logger.error(f"Error generating speech: {e}")
        raise HTTPException(status_code=500, detail=f"Speech generation failed: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5000)
