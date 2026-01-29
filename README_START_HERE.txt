EDUFAD (Rebuild) – Tema chiaro + Disclaimer + Grafici

1) AVVIO VELOCE SU WINDOWS (senza Docker)
   A) Installa Python 3 (3.11 o 3.12) e durante l'installazione spunta:
      - "Add python.exe to PATH"
   B) Estrai questa cartella sul Desktop.
   C) Clic destro su RUN_WINDOWS.ps1 -> Esegui con PowerShell
   D) Apri il browser su:
      http://localhost:8000

2) AVVIO CON DOCKER (se hai Docker Desktop)
   A) Apri un terminale nella cartella estratta
   B) Esegui:
      docker build -t edufad .
      docker run -p 8000:8000 edufad
   C) Apri:
      http://localhost:8000

API DI ESEMPIO
- GET  /api/health
- GET  /api/profiles
- POST /api/profiles
  Body JSON:
  {"full_name":"Mario Rossi","date_of_birth":"2010-05-10"}

NOTA
Questa è la BASE STABILE (grafica + disclaimer + struttura).
Nei prossimi step agganciamo login, ruoli, rilevazioni, dashboard item, export PDF/CSV.
