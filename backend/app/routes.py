from __future__ import annotations

import re

from fastapi import APIRouter, Depends, Request, Response
from fastapi.concurrency import run_in_threadpool

from backend.app import fleet_report, mailer, report, service
from backend.app.auth import require_user
from backend.app import reference
from backend.app.config import get_settings
from backend.app.errors import ApiError
from backend.app.schemas import (CompareRequest, CompareResult, FleetReportRequest, FleetRequest, FleetResponse, PredictionResult, PredictRequest, RecommendRequest, RecommendResponse,
                                 ReportEmailRequest, ReportRequest, ReportSent, ReportStatus)
from engine.decide.fleet import FleetInputError

router = APIRouter(prefix="/api/v1", dependencies=[Depends(require_user)])


def _check_mode(mode: str) -> None:
    if mode != "prior":
        raise ApiError(400, "unsupported_mode", f"Mode {mode!r} is not available: v1 runs in 'prior' mode only. "
                       "Calibrated mode needs operator data and is not wired into the API.")


@router.post("/predict", response_model=PredictionResult, tags=["predict"],
             summary="Forecast battery retention, replacement window, range and cost per km for one scenario")
async def predict(req: PredictRequest, request: Request, response: Response):
    _check_mode(req.mode)
    st = request.app.state
    key = service.LRUCache.key(req, st.model_version)
    hit = st.cache.get(key)
    if hit is not None:
        response.headers["X-Cache"] = "HIT"
        return hit
    result = await run_in_threadpool(service.run_prediction, req, st.models, st.model_version)
    st.cache.put(key, result)
    response.headers["X-Cache"] = "MISS"
    return result


@router.post("/compare", response_model=CompareResult, tags=["predict"],
             summary="Paired what-if comparison of 2-4 scenarios on shared random draws")
async def compare(req: CompareRequest, request: Request, response: Response):
    _check_mode(req.mode)
    st = request.app.state
    key = service.LRUCache.key(req, st.model_version)
    hit = st.cache.get(key)
    if hit is not None:
        response.headers["X-Cache"] = "HIT"
        return hit
    result = await run_in_threadpool(service.run_compare, req, st.models, st.model_version)
    st.cache.put(key, result)
    response.headers["X-Cache"] = "MISS"
    return result


@router.post("/recommend", response_model=RecommendResponse, tags=["predict"],
             summary="Search real usage levers for a bus and return goal-based presets with plain-language explanations")
async def recommend(req: RecommendRequest, request: Request, response: Response):
    _check_mode(req.mode)
    st = request.app.state
    key = service.LRUCache.key(req, st.model_version)
    hit = st.cache.get(key)
    if hit is not None:
        response.headers["X-Cache"] = "HIT"
        return hit
    result = await run_in_threadpool(service.run_recommend, req, st.models, st.model_version)
    st.cache.put(key, result)
    response.headers["X-Cache"] = "MISS"
    return result


@router.post("/fleet", response_model=FleetResponse, tags=["predict"],
             summary="Forecast a fleet of mixed-age buses in duty classes: replacements and spend by financial year, per-class and per-cohort summaries")
async def fleet(req: FleetRequest, request: Request, response: Response):
    _check_mode(req.mode)
    st = request.app.state
    key = service.LRUCache.key(req, st.model_version)
    hit = st.cache.get(key)
    if hit is not None:
        response.headers["X-Cache"] = "HIT"
        return hit
    try:
        result = await run_in_threadpool(service.run_fleet, req, st.models, st.model_version)
    except FleetInputError as e:
        raise ApiError(422, "fleet_not_forecastable", str(e)) from e
    st.cache.put(key, result)
    response.headers["X-Cache"] = "MISS"
    return result


@router.get("/presets", tags=["reference"], summary="Bus archetypes with every default's source and evidence level")
async def get_presets():
    return {"mode": "prior", "presets": await run_in_threadpool(reference.presets_json)}


@router.get("/zones", tags=["reference"], summary="Climate zones: monthly air-temperature statistics and data provenance")
async def get_zones():
    return await run_in_threadpool(reference.zones)


