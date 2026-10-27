from fastapi.testclient import TestClient


def sign_up(client: TestClient, username: str = "Drew_1") -> dict[str, str]:
    """Creates an account and returns the Authorization header for it."""
    response = client.post(
        "/api/auth/signup", json={"username": username, "password": "correct horse"}
    )
    assert response.status_code == 201, response.text
    return {"Authorization": f"Bearer {response.json()['token']}"}
