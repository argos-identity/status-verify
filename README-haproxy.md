# HAProxy 설치형 구성 가이드

SLA 모니터링 시스템에서 HAProxy를 Docker 없이 직접 설치하여 사용하는 방법을 설명합니다.

## 개요

HAProxy를 로컬 시스템에 설치하여 다음 서비스들을 프록시합니다:
- **Main Dashboard** (포트 3000) - 시스템 상태 대시보드
- **API Server** (포트 3001) - 백엔드 REST API 및 WebSocket
- **Incidents App** (포트 3006) - 장애 관리 애플리케이션

## 시스템 요구사항

- macOS (Homebrew 지원) 또는 Linux
- 관리자 권한 (포트 80 바인딩을 위해)
- 포트 80, 8404 사용 가능

## 1. HAProxy 설치

### macOS (Homebrew)
```bash
# Homebrew로 HAProxy 설치
brew install haproxy

# 설치 확인
haproxy -v
```

### Ubuntu/Debian
```bash
# 패키지 업데이트
sudo apt update

# HAProxy 설치
sudo apt install haproxy

# 설치 확인
haproxy -v
```

### CentOS/RHEL/Rocky Linux
```bash
# HAProxy 설치
sudo yum install haproxy
# 또는 (RHEL 8/9, Rocky Linux)
sudo dnf install haproxy

# 설치 확인
haproxy -v
```

## 2. 설정 파일 구성

### 설정 파일 복사
```bash
# 프로젝트 루트에서 설정 파일 복사
sudo cp haproxy-local.cfg /usr/local/etc/haproxy/haproxy.cfg

# macOS에서는 다음 경로일 수도 있음
sudo cp haproxy-local.cfg /opt/homebrew/etc/haproxy.cfg
```

### Linux에서의 설정 파일 위치
```bash
# 대부분의 Linux 배포판
sudo cp haproxy-local.cfg /etc/haproxy/haproxy.cfg

# 기존 설정 백업 (선택사항)
sudo cp /etc/haproxy/haproxy.cfg /etc/haproxy/haproxy.cfg.backup
```

### 설정 파일 유효성 검증
```bash
# 설정 파일 문법 확인
sudo haproxy -f /usr/local/etc/haproxy/haproxy.cfg -c
# 또는 Linux에서
sudo haproxy -f /etc/haproxy/haproxy.cfg -c
```

## 3. HAProxy 사용자 및 그룹 생성

### macOS
```bash
# haproxy 사용자 생성 (이미 존재할 수 있음)
sudo dscl . -create /Users/haproxy
sudo dscl . -create /Users/haproxy UserShell /usr/bin/false
sudo dscl . -create /Users/haproxy RealName "HAProxy User"
```

### Linux
```bash
# haproxy 사용자 및 그룹 생성
sudo groupadd -r haproxy
sudo useradd -r -g haproxy -d /var/lib/haproxy -s /sbin/nologin haproxy

# 필요한 디렉토리 생성
sudo mkdir -p /var/lib/haproxy
sudo chown haproxy:haproxy /var/lib/haproxy
```

## 4. HAProxy 실행

### 수동 실행 (개발/테스트용)
```bash
# 포그라운드에서 실행 (macOS)
sudo haproxy -f /usr/local/etc/haproxy/haproxy.cfg -d

# 포그라운드에서 실행 (Linux)
sudo haproxy -f /etc/haproxy/haproxy.cfg -d

# 백그라운드에서 실행
sudo haproxy -f /usr/local/etc/haproxy/haproxy.cfg -D
```

### systemd 서비스로 실행 (Linux)
```bash
# HAProxy 서비스 시작
sudo systemctl start haproxy

# 부팅 시 자동 시작 설정
sudo systemctl enable haproxy

# 서비스 상태 확인
sudo systemctl status haproxy

# 서비스 재시작
sudo systemctl restart haproxy
```

### macOS에서 launchctl 사용
```bash
# Homebrew로 설치했다면 다음 명령으로 서비스 시작
sudo brew services start haproxy

# 서비스 중지
sudo brew services stop haproxy

# 서비스 재시작
sudo brew services restart haproxy
```

## 5. 접속 및 확인

