from datetime import date, datetime, timedelta
import csv
import io
import json

from fastapi import Depends, FastAPI, HTTPException, Query, Response, status
from fastapi.staticfiles import StaticFiles
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session

from .audit import log_action
from .auth import (
    create_access_token,
    get_current_user,
    get_db,
    hash_password,
    rate_limit_login,
    reset_rate_limit,
    require_admin,
    verify_password,
)
from .checklist import CHECKLIST
from .config import get_settings
from .database import Base, engine
from .models import (
    Assessment,
    AuditLog,
    GroupAssignee,
    GroupMember,
    Plan,
    Profile,
    Response as ResponseModel,
    Summary,
    User,
    WorkGroup,
)
from .schemas import (
    AssessmentCreate,
    AssessmentOut,
    AssessmentUpdate,
    AuditOut,
    PlanOut,
    ProfileCreate,
    ProfileOut,
    ProfileUpdate,
    ResponseCreate,
    ResponseOut,
    SummaryOut,
    SummaryUpdate,
    Token,
    UserBasic,
    UserCreate,
    UserOut,
    WorkGroupCreate,
    WorkGroupOut,
    WorkGroupUpdate,
)
from .services import ITEM_TO_AREA, build_plan_content, summarize_assessment


app = FastAPI(title="EduFAD")
@app.get("/health")
def health():
    return {"status": "ok"}


@app.on_event("startup")
def startup():
    Base.metadata.create_all(bind=engine)
    settings = get_settings()
    db = next(get_db())
    existing = db.query(User).filter(User.username == settings.admin_username).first()
    if not existing:
        admin = User(
            username=settings.admin_username,
            password_hash=hash_password(settings.admin_password),
            role="admin",
            is_active=True,
        )
        db.add(admin)
        db.commit()
        log_action(db, None, "seed_admin", "user", admin.id, "Creato utente admin iniziale.")
    db.close()


@app.post("/api/auth/login", response_model=Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    rate_limit_login(form_data.username)
    user = db.query(User).filter(User.username == form_data.username).first()
    if not user or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Credenziali errate.")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Utente disattivato.")
    reset_rate_limit(form_data.username)
    access_token = create_access_token({"sub": user.username, "role": user.role})
    log_action(db, user.id, "login", "user", user.id, "Accesso utente.")
    return Token(access_token=access_token)


@app.get("/api/auth/me", response_model=UserOut)
def read_me(user: User = Depends(get_current_user)):
    return user


