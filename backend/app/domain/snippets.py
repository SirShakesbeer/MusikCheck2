from dataclasses import dataclass


@dataclass
class SnippetSpec:
    kind: str
    duration_seconds: int
    random_start: bool = True
