# EduFAD
**EduFAD** — Strumento educativo per il funzionamento adattivo.

> Disclaimer: strumento educativo/osservativo, non diagnostico o terapeutico.

## Funzionalità principali
- Gestione multi-utente con ruoli (admin/editor).
- Profili studenti e valutazioni con soft-delete.
- Dashboard con grafici Canvas e “obiettivi condivisi”.
- Export PDF/CSV per valutazioni, dashboard item e piani educativi.
- Audit log per azioni critiche.

## Requisiti
- Python 3.11+
- PostgreSQL (per produzione) oppure SQLite (sviluppo rapido)

## Avvio locale
```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
export DATABASE_URL="sqlite:///./edufad.db"
export SECRET_KEY="sviluppo-change-me"
uvicorn app.main:app --reload
```

Visita `http://localhost:8000`.

### Utente admin iniziale
Alla prima esecuzione viene creato un admin usando:
```
ADMIN_USERNAME / ADMIN_PASSWORD
```
Se non impostati: `admin / admin123` (**consigliato modificare**).

### Creare utenti editor
Solo admin può creare utenti:
```
POST /api/users
{
  "username": "editor1",
  "password": "passwordSicura",
  "role": "editor"
}
```

### Ripristino valutazioni eliminate
Admin può usare:
```
POST /api/assessments/{id}/restore
```
e abilitare il filtro “show deleted” per vedere le valutazioni eliminate.

## Deployment su Render.com (click-by-click)
1. Crea un nuovo progetto su Render.
2. Aggiungi un **PostgreSQL** managed database. Copia la `DATABASE_URL`.
3. Crea un nuovo **Web Service**:
   - Repo: questo repository.
   - Runtime: Python.
   - Build Command: `pip install -r backend/requirements.txt`
   - Start Command: `uvicorn app.main:app --host 0.0.0.0 --port 10000`
4. Imposta le environment variables:
   - `DATABASE_URL` (dal database Render)
   - `SECRET_KEY` (stringa lunga e casuale)
   - `ADMIN_USERNAME` e `ADMIN_PASSWORD` (opzionali)
5. Deploy.

## Migrazioni
```
cd backend
alembic -c alembic.ini upgrade head
```

## Test minimi
```
cd backend
pytest
```