@router.get("/evidence", tags=["reference"], summary="Datasets, measured model errors, training coverage and known limitations")
async def get_evidence(request: Request):
    st = request.app.state
    return await run_in_threadpool(reference.evidence, get_settings().artifact_dir, st.versions, st.model_version, st.models)


# ---- comparison report (PDF download and email) ----------------------------------------------------------------------------------------

async def _predict_cached(request: Request, scenario) -> PredictionResult:
    """Same cache as /predict, so a report for two buses already on screen costs no new model run."""
    st = request.app.state
    req = PredictRequest(scenario=scenario)
    key = service.LRUCache.key(req, st.model_version)
    hit = st.cache.get(key)
    if hit is None:
        hit = await run_in_threadpool(service.run_prediction, req, st.models, st.model_version)
        st.cache.put(key, hit)
    return hit


async def _build_report(request: Request, req: ReportRequest) -> tuple[bytes, list[str]]:
    st = request.app.state
    pa, pb = await _predict_cached(request, req.scenario_a), await _predict_cached(request, req.scenario_b)
    creq = CompareRequest(scenarios=[req.scenario_a, req.scenario_b])
    key = service.LRUCache.key(creq, st.model_version)
    cmp = st.cache.get(key)
    if cmp is None:
        cmp = await run_in_threadpool(service.run_compare, creq, st.models, st.model_version)
        st.cache.put(key, cmp)
    pdf = await run_in_threadpool(report.build_pdf, pa, pb, cmp, req.fleet_size)
    return pdf, [re.sub(r"</?b>", "", t) for t in report.headline(pa, pb, cmp.deltas[0])]


@router.post("/report/fleet-pdf", tags=["report"], summary="The fleet forecast as a PDF",
             responses={200: {"content": {"application/pdf": {}}, "description": "the fleet PDF report"}})
async def report_fleet_pdf(req: FleetReportRequest, request: Request):
    _check_mode(req.mode)
    st = request.app.state
    base = FleetRequest(**req.model_dump(exclude={"name"}))
    key = service.LRUCache.key(base, st.model_version)
    result = st.cache.get(key)
    if result is None:
        try:
            result = await run_in_threadpool(service.run_fleet, base, st.models, st.model_version)
        except FleetInputError as e:
            raise ApiError(422, "fleet_not_forecastable", str(e)) from e
        st.cache.put(key, result)
    pdf = await run_in_threadpool(fleet_report.build_fleet_pdf, result, len(req.buses), req.name)
    return Response(content=pdf, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{fleet_report.filename()}"', "Cache-Control": "no-store"})


@router.get("/report/status", response_model=ReportStatus, tags=["report"], summary="Whether report email is set up on this server")
async def report_status():
    return ReportStatus(email_enabled=mailer.enabled(get_settings()))


@router.post("/report/pdf", tags=["report"], summary="The Bus A vs Bus B comparison as a PDF",
             responses={200: {"content": {"application/pdf": {}}, "description": "the PDF report"}})
async def report_pdf(req: ReportRequest, request: Request):
    pdf, _ = await _build_report(request, req)
    return Response(content=pdf, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{report.filename()}"', "Cache-Control": "no-store"})


@router.post("/report/email", response_model=ReportSent, tags=["report"], summary="Email the comparison report to one address")
async def report_email(req: ReportEmailRequest, request: Request, user: str = Depends(require_user)):
    st = get_settings()
    if not mailer.enabled(st):
        raise ApiError(503, "email_not_set_up", "Email is not set up on this server. Download the PDF and send it yourself.")
    to = req.to.strip()
    if not mailer.valid_address(to):
        raise ApiError(422, "invalid_address", "That does not look like one email address. Enter a single address such as name@company.com.")
    client = f"{user}@{request.client.host if request.client else 'unknown'}"
    mailer.check_rate(client)
    pdf, summary = await _build_report(request, req)
    msg = mailer.build_message(st, to, pdf, report.filename(), summary)
    await run_in_threadpool(mailer.send, st, msg)
    mailer.record(client)
    return ReportSent(to=mailer.mask(to))
