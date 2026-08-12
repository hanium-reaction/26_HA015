"""사용자가 준 URL 을 서버가 열어도 되는지 판정 (BE #226).

**이 파일이 SSRF 방어의 전부다.** 우리 배포는 EC2 라서 서버가 임의 URL 을 여는 순간
아래가 사정권에 들어온다:

- `http://169.254.169.254/latest/meta-data/iam/security-credentials/` — 인스턴스
  메타데이터. 자격증명이 여기 있다.
- `http://127.0.0.1:8000/...` — 우리 앱 자신. 인증 미들웨어를 우회해 내부 라우트를
  두드릴 수 있다.
- RDS·사설 대역(10./172.16./192.168.).

그래서 **호스트 이름이 아니라 실제로 접속할 IP** 를 본다. `evil.com` 이 `127.0.0.1`
로 해석되는 DNS rebinding 류를 이름 검사로는 못 막는다. 리다이렉트도 매 홉마다 다시
검사해야 한다 — 공개 URL 이 사설 대역으로 302 하는 게 전형적인 우회다(호출자 책임,
`fetcher._fetch_sync` 참고).
"""

from __future__ import annotations

import ipaddress
import socket
from typing import Final
from urllib.parse import urlsplit

# 이 사유들은 사용자에게 보이는 문구로 번역된다 (`orchestrator/materials_resolver.py`).
REASON_SCHEME: Final = "unsupported_scheme"
REASON_MALFORMED: Final = "malformed"
REASON_PORT: Final = "unsupported_port"
REASON_DNS: Final = "dns_failed"
REASON_PRIVATE: Final = "private_address"

_ALLOWED_SCHEMES: Final[frozenset[str]] = frozenset({"http", "https"})
# 표준 웹 포트만. 다른 포트는 대부분 내부 서비스(우리 앱 8000, DB 5432 …)를 가리킨다.
_ALLOWED_PORTS: Final[frozenset[int]] = frozenset({80, 443})


class UnsafeUrl(Exception):
    """이 URL 은 서버가 열면 안 된다. `reason` 은 위 REASON_* 상수."""

    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


def _is_public(ip: str) -> bool:
    """공인 주소인가 — 사설·loopback·link-local·multicast·reserved 는 전부 거절.

    `is_global` 한 속성으로 묶는 이유: 개별 대역을 손으로 나열하면 IPv6 unique-local
    (`fc00::/7`)이나 IPv4-mapped IPv6 처럼 빠뜨리기 쉬운 구멍이 남는다.
    """
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return False
    if addr.version == 6 and addr.ipv4_mapped is not None:
        # `::ffff:127.0.0.1` 같은 사상 주소는 v4 쪽 성질로 판정해야 한다.
        addr = addr.ipv4_mapped
    return addr.is_global


def resolved_addresses(host: str) -> list[str]:
    """호스트가 해석되는 모든 IP. 하나라도 사설이면 통째로 거절할 것(아래 validate)."""
    infos = socket.getaddrinfo(host, None, proto=socket.IPPROTO_TCP)
    return [str(info[4][0]) for info in infos]


def validate_url(raw: str) -> str:
    """열어도 되면 URL 을 그대로 돌려주고, 아니면 `UnsafeUrl` 을 던진다.

    A 레코드가 여러 개면 **전부** 공인이어야 한다 — 하나라도 사설이면 요청이 어느 쪽으로
    갈지 우리가 고를 수 없다.
    """
    parts = urlsplit(raw)
    if parts.scheme.lower() not in _ALLOWED_SCHEMES:
        raise UnsafeUrl(REASON_SCHEME)
    # `@` 가 있으면 `https://real.com@127.0.0.1/` 처럼 사람 눈과 파서가 다르게 읽는다.
    if "@" in parts.netloc or not parts.hostname:
        raise UnsafeUrl(REASON_MALFORMED)
    try:
        port = parts.port
    except ValueError as e:  # 포트가 숫자가 아님
        raise UnsafeUrl(REASON_MALFORMED) from e
    if port is not None and port not in _ALLOWED_PORTS:
        raise UnsafeUrl(REASON_PORT)

    try:
        addresses = resolved_addresses(parts.hostname)
    except OSError as e:
        raise UnsafeUrl(REASON_DNS) from e
    if not addresses:
        raise UnsafeUrl(REASON_DNS)
    if not all(_is_public(ip) for ip in addresses):
        raise UnsafeUrl(REASON_PRIVATE)
    return raw
