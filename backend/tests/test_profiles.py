"""Your own profile: editing, validation, onboarding, photos, and account deletion."""

import base64

import pytest

from app import db
from app.profiles import strip_jpeg_metadata
from tests.helpers import FULL_PROFILE, make_person, signup

# A tiny JPEG with an EXIF block (marker FF E1) that contains a fake GPS note.
EXIF = b"Exif\x00\x00GPS 43.78N 79.18W"
TINY_JPEG = (
    b"\xff\xd8"
    + b"\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00"
    + b"\xff\xe1" + (len(EXIF) + 2).to_bytes(2, "big") + EXIF
    + b"\xff\xdb\x00\x05\x00\x01\x02"
    + b"\xff\xda\x00\x02image-data-here\xff\xd9"
)


def data_url(data, mime="image/jpeg"):
    return f"data:{mime};base64," + base64.b64encode(data).decode()


def test_finishing_the_profile_marks_onboarding_done(database, client):
    headers, user = signup(client)
    assert user["onboarded"] is False
    partial = client.patch("/api/me", json={"university": "UofT Scarborough"}, headers=headers).json()
    assert partial["onboarded"] is False
    full = client.patch("/api/me", json=FULL_PROFILE, headers=headers).json()
    assert full["onboarded"] is True


def test_profile_changes_are_saved(database, client):
    headers, _ = make_person(client)
    client.patch("/api/me", json={"hook": "New hook", "interests": ["Chess", "chess", "Books"]}, headers=headers)
    me = client.get("/api/me", headers=headers).json()
    assert me["hook"] == "New hook"
    assert me["interests"] == ["Chess", "Books"]  # repeats removed, ignoring capitals


def test_availability_is_tidied(database, client):
    headers, _ = make_person(client)
    response = client.patch("/api/me", json={"availability": {"Mon": ["evening", "morning", "morning"], "Tue": []}},
                            headers=headers)
    assert response.json()["availability"] == {"Mon": ["morning", "evening"]}


def test_age_and_goal_can_be_cleared(database, client):
    headers, _ = make_person(client)
    response = client.patch("/api/me", json={"age": None, "daily_goal_minutes": None}, headers=headers)
    assert response.status_code == 200
    assert response.json()["age"] is None


@pytest.mark.parametrize(
    "bad",
    [
        {"age": 12},
        {"age": 150},
        {"name": None},
        {"name": ""},
        {"hook": "x" * 121},
        {"looking_for": ["A girlfriend"]},
        {"interests": ["x"] * 13},
        {"availability": {"Funday": ["morning"]}},
        {"availability": {"Mon": ["midnight"]}},
        {"avatar_color": "red"},
        {"email": "new@example.com"},
        {"id": 2},
        {"is_demo": True},
    ],
)
def test_profile_rejects_bad_or_forbidden_changes(database, client, bad):
    headers, _ = make_person(client)
    assert client.patch("/api/me", json=bad, headers=headers).status_code == 422


def test_you_cannot_edit_someone_else_by_changing_an_id(database, client):
    a_headers, a = make_person(client, "Amira Khan")
    b_headers, b = make_person(client, "Tariq Aziz")
    # There is no id in the URL: /api/me always means the logged-in person, and "id" is refused.
    client.patch("/api/me", json={"hook": "Changed by Amira"}, headers=a_headers)
    assert client.patch("/api/me", json={"id": b["id"], "hook": "Hacked"}, headers=a_headers).status_code == 422
    assert client.get(f"/api/people/{b['id']}", headers=a_headers).json()["hook"] == FULL_PROFILE["hook"]


def test_public_profiles_hide_email_and_full_timetable(database, client):
    a_headers, _ = make_person(client, "Amira Khan")
    _, b = make_person(client, "Tariq Aziz")
    body = client.get(f"/api/people/{b['id']}", headers=a_headers).json()
    assert "email" not in body and "availability" not in body
    assert body["match"]["overlap"]  # only the times you're BOTH free


def test_photo_upload_strips_location_metadata(database, client):
    headers, _ = make_person(client)
    response = client.put("/api/me/photo", json={"image": data_url(TINY_JPEG)}, headers=headers)
    assert response.status_code == 200
    photo_url = response.json()["photo_url"]
    assert photo_url.startswith("/api/photos/")

    photo = client.get(photo_url)
    assert photo.status_code == 200
    assert photo.headers["content-type"] == "image/jpeg"
    assert b"GPS" not in photo.content
    assert b"image-data-here" in photo.content


@pytest.mark.parametrize("image", ["data:image/png;base64,iVBORw0KGgo=", "data:image/jpeg;base64,not-base64!!",
                                   data_url(b"GIF89a fake")])
def test_photo_upload_rejects_non_jpeg_files(database, client, image):
    headers, _ = make_person(client)
    assert client.put("/api/me/photo", json={"image": image}, headers=headers).status_code == 422


def test_photo_can_be_removed(database, client):
    headers, _ = make_person(client)
    url = client.put("/api/me/photo", json={"image": data_url(TINY_JPEG)}, headers=headers).json()["photo_url"]
    assert client.delete("/api/me/photo", headers=headers).json()["photo_url"] is None
    assert client.get(url).status_code == 404


def test_strip_jpeg_metadata_rejects_broken_files():
    with pytest.raises(ValueError):
        strip_jpeg_metadata(b"\xff\xd8\x00\x00")


def test_deleting_an_account_needs_confirmation(database, client):
    headers, _ = make_person(client)
    assert client.request("DELETE", "/api/me", json={"confirm": "yes"}, headers=headers).status_code == 422
    assert client.request("DELETE", "/api/me", json={"confirm": "DELETE"}, headers=headers).status_code == 200
    with db.get_connection() as conn, conn.cursor() as cur:
        cur.execute("SELECT count(*) AS n FROM users")
        assert cur.fetchone()["n"] == 0


def test_options_list_the_friendship_goals(client):
    body = client.get("/api/options").json()
    assert "Study buddy" in body["friendship_goals"]
    assert body["days"][0] == "Mon"
