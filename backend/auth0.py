from fastapi import FastAPI
from pydantic import BaseModel

from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer
from jose import jwt
import requests

AUTH0_DOMAIN = "dev-s6ofaf4udt2w1nw1.us.auth0.com"
API_AUDIENCE = "https://look/api"
ALGORITHMS = ["RS256"]

token_auth_scheme = HTTPBearer()


def verify_jwt(token=Depends(token_auth_scheme)):
    token = token.credentials
    jwks_url = f"https://{AUTH0_DOMAIN}/.well-known/jwks.json"
    jwks = requests.get(jwks_url).json()
    unverified_header = jwt.get_unverified_header(token)

    rsa_key = {}
    for key in jwks["keys"]:
        if key["kid"] == unverified_header["kid"]:
            rsa_key = {
                "kty": key["kty"],
                "kid": key["kid"],
                "use": key["use"],
                "n": key["n"],
                "e": key["e"],
            }

    if not rsa_key:
        raise HTTPException(status_code=401, detail="Invalid header")

    try:
        payload = jwt.decode(
            token,
            rsa_key,
            algorithms=ALGORITHMS,
            audience=API_AUDIENCE,
            issuer=f"https://{AUTH0_DOMAIN}/",
        )
        return payload
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")