@app.post("/api/auth/ack-disclaimer", response_model=UserOut)
def acknowledge_disclaimer(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    user.disclaimer_ack_at = datetime.utcnow()
    db.commit()
    log_action(db, user.id, "acknowledge", "disclaimer", user.id, "Conferma disclaimer.")
    return user


@app.post("/api/users", response_model=UserOut, dependencies=[Depends(require_admin)])
def create_user(payload: UserCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if db.query(User).filter(User.username == payload.username).first():
        raise HTTPException(status_code=400, detail="Username già esistente.")
    new_user = User(
        username=payload.username,
        password_hash=hash_password(payload.password),
        role=payload.role,
        is_active=True,
    )
    db.add(new_user)
    db.commit()
    log_action(db, user.id, "create", "user", new_user.id, f"Creato utente {payload.username}.")
    return new_user


@app.get("/api/users", response_model=list[UserOut], dependencies=[Depends(require_admin)])
def list_users(db: Session = Depends(get_db)):
    return db.query(User).order_by(User.username).all()


@app.get("/api/users/basic", response_model=list[UserBasic])
def list_users_basic(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return db.query(User).order_by(User.username).all()


@app.patch("/api/users/{user_id}", response_model=UserOut, dependencies=[Depends(require_admin)])
def update_user(user_id: int, payload: UserCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    existing = db.query(User).filter(User.id == user_id).first()
    if not existing:
        raise HTTPException(status_code=404, detail="Utente non trovato.")
    existing.username = payload.username
    existing.role = payload.role
    existing.password_hash = hash_password(payload.password)
    db.commit()
    log_action(db, user.id, "update", "user", existing.id, "Aggiornato utente.")
    return existing


@app.delete("/api/users/{user_id}", dependencies=[Depends(require_admin)])
def delete_user(user_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    existing = db.query(User).filter(User.id == user_id).first()
    if not existing:
        raise HTTPException(status_code=404, detail="Utente non trovato.")
    db.delete(existing)
    db.commit()
    log_action(db, user.id, "delete", "user", user_id, "Eliminato utente.")
    return {"ok": True}


@app.get("/api/checklist")
def get_checklist():
    return CHECKLIST


@app.post("/api/profiles", response_model=ProfileOut, dependencies=[Depends(require_admin)])
def create_profile(payload: ProfileCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    profile = Profile(**payload.dict())
    db.add(profile)
    db.commit()
    log_action(db, user.id, "create", "profile", profile.id, f"Creato profilo {profile.display_name}.")
    return profile


@app.get("/api/profiles", response_model=list[ProfileOut])
def list_profiles(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return db.query(Profile).order_by(Profile.display_name).all()


@app.patch("/api/profiles/{profile_id}", response_model=ProfileOut, dependencies=[Depends(require_admin)])
def update_profile(profile_id: int, payload: ProfileUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    profile = db.query(Profile).filter(Profile.id == profile_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Profilo non trovato.")
    for field, value in payload.dict(exclude_unset=True).items():
        setattr(profile, field, value)
    db.commit()
    log_action(db, user.id, "update", "profile", profile.id, "Aggiornato profilo.")
    return profile


@app.delete("/api/profiles/{profile_id}", dependencies=[Depends(require_admin)])
def delete_profile(profile_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    profile = db.query(Profile).filter(Profile.id == profile_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Profilo non trovato.")
    db.delete(profile)
    db.commit()
    log_action(db, user.id, "delete", "profile", profile_id, "Eliminato profilo.")
    return {"ok": True}


@app.post("/api/assessments", response_model=AssessmentOut)
def create_assessment(payload: AssessmentCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    assessment = Assessment(
        **payload.dict(),
        created_by_id=user.id,
        updated_by_id=user.id,
    )
    db.add(assessment)
    db.commit()
    log_action(db, user.id, "create", "assessment", assessment.id, "Creato assessment.")
    return assessment


@app.get("/api/assessments", response_model=list[AssessmentOut])
def list_assessments(
    profile_id: int | None = None,
    include_deleted: bool = False,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    query = db.query(Assessment)
    if profile_id:
        query = query.filter(Assessment.profile_id == profile_id)
    if not include_deleted or user.role != "admin":
        query = query.filter(Assessment.is_deleted.is_(False))
    return query.order_by(Assessment.assessment_date.desc()).all()


@app.get("/api/assessments/{assessment_id}", response_model=AssessmentOut)
def get_assessment(assessment_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    assessment = db.query(Assessment).filter(Assessment.id == assessment_id).first()
    if not assessment or (assessment.is_deleted and user.role != "admin"):
        raise HTTPException(status_code=404, detail="Assessment non trovato.")
    return assessment


@app.patch("/api/assessments/{assessment_id}", response_model=AssessmentOut)
def update_assessment(
    assessment_id: int,
    payload: AssessmentUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    assessment = db.query(Assessment).filter(Assessment.id == assessment_id).first()
    if not assessment or (assessment.is_deleted and user.role != "admin"):
        raise HTTPException(status_code=404, detail="Assessment non trovato.")
    for field, value in payload.dict(exclude_unset=True).items():
        setattr(assessment, field, value)
    assessment.updated_by_id = user.id
    db.commit()
    log_action(db, user.id, "update", "assessment", assessment.id, "Aggiornato assessment.")
    return assessment


@app.delete("/api/assessments/{assessment_id}")
def soft_delete_assessment(assessment_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    assessment = db.query(Assessment).filter(Assessment.id == assessment_id).first()
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment non trovato.")
    if user.role != "admin":
        if assessment.created_by_id != user.id:
            raise HTTPException(status_code=403, detail="Non autorizzato alla cancellazione.")
        if datetime.utcnow() - assessment.created_at > timedelta(hours=24):
            raise HTTPException(status_code=403, detail="Tempo massimo di cancellazione superato.")
    assessment.is_deleted = True
    assessment.deleted_at = datetime.utcnow()
    assessment.deleted_by_id = user.id
    db.commit()
    log_action(db, user.id, "delete", "assessment", assessment.id, "Soft delete assessment.")
    return {"ok": True}


@app.post("/api/assessments/{assessment_id}/restore", dependencies=[Depends(require_admin)])
def restore_assessment(assessment_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    assessment = db.query(Assessment).filter(Assessment.id == assessment_id).first()
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment non trovato.")
    assessment.is_deleted = False
    assessment.deleted_at = None
    assessment.deleted_by_id = None
    db.commit()
    log_action(db, user.id, "restore", "assessment", assessment.id, "Ripristino assessment.")
    return {"ok": True}


@app.delete("/api/assessments/{assessment_id}/hard-delete", dependencies=[Depends(require_admin)])
def hard_delete_assessment(assessment_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    assessment = db.query(Assessment).filter(Assessment.id == assessment_id).first()
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment non trovato.")
    db.delete(assessment)
    db.commit()
    log_action(db, user.id, "hard_delete", "assessment", assessment_id, "Eliminazione definitiva.")
    return {"ok": True}


@app.get("/api/assessments/{assessment_id}/responses", response_model=list[ResponseOut])
def list_responses(assessment_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    assessment = db.query(Assessment).filter(Assessment.id == assessment_id, Assessment.is_deleted.is_(False)).first()
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment non trovato.")
    return db.query(ResponseModel).filter(ResponseModel.assessment_id == assessment_id).all()


def _refresh_summary(db: Session, assessment: Assessment, user_id: int):
    responses = db.query(ResponseModel).filter(ResponseModel.assessment_id == assessment.id).all()
    response_dicts = [{"item_id": r.item_id, "support": r.support} for r in responses]
    new_auto = summarize_assessment(response_dicts)
    if assessment.summary:
        prev = assessment.summary.auto_text
        if prev != new_auto:
            log_action(db, user_id, "summary_regenerate", "assessment", assessment.id, prev)
        assessment.summary.auto_text = new_auto
        assessment.summary.last_generated_at = datetime.utcnow()
    else:
        summary = Summary(assessment_id=assessment.id, auto_text=new_auto)
        db.add(summary)
    db.commit()


@app.post("/api/assessments/{assessment_id}/responses", response_model=ResponseOut)
def upsert_response(
    assessment_id: int,
    payload: ResponseCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    assessment = db.query(Assessment).filter(Assessment.id == assessment_id, Assessment.is_deleted.is_(False)).first()
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment non trovato.")
    response = (
        db.query(ResponseModel)
        .filter(ResponseModel.assessment_id == assessment_id, ResponseModel.item_id == payload.item_id)
        .first()
    )
    if response:
        for field, value in payload.dict().items():
            setattr(response, field, value)
        response.updated_by_id = user.id
    else:
        response = ResponseModel(
            assessment_id=assessment_id,
            updated_by_id=user.id,
            **payload.dict(),
        )
        db.add(response)
    db.commit()
    _refresh_summary(db, assessment, user.id)
    log_action(db, user.id, "update", "response", response.id, "Aggiornato item.")
    return response


@app.get("/api/assessments/{assessment_id}/summary", response_model=SummaryOut)
def get_summary(assessment_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    summary = db.query(Summary).filter(Summary.assessment_id == assessment_id).first()
    if not summary:
        raise HTTPException(status_code=404, detail="Sintesi non trovata.")
    return summary


@app.patch("/api/assessments/{assessment_id}/summary", response_model=SummaryOut)
def update_summary(
    assessment_id: int,
    payload: SummaryUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    summary = db.query(Summary).filter(Summary.assessment_id == assessment_id).first()
    if not summary:
        raise HTTPException(status_code=404, detail="Sintesi non trovata.")
    summary.manual_text = payload.manual_text
    summary.manual_edited_at = datetime.utcnow()
    db.commit()
    log_action(db, user.id, "update", "summary", summary.id, "Modifica sintesi manuale.")
    return summary


@app.post("/api/assessments/{assessment_id}/plans", response_model=PlanOut)
def generate_plan(assessment_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    assessment = db.query(Assessment).filter(Assessment.id == assessment_id, Assessment.is_deleted.is_(False)).first()
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment non trovato.")
    responses = db.query(ResponseModel).filter(ResponseModel.assessment_id == assessment_id).all()
    response_dicts = [{"item_id": r.item_id, "support": r.support} for r in responses]
    content_json, content_text = build_plan_content(response_dicts)
    latest_version = db.query(func.max(Plan.version)).filter(Plan.assessment_id == assessment_id).scalar() or 0
    db.query(Plan).filter(Plan.assessment_id == assessment_id).update({Plan.is_active: False})
    plan = Plan(
        assessment_id=assessment_id,
        version=latest_version + 1,
        generated_by_id=user.id,
        content_json=content_json,
        content_text=content_text,
        is_active=True,
    )
    db.add(plan)
    db.commit()
    log_action(db, user.id, "generate", "plan", plan.id, "Generato piano educativo.")
    return plan


@app.get("/api/assessments/{assessment_id}/plans", response_model=list[PlanOut])
def list_plans(assessment_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return db.query(Plan).filter(Plan.assessment_id == assessment_id).order_by(Plan.version.desc()).all()


@app.get("/api/dashboard/profile/{profile_id}")
def dashboard_profile(profile_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    assessments = (
        db.query(Assessment)
        .filter(
            Assessment.profile_id == profile_id,
            Assessment.status == "finalized",
            Assessment.is_deleted.is_(False),
        )
        .order_by(Assessment.assessment_date.asc())
        .all()
    )
    series = []
    for assessment in assessments:
        responses = db.query(ResponseModel).filter(ResponseModel.assessment_id == assessment.id).all()
        area_values = {}
        for area_id in {ITEM_TO_AREA.get(r.item_id) for r in responses}:
            supports = [r.support for r in responses if ITEM_TO_AREA.get(r.item_id) == area_id]
            if supports:
                area_values[area_id] = sum(supports) / len(supports)
        series.append(
            {
                "assessment_id": assessment.id,
                "date": assessment.assessment_date.isoformat(),
                "areas": area_values,
            }
        )
    return {"series": series}


@app.get("/api/dashboard/compare")
def compare_assessments(
    assessment_a: int = Query(...),
    assessment_b: int = Query(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    responses_a = db.query(ResponseModel).filter(ResponseModel.assessment_id == assessment_a).all()
    responses_b = db.query(ResponseModel).filter(ResponseModel.assessment_id == assessment_b).all()
    map_a = {r.item_id: r.support for r in responses_a}
    map_b = {r.item_id: r.support for r in responses_b}
    deltas = []
    for item_id in set(map_a) | set(map_b):
        support_a = map_a.get(item_id)
        support_b = map_b.get(item_id)
        if support_a is None or support_b is None:
            continue
        delta = support_b - support_a
        deltas.append({"item_id": item_id, "delta": delta})
    return {"deltas": deltas}


@app.get("/api/dashboard/item/{item_id}")
def dashboard_item(
    item_id: str,
    max_support: int = 1,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    subquery = (
        db.query(
            Assessment.profile_id,
            func.max(Assessment.assessment_date).label("latest_date"),
        )
        .filter(Assessment.status == "finalized", Assessment.is_deleted.is_(False))
        .group_by(Assessment.profile_id)
        .subquery()
    )
    assessments = (
        db.query(Assessment)
        .join(subquery, and_(Assessment.profile_id == subquery.c.profile_id, Assessment.assessment_date == subquery.c.latest_date))
        .all()
    )
    rows = []
    for assessment in assessments:
        response = (
            db.query(ResponseModel)
            .filter(ResponseModel.assessment_id == assessment.id, ResponseModel.item_id == item_id)
            .first()
        )
        if response and response.support <= max_support:
            profile = db.query(Profile).filter(Profile.id == assessment.profile_id).first()
            rows.append(
                {
                    "profile_id": profile.id,
                    "profile_name": profile.display_name,
                    "assessment_date": assessment.assessment_date.isoformat(),
                    "support": response.support,
                    "freq": response.freq,
                    "gen": response.gen,
                }
            )
    return {"item_id": item_id, "results": rows}


@app.post("/api/work-groups", response_model=WorkGroupOut)
def create_group(payload: WorkGroupCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    group = WorkGroup(
        title=payload.title,
        item_id=payload.item_id,
        area_id=payload.area_id,
        support_min=payload.support_min,
        support_max=payload.support_max,
        created_by_id=user.id,
        start_date=payload.start_date,
        end_date=payload.end_date,
        notes=payload.notes,
        status=payload.status,
    )
    db.add(group)
    db.commit()
    for profile_id in payload.member_profile_ids:
        db.add(GroupMember(group_id=group.id, profile_id=profile_id))
    for user_id in payload.assignee_user_ids:
        db.add(GroupAssignee(group_id=group.id, user_id=user_id))
    db.commit()
    log_action(db, user.id, "create", "group", group.id, "Creato gruppo di lavoro.")
    return _group_out(group)


@app.get("/api/work-groups", response_model=list[WorkGroupOut])
def list_groups(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return [_group_out(group) for group in db.query(WorkGroup).order_by(WorkGroup.created_at.desc()).all()]


@app.patch("/api/work-groups/{group_id}", response_model=WorkGroupOut)
def update_group(group_id: int, payload: WorkGroupUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    group = db.query(WorkGroup).filter(WorkGroup.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Gruppo non trovato.")
    for field, value in payload.dict(exclude_unset=True).items():
        if field in {"member_profile_ids", "assignee_user_ids"}:
            continue
        setattr(group, field, value)
    if payload.member_profile_ids is not None:
        db.query(GroupMember).filter(GroupMember.group_id == group_id).delete()
        for profile_id in payload.member_profile_ids:
            db.add(GroupMember(group_id=group_id, profile_id=profile_id))
    if payload.assignee_user_ids is not None:
        db.query(GroupAssignee).filter(GroupAssignee.group_id == group_id).delete()
        for user_id in payload.assignee_user_ids:
            db.add(GroupAssignee(group_id=group_id, user_id=user_id))
    db.commit()
    log_action(db, user.id, "update", "group", group.id, "Aggiornato gruppo.")
    return _group_out(group)


@app.delete("/api/work-groups/{group_id}")
def delete_group(group_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Solo admin può eliminare definitivamente.")
    group = db.query(WorkGroup).filter(WorkGroup.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Gruppo non trovato.")
    db.delete(group)
    db.commit()
    log_action(db, user.id, "delete", "group", group_id, "Eliminato gruppo.")
    return {"ok": True}


@app.get("/api/audit", response_model=list[AuditOut], dependencies=[Depends(require_admin)])
def list_audit(db: Session = Depends(get_db)):
    return db.query(AuditLog).order_by(AuditLog.created_at.desc()).limit(200).all()


def _group_out(group: WorkGroup) -> WorkGroupOut:
    return WorkGroupOut(
        id=group.id,
        title=group.title,
        item_id=group.item_id,
        area_id=group.area_id,
        support_min=group.support_min,
        support_max=group.support_max,
        created_by_id=group.created_by_id,
        created_at=group.created_at,
        updated_at=group.updated_at,
        start_date=group.start_date,
        end_date=group.end_date,
        notes=group.notes,
        status=group.status,
        members=[m.profile_id for m in group.members],
        assignees=[a.user_id for a in group.assignees],
    )


def _pdf_response(content: bytes, filename: str) -> Response:
    return Response(content, media_type="application/pdf", headers={"Content-Disposition": f"attachment; filename={filename}"})


@app.get("/api/exports/assessments.csv")
def export_assessments_csv(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    assessments = (
        db.query(Assessment)
        .filter(Assessment.is_deleted.is_(False), Assessment.status == "finalized")
        .all()
    )
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["id", "profile_id", "assessment_date", "status", "operator_name", "operator_role"])
    for a in assessments:
        writer.writerow([a.id, a.profile_id, a.assessment_date, a.status, a.operator_name, a.operator_role])
    log_action(db, user.id, "export", "assessment", None, "Export CSV assessments.")
    return Response(output.getvalue(), media_type="text/csv")


@app.get("/api/exports/item/{item_id}.csv")
def export_item_csv(item_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    dashboard = dashboard_item(item_id, db=db, user=user)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["profile_id", "profile_name", "assessment_date", "support", "freq", "gen"])
    for row in dashboard["results"]:
        writer.writerow([row["profile_id"], row["profile_name"], row["assessment_date"], row["support"], row["freq"], row["gen"]])
    log_action(db, user.id, "export", "dashboard_item", None, f"Export CSV item {item_id}.")
    return Response(output.getvalue(), media_type="text/csv")


@app.get("/api/exports/assessment/{assessment_id}.pdf")
def export_assessment_pdf(assessment_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas

    assessment = db.query(Assessment).filter(Assessment.id == assessment_id).first()
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment non trovato.")
    profile = db.query(Profile).filter(Profile.id == assessment.profile_id).first()
    responses = db.query(ResponseModel).filter(ResponseModel.assessment_id == assessment_id).all()
    summary = db.query(Summary).filter(Summary.assessment_id == assessment_id).first()
    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    y = 800
    c.setFont("Helvetica-Bold", 14)
    c.drawString(40, y, "EduFAD - Report Assessment")
    y -= 20
    c.setFont("Helvetica", 10)
    age = assessment.assessment_date.year - profile.date_of_birth.year - (
        (assessment.assessment_date.month, assessment.assessment_date.day) < (profile.date_of_birth.month, profile.date_of_birth.day)
    )
    c.drawString(40, y, f"Profilo: {profile.display_name} (DOB {profile.date_of_birth}, età {age} anni)")
    y -= 14
    c.drawString(40, y, f"Data: {assessment.assessment_date} | Operatore: {assessment.operator_name} ({assessment.operator_role})")
    y -= 14
    c.drawString(40, y, f"Versione checklist: {CHECKLIST['version']}")
    y -= 20
    if summary:
        c.drawString(40, y, "Sintesi:")
        y -= 14
        for line in summary.auto_text.split(". "):
            c.drawString(50, y, line.strip())
            y -= 12
    y -= 10
    c.drawString(40, y, "Risposte:")
    y -= 14
    for resp in responses:
        c.drawString(50, y, f"{resp.item_id}: S{resp.support} F{resp.freq or '-'} G{resp.gen or '-'}")
        y -= 12
        if y < 60:
            c.showPage()
            y = 800
    c.setFont("Helvetica-Oblique", 8)
    c.drawString(40, 30, "Strumento educativo/osservativo, non diagnostico o terapeutico.")
    c.showPage()
    c.save()
    log_action(db, user.id, "export", "assessment_pdf", assessment_id, "Export PDF assessment.")
    return _pdf_response(buffer.getvalue(), f"assessment_{assessment_id}.pdf")


@app.get("/api/exports/item/{item_id}.pdf")
def export_item_pdf(item_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas

    dashboard = dashboard_item(item_id, db=db, user=user)
    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    y = 800
    c.setFont("Helvetica-Bold", 14)
    c.drawString(40, y, f"EduFAD - Dashboard Item {item_id}")
    y -= 20
    c.setFont("Helvetica", 10)
    c.drawString(40, y, f"Esportato da: {user.username}")
    y -= 14
    for row in dashboard["results"]:
        c.drawString(40, y, f"{row['profile_name']} - {row['assessment_date']} - S{row['support']}")
        y -= 12
        if y < 60:
            c.showPage()
            y = 800
    c.setFont("Helvetica-Oblique", 8)
    c.drawString(40, 30, "Strumento educativo/osservativo, non diagnostico o terapeutico.")
    c.showPage()
    c.save()
    log_action(db, user.id, "export", "dashboard_item_pdf", None, f"Export PDF item {item_id}.")
    return _pdf_response(buffer.getvalue(), f"item_{item_id}.pdf")


@app.get("/api/exports/plan/{plan_id}.pdf")
def export_plan_pdf(plan_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas

    plan = db.query(Plan).filter(Plan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Piano non trovato.")
    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    y = 800
    c.setFont("Helvetica-Bold", 14)
    c.drawString(40, y, f"EduFAD - Piano Educativo v{plan.version}")
    y -= 20
    c.setFont("Helvetica", 10)
    for line in plan.content_text.split("\n"):
        c.drawString(40, y, line[:110])
        y -= 12
        if y < 60:
            c.showPage()
            y = 800
    c.setFont("Helvetica-Oblique", 8)
    c.drawString(40, 30, "Strumento educativo/osservativo, non diagnostico o terapeutico.")
    c.showPage()
    c.save()
    log_action(db, user.id, "export", "plan_pdf", plan_id, "Export PDF piano.")
    return _pdf_response(buffer.getvalue(), f"plan_{plan_id}.pdf")


from pathlib import Path


static_dir = Path(__file__).resolve().parents[1] / "static"
app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")

