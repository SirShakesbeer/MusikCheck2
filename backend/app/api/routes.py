from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.ws_manager import ws_manager
from app.schemas.game import ApiEnvelope, CreateLobbyRequest, GuessRequest, JoinLobbyRequest, StopRequest
from app.services.service_container import game_engine, game_mode_registry, media_ingestion_service

router = APIRouter()


@router.get("/modes")
def list_modes() -> dict:
    return {"ok": True, "data": game_mode_registry.all_modes()}


@router.get("/providers")
def list_providers() -> dict:
    return {"ok": True, "data": media_ingestion_service.providers}


@router.post("/lobbies", response_model=ApiEnvelope)
async def create_lobby(payload: CreateLobbyRequest, db: Session = Depends(get_db)):
    try:
        lobby = game_engine.create_lobby(db, payload.host_name, payload.mode_key)
        state = game_engine.get_state(db, lobby.code, message="Lobby created")
        return ApiEnvelope(data=state)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.post("/lobbies/{code}/join", response_model=ApiEnvelope)
async def join_lobby(code: str, payload: JoinLobbyRequest, db: Session = Depends(get_db)):
    try:
        game_engine.join_team(db, code, payload.player_name, payload.team_name)
        state = game_engine.get_state(db, code, message=f"{payload.player_name} joined {payload.team_name}")
        await ws_manager.broadcast(code, {"type": "state", "data": state.model_dump()})
        return ApiEnvelope(data=state)
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@router.post("/lobbies/{code}/rounds/start", response_model=ApiEnvelope)
async def start_round(code: str, db: Session = Depends(get_db)):
    try:
        game_engine.start_round(db, code)
        state = game_engine.get_state(db, code, message="Round started")
        await ws_manager.broadcast(code, {"type": "state", "data": state.model_dump()})
        return ApiEnvelope(data=state)
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@router.post("/lobbies/{code}/rounds/stop", response_model=ApiEnvelope)
async def stop_round(code: str, payload: StopRequest, db: Session = Depends(get_db)):
    try:
        game_engine.stop_round(db, code, payload.team_id)
        state = game_engine.get_state(db, code, message=f"Stopped by {payload.player_name}")
        await ws_manager.broadcast(code, {"type": "state", "data": state.model_dump()})
        return ApiEnvelope(data=state)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.post("/lobbies/{code}/rounds/guess", response_model=ApiEnvelope)
async def submit_guess(code: str, payload: GuessRequest, db: Session = Depends(get_db)):
    try:
        correct = game_engine.submit_guess(db, code, payload.team_id, payload.title, payload.artist)
        message = "Correct guess!" if correct else "Incorrect guess"
        state = game_engine.get_state(db, code, message=message)
        await ws_manager.broadcast(code, {"type": "state", "data": state.model_dump()})
        return ApiEnvelope(data=state)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.post("/lobbies/{code}/rounds/next-stage", response_model=ApiEnvelope)
async def next_stage(code: str, db: Session = Depends(get_db)):
    try:
        advanced = game_engine.next_stage(db, code)
        message = "Advanced stage" if advanced else "Round ended - no guess"
        state = game_engine.get_state(db, code, message=message)
        await ws_manager.broadcast(code, {"type": "state", "data": state.model_dump()})
        return ApiEnvelope(data=state)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.get("/lobbies/{code}", response_model=ApiEnvelope)
def get_lobby_state(code: str, db: Session = Depends(get_db)):
    try:
        return ApiEnvelope(data=game_engine.get_state(db, code))
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
