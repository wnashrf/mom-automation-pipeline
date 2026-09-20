import os
import sys
import json
import time
import threading
from pathlib import Path
import customtkinter as ctk
from tkinter import filedialog
from tkinterdnd2 import TkinterDnD, DND_FILES
from faster_whisper import WhisperModel

# Import your existing MoM extraction core
from scripts.extraction_agent import run_extraction
from scripts.output_writer import write_mom_output

ctk.set_appearance_mode("Dark")
ctk.set_default_color_theme("blue")

def format_mmss(seconds: float) -> str:
    secs = int(seconds)
    mins, secs = divmod(secs, 60)
    return f"{mins:02d}:{secs:02d}"

class TranscriptionJob:
    def __init__(self, file_path: str, model_name: str):
        self.file_path = file_path
        self.filename = Path(file_path).name
        self.model_name = model_name
        self.status = "Queued"  # Queued, Transcribing..., Extracting MoM..., Done, Failed
        self.segments = []
        self.mom_data = None
        self.output_files = {}

class SpeechTextWindowsApp(ctk.CTk):
    def __init__(self):
        super().__init__()
        self.title("SpeechTextApp - MoM Ingestion Studio")
        self.geometry("1020x640")
        self.minsize(820, 500)

        # Inject TkinterDnD for native OS file drag-and-drop
        try:
            TkinterDnD.require(self)
            self.dnd_supported = True
        except Exception:
            self.dnd_supported = False

        self.jobs = []
        self.selected_job = None
        self.active_engine = None

        # Two-pane Split View Grid
        self.grid_columnconfigure(1, weight=1)
        self.grid_rowconfigure(0, weight=1)

        self._build_sidebar()
        self._build_detail_view()

    # -------------------------------------------------------------
    # SIDEBAR: Job List, Model Picker, File Dropzone, Add/Record
    # -------------------------------------------------------------
    def _build_sidebar(self):
        self.sidebar_frame = ctk.CTkFrame(self, width=300, corner_radius=0)
        self.sidebar_frame.grid(row=0, column=0, sticky="nsew")
        self.sidebar_frame.grid_propagate(False)

        # Job Queue Container
        self.job_list_container = ctk.CTkScrollableFrame(self.sidebar_frame, fg_color="transparent")
        self.job_list_container.pack(fill="both", expand=True, padx=8, pady=(8, 4))

        # Placeholder when queue is empty
        self.empty_label = ctk.CTkLabel(
            self.job_list_container, 
            text="Drop audio files here\nor use Add Files below", 
            font=("Segoe UI", 13), 
            text_color="gray"
        )
        self.empty_label.pack(pady=80)

        # Enable Drag and Drop on the sidebar
        if self.dnd_supported:
            self.sidebar_frame.drop_target_register(DND_FILES)
            self.sidebar_frame.dnd_bind("<<Drop>>", self._handle_os_drop)

        # Divider
        ctk.CTkFrame(self.sidebar_frame, height=2, fg_color="#333333").pack(fill="x", padx=6, pady=4)

        # Bottom Controls
        self.controls_frame = ctk.CTkFrame(self.sidebar_frame, fg_color="transparent")
        self.controls_frame.pack(fill="x", padx=12, pady=(4, 12))

        # Model Selector (Matching Swift's TranscriptionModel dropdown)
        self.model_var = ctk.StringVar(value="large-v3-turbo")
        self.model_picker = ctk.CTkOptionMenu(
            self.controls_frame, 
            values=["large-v3-turbo", "large-v3", "medium", "small", "base"], 
            variable=self.model_var
        )
        self.model_picker.pack(fill="x", pady=(0, 8))

        # Action Buttons
        self.btn_row = ctk.CTkFrame(self.controls_frame, fg_color="transparent")
        self.btn_row.pack(fill="x")

        self.btn_add = ctk.CTkButton(self.btn_row, text="+ Add Files", width=120, command=self._add_files_dialog)
        self.btn_add.pack(side="left")

        self.btn_process = ctk.CTkButton(
            self.btn_row, 
            text="Run MoM Pipeline", 
            fg_color="#2b7a4b", 
            width=130, 
            command=self._start_pipeline_worker
        )
        self.btn_process.pack(side="right")

    # -------------------------------------------------------------
    # DETAIL VIEW: Header, Summary Banner, Transcript Rows
    # -------------------------------------------------------------
    def _build_detail_view(self):
        self.detail_frame = ctk.CTkFrame(self, fg_color="#181818")
        self.detail_frame.grid(row=0, column=1, sticky="nsew", padx=10, pady=10)
        self.detail_frame.grid_rowconfigure(2, weight=1)
        self.detail_frame.grid_columnconfigure(0, weight=1)

        # 1. Header (Filename, Model, Open Folder)
        self.header_frame = ctk.CTkFrame(self.detail_frame, fg_color="transparent")
        self.header_frame.grid(row=0, column=0, sticky="ew", padx=16, pady=(12, 6))

        self.lbl_file_title = ctk.CTkLabel(self.header_frame, text="Select an audio session", font=("Segoe UI", 16, "bold"))
        self.lbl_file_title.pack(side="left")

        self.btn_reveal = ctk.CTkButton(
            self.header_frame, 
            text="Reveal in Folder", 
            width=120, 
            state="disabled", 
            command=self._open_output_folder
        )
        self.btn_reveal.pack(side="right")

        # 2. Summary Status Banner (Matching Swift's VerificationSummaryView)
        self.banner_frame = ctk.CTkFrame(self.detail_frame, fg_color="#242424", corner_radius=6)
        self.banner_frame.grid(row=1, column=0, sticky="ew", padx=16, pady=6)

        self.lbl_status_badge = ctk.CTkLabel(
            self.banner_frame, 
            text="Ready", 
            font=("Segoe UI", 13, "bold"), 
            text_color="#888888"
        )
        self.lbl_status_badge.pack(anchor="w", padx=12, pady=(6, 2))

        self.lbl_meta_summary = ctk.CTkLabel(
            self.banner_frame, 
            text="No audio processed yet.", 
            font=("Segoe UI", 11), 
            text_color="gray"
        )
        self.lbl_meta_summary.pack(anchor="w", padx=12, pady=(0, 6))

        # 3. Transcript Segments Scroll View
        self.transcript_scroll = ctk.CTkScrollableFrame(self.detail_frame, fg_color="transparent")
        self.transcript_scroll.grid(row=2, column=0, sticky="nsew", padx=12, pady=6)

    # -------------------------------------------------------------
    # LOGIC & EVENT HANDLERS
    # -------------------------------------------------------------
    def _add_files_dialog(self):
        paths = filedialog.askopenfilenames(filetypes=[("Audio Files", "*.mp3 *.wav *.m4a *.aac *.flac")])
        for p in paths:
            self._enqueue_file(p)

    def _handle_os_drop(self, event):
        raw = event.data
        files = self.tk.splitlist(raw)
        for f in files:
            clean = f.strip("{}")
            if Path(clean).suffix.lower() in [".mp3", ".wav", ".m4a", ".aac", ".flac"]:
                self._enqueue_file(clean)

    def _enqueue_file(self, file_path: str):
        if self.empty_label:
            self.empty_label.destroy()
            self.empty_label = None

        job = TranscriptionJob(file_path, self.model_var.get())
        self.jobs.append(job)

        # Job Row in Sidebar (Matching JobRow in Swift)
        row_btn = ctk.CTkButton(
            self.job_list_container,
            text=f"{job.filename[:22]}\nQueued",
            font=("Segoe UI", 12),
            fg_color="#2b2b2b",
            anchor="w",
            command=lambda j=job: self._select_job(j)
        )
        row_btn.pack(fill="x", pady=3)
        job.widget = row_btn

        if not self.selected_job:
            self._select_job(job)

    def _select_job(self, job: TranscriptionJob):
        self.selected_job = job
        self.lbl_file_title.configure(text=f"{job.filename}  ({job.model_name})")
        self._refresh_detail_view()

    def _refresh_detail_view(self):
        job = self.selected_job
        if not job:
            return

        self.lbl_status_badge.configure(text=f"Status: {job.status}")
        self.lbl_meta_summary.configure(text=f"{len(job.segments)} dialogue segments recorded.")

        # Clear existing segment rows
        for w in self.transcript_scroll.winfo_children():
            w.destroy()

        # Render rows matching SegmentRow (Timestamp on left, text on right)
        for seg in job.segments:
            self._append_segment_row(seg["start"], seg["text"])

        if job.status == "Done":
            self.btn_reveal.configure(state="normal")
            self.lbl_status_badge.configure(text="✓ Completed (MoM Validated & Saved)", text_color="#2ecc71")

    def _append_segment_row(self, start_sec: float, text: str):
        row = ctk.CTkFrame(self.transcript_scroll, fg_color="transparent")
        row.pack(fill="x", pady=2)

        # Fixed width MM:SS timestamp
        lbl_ts = ctk.CTkLabel(
            row, 
            text=format_mmss(start_sec), 
            font=("Consolas", 12), 
            text_color="#888888", 
            width=50, 
            anchor="w"
        )
        lbl_ts.pack(side="left", anchor="n", padx=(4, 8))

        lbl_txt = ctk.CTkLabel(row, text=text, font=("Segoe UI", 13), wraplength=540, justify="left", anchor="w")
        lbl_txt.pack(side="left", fill="x", expand=True)

    # -------------------------------------------------------------
    # BACKGROUND PIPELINE EXECUTION
    # -------------------------------------------------------------
    def _start_pipeline_worker(self):
        if not self.selected_job or self.selected_job.status in ["Transcribing...", "Extracting MoM..."]:
            return
        threading.Thread(target=self._run_job_pipeline, daemon=True).start()

    def _run_job_pipeline(self):
        job = self.selected_job
        try:
            # 1. Transcription Stage
            job.status = "Transcribing..."
            job.widget.configure(text=f"{job.filename[:22]}\nTranscribing...", fg_color="#1f6aa5")
            self.lbl_status_badge.configure(text="Transcribing Audio...", text_color="#3a86ff")

            # Load model (matches teammate's configuration)
            model = WhisperModel(
                job.model_name, 
                device="cpu", 
                compute_type="int8", 
                cpu_threads=6  # Utilizes your multi-core Ryzen processor
            )
            segments, info = model.transcribe(
                job.file_path, 
                task="transcribe", 
                language=None, # Auto Malay/English code-switching
                temperature=[0.0, 0.2, 0.4, 0.6, 0.8, 1.0],
                vad_filter=True
            )

            job.segments = []
            for s in segments:
                item = {"id": s.id, "start": s.start, "end": s.end, "text": s.text.strip()}
                job.segments.append(item)
                self.after(0, lambda st=s.start, tx=s.text.strip(): self._append_segment_row(st, tx))

            # Auto-save raw transcript for the LLM runner
            transcripts_dir = Path("transcripts")
            transcripts_dir.mkdir(exist_ok=True)
            txt_file = transcripts_dir / f"{Path(job.file_path).stem}.txt"
            txt_file.write_text(
                "\n".join([f"[{format_mmss(s['start'])}] {s['text']}" for s in job.segments]), 
                encoding="utf-8"
            )
            job.output_files["txt"] = str(txt_file)

            # 2. Cognitive Extraction Stage (Sonnet)
            job.status = "Extracting MoM..."
            job.widget.configure(text=f"{job.filename[:22]}\nExtracting MoM...", fg_color="#d35400")
            self.lbl_status_badge.configure(text="Extracting Decisions & Actions via Claude Sonnet...", text_color="#e67e22")

            extracted_data = run_extraction(txt_file)
            write_mom_output(extracted_data)
            job.mom_data = extracted_data
            job.output_files["json"] = "data/extracted_mom.json"

            # 3. Done
            job.status = "Done"
            job.widget.configure(text=f"{job.filename[:22]}\nDone", fg_color="#27ae60")
            self.after(0, self._refresh_detail_view)

        except Exception as e:
            job.status = "Failed"
            job.widget.configure(text=f"{job.filename[:22]}\nFailed", fg_color="#c0392b")
            self.lbl_status_badge.configure(text=f"Error: {str(e)}", text_color="red")

    def _open_output_folder(self):
        target = Path("data").resolve()
        if sys.platform == "win32":
            os.startfile(target)

if __name__ == "__main__":
    app = SpeechTextWindowsApp()
    app.mainloop()