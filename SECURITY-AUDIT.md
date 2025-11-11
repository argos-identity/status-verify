# 보안 감사 보고서

> Status-Verify 프로젝트의 데이터베이스 인증 정보 하드코딩 분석 결과

**감사 일자**: 2025-11-10
**감사자**: Claude Code
**프로젝트**: status-verify

---

## 📊 요약

| 항목 | 상태 | 위험도 |
|------|------|--------|
| 실제 .env 파일 | ✅ 안전 | 🟢 낮음 |
| docker-compose.yml fallback | ⚠️ 수정 완료 | 🟡 중간 |
| 테스트 코드 | ✅ 양호 | 🟢 낮음 |
| 예시/템플릿 파일 | ✅ 정상 | 🟢 없음 |
| 기본 계정 비밀번호 문서 노출 | ⚠️ 주의 필요 | 🔴 높음 |

---

## 🔍 상세 분석 결과

### 1. 실제 환경변수 파일 (.env) - ✅ 안전

#### verify-monitor-api/.env
```bash
DATABASE_URL="postgresql://pegasus@localhost:5432/sla_monitor_dev"
```

#### watch-server/.env
```bash
DATABASE_URL=postgresql://pegasus@localhost:5432/sla_monitor_dev
```

**분석**:
- ✅ 비밀번호가 하드코딩되어 있지 않음
- ✅ 로컬 개발 환경에서 peer authentication 사용
- ✅ Git에 커밋되지 않음 (.gitignore에 포함)

**권장사항**:
- 현재 상태 유지
- 프로덕션 배포 시 강력한 비밀번호 사용

---

### 2. Docker Compose 설정 - ✅ 수정 완료

#### 수정 전 (docker-compose.yml)
```yaml
# 🔴 문제: Fallback으로 약한 비밀번호 사용
POSTGRES_PASSWORD: ${DB_PASSWORD:-dev_password_123}
DATABASE_URL: postgresql://${DB_USER:-slamonitor}:${DB_PASSWORD:-dev_password_123}@...
```

#### 수정 후 (docker-compose.yml)
```yaml
# ✅ 개선: 환경변수 필수로 변경
POSTGRES_PASSWORD: ${DB_PASSWORD}
DATABASE_URL: ${DATABASE_URL}
JWT_SECRET: ${JWT_SECRET}
```

**변경 사항**:
- `:-fallback_value` 제거
- 환경변수가 설정되지 않으면 Docker 시작 실패 (명시적 에러)
- 프로덕션 배포 시 약한 비밀번호 사용 방지

**영향**:
- `.env` 파일이 없으면 `docker-compose up` 실패
- 명시적으로 환경변수 설정 강제

---

### 3. 테스트 코드 - ✅ 양호

#### verify-monitor-api/tests/setup.ts:14
```typescript
url: process.env.DATABASE_URL?.replace('sla_monitor_dev', 'sla_monitor_test')
     ?? 'postgresql://postgres:postgres@localhost:5432/sla_monitor_test'
```

**분석**:
- ✅ 테스트 전용 데이터베이스 사용
- ✅ Fallback은 로컬 테스트 환경에만 적용
- ✅ CI/CD에서는 환경변수로 재정의 가능

**권장사항**:
- 현재 상태 유지 (테스트 코드는 개발 편의성 우선)
- CI/CD 환경에서는 `DATABASE_URL` 환경변수 설정

---

### 4. 예시/템플릿 파일 - ✅ 정상

#### .env.example, DEPLOYMENT.md, DATABASE-SETUP.md
```bash
DB_PASSWORD=dev_password_123
DATABASE_URL=postgresql://slamonitor:dev_password_123@postgres:5432/sla_monitor
```

**분석**:
- ✅ 예시 목적의 템플릿 파일
- ✅ 실제 사용되지 않음
- ✅ Git에 커밋됨 (의도된 동작)

**권장사항**:
- 현재 상태 유지
- 문서에 "반드시 변경하세요" 경고 포함 (이미 포함됨)

---

### 5. 기본 계정 비밀번호 문서 노출 - ⚠️ 주의 필요

#### README.md, QUICKSTART.md, verify-incidents UI
```markdown
Admin:    admin@argosidentity.com / Admin@123
Reporter: reporter@argosidentity.com / reporter123
Viewer:   viewer@argosidentity.com / viewer123
```

