@echo off
setlocal

echo ==============================================
echo GDVG AI Embedding Pipeline
echo Model: qwen3-embedding:4b (via IPEX-LLM)
echo Smart Chunking: Drama, Character, Season, Episode
echo ==============================================

:: Navigate to the python directory
cd /d "%~dp0python"

:: Activate virtual environment
if not exist ".venv\Scripts\activate.bat" (
    echo Error: Virtual environment not found at python\.venv
    echo Please run "pip install -e ." first.
    pause
    exit /b 1
)

call .venv\Scripts\activate.bat

:: Run the embedding script
echo Starting embedding generation...
python src\gdvg\workflows\embedding.py

echo.
echo ==============================================
echo Embedding generation complete.
echo ==============================================
pause
