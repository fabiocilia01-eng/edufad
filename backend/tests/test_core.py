import os
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient


@pytest.fixture(scope="module")
def client(tmp_path_factory):
    db_path = tmp_path_factory.mktemp("data") / "test.db"
    os.environ["DATABASE_URL"] = f"sqlite:///{db_path}"
    os.environ["SECRET_KEY"] = "test-secret"
    os.environ["ADMIN_USERNAME"] = "admin"
    os.environ["ADMIN_PASSWORD"] = "admin123"
    sys.path.append(str(Path(__file__).resolve().parents[1]))
    from app.main import app

    return TestClient(app)


def login(client, username="admin", password="admin123"):
    response = client.post(
        "/api/auth/login",
        data={"username": username, "password": password},
        headers={"content-type": "application/x-www-form-urlencoded"},
    )
    assert response.status_code == 200
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_auth_and_permissions(client):
    headers = login(client)
    response = client.post(
        "/api/users",
        json={"username": "editor1", "password": "pass", "role": "editor"},
        headers=headers,
    )
    assert response.status_code == 200
    editor_headers = login(client, "editor1", "pass")
    response = client.post(
        "/api/profiles",
        json={"code": "P01", "display_name": "Studente Uno", "date_of_birth": "2010-01-01"},
        headers=editor_headers,
    )
    assert response.status_code == 403


def test_soft_delete_and_dashboard(client):
    admin_headers = login(client)
    profile = client.post(
        "/api/profiles",
        json={"code": "P02", "display_name": "Studente Due", "date_of_birth": "2012-05-10"},
        headers=admin_headers,
    ).json()
    editor_headers = login(client, "editor1", "pass")
    assessment = client.post(
        "/api/assessments",
        json={
            "profile_id": profile["id"],
            "assessment_date": "2024-02-01",
            "operator_name": "Operatore",
            "operator_role": "Educatore",
            "status": "finalized",
        },
        headers=editor_headers,
    ).json()
    response = client.post(
        f"/api/assessments/{assessment['id']}/responses",
        json={"item_id": "AP01", "support": 1, "freq": "F2", "gen": "G1"},
        headers=editor_headers,
    )
    assert response.status_code == 200
    dashboard = client.get(f"/api/dashboard/profile/{profile['id']}", headers=editor_headers)
    assert dashboard.status_code == 200
    response = client.delete(f"/api/assessments/{assessment['id']}", headers=editor_headers)
    assert response.status_code == 200
    listed = client.get("/api/assessments", headers=editor_headers).json()
    assert assessment["id"] not in [a["id"] for a in listed]
    admin_list = client.get("/api/assessments?include_deleted=true", headers=admin_headers).json()
    assert assessment["id"] in [a["id"] for a in admin_list]
