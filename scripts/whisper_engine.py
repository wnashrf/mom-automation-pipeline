# scripts/whisper_engine.py
from pathlib import Path
from faster_whisper import WhisperModel

def format_timestamp(seconds: float) -> str:
    millis = int((seconds % 1) * 1000)
    seconds = int(seconds)
    mins, secs = divmod(seconds, 60)
    hours, mins = divmod(mins, 60)
    return f"{hours:02d}:{mins:02d}:{secs:02d},{millis:03d}"

class MeetingTranscriber:
    def __init__(self, model_size: str = "large-v3-turbo", device: str = "auto"):
        # Automatically detects CUDA GPU or falls back to multi-threaded CPU
        # On CPU, int8 quantization keeps memory footprint low
        compute = "default" if device == "cuda" else "int8"
        self.model = WhisperModel(model_size, device=device, compute_type=compute)

    def stream_transcribe(self, audio_path: str):
        """
        Yields individual segments as they are decoded in real time.
        Matches Swift decode settings: auto-language, 5 fallbacks.
        """
        segments, info = self.model.transcribe(
            audio_path,
            task="transcribe",
            language=None, # Auto-detects Malay and English code-switching
            temperature=[0.0, 0.2, 0.4, 0.6, 0.8, 1.0],
            vad_filter=True # Trims dead air / prevents looping
        )
        for seg in segments:
            yield {
                "id": seg.id,
                "start": seg.start,
                "end": seg.end,
                "text": seg.text.strip(),
                "time_str": f"[{format_timestamp(seg.start)} --> {format_timestamp(seg.end)}]"
            }