**문제점**:
- 🔴 기본 admin 비밀번호가 공개 문서에 노출
- 🔴 첫 배포 후 변경하지 않으면 보안 위험
- 🔴 Public 저장소라면 심각한 보안 이슈

**위험 시나리오**:
1. 프로덕션에 기본 계정으로 배포
2. 비밀번호 변경 없이 운영
3. 공격자가 문서에서 비밀번호 확인
4. 관리자 계정 탈취

---

## 🛡️ 보안 권장사항

### 즉시 조치 (Critical)

#### 1. .env 파일 필수 생성

```bash
# 프로젝트 루트에 .env 생성
cat > .env << 'EOF'
# Database
DB_USER=slamonitor
DB_PASSWORD=$(openssl rand -base64 32)
DB_PORT=5432
DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@localhost:5432/sla_monitor

# JWT
JWT_SECRET=$(openssl rand -base64 64)
JWT_EXPIRES_IN=24h

# 기타 설정
SEED_DATABASE=true
NODE_ENV=production
EOF

# 권한 제한
chmod 600 .env
```

#### 2. 첫 배포 후 admin 비밀번호 즉시 변경

```bash
# API를 통해 비밀번호 변경
curl -X PUT http://localhost:3001/api/users/admin \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "password": "새로운_강력한_비밀번호"
  }'
```

#### 3. 환경변수 검증 스크립트 추가

새 스크립트 생성: `scripts/validate-env.sh`

```bash
#!/bin/bash
# scripts/validate-env.sh

echo "Validating environment variables..."

REQUIRED_VARS=(
  "DB_PASSWORD"
  "DATABASE_URL"
  "JWT_SECRET"
)

MISSING=()

for var in "${REQUIRED_VARS[@]}"; do
  if [ -z "${!var}" ]; then
    MISSING+=("$var")
  fi
done

if [ ${#MISSING[@]} -gt 0 ]; then
  echo "❌ Missing required environment variables:"
  printf '  - %s\n' "${MISSING[@]}"
  exit 1
fi

# 비밀번호 강도 검증
if [ ${#DB_PASSWORD} -lt 16 ]; then
  echo "⚠️  Warning: DB_PASSWORD is too short (< 16 chars)"
fi

if [ ${#JWT_SECRET} -lt 32 ]; then
  echo "❌ Error: JWT_SECRET is too short (< 32 chars)"
  exit 1
fi

echo "✅ All required environment variables are set"
```

사용법:
```bash
chmod +x scripts/validate-env.sh

# Docker Compose 실행 전 검증
source .env && bash scripts/validate-env.sh && docker-compose up -d
```

---

### 중기 조치 (Important)

#### 4. Secrets 관리 시스템 도입

**옵션 1: Docker Secrets (Swarm)**
```yaml
secrets:
  db_password:
    external: true
  jwt_secret:
    external: true

services:
  postgres:
    secrets:
      - db_password
    environment:
      POSTGRES_PASSWORD_FILE: /run/secrets/db_password
```

**옵션 2: HashiCorp Vault**
```bash
# Vault에 저장
vault kv put secret/status-verify \
  db_password="$(openssl rand -base64 32)" \
  jwt_secret="$(openssl rand -base64 64)"

# 애플리케이션에서 가져오기
vault kv get -field=db_password secret/status-verify
```

**옵션 3: AWS Secrets Manager / Azure Key Vault**

#### 5. 기본 계정 제거 또는 비활성화

**방법 1: 시드 데이터에서 제거**
```typescript
// prisma/seeds/index.ts
// ❌ 기본 계정 생성 제거
// await createDefaultUsers();

// ✅ 환경변수에서만 admin 생성
if (process.env.CREATE_ADMIN === 'true') {
  await createAdminFromEnv();
}
```

**방법 2: 첫 로그인 시 비밀번호 강제 변경**
```typescript
// auth middleware
if (user.must_change_password) {
  return res.status(403).json({
    error: 'Password change required',
    redirect: '/change-password'
  });
}
```

#### 6. 비밀번호 정책 강화

```typescript
// auth-service.ts - 이미 구현되어 있음 ✅
export function validatePassword(password: string): ValidationResult {
  const errors: string[] = [];

  if (password.length < 12) {  // 8 → 12로 강화
    errors.push('Password must be at least 12 characters long');
  }

  if (!/(?=.*[a-z])/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }

  if (!/(?=.*[A-Z])/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  if (!/(?=.*\d)/.test(password)) {
    errors.push('Password must contain at least one number');
  }

  if (!/(?=.*[@$!%*?&])/.test(password)) {
    errors.push('Password must contain at least one special character');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
```

