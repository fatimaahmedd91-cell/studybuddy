"""The real email, Twilio and Google Places code, talking over the network to local stand-in servers.

Other tests replace these functions entirely. These run them for real: an encrypted SMTP conversation
(STARTTLS, a checked certificate, a login, the message), and real HTTP requests in the shape the providers
document. Only the far end is a stand-in, so a live provider account still needs one manual check.
"""

import base64
import datetime
import json
import re
import socketserver
import ssl
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs

import pytest
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.x509.oid import NameOID

from app import config, planning, verification
from tests.helpers import befriend, make_person, signup


# ---------- A tiny SMTP server: STARTTLS, then AUTH PLAIN, then the message ----------


def make_certificate(folder):
    """A self-signed certificate for "localhost". Returns the path of the file holding it."""
    key = ec.generate_private_key(ec.SECP256R1())
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "localhost")])
    now = datetime.datetime.now(datetime.timezone.utc)
    cert = (
        x509.CertificateBuilder().subject_name(name).issuer_name(name).public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - datetime.timedelta(days=1)).not_valid_after(now + datetime.timedelta(days=1))
        .add_extension(x509.SubjectAlternativeName([x509.DNSName("localhost")]), critical=False)
        .add_extension(x509.BasicConstraints(ca=True, path_length=None), critical=True)
        .add_extension(x509.KeyUsage(digital_signature=True, key_cert_sign=True, content_commitment=False,
                                     key_encipherment=False, data_encipherment=False, key_agreement=False,
                                     crl_sign=False, encipher_only=False, decipher_only=False), critical=True)
        .add_extension(x509.SubjectKeyIdentifier.from_public_key(key.public_key()), critical=False)
        .add_extension(x509.AuthorityKeyIdentifier.from_issuer_public_key(key.public_key()), critical=False)
        .sign(key, hashes.SHA256())
    )
    cert_file, key_file = folder / "cert.pem", folder / "key.pem"
    cert_file.write_bytes(cert.public_bytes(serialization.Encoding.PEM))
    key_file.write_bytes(key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
                                           serialization.NoEncryption()))
    return cert_file, key_file


class SMTPHandler(socketserver.StreamRequestHandler):
    def send(self, line):
        self.wfile.write((line + "\r\n").encode())
        self.wfile.flush()

    def handle(self):
        server, encrypted = self.server, False
        self.send("220 localhost test ESMTP")
        while line := self.rfile.readline().decode().rstrip("\r\n"):
            command = line.split(" ", 1)[0].upper()
            if command in ("EHLO", "HELO"):
                # Like real providers: logging in is only offered once the connection is encrypted.
                self.send("250-localhost")
                self.send("250 AUTH PLAIN" if encrypted else "250 STARTTLS")
            elif command == "STARTTLS":
                self.send("220 Go ahead")
                self.connection = server.tls.wrap_socket(self.connection, server_side=True)
                self.rfile, self.wfile = self.connection.makefile("rb"), self.connection.makefile("wb")
                encrypted = True
            elif command == "AUTH":
                server.logins.append(base64.b64decode(line.split()[2]).split(b"\0")[1:])
                self.send("235 Logged in")
            elif command == "DATA":
                self.send("354 Go ahead")
                lines = []
                while (data := self.rfile.readline()) not in (b".\r\n", b""):
                    lines.append(data)
                server.messages.append({"encrypted": encrypted, "text": b"".join(lines).decode()})
                self.send("250 Queued")
            elif command == "QUIT":
                self.send("221 Bye")
                return
            else:  # MAIL FROM, RCPT TO, ...
                self.send("250 OK")


@pytest.fixture
def smtp_server(tmp_path, monkeypatch):
    cert_file, key_file = make_certificate(tmp_path)
    server = socketserver.ThreadingTCPServer(("127.0.0.1", 0), SMTPHandler)
    server.daemon_threads = True
    server.tls = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    server.tls.load_cert_chain(cert_file, key_file)
    server.messages, server.logins = [], []
    threading.Thread(target=server.serve_forever, daemon=True).start()
    monkeypatch.setattr(config, "SMTP_HOST", "localhost")
    monkeypatch.setattr(config, "SMTP_PORT", server.server_address[1])
    monkeypatch.setattr(config, "SMTP_USER", "meetkat-mailer")
    monkeypatch.setattr(config, "SMTP_PASSWORD", "mail-password")
    monkeypatch.setattr(config, "SMTP_FROM", "Meetkat <hello@meetkat.example>")
    server.trust = lambda: monkeypatch.setattr(
        verification, "tls_context", lambda: ssl.create_default_context(cafile=str(cert_file)))
    yield server
    server.shutdown()


