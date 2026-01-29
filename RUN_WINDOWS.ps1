# EDUFAD - avvio locale (Windows PowerShell)
# Requisito: Python 3.11+ installato e "python" nel PATH (spunta "Add to PATH" in installazione)
cd $PSScriptRoot
python -m venv .venv
.\.venv\Scripts\pip install -r .\backend\requirements.txt
.\.venv\Scripts\python -m uvicorn backend.main:app --reload --port 8000
