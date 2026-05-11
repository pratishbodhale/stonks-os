import uvicorn

if __name__ == "__main__":
    uvicorn.run(
        "holdings.backend.main:app",
        host="0.0.0.0",
        port=8010,
        reload=True,
    )
