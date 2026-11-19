# Cloudflare Workers 자동 배포 (GitHub Secrets 불필요)

이 저장소는 Cloudflare Workers Builds의 GitHub 연동으로 배포할 수 있습니다.
GitHub Actions의 검증 워크플로는 테스트와 빌드만 수행하며, 배포 인증정보를 GitHub Secrets로 보관하지 않습니다.

## 최초 1회 연결

1. https://dash.cloudflare.com/ 에 로그인합니다.
2. **Workers & Pages**에서 기존 Worker **abyss-run**을 엽니다.
3. **Settings → Builds → Connect**에서 GitHub를 선택하고 `nyoonsung/Project-Sim` 저장소 접근을 승인합니다.
4. Production branch를 `main`으로 설정합니다.
5. Root directory는 저장소 루트(`/` 또는 빈 값)로 둡니다.
6. Build command는 `npm ci`로 설정합니다.
7. Deploy command는 `npx wrangler deploy`로 설정합니다.

저장소의 `wrangler.toml`에 Worker 이름(`abyss-run`)과 빌드 명령(`node tools/build-cf.mjs`)이 이미 정의되어 있습니다. 따라서 Wrangler 배포 단계가 설정된 빌드 명령을 실행한 뒤 Worker와 정적 자산을 게시합니다.

## 이후 배포

연결이 끝나면 `main` 브랜치에 변경사항이 푸시될 때 Cloudflare Workers Builds가 자동으로 빌드하고 배포합니다. 배포 기록과 로그는 Cloudflare 대시보드의 해당 Worker → **Deployments / Build history**에서 확인할 수 있습니다.

## 주의

- 이 저장소 변경만으로 Cloudflare 계정에 자동으로 연결되지는 않습니다. 최초 GitHub 연결과 권한 승인은 Cloudflare 계정 소유자가 직접 해야 합니다.
- Worker 이름은 `wrangler.toml`의 `name = "abyss-run"`과 대시보드의 Worker 이름이 일치해야 합니다.
- GitHub Secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`는 필요하지 않습니다.
