import shutil
from pathlib import Path


def ffmpeg_exe() -> str:
    exe = shutil.which("ffmpeg")
    if exe:
        return exe
    import imageio_ffmpeg

    return imageio_ffmpeg.get_ffmpeg_exe()


def output_path(video: Path, suffix: str) -> Path:
    # public/meu-video.mp4 -> public/meu-video<suffix>
    return video.with_name(video.stem + suffix)
