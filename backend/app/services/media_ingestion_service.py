from collections.abc import Iterable

from app.domain.providers.base import MediaItem, MediaProvider


class MediaIngestionService:
    def __init__(self, providers: Iterable[MediaProvider]):
        self._providers = {provider.key: provider for provider in providers}

    def import_from_source(self, provider_key: str, source: str) -> list[MediaItem]:
        provider = self._providers.get(provider_key)
        if not provider:
            raise ValueError(f"Unknown provider: {provider_key}")
        return provider.fetch_items(source)

    def get_provider(self, provider_key: str) -> MediaProvider | None:
        return self._providers.get(provider_key)

    @property
    def providers(self) -> list[str]:
        return list(self._providers.keys())