---

### 장기 조치 (Recommended)

#### 7. 정기적인 비밀번호 로테이션

```bash
# scripts/rotate-secrets.sh
#!/bin/bash

NEW_DB_PASSWORD=$(openssl rand -base64 32)
NEW_JWT_SECRET=$(openssl rand -base64 64)

# Vault 업데이트
vault kv put secret/status-verify \
  db_password="$NEW_DB_PASSWORD" \
  jwt_secret="$NEW_JWT_SECRET"

# PostgreSQL 비밀번호 변경
docker-compose exec postgres psql -U postgres -c \
  "ALTER USER slamonitor WITH PASSWORD '$NEW_DB_PASSWORD';"

# 서비스 재시작
docker-compose restart verify-monitor-api watch-server
```

#### 8. 감사 로그 구현

```typescript
// audit-logger.ts
export function logSecurityEvent(event: {
  type: 'login' | 'password_change' | 'failed_login',
  user: string,
  ip: string,
  success: boolean
}) {
  // 별도 테이블에 저장
  await prisma.auditLog.create({
    data: {
      ...event,
      timestamp: new Date()
    }
  });
}
```

#### 9. 2FA (Two-Factor Authentication) 도입

#### 10. 보안 스캐너 통합

```yaml
# .github/workflows/security-scan.yml
name: Security Scan

on: [push, pull_request]

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2

      # Secrets 스캔
      - name: TruffleHog Scan
        uses: trufflesecurity/trufflehog@main
        with:
          path: ./

      # 의존성 취약점 스캔
      - name: npm audit
        run: npm audit --audit-level=high
```

---

## 📋 체크리스트

### 배포 전 필수 확인

- [ ] `.env` 파일 생성 및 강력한 비밀번호 설정
- [ ] `chmod 600 .env` 권한 제한
- [ ] `.env` 파일이 `.gitignore`에 포함되어 있음
- [ ] `docker-compose.yml`에 fallback 값 제거 (✅ 완료)
- [ ] 환경변수 검증 스크립트 실행
- [ ] 기본 admin 비밀번호 변경 계획 수립

### 배포 직후 필수 작업

- [ ] admin 계정 비밀번호 즉시 변경
- [ ] reporter, viewer 계정 비밀번호 변경 또는 삭제
- [ ] 비밀번호 정책 검증
- [ ] 감사 로그 확인

### 정기 보안 점검 (월 1회)

- [ ] 사용되지 않는 계정 삭제
- [ ] 비밀번호 만료일 확인
- [ ] 실패한 로그인 시도 분석
- [ ] 의존성 취약점 스캔
- [ ] 백업 파일 보안 점검

---

## 🚨 긴급 대응 절차

### 비밀번호 유출 의심 시

1. **즉시 비밀번호 변경**
```bash
docker-compose exec postgres psql -U postgres -c \
  "ALTER USER slamonitor WITH PASSWORD '$(openssl rand -base64 32)';"
```

2. **모든 JWT 토큰 무효화**
```typescript
// JWT Secret 변경으로 기존 토큰 무효화
process.env.JWT_SECRET = generateNewSecret();
```

3. **의심스러운 접근 로그 확인**
```sql
SELECT * FROM audit_logs
WHERE created_at > NOW() - INTERVAL '24 hours'
  AND (success = false OR ip NOT IN (whitelist));
```

4. **시스템 무결성 검증**
```bash
# 데이터베이스 백업
bash scripts/backup-database.sh

# 서비스 재시작
docker-compose restart
```

---

## 📚 참고 자료

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [CWE-798: Use of Hard-coded Credentials](https://cwe.mitre.org/data/definitions/798.html)
- [Docker Secrets](https://docs.docker.com/engine/swarm/secrets/)
- [HashiCorp Vault](https://www.vaultproject.io/)
- [AWS Secrets Manager](https://aws.amazon.com/secrets-manager/)

---

## 📞 보안 문의

보안 취약점을 발견하신 경우:
1. **공개하지 마세요** - GitHub Issues에 올리지 말 것
2. 보안팀에 이메일로 연락: security@yourdomain.com
3. 24시간 내 응답 예상

---

**Last Updated**: 2025-11-10
**Next Audit**: 2025-12-10
**Audit Version**: 1.0.0
