/**
 * PM2 Ecosystem Configuration
 * Status-Verify 프로젝트의 모든 서비스를 관리하는 PM2 설정 파일
 *
 * 사용법:
 *   pm2 start ecosystem.config.js          # 모든 서비스 시작
 *   pm2 start ecosystem.config.js --only verify-monitor-api  # 특정 서비스만
 *   pm2 restart all                        # 모든 서비스 재시작
 *   pm2 stop all                           # 모든 서비스 중지
 *   pm2 logs                               # 통합 로그 확인
 *   pm2 monit                              # 실시간 모니터링
 *   pm2 save                               # 현재 프로세스 목록 저장
 *   pm2 startup                            # 시스템 부팅시 자동 시작 설정
 */

module.exports = {
  apps: [
    // ============================================
    // Backend API (Express + Socket.IO)
    // ============================================
    {
      name: 'verify-monitor-api',
      cwd: './verify-monitor-api',
      script: './dist/server.js',

      // 클러스터 모드로 실행 (무상태 서비스)
      instances: 2,
      exec_mode: 'cluster',

      // 환경변수
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        HOST: '0.0.0.0',
      },

      // 환경변수 파일 로드
      env_file: './verify-monitor-api/.env',

      // 로그 설정
      error_file: './verify-monitor-api/logs/pm2-error.log',
      out_file: './verify-monitor-api/logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,

      // 재시작 정책
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 4000,

      // 메모리 제한 (선택사항)
      max_memory_restart: '500M',

      // 프로세스 관리
      kill_timeout: 5000,
      listen_timeout: 3000,
      shutdown_with_message: true,

      // 모니터링
      watch: false,
      ignore_watch: ['node_modules', 'logs'],

      // 기타
      time: true,
      instance_var: 'INSTANCE_ID',
    },

    // ============================================
    // Watch Server (Health Check Monitor)
    // ============================================
    {
      name: 'watch-server',
      cwd: './watch-server',
      script: './dist/index.js',

      // Fork 모드 (단일 인스턴스 - cron 작업)
      instances: 1,
      exec_mode: 'fork',

      // 환경변수
      env: {
        NODE_ENV: 'production',
        PORT: 3008,
        WATCH_MODE: 'continuous',
        MONITORING_INTERVAL: 60000,  // 1분
      },

      env_file: './watch-server/.env',

      // 로그 설정
      error_file: './watch-server/logs/pm2-error.log',
      out_file: './watch-server/logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',

      // 재시작 정책
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 5000,

      // 메모리 제한
      max_memory_restart: '300M',

      // 프로세스 관리
      kill_timeout: 5000,
      listen_timeout: 3000,

      // 모니터링
      watch: false,
      time: true,
    },

    // ============================================
    // Frontend - verify-main (System Status Dashboard)
    // ============================================
    {
      name: 'verify-main',
      cwd: './verify-main',
      script: './.next/standalone/server.js',

      // 클러스터 모드 (Next.js standalone)
      instances: 2,
      exec_mode: 'cluster',

      // 환경변수
      env: {
        NODE_ENV: 'production',
        PORT: 80,
        HOSTNAME: '0.0.0.0',
      },

      env_file: './verify-main/.env.local',

      // 로그 설정
      error_file: './verify-main/logs/pm2-error.log',
      out_file: './verify-main/logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,

      // 재시작 정책
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 4000,

      // 메모리 제한
      max_memory_restart: '400M',

      // 프로세스 관리
      kill_timeout: 5000,
      listen_timeout: 3000,

      // 모니터링
      watch: false,
      time: true,
      instance_var: 'INSTANCE_ID',

      // Note: Port 80 requires elevated privileges
      // Option 1: Run with sudo (not recommended)
      // Option 2: Use setcap: sudo setcap 'cap_net_bind_service=+ep' $(which node)
      // Option 3: Use port 3000 and proxy with nginx/HAProxy
    },

    // ============================================
    // Frontend - verify-incidents (Incident Management)
    // ============================================
    {
      name: 'verify-incidents',
      cwd: './verify-incidents',
      script: './.next/standalone/server.js',

      // 클러스터 모드
      instances: 2,
      exec_mode: 'cluster',

      // 환경변수
      env: {
        NODE_ENV: 'production',
        PORT: 3006,
        HOSTNAME: '0.0.0.0',
      },

      env_file: './verify-incidents/.env.local',

      // 로그 설정
      error_file: './verify-incidents/logs/pm2-error.log',
      out_file: './verify-incidents/logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,

      // 재시작 정책
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 4000,

      // 메모리 제한
      max_memory_restart: '400M',

      // 프로세스 관리
      kill_timeout: 5000,
      listen_timeout: 3000,

      // 모니터링
      watch: false,
      time: true,
      instance_var: 'INSTANCE_ID',
    },
  ],

  // ============================================
  // PM2 배포 설정 (선택사항)
  // ============================================
  deploy: {
    production: {
      user: 'ubuntu',
      host: ['production-server.com'],
      ref: 'origin/main',
      repo: 'git@github.com:your-org/status-verify.git',
      path: '/var/www/status-verify',
      'pre-deploy-local': '',
      'post-deploy': 'npm ci && npm run build && pm2 reload ecosystem.config.js --env production',
      'pre-setup': '',
      'ssh_options': 'StrictHostKeyChecking=no',
    },

    staging: {
      user: 'ubuntu',
      host: ['staging-server.com'],
      ref: 'origin/develop',
      repo: 'git@github.com:your-org/status-verify.git',
      path: '/var/www/status-verify-staging',
      'post-deploy': 'npm ci && npm run build && pm2 reload ecosystem.config.js --env staging',
    },
  },
};