def test_email_code_goes_through_an_encrypted_login_to_the_mail_server(database, client, smtp_server):
    smtp_server.trust()
    headers, user = signup(client)
    assert client.post("/api/verification/email/send", headers=headers).status_code == 200
    [message] = smtp_server.messages
    assert message["encrypted"] is True
    assert smtp_server.logins == [[b"meetkat-mailer", b"mail-password"]]
    assert f"To: {user['email']}" in message["text"] and "Subject: Your Meetkat verification code" in message["text"]
    code = re.search(r"\b(\d{6})\b", message["text"]).group(1)
    confirmed = client.post("/api/verification/email/confirm", json={"code": code}, headers=headers).json()
    assert confirmed["email_verified"] is True


def test_a_mail_server_with_an_untrusted_certificate_gets_nothing(database, client, smtp_server):
    # Without trusting the test certificate, the app refuses to log in or send: nobody in between can read codes.
    headers, _ = signup(client)
    response = client.post("/api/verification/email/send", headers=headers)
    assert response.status_code == 502 and "couldn't send" in response.json()["detail"]
    assert smtp_server.messages == [] and smtp_server.logins == []


def test_password_reset_email_is_really_sent(database, client, smtp_server):
    smtp_server.trust()
    _, user = signup(client, password="old-password-1")
    assert client.post("/api/auth/password-reset/request", json={"email": user["email"]}).status_code == 200
    [message] = smtp_server.messages
    assert "Subject: Reset your Meetkat password" in message["text"]
    code = re.search(r"\b(\d{6})\b", message["text"]).group(1)
    response = client.post("/api/auth/password-reset/confirm",
                           json={"email": user["email"], "code": code, "new_password": "new-password-2"})
    assert response.status_code == 200
    assert client.post("/api/auth/login", json={"email": user["email"], "password": "new-password-2"}).status_code == 200


# ---------- A stand-in web server for Twilio Verify and Google Places ----------


@pytest.fixture
def web_server():
    """Answers with whatever `server.reply(path, body)` returns, and records every request."""

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            body = self.rfile.read(int(self.headers["Content-Length"]))
            server.requests.append({"path": self.path, "headers": dict(self.headers), "body": body.decode()})
            status, payload = server.reply(self.path, body.decode())
            data = json.dumps(payload).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def log_message(self, *args):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    server.requests = []
    server.url = f"http://127.0.0.1:{server.server_address[1]}"
    threading.Thread(target=server.serve_forever, daemon=True).start()
    yield server
    server.shutdown()


@pytest.fixture
def twilio_server(web_server, monkeypatch):
    monkeypatch.setattr(verification, "TWILIO_BASE", f"{web_server.url}/v2/Services")
    monkeypatch.setattr(config, "TWILIO_ACCOUNT_SID", "AC0123")
    monkeypatch.setattr(config, "TWILIO_AUTH_TOKEN", "twilio-token")
    monkeypatch.setattr(config, "TWILIO_VERIFY_SERVICE_SID", "VA0123")

    def reply(path, body):
        form = parse_qs(body)
        if path.endswith("/Verifications"):
            return 201, {"sid": "VE1", "status": "pending", "to": form["To"][0], "channel": form["Channel"][0]}
        if path.endswith("/VerificationCheck"):
            return 200, {"sid": "VE1", "status": "approved" if form["Code"] == ["424242"] else "pending"}
        return 404, {"code": 20404, "message": "Not found"}

    web_server.reply = reply
    return web_server


