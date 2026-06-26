from typing import Any

import httpx


class FactusService:
    SANDBOX_BASE_URL = "https://api-sandbox.factus.com.co"
    PRODUCTION_BASE_URL = "https://api.factus.com.co"

    @classmethod
    def get_base_url(cls, environment: str) -> str:
        return cls.PRODUCTION_BASE_URL if environment == "production" else cls.SANDBOX_BASE_URL

    @classmethod
    async def authenticate(
        cls,
        *,
        environment: str,
        client_id: str,
        client_secret: str,
        username: str,
        password: str,
    ) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.post(
                f"{cls.get_base_url(environment)}/oauth/token",
                headers={"Accept": "application/json"},
                data={
                    "grant_type": "password",
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "username": username,
                    "password": password,
                },
            )
            response.raise_for_status()
            return response.json()

    @classmethod
    async def get_company(cls, *, environment: str, access_token: str) -> dict[str, Any]:
        return await cls._get(environment=environment, access_token=access_token, path="/v2/companies/me")

    @classmethod
    async def get_numbering_ranges(cls, *, environment: str, access_token: str) -> dict[str, Any]:
        return await cls._get(
            environment=environment,
            access_token=access_token,
            path="/v2/numbering-ranges",
            params={"filter[is_active]": "1"},
        )

    @classmethod
    async def _get(
        cls,
        *,
        environment: str,
        access_token: str,
        path: str,
        params: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.get(
                f"{cls.get_base_url(environment)}{path}",
                headers={
                    "Accept": "application/json",
                    "Authorization": f"Bearer {access_token}",
                },
                params=params,
            )
            response.raise_for_status()
            return response.json()