/**
 * ============================================
 * 사용 가이드
 * ============================================
 *
 * 1. 모든 서비스 시작:
 *    pm2 start ecosystem.config.js
 *
 * 2. 특정 서비스만 시작:
 *    pm2 start ecosystem.config.js --only verify-monitor-api
 *    pm2 start ecosystem.config.js --only watch-server
 *
 * 3. 서비스 상태 확인:
 *    pm2 status
 *    pm2 list
 *
 * 4. 로그 확인:
 *    pm2 logs                              # 모든 서비스 로그
 *    pm2 logs verify-monitor-api --lines 100   # 특정 서비스 로그
 *    pm2 logs --err                        # 에러 로그만
 *
 * 5. 서비스 재시작:
 *    pm2 restart all                       # 모든 서비스
 *    pm2 restart verify-monitor-api        # 특정 서비스
 *    pm2 reload all                        # 무중단 재시작 (클러스터)
 *
 * 6. 서비스 중지:
 *    pm2 stop all
 *    pm2 stop verify-monitor-api
 *
 * 7. 서비스 삭제:
 *    pm2 delete all
 *    pm2 delete verify-monitor-api
 *
 * 8. 모니터링:
 *    pm2 monit                             # 실시간 모니터링 대시보드
 *    pm2 show verify-monitor-api           # 상세 정보
 *
 * 9. 프로세스 목록 저장:
 *    pm2 save                              # 현재 프로세스 목록 저장
 *    pm2 resurrect                         # 저장된 프로세스 복원
 *
 * 10. 시스템 부팅시 자동 시작:
 *     pm2 startup                          # 명령어 출력 확인
 *     sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u $USER --hp $HOME
 *     pm2 save                             # 현재 프로세스 목록 저장
 *
 * 11. 메트릭 및 모니터링:
 *     pm2 install pm2-logrotate            # 로그 로테이션
 *     pm2 install pm2-server-monit         # 서버 모니터링
 *
 * 12. 로그 비우기:
 *     pm2 flush                            # 모든 로그 삭제
 *
 * ============================================
 * 트러블슈팅
 * ============================================
 *
 * 1. 서비스가 계속 재시작하는 경우:
 *    - pm2 logs [service-name] --err 로 에러 확인
 *    - 환경변수 파일(.env) 확인
 *    - 포트 충돌 확인: sudo lsof -i :[port]
 *    - 수동 실행으로 에러 확인: node dist/server.js
 *
 * 2. Port 80 바인딩 실패:
 *    - sudo setcap 'cap_net_bind_service=+ep' $(which node)
 *    - 또는 port 3000으로 변경 후 nginx/HAProxy 사용
 *
 * 3. 메모리 부족:
 *    - pm2 show [service-name] 으로 메모리 사용량 확인
 *    - max_memory_restart 값 조정
 *    - instances 수 감소
 *
 * 4. 로그 파일 찾기:
 *    - ~/.pm2/logs/ 디렉토리에서 확인
 *    - 또는 각 서비스의 logs/ 디렉토리
 *
 * 5. PM2 데몬 문제:
 *    - pm2 kill                           # PM2 데몬 종료
 *    - pm2 start ecosystem.config.js      # 다시 시작
 *
 * ============================================
 * 배포 체크리스트
 * ============================================
 *
 * 배포 전 확인사항:
 * □ PostgreSQL 데이터베이스 실행 중
 * □ 모든 .env 파일 설정 완료
 * □ 각 서비스 빌드 완료 (npm run build)
 * □ Prisma 마이그레이션 적용 (npx prisma migrate deploy)
 * □ 로그 디렉토리 생성 (각 서비스의 logs/)
 * □ Port 80 권한 설정 (setcap 또는 sudo)
 * □ 방화벽 설정 확인
 *
 * 배포 후 확인사항:
 * □ pm2 status 로 모든 서비스 online 확인
 * □ Health check 엔드포인트 테스트
 * □ pm2 logs 로 에러 없는지 확인
 * □ pm2 save 로 프로세스 목록 저장
 * □ pm2 startup 으로 자동 시작 설정
 *
 * ============================================
 */
