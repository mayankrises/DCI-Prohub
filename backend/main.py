from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import documents, annotations, tasks, users, projects, dci, imports

app = FastAPI(title="DCI ProHub API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(documents.router, prefix="/documents", tags=["Documents"])
app.include_router(annotations.router, prefix="/annotations", tags=["Annotations"])
app.include_router(tasks.router, prefix="/tasks", tags=["Tasks"])
app.include_router(users.router, prefix="/users", tags=["Users"])
app.include_router(projects.router, prefix="/projects", tags=["Projects"])
app.include_router(dci.router, prefix="/dci", tags=["DCI Dashboard"])
app.include_router(imports.router, prefix="/imports", tags=["Import/Export"])

@app.get("/")
def root():
    return {"status": "ok", "version": "2.0.0"}

@app.get("/healthz")
def healthz():
    return {"status": "ok"}
