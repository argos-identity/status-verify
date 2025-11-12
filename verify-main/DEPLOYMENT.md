# Deployment Guide - verify-main

이 문서는 verify-main Next.js 애플리케이션의 배포 가이드입니다.

## 📋 목차

- [개발 환경 실행](#개발-환경-실행)
- [프로덕션 빌드](#프로덕션-빌드)
- [Standalone 모드 배포](#standalone-모드-배포)
- [PM2로 프로세스 관리](#pm2로-프로세스-관리)
- [문제 해결](#문제-해결)

---

## 🚀 개발 환경 실행

개발 서버는 Turbopack을 사용하여 포트 80에서 실행됩니다:

```bash
cd verify-main
npm run dev
```

브라우저에서 `http://localhost:80` 접속

---

## 🏗️ 프로덕션 빌드

### 일반 빌드 (next start용)

```bash
npm run build
npm run start
```

### Standalone 빌드 (권장)

Standalone 모드는 최소한의 의존성으로 독립 실행 가능한 빌드를 생성합니다.

#### 방법 1: npm 스크립트 사용 (권장)

```bash
# 빌드 + 정적 파일 자동 복사
npm run build:standalone

# 서버 실행
npm run start:standalone
```

#### 방법 2: 배포 스크립트 사용

```bash
# 빌드 및 검증 포함
./scripts/deploy-standalone.sh

# 서버 실행
npm run start:standalone
```

#### 방법 3: 수동 빌드

```bash
# 1. 빌드 실행
npm run build

# 2. ⚠️ 중요: 정적 파일 복사
npm run copy-assets

# 또는 직접 복사:
cp -r .next/static .next/standalone/status-verify/verify-main/.next/static
cp -r public .next/standalone/status-verify/verify-main/public

# 3. 서버 실행
node .next/standalone/status-verify/verify-main/server.js
```

---

## ⚠️ Standalone 빌드 주의사항

### CSS/이미지가 로드되지 않는 문제

**증상**: standalone 서버 실행 시 화면 레이아웃이 깨지고 스타일이 적용되지 않음

**원인**: Next.js standalone 빌드는 `.next/static/`과 `public/` 디렉토리를 **자동으로 복사하지 않습니다**.

**해결방법**: 반드시 정적 파일을 수동으로 복사해야 합니다.

```bash
# 이 명령들을 빌드 후 반드시 실행:
cp -r .next/static .next/standalone/status-verify/verify-main/.next/static
cp -r public .next/standalone/status-verify/verify-main/public
```

또는 자동화된 스크립트 사용:

```bash
npm run build:standalone  # 빌드 + 자동 복사
```

### 파일 구조 확인

정상적인 standalone 빌드 구조:

```
.next/standalone/status-verify/verify-main/
├── .next/
│   ├── server/           ✅ (자동 생성)
│   └── static/           ⚠️ (수동 복사 필요!)
│       ├── css/          ← CSS 파일들
│       ├── chunks/       ← JS 번들들
│       └── media/        ← 폰트, 이미지 등
├── public/               ⚠️ (수동 복사 필요!)
│   └── *.png, *.svg      ← 정적 이미지들
├── node_modules/         ✅ (자동 생성)
├── package.json          ✅ (자동 생성)
└── server.js             ✅ (자동 생성)
```

---

## 🔧 PM2로 프로세스 관리

### PM2 설치

```bash
npm install -g pm2
```

### PM2로 빌드 & 실행 (한 번에!)

**가장 간단한 방법 - npm 스크립트 사용:**

```bash
# 프로덕션 모드 (포트 80)
npm run pm2:start

# 개발 모드 (포트 3000)
npm run pm2:start:dev
```

이 명령은 자동으로:
1. ✅ `npm run build:standalone` 실행 (Next.js 빌드 + 정적 파일 복사)
2. ✅ PM2로 서버 시작

### PM2 관리 명령어

```bash
# 상태 확인
npm run pm2:status
# 또는: pm2 status

# 로그 실시간 보기
npm run pm2:logs
# 또는: pm2 logs verify-main

# 서버 재시작 (다운타임 있음)
npm run pm2:restart
# 또는: pm2 restart verify-main

# 서버 리로드 (무중단 재시작)
npm run pm2:reload
# 또는: pm2 reload verify-main

# 서버 중지
npm run pm2:stop
# 또는: pm2 stop verify-main

# 서버 삭제
npm run pm2:delete
# 또는: pm2 delete verify-main

# 실시간 모니터링
npm run pm2:monit
# 또는: pm2 monit verify-main
```

### PM2 시스템 자동 시작 설정

서버 재부팅 시 자동으로 verify-main을 시작하려면:

```bash
# 1. PM2 startup 스크립트 생성
pm2 startup

# 위 명령이 출력하는 명령을 복사해서 실행 (sudo 필요)
# 예: sudo env PATH=$PATH:/usr/local/bin pm2 startup systemd -u username --hp /home/username

# 2. 현재 PM2 프로세스 목록 저장
pm2 save

# 3. 확인
pm2 list
```

이제 서버가 재부팅되어도 verify-main이 자동으로 시작됩니다.

### PM2 Ecosystem 설정 (ecosystem.config.js)

프로젝트에는 이미 `ecosystem.config.js` 파일이 포함되어 있습니다:

```javascript
module.exports = {
  apps: [{
    name: 'verify-main',
    script: './.next/standalone/status-verify/verify-main/server.js',
    instances: 1,
    exec_mode: 'cluster',
    env_production: {
      NODE_ENV: 'production',
      PORT: 80
    },
    env_development: {
      NODE_ENV: 'development',
      PORT: 3000
    }
  }]
};
```

**직접 PM2 명령 사용하기:**

```bash
# 프로덕션 환경
pm2 start ecosystem.config.js --env production

# 개발 환경
pm2 start ecosystem.config.js --env development

# 리로드
pm2 reload ecosystem.config.js --env production
```

### PM2 고급 기능

#### 클러스터 모드 (멀티코어 활용)

`ecosystem.config.js`에서 `instances` 수정:

```javascript
{
  instances: 4,  // CPU 코어 수만큼 또는 'max'
  exec_mode: 'cluster'
}
```

#### 로그 관리

```bash
# 로그 파일 위치
# - 에러: ./logs/pm2-error.log
# - 출력: ./logs/pm2-out.log
# - 통합: ./logs/pm2-combined.log

# 로그 파일 비우기
pm2 flush verify-main

# 로그 로테이션 설정
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 30
```

#### 메모리 모니터링

```bash
# 실시간 메모리 사용량
pm2 monit

# 메모리 초과 시 자동 재시작 (ecosystem.config.js 설정됨)
# max_memory_restart: '1G'
```

---

## 🐛 문제 해결

### 1. CSS가 로드되지 않음 (레이아웃 깨짐)

**증상**:
- 개발 서버(`npm run dev`)는 정상 작동
- standalone 서버 실행 시 스타일 없음

**해결**:
```bash
# 정적 파일이 복사되었는지 확인
ls -la .next/standalone/status-verify/verify-main/.next/static/

# 없으면 복사 실행
npm run copy-assets
```

### 2. 포트 80 권한 에러

**증상**: `Error: listen EACCES: permission denied 0.0.0.0:80`

**해결**:
```bash
# macOS/Linux: sudo로 실행
sudo npm run start:standalone

# 또는 포트 변경
PORT=3000 npm run start:standalone
```

### 3. 모듈을 찾을 수 없음 (Module not found)

**증상**: `Cannot find module 'next/dist/...'`

**해결**:
```bash
# node_modules 재설치
rm -rf node_modules package-lock.json
npm install

# 재빌드
npm run build:standalone
```

### 4. 빌드 에러

**증상**: 빌드 중 TypeScript 에러 발생

**해결**:
```bash
# TypeScript 타입 체크
npm run lint

# 타입 에러 수정 후 재빌드
npm run build:standalone
```

---

## 📊 성능 최적화

### 빌드 최적화

```bash
# Turbopack 사용 (빌드 속도 향상)
TURBOPACK=1 npm run build

# 분석 모드로 번들 크기 확인
npm run build -- --profile
```

### 런타임 최적화

- **CDN 사용**: `.next/static/`을 CDN으로 서빙
- **이미지 최적화**: Next.js Image 컴포넌트 사용
- **캐싱**: Reverse proxy (nginx/HAProxy)로 정적 파일 캐싱

---

## 📝 체크리스트

배포 전 확인사항:

- [ ] `npm run build:standalone` 성공적으로 완료
- [ ] `.next/standalone/.../. next/static/` 디렉토리 존재 확인
- [ ] `.next/standalone/.../public/` 디렉토리 존재 확인
- [ ] 로컬에서 `npm run start:standalone` 테스트
- [ ] 브라우저에서 CSS/이미지 정상 로드 확인
- [ ] API 연결 테스트
- [ ] 환경 변수 설정 확인

---

## 🔗 관련 문서

- [Next.js Standalone Output 공식 문서](https://nextjs.org/docs/app/api-reference/next-config-js/output)
- [PM2 공식 문서](https://pm2.keymetrics.io/docs/usage/quick-start/)
- 프로젝트 README: `../README.md`
- API 명세: `../specs/001-prd-md/contracts/api-spec.yaml`

---

**Last Updated**: 2025-11-12