### 웹 애플리케이션 접속
- **Main Dashboard**: http://localhost/ (포트 80)
- **API Endpoints**: http://localhost/api/
- **Incidents App**: http://localhost/incidents/
- **HAProxy 통계**: http://localhost:8404/stats

### 서비스 상태 확인
```bash
# HAProxy 프로세스 확인
ps aux | grep haproxy

# 포트 사용 확인
sudo netstat -tlnp | grep :80
sudo netstat -tlnp | grep :8404

# 로그 확인 (Linux)
sudo journalctl -u haproxy -f

# 로그 확인 (macOS)
tail -f /usr/local/var/log/haproxy.log
```

## 6. 백엔드 서비스 실행

HAProxy가 프록시할 백엔드 서비스들을 실행해야 합니다:

```bash
# 1. PostgreSQL 및 백엔드 API 시작 (Docker Compose 사용)
docker-compose up -d postgres verify-monitor-api watch-server

# 2. 프론트엔드 애플리케이션들 개별 실행
# verify-main (포트 3000)
cd verify-main && npm run dev &

# verify-incidents (포트 3006)
cd verify-incidents && npm run dev &

# 또는 Docker로 실행
docker-compose up -d verify-main verify-incidents
```

## 7. 설정 파일 주요 구성

### 라우팅 규칙
- `/api/*` → API 백엔드 (포트 3001)
- `/socket.io/*` → API 백엔드 (WebSocket)
- `/incidents/*` → Incidents 앱 (포트 3006)
- `/` (기본) → Main Dashboard (포트 3000)

### 로드 밸런싱
- 각 백엔드에 대해 라운드 로빈 방식
- 헬스 체크를 통한 장애 감지
- 자동 복구 및 재시도 설정

### 보안 헤더
- X-Frame-Options, X-Content-Type-Options
- XSS Protection, HSTS
- CORS 헤더 (개발용)

## 8. 문제 해결

### 권한 문제
```bash
# 포트 80 바인딩 권한 문제 해결 (Linux)
sudo setcap cap_net_bind_service=+ep /usr/sbin/haproxy

# 또는 다른 포트 사용 (예: 8080)
# haproxy-local.cfg에서 bind *:80을 bind *:8080으로 변경
```

### 설정 오류
```bash
# 설정 파일 문법 재검사
sudo haproxy -f /etc/haproxy/haproxy.cfg -c

# 자세한 에러 메시지 확인
sudo haproxy -f /etc/haproxy/haproxy.cfg -d
```

### 백엔드 연결 실패
```bash
# 백엔드 서비스 상태 확인
curl http://localhost:3000/api/health
curl http://localhost:3001/api/health
curl http://localhost:3006/api/health

# 포트 사용 확인
sudo netstat -tlnp | grep -E ':300[016]'
```

## 9. 로그 및 모니터링

### HAProxy 통계 페이지
- URL: http://localhost:8404/stats
- 실시간 백엔드 상태 모니터링
- 트래픽 통계 및 성능 메트릭

### 로그 설정
```bash
# Linux에서 rsyslog 설정 (선택사항)
echo '$ModLoad imudp' | sudo tee -a /etc/rsyslog.conf
echo '$UDPServerRun 514' | sudo tee -a /etc/rsyslog.conf
echo 'local0.*    /var/log/haproxy.log' | sudo tee -a /etc/rsyslog.conf
sudo systemctl restart rsyslog
```

## 10. 개발 워크플로우

1. **백엔드 서비스 시작**
   ```bash
   docker-compose up -d postgres verify-monitor-api watch-server
   ```

2. **HAProxy 시작**
   ```bash
   sudo haproxy -f /usr/local/etc/haproxy/haproxy.cfg -D
   ```

3. **프론트엔드 개발 서버 시작**
   ```bash
   # 별도 터미널에서
   cd verify-main && npm run dev &
   cd verify-incidents && npm run dev &
   ```

4. **통합 테스트**
   - http://localhost/ 접속하여 전체 시스템 확인
   - http://localhost:8404/stats에서 백엔드 상태 모니터링

이제 HAProxy가 설치형으로 구성되어 Docker 없이도 로드 밸런싱과 리버스 프록시 기능을 제공합니다.