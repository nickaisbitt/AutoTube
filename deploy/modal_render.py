"""
Modal GPU ffmpeg assembly for AutoTube (TTS runs locally; this worker encodes only).

Deploy:
  modal deploy deploy/modal_render.py

Set in .env.local:
  MODAL_RENDER_URL=https://<workspace>--autotube-render-serve.modal.run
  AUTOTUBE_MODAL_RENDER=1
"""
from __future__ import annotations

import io
import logging
import os
import subprocess
import tarfile
import tempfile
from pathlib import Path

import modal
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import Response

APP_NAME = "autotube-render"
logger = logging.getLogger("autotube-render")

root = Path(__file__).resolve().parent.parent

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg", "curl", "ca-certificates", "gnupg")
    .run_commands(
        "curl -fsSL https://deb.nodesource.com/setup_22.x | bash -",
        "apt-get install -y nodejs",
        "ffmpeg -encoders 2>/dev/null | head -5 || true",
    )
    .add_local_dir(str(root / "deploy" / "server-render"), remote_path="/app/deploy/server-render")
    .add_local_dir(str(root / "scripts" / "lib"), remote_path="/app/scripts/lib")
    .add_local_dir(str(root / "scripts" / "modal-render"), remote_path="/app/scripts/modal-render")
)

app = modal.App(APP_NAME, image=image)


def _extract_bundle(bundle_bytes: bytes, work_dir: Path) -> None:
    work_dir.mkdir(parents=True, exist_ok=True)
    with tarfile.open(fileobj=io.BytesIO(bundle_bytes), mode="r:gz") as tar:
        tar.extractall(work_dir)


def _run_assembly(work_dir: Path) -> bytes:
    env = os.environ.copy()
    env["MODAL_WORK_DIR"] = str(work_dir)
    env["AUTOTUBE_FORCE_CPU"] = "0"
    env["AUTOTUBE_RENDER_MODE"] = "ffmpeg"
    env["AUTOTUBE_LOOP_MODE"] = "1"

    render_env_path = work_dir / "render-env.json"
    if render_env_path.exists():
        import json

        for k, v in json.loads(render_env_path.read_text()).items():
            if v is not None and v != "":
                env[str(k)] = str(v)
    env["AUTOTUBE_FORCE_CPU"] = "0"

    entry = "/app/scripts/modal-render/assembly-entry.mjs"
    proc = subprocess.run(
        ["node", entry],
        cwd="/app",
        env=env,
        capture_output=True,
        text=True,
        timeout=1700,
    )
    if proc.stdout:
        logger.info(proc.stdout[-4000:])
    if proc.returncode != 0:
        detail = (proc.stderr or proc.stdout or "assembly failed")[-2000:]
        raise RuntimeError(detail)

    final_mp4 = work_dir / "final-video-final.mp4"
    if not final_mp4.exists():
        alt = work_dir / "final-video.mp4"
        if alt.exists():
            final_mp4 = alt
        else:
            raise RuntimeError("no output mp4 in bundle work dir")
    data = final_mp4.read_bytes()
    if len(data) < 500_000:
        raise RuntimeError(f"output too small ({len(data)} bytes)")
    return data


@app.cls(gpu="T4", timeout=1800, scaledown_window=120)
class AutoTubeRenderWorker:
    @modal.enter()
    def setup(self) -> None:
        logger.info("AutoTube Modal render worker ready")

    @modal.method()
    def render_bundle(self, bundle_bytes: bytes) -> bytes:
        with tempfile.TemporaryDirectory(prefix="autotube-") as tmp:
            work = Path(tmp) / "bundle"
            _extract_bundle(bundle_bytes, work)
            return _run_assembly(work)

    @modal.asgi_app()
    def serve(self):
        web = FastAPI()

        @web.get("/health")
        async def health():
            return {"ok": True, "service": "autotube-render", "gpu": True}

        @web.post("/render")
        async def render(request: Request):
            try:
                bundle_bytes = await request.body()
                if len(bundle_bytes) < 1000:
                    raise HTTPException(status_code=400, detail="bundle too small")
                with tempfile.TemporaryDirectory(prefix="autotube-http-") as tmp:
                    work = Path(tmp) / "bundle"
                    _extract_bundle(bundle_bytes, work)
                    out = _run_assembly(work)
                return Response(
                    content=out,
                    media_type="video/mp4",
                    headers={"X-Render-Backend": "modal-gpu", "X-Output-Bytes": str(len(out))},
                )
            except HTTPException:
                raise
            except Exception as exc:
                logger.exception("render failed")
                raise HTTPException(status_code=500, detail=str(exc)[:500]) from exc

        return web


@app.local_entrypoint()
def render_bundle(bundle_path: str, out_path: str = "") -> None:
    """modal run deploy/modal_render.py::render_bundle --bundle-path /path/to/bundle.tar.gz"""
    data = Path(bundle_path).read_bytes()
    out = AutoTubeRenderWorker().render_bundle.remote(data)
    dest = Path(out_path) if out_path else Path(bundle_path).with_suffix(".modal.mp4")
    dest.write_bytes(out)
    print(f"Wrote {dest} ({len(out) / 1024 / 1024:.1f} MB)")


@app.local_entrypoint()
def deploy_hint() -> None:
    print("Run: modal deploy deploy/modal_render.py")
    print("Then set MODAL_RENDER_URL to the printed serve URL + AUTOTUBE_MODAL_RENDER=1")
