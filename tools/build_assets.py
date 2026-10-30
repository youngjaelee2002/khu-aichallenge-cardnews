"""assets/ 의 템플릿 이미지를 data URI로 묶어 assets/assets.js 를 만든다.

index.html 을 파일로 바로 열어도(file://) 캔버스를 PNG로 저장할 수 있도록 이미지를 스크립트에 내장한다.
템플릿 이미지(배경, 하단 로고 띠, 마무리 장)를 바꿨다면 다시 실행한다:

    python tools/build_assets.py
"""
import base64
import mimetypes
from pathlib import Path

ASSETS = Path(__file__).resolve().parent.parent / "assets"

TEMPLATE_FILES = {
    "bgCover": "bg-cover.jpg",
    "bgInner": "bg-inner.jpg",
    "footerCover": "footer-cover.png",
    "footerInner": "footer-inner.png",
    "closing": "closing.png",
}


def data_uri(path: Path) -> str:
    mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    return f"data:{mime};base64,{base64.b64encode(path.read_bytes()).decode()}"


def write_assets():
    lines = [
        "// Figma 템플릿에서 내려받은 에셋 (data URI로 내장: file://로 열어도 PNG 저장 가능)",
        "// footer*: 피그마 렌더의 하단 110px(로고 포함). 배경 질감이 같아서 이어 붙여도 티가 나지 않는다.",
        "// tools/build_assets.py 가 만든 파일이다. 직접 고치지 말 것.",
        "window.CN_ASSETS = {",
    ]
    lines += [f'  {key}: "{data_uri(ASSETS / name)}",' for key, name in TEMPLATE_FILES.items()]
    lines.append("};")
    (ASSETS / "assets.js").write_text("\n".join(lines), encoding="utf-8")


if __name__ == "__main__":
    write_assets()
    print(f"assets.js: {(ASSETS / 'assets.js').stat().st_size // 1024} KB")