def test_phone_codes_use_twilio_verify_as_documented(database, client, twilio_server):
    headers, _ = signup(client)
    client.patch("/api/me/phone", json={"phone": "+14165550123"}, headers=headers)
    assert client.post("/api/verification/phone/send", headers=headers).status_code == 200
    assert client.post("/api/verification/phone/confirm", json={"code": "111111"}, headers=headers).status_code == 400
    ok = client.post("/api/verification/phone/confirm", json={"code": "424242"}, headers=headers).json()
    assert ok["phone_verified"] is True

    start, wrong, right = twilio_server.requests
    assert start["path"] == "/v2/Services/VA0123/Verifications"
    assert parse_qs(start["body"]) == {"To": ["+14165550123"], "Channel": ["sms"]}
    assert wrong["path"] == right["path"] == "/v2/Services/VA0123/VerificationCheck"
    assert parse_qs(right["body"]) == {"To": ["+14165550123"], "Code": ["424242"]}
    expected = "Basic " + base64.b64encode(b"AC0123:twilio-token").decode()
    assert all(r["headers"]["Authorization"] == expected for r in twilio_server.requests)
    assert all(r["headers"]["Content-Type"] == "application/x-www-form-urlencoded" for r in twilio_server.requests)


def test_twilio_refusing_shows_an_honest_error(database, client, twilio_server):
    twilio_server.reply = lambda path, body: (401, {"code": 20003, "message": "Authenticate"})
    headers, _ = signup(client)
    client.patch("/api/me/phone", json={"phone": "+14165550123"}, headers=headers)
    response = client.post("/api/verification/phone/send", headers=headers)
    assert response.status_code == 502


PLACES_REPLY = {"places": [
    {"displayName": {"text": "Snakes & Lattes", "languageCode": "en"}, "formattedAddress": "45 Carlton St, Toronto",
     "googleMapsUri": "https://maps.google.com/?cid=1", "location": {"latitude": 43.6617, "longitude": -79.3807},
     "currentOpeningHours": {"openNow": True}, "priceLevel": "PRICE_LEVEL_MODERATE"},
    {"displayName": {"text": "Quiet Corner Cafe"}, "location": {"latitude": 43.66, "longitude": -79.38}},
]}


def meeting_pair(client):
    a, b = make_person(client, "Avery"), make_person(client, "Blake")
    befriend(client, a, b)
    for person, preset in ((a, "union"), (b, "yonge_eglinton")):
        client.put("/api/me/consents/location_suggestions", json={"granted": True}, headers=person[0])
        client.put("/api/me/meeting-origin", json={"preset": preset}, headers=person[0])
    return a, b


def test_places_search_is_sent_the_way_google_documents_it(database, client, web_server, monkeypatch):
    monkeypatch.setattr(planning, "PLACES_URL", f"{web_server.url}/v1/places:searchText")
    monkeypatch.setattr(config, "GOOGLE_MAPS_API_KEY", "maps-key")
    web_server.reply = lambda path, body: (200, PLACES_REPLY)
    a, b = meeting_pair(client)
    result = client.post("/api/planning/area", json={"friend_ids": [b[1]["id"]], "activity": "board game cafe",
                                                     "budget": "cheap"}, headers=a[0]).json()

    [sent] = web_server.requests
    assert sent["path"] == "/v1/places:searchText"
    assert sent["headers"]["X-Goog-Api-Key"] == "maps-key"
    assert "places.displayName" in sent["headers"]["X-Goog-FieldMask"]
    body = json.loads(sent["body"])
    # Only the halfway point and the kind of place leave Meetkat: nobody's own area.
    assert body["textQuery"] == "board game cafe" and body["priceLevels"] == ["PRICE_LEVEL_INEXPENSIVE"]
    assert body["locationBias"]["circle"]["center"] == {"latitude": result["midpoint"]["lat"],
                                                        "longitude": result["midpoint"]["lng"]}
    assert "43.65" not in sent["body"] and "43.71" not in sent["body"]  # Union and Yonge-Eglinton themselves

    assert result["source"] == "google_places"
    first, second = result["venues"]
    assert first["name"] == "Snakes & Lattes" and first["open_now"] is True
    assert second["address"] is None and second["open_now"] is None  # missing details stay missing


def test_places_refusing_the_key_falls_back_to_labelled_links(database, client, web_server, monkeypatch):
    monkeypatch.setattr(planning, "PLACES_URL", f"{web_server.url}/v1/places:searchText")
    monkeypatch.setattr(config, "GOOGLE_MAPS_API_KEY", "wrong-key")
    web_server.reply = lambda path, body: (403, {"error": {"code": 403, "status": "PERMISSION_DENIED"}})
    a, b = meeting_pair(client)
    result = client.post("/api/planning/area", json={"friend_ids": [b[1]["id"]]}, headers=a[0]).json()
    assert result["source"] == "links" and result["venues"] == [] and "didn't work" in result["notice"]
