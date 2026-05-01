@echo off
setlocal

echo ==============================================
echo GDVG AI Enrichment Pipeline
echo Model: llama3.1:8b (via IPEX-LLM)
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

:: Check if environment variables are set
if not exist ".env" (
    if not exist "..\.env.local" (
        echo Warning: .env or .env.local not found. Config might be missing.
    )
)

:: Run the enrichment script
echo Starting enrichment process...
python src\gdvg\workflows\enrichment.py

echo.
echo ==============================================
echo Enrichment complete.
echo ==============================================
pause
