from __future__ import annotations

import os

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend.routers import annotations, dci, documents, imports, locks, projects, tasks, users

app = FastAPI(
    title="DCI ProHub API",
    description="FastAPI backend for DCI workbook dashboards and document collaboration.",
    version="3.0.0",
)

origins = [
    item.strip()
    for item in os.getenv(
        "CORS_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000",
    ).split(",")
    if item.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(ValueError)
async def value_error_handler(_: Request, exc: ValueError) -> JSONResponse:
    return JSONResponse(status_code=400, content={"detail": str(exc)})


@app.exception_handler(RuntimeError)
async def runtime_error_handler(_: Request, exc: RuntimeError) -> JSONResponse:
    return JSONResponse(status_code=409, content={"detail": str(exc)})


app.include_router(projects.router, prefix="/projects", tags=["Projects"])
app.include_router(imports.router, prefix="/imports", tags=["Import / Export"])
app.include_router(dci.router, prefix="/dci", tags=["DCI Dashboard"])
app.include_router(documents.router, prefix="/documents", tags=["Project Documents"])
app.include_router(annotations.router, prefix="/annotations", tags=["Annotations"])
app.include_router(locks.router, prefix="/locks", tags=["Document Locks"])
app.include_router(tasks.router, prefix="/tasks", tags=["Tasks"])
app.include_router(users.router, prefix="/users", tags=["Users"])


@app.get("/")
def root() -> dict[str, str]:
    return {"status": "ok", "name": "DCI ProHub API", "version": "3.0.0"}


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}